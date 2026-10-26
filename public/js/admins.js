/**
 * Admins & Settings — the administrator list.
 *
 * The list is filtered, sorted and paginated on the server. User data is only
 * inserted through `HrmDom.html`, which escapes every interpolated value.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('admin-list-body');
  var count = document.getElementById('admin-records-count');
  var listStatus = document.getElementById('admin-list-status');
  var pagination = document.getElementById('admin-pagination');
  var filterForm = document.getElementById('admin-filter-form');
  var nameFilter = document.getElementById('filter-name');
  var emailFilter = document.getElementById('filter-email');
  var statusFilter = document.getElementById('filter-status');
  var resetButton = document.getElementById('reset-filters');
  var filterToggle = document.getElementById('admin-filter-toggle');
  var filterPanel = document.getElementById('admin-filter-panel');
  var filterToggleLabel = filterToggle.querySelector('[data-filter-toggle-label]');
  var filterToggleIcon = filterToggle.querySelector('i');
  var selectAll = document.getElementById('admin-select-all');
  var selectionBar = document.getElementById('admin-selection-bar');
  var selectionCount = document.getElementById('admin-selection-count');
  var bulkError = document.getElementById('admin-bulk-error');
  var disableSelected = document.getElementById('admin-disable-selected');
  var deleteSelected = document.getElementById('admin-delete-selected');
  var sortButtons = Array.prototype.slice.call(document.querySelectorAll('.admin-sort'));

  var state = {
    page: 1,
    perPage: 20,
    sort: 'name',
    order: 'asc',
    total: 0,
    pages: 0,
    currentId: null,
    selected: new Set(),
    byId: {},
    loadSeq: 0,
    started: false,
  };

  var SORT_LABELS = {
    name: 'Name',
    email: 'Email',
    status: 'Status',
    lastLogin: 'Last login',
  };

  function currentAdminId() {
    return window.HrmCurrentAdmin ? window.HrmCurrentAdmin.id : null;
  }

  function formatLastLogin(value) {
    if (!value) return 'Never';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusMarkup(isActive) {
    if (isActive) {
      return html`<span class="admin-status admin-status-enabled">
        <i class="fa fa-check-circle" aria-hidden="true"></i> Enabled
      </span>`;
    }
    return html`<span class="admin-status admin-status-disabled">
      <i class="fa fa-ban" aria-hidden="true"></i> Disabled
    </span>`;
  }

  function rowMarkup(admin) {
    var own = admin.id === state.currentId;
    var name = admin.name || '';
    var email = admin.email || '';
    var selectCell = own
      ? html`<span class="admin-check-placeholder" aria-hidden="true"></span>`
      : html`<label class="admin-check">
          <input type="checkbox" class="admin-row-check" value="${admin.id}" aria-label="Select ${name}">
          <span aria-hidden="true"></span>
        </label>`;

    var deleteAction = own
      ? html`<span class="admin-tooltip" tabindex="0" data-tooltip="You cannot delete yourself"
                    aria-label="Delete disabled: you cannot delete yourself">
          <button type="button" class="admin-icon-btn admin-icon-btn-danger" disabled tabindex="-1" aria-hidden="true">
            <i class="fa fa-trash-alt"></i>
          </button>
        </span>`
      : html`<button type="button" class="admin-icon-btn admin-icon-btn-danger"
                    data-delete-admin="${admin.id}" aria-label="Delete ${name}" title="Delete ${name}">
          <i class="fa fa-trash-alt" aria-hidden="true"></i>
        </button>`;

    return html`<tr class="admin-row" data-admin-id="${admin.id}">
      <td class="admin-check-cell" data-label="Select">${selectCell}</td>
      <td class="admin-name-cell" data-label="Name">
        <div class="admin-person">
          <span class="admin-avatar" aria-hidden="true">${window.HrmAdminUi.initials(name)}</span>
          <span class="admin-person-text">
            <span class="admin-name">${name}</span>
            ${own ? html`<span class="admin-you-badge">You</span>` : ''}
          </span>
        </div>
      </td>
      <td class="admin-email-cell" data-label="Email (login)">
        <a class="admin-email" href="mailto:${email}">${email}</a>
      </td>
      <td data-label="User Role"><span class="admin-role-pill">${admin.role === 'admin' ? 'Admin' : admin.role}</span></td>
      <td data-label="Status">${statusMarkup(admin.isActive)}</td>
      <td data-label="Last login"><span class="admin-last-login">${formatLastLogin(admin.lastLoginAt)}</span></td>
      <td class="admin-actions-cell" data-label="Actions">
        <div class="admin-row-actions">
          <a class="admin-icon-btn" href="/admin-form.html?id=${admin.id}" aria-label="Edit ${name}" title="Edit ${name}">
            <i class="fa fa-pen" aria-hidden="true"></i>
          </a>
          ${deleteAction}
        </div>
      </td>
    </tr>`;
  }

  function renderSkeleton() {
    var rows = [];
    for (var index = 0; index < 5; index += 1) {
      rows.push(html`<tr class="admin-row admin-row-skeleton" aria-hidden="true">
        <td class="admin-check-cell"><span class="admin-skeleton admin-skeleton-check"></span></td>
        <td><span class="admin-skeleton admin-skeleton-name"></span></td>
        <td><span class="admin-skeleton admin-skeleton-email"></span></td>
        <td><span class="admin-skeleton admin-skeleton-short"></span></td>
        <td><span class="admin-skeleton admin-skeleton-short"></span></td>
        <td><span class="admin-skeleton admin-skeleton-date"></span></td>
        <td><span class="admin-skeleton admin-skeleton-action"></span></td>
      </tr>`);
    }
    body.innerHTML = html`${rows}`;
  }

  function renderRows(admins) {
    if (!admins.length) {
      window.HrmDom.renderListState(body, 7, {
        type: 'empty',
        message: 'No admins found',
        help: 'Try changing the filters, or add a new administrator.',
      });
      markStateRow();
      return;
    }

    body.innerHTML = html`${admins.map(rowMarkup)}`;
  }

  function markStateRow() {
    if (body.firstElementChild) body.firstElementChild.classList.add('admin-state-row');
  }

  function updateCount(total) {
    state.total = total;
    count.textContent = '(' + total + ') Records Found';
  }

  function syncSelection() {
    var boxes = body.querySelectorAll('.admin-row-check');
    var selectedOnPage = 0;

    for (var index = 0; index < boxes.length; index += 1) {
      var checked = state.selected.has(boxes[index].value);
      boxes[index].checked = checked;
      if (checked) selectedOnPage += 1;
    }

    selectionBar.hidden = state.selected.size === 0;
    selectionCount.textContent = state.selected.size + ' selected';
    disableSelected.disabled = state.selected.size === 0;
    deleteSelected.disabled = state.selected.size === 0;

    selectAll.disabled = boxes.length === 0;
    selectAll.checked = boxes.length > 0 && selectedOnPage === boxes.length;
    selectAll.indeterminate = selectedOnPage > 0 && selectedOnPage < boxes.length;
  }

  function clearBulkError() {
    bulkError.hidden = true;
    bulkError.textContent = '';
  }

  function nameForId(id) {
    return state.byId[id] ? state.byId[id].name : id;
  }

  function showBulkError(error) {
    var details = Array.isArray(error.details) ? error.details : [];
    var seen = {};
    var issues = [];

    details.forEach(function (issue) {
      var key = String(issue.id) + '|' + String(issue.code) + '|' + String(issue.message);
      if (seen[key]) return;
      seen[key] = true;
      issues.push(issue);
    });

    if (!issues.length) {
      HrmToast.error(error.message);
      return;
    }

    bulkError.innerHTML = html`
      <p class="admin-bulk-error-title">${error.message}</p>
      <ul>
        ${issues.map(function (issue) {
          return html`<li><strong>${nameForId(String(issue.id))}</strong>: ${issue.message}</li>`;
        })}
      </ul>
    `;
    bulkError.hidden = false;
    HrmToast.error(error.message);
  }

  function applySortUi() {
    sortButtons.forEach(function (button) {
      var field = button.getAttribute('data-sort');
      var icon = button.querySelector('i');
      var header = button.closest('th');
      var active = field === state.sort;

      header.removeAttribute('aria-sort');
      icon.className = 'fa ' + (active ? (state.order === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort');
      button.setAttribute(
        'aria-label',
        active
          ? 'Sort by ' + SORT_LABELS[field] + ' ascending. Activate to sort descending.'
          : 'Sort by ' + SORT_LABELS[field],
      );

      if (active) {
        header.setAttribute('aria-sort', state.order === 'asc' ? 'ascending' : 'descending');
        button.setAttribute(
          'aria-label',
          'Sort by ' + SORT_LABELS[field] + ' ' + (state.order === 'asc' ? 'ascending' : 'descending') +
            '. Activate to sort ' + (state.order === 'asc' ? 'descending' : 'ascending') + '.',
        );
      }
    });
  }

  function queryUrl() {
    var params = new URLSearchParams();
    var name = nameFilter.value.trim();
    var email = emailFilter.value.trim();
    var status = statusFilter.value;

    if (name) params.set('name', name);
    if (email) params.set('email', email);
    if (status) params.set('status', status);
    params.set('sort', state.sort);
    params.set('order', state.order);
    params.set('page', String(state.page));
    params.set('perPage', String(state.perPage));

    return '/api/admins?' + params.toString();
  }

  async function load() {
    var sequence = ++state.loadSeq;
    clearBulkError();
    state.selected.clear();
    syncSelection();
    body.setAttribute('aria-busy', 'true');
    listStatus.textContent = 'Loading administrators.';
    renderSkeleton();

    try {
      var response = await window.HrmApi.get(queryUrl());
      if (sequence !== state.loadSeq) return;

      var admins = (response.data && response.data.admins) || [];
      var meta = response.meta || {};
      state.page = Number(meta.page) || state.page;
      state.pages = Number(meta.pages) || 0;
      state.byId = {};

      admins.forEach(function (admin) {
        state.byId[admin.id] = admin;
      });

      renderRows(admins);
      updateCount(Number(meta.total) || 0);
      window.HrmDom.renderPagination(
        pagination,
        { page: state.page, pages: state.pages, perPage: state.perPage },
        function (page) {
          state.page = page;
          void load();
        },
      );
      syncSelection();
      listStatus.textContent =
        state.total + ' administrator' + (state.total === 1 ? '' : 's') + ' found.';
    } catch (error) {
      if (sequence !== state.loadSeq) return;

      count.textContent = 'Records unavailable';
      pagination.textContent = '';
      window.HrmDom.renderListState(body, 7, {
        type: 'error',
        message: 'The administrator list could not be loaded.',
        help: error.message || 'Please try again.',
        retryLabel: 'Retry',
        onRetry: function () {
          void load();
        },
      });
      markStateRow();
      listStatus.textContent = 'The administrator list could not be loaded.';
      syncSelection();
    } finally {
      if (sequence === state.loadSeq) body.removeAttribute('aria-busy');
    }
  }

  function setFilterExpanded(expanded) {
    filterPanel.hidden = !expanded;
    filterToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    filterToggle.setAttribute('aria-label', expanded ? 'Hide filters' : 'Show filters');
    filterToggleLabel.textContent = expanded ? 'Hide filters' : 'Show filters';
    filterToggleIcon.className = 'fa ' + (expanded ? 'fa-chevron-up' : 'fa-chevron-down');
  }

  function initFilters() {
    var mobile = window.matchMedia && window.matchMedia('(max-width: 767.98px)').matches;
    setFilterExpanded(!mobile);

    filterToggle.addEventListener('click', function () {
      setFilterExpanded(filterPanel.hidden);
    });

    filterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      state.page = 1;
      void load();
    });

    resetButton.addEventListener('click', function () {
      filterForm.reset();
      statusFilter.value = '';
      state.page = 1;
      state.sort = 'name';
      state.order = 'asc';
      applySortUi();
      void load();
    });

    sortButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var field = button.getAttribute('data-sort');
        if (state.sort === field) {
          state.order = state.order === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort = field;
          state.order = 'asc';
        }
        state.page = 1;
        applySortUi();
        void load();
      });
    });
  }

  function initSelection() {
    selectAll.addEventListener('change', function () {
      var boxes = body.querySelectorAll('.admin-row-check');
      for (var index = 0; index < boxes.length; index += 1) {
        if (selectAll.checked) state.selected.add(boxes[index].value);
        else state.selected.delete(boxes[index].value);
      }
      syncSelection();
    });

    body.addEventListener('change', function (event) {
      if (!event.target.classList.contains('admin-row-check')) return;
      if (event.target.checked) state.selected.add(event.target.value);
      else state.selected.delete(event.target.value);
      clearBulkError();
      syncSelection();
    });

    body.addEventListener('click', function (event) {
      var button = event.target.closest('[data-delete-admin]');
      if (!button) return;
      event.preventDefault();
      var id = button.getAttribute('data-delete-admin');
      void deleteOne(id, nameForId(id), button);
    });
  }

  async function deleteOne(id, name, button) {
    var confirmed = await window.HrmConfirm({
      title: 'Delete administrator?',
      message: 'Delete ' + name + '? This permanently removes the account and cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    window.HrmForms.setBusy(button, true, 'Deleting…');
    clearBulkError();
    try {
      await window.HrmApi.delete('/api/admins/' + encodeURIComponent(id));
      HrmToast.success('The administrator was deleted.');
      await load();
    } catch (error) {
      HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(button, false);
    }
  }

  async function runBulk(action) {
    var ids = Array.from(state.selected);
    if (!ids.length) return;

    var deleting = action === 'delete';
    var confirmed = await window.HrmConfirm({
      title: deleting ? 'Delete selected administrators?' : 'Disable selected administrators?',
      message:
        (deleting ? 'Delete ' : 'Disable ') +
        ids.length +
        ' selected administrator' +
        (ids.length === 1 ? '' : 's') +
        (deleting ? '? This cannot be undone.' : '? They will be signed out immediately.'),
      confirmLabel: deleting ? 'Delete' : 'Disable',
      variant: deleting ? 'danger' : 'primary',
    });
    if (!confirmed) return;

    var button = deleting ? deleteSelected : disableSelected;
    window.HrmForms.setBusy(button, true, 'Working…');
    clearBulkError();

    try {
      await window.HrmApi.post('/api/admins/bulk', { action: action, ids: ids });
      HrmToast.success(
        ids.length + ' administrator' + (ids.length === 1 ? ' was ' : 's were ') +
          (deleting ? 'deleted.' : 'disabled.'),
      );
      state.selected.clear();
      await load();
    } catch (error) {
      if (error.code === 'bulk_rejected') showBulkError(error);
      else HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(button, false);
    }
  }

  function showFlash() {
    try {
      var message = window.sessionStorage.getItem('hrm.admin.flash');
      if (!message) return;
      window.sessionStorage.removeItem('hrm.admin.flash');
      HrmToast.success(message);
    } catch (error) {
      /* storage unavailable — nothing to show */
    }
  }

  function init() {
    if (state.started) return;
    state.started = true;
    state.currentId = currentAdminId();

    window.HrmAdminUi.enhanceSelects(document);
    initFilters();
    initSelection();
    applySortUi();
    showFlash();
    disableSelected.addEventListener('click', function () {
      void runBulk('disable');
    });
    deleteSelected.addEventListener('click', function () {
      void runBulk('delete');
    });
    void load();
  }

  document.addEventListener('hrm:layout-ready', init);
})();
