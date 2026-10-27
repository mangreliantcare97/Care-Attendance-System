/**
 * Entries admin page — server-filtered, sorted and paginated records.
 * User-controlled values are rendered only through HrmDom.html.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('entries-body');
  var summary = document.getElementById('entries-summary');
  var pageStatus = document.getElementById('entries-page-status');
  var previousButton = document.getElementById('entries-previous');
  var nextButton = document.getElementById('entries-next');
  var filterForm = document.getElementById('entry-filter-form');
  var searchInput = document.getElementById('entry-search');
  var userTypeFilter = document.getElementById('entry-user-type');
  var directionFilter = document.getElementById('entry-direction');
  var locationFilter = document.getElementById('entry-location');
  var dateFromFilter = document.getElementById('entry-date-from');
  var dateToFilter = document.getElementById('entry-date-to');
  var perPageSelect = document.getElementById('entry-per-page');
  var editForm = document.getElementById('entry-form');
  var modal = document.getElementById('entry-modal');
  var saveButton = document.getElementById('save-entry');
  var editLocation = document.getElementById('edit-entry-location');
  var editId = null;
  var locations = [];
  var state = {
    page: 1,
    perPage: 20,
    pages: 1,
    total: 0,
    sort: 'date',
    order: 'desc',
    entries: [],
    loadSequence: 0,
  };

  function filterValues() {
    return {
      search: searchInput.value.trim(),
      userType: userTypeFilter.value,
      direction: directionFilter.value,
      locationId: locationFilter.value,
      dateFrom: dateFromFilter.value,
      dateTo: dateToFilter.value,
    };
  }

  function queryString(includePage) {
    var params = new URLSearchParams();
    var filters = filterValues();
    Object.keys(filters).forEach(function (key) {
      if (filters[key]) params.set(key, filters[key]);
    });
    params.set('sort', state.sort);
    params.set('order', state.order);
    if (includePage) {
      params.set('page', String(state.page));
      params.set('perPage', String(state.perPage));
    }
    return params.toString();
  }

  function displayDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '—';
    var date = new Date(value + 'T12:00:00.000Z');
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function userTypeLabel(value) {
    if (value === 'staff') return 'Staff Member';
    if (value === 'service_user') return 'Service User';
    if (value === 'visitor') return 'Visitor';
    return value || '—';
  }

  function directionMarkup(value) {
    return value === 'out'
      ? html`<span class="badge badge-secondary">Check out</span>`
      : html`<span class="badge badge-success">Check in</span>`;
  }

  function rowMarkup(entry) {
    var locationName = entry.location
      ? entry.location.name + (entry.location.postcode ? ', ' + entry.location.postcode : '')
      : 'Location unavailable';
    return html`<tr data-entry-id="${entry.id}">
      <td data-label="Date">${displayDate(entry.date)}</td>
      <td data-label="Time">${entry.enteredTime}</td>
      <td data-label="Name"><strong>${entry.name}</strong></td>
      <td data-label="User type">${userTypeLabel(entry.userType)}</td>
      <td data-label="Direction">${directionMarkup(entry.direction)}</td>
      <td data-label="Location">${locationName}</td>
      <td data-label="Notes"><span title="${entry.notes}">${entry.notes}</span></td>
      <td data-label="Actions" class="text-right text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit"
                data-id="${entry.id}" aria-label="Edit entry for ${entry.name}" title="Edit entry">
          <i class="fa fa-pencil-alt" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete"
                data-id="${entry.id}" aria-label="Delete entry for ${entry.name}" title="Delete entry">
          <i class="fa fa-trash" aria-hidden="true"></i>
        </button>
      </td>
    </tr>`;
  }

  function updateSortControls() {
    var buttons = document.querySelectorAll('.admin-sort[data-sort]');
    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      var icon = button.querySelector('i');
      if (!icon) continue;
      var active = button.getAttribute('data-sort') === state.sort;
      icon.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
      icon.classList.add(!active ? 'fa-sort' : state.order === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
      button.setAttribute(
        'aria-label',
        button.textContent.trim() +
          (active ? (state.order === 'asc' ? ' — sorted ascending' : ' — sorted descending') : ''),
      );
    }
  }

  function render(entries) {
    if (!entries.length) {
      window.HrmDom.renderListState(body, 8, {
        type: 'empty',
        message: state.total ? 'No entries are on this page.' : 'No entries match these filters.',
        help: state.total ? '' : 'Try changing the filters or date range.',
      });
    } else {
      body.innerHTML = html`${entries.map(rowMarkup)}`;
    }

    state.entries = entries;
    state.total = Number(state.total) || 0;
    var first = state.total ? ((state.page - 1) * state.perPage) + 1 : 0;
    var last = Math.min(state.page * state.perPage, state.total);
    summary.textContent = state.total
      ? 'Showing ' + first + '–' + last + ' of ' + state.total + ' entries.'
      : '0 entries found.';
    pageStatus.textContent = 'Page ' + state.page + ' of ' + state.pages;
    previousButton.disabled = state.page <= 1;
    nextButton.disabled = state.page >= state.pages;
    updateSortControls();
  }

  async function load() {
    var sequence = ++state.loadSequence;
    body.setAttribute('aria-busy', 'true');
    summary.textContent = 'Loading entries…';
    window.HrmDom.renderListState(body, 8, { type: 'loading', message: 'Loading entries…' });

    try {
      var response = await window.HrmApi.get('/api/entries?' + queryString(true));
      if (sequence !== state.loadSequence) return;
      var meta = (response.meta && response.meta.pagination) || {};
      state.total = Number(meta.total) || 0;
      state.pages = Math.max(1, Number(meta.pages) || 1);
      if (state.page > state.pages) {
        state.page = state.pages;
        await load();
        return;
      }
      render((response.data && response.data.entries) || []);
    } catch (error) {
      if (sequence !== state.loadSequence) return;
      window.HrmDom.renderListState(body, 8, {
        type: 'error',
        message: 'The entries could not be loaded.',
        help: error.message || 'Check your connection and try again.',
        retryLabel: 'Retry',
        onRetry: function () { void load(); },
      });
      summary.textContent = 'Entries unavailable.';
    } finally {
      if (sequence === state.loadSequence) body.removeAttribute('aria-busy');
    }
  }

  function appendLocations(select, includeAll) {
    select.textContent = '';
    if (includeAll) {
      var allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All locations';
      select.appendChild(allOption);
    }
    locations.forEach(function (location) {
      var option = document.createElement('option');
      option.value = location.id;
      option.textContent = location.name + (location.active ? '' : ' (Inactive)');
      select.appendChild(option);
    });
  }

  async function loadLocations() {
    var response = await window.HrmApi.get('/api/locations');
    locations = (response.data && response.data.locations) || [];
    appendLocations(locationFilter, true);
    appendLocations(editLocation, false);
  }

  function findEntry(id) {
    return state.entries.find(function (entry) { return entry.id === id; }) || null;
  }

  function openEditor(entry) {
    editId = entry.id;
    window.HrmForms.clear(editForm);
    document.getElementById('edit-entry-name').value = entry.name;
    document.getElementById('edit-entry-user-type').value = entry.userType;
    document.getElementById('edit-entry-direction').value = entry.direction;
    document.getElementById('edit-entry-date').value = entry.date;
    document.getElementById('edit-entry-time').value = entry.enteredTime;
    document.getElementById('edit-entry-notes').value = entry.notes;
    editLocation.value = entry.location ? entry.location.id : '';
    window.jQuery(modal).modal('show');
    window.setTimeout(function () {
      document.getElementById('edit-entry-name').focus();
    }, 350);
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!editForm.reportValidity() || !editId) return;
    var patch = {
      name: document.getElementById('edit-entry-name').value.trim(),
      userType: document.getElementById('edit-entry-user-type').value,
      direction: document.getElementById('edit-entry-direction').value,
      date: document.getElementById('edit-entry-date').value,
      enteredTime: document.getElementById('edit-entry-time').value,
      locationId: editLocation.value,
      notes: document.getElementById('edit-entry-notes').value.trim(),
    };
    window.HrmForms.setBusy(saveButton, true, 'Saving…');
    try {
      await window.HrmApi.patch('/api/entries/' + encodeURIComponent(editId), patch);
      window.jQuery(modal).modal('hide');
      window.HrmToast.success('Entry updated.');
      await load();
    } catch (error) {
      if (!(error.details && window.HrmForms.showErrors(editForm, error))) {
        window.HrmToast.error(error.message || 'The entry could not be updated.');
      }
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  }

  async function deleteEntry(id) {
    var entry = findEntry(id);
    if (!entry) return;
    var confirmed = await window.HrmConfirm({
      title: 'Delete entry',
      message: 'Move the entry for ' + entry.name + ' to the deleted records? It will no longer appear in reports or exports.',
      confirmLabel: 'Delete entry',
    });
    if (!confirmed) return;
    try {
      await window.HrmApi.delete('/api/entries/' + encodeURIComponent(id));
      window.HrmToast.success('Entry deleted.');
      await load();
    } catch (error) {
      window.HrmToast.error(error.message || 'The entry could not be deleted.');
    }
  }

  async function exportCsv() {
    var url = '/api/entries/export.csv?' + queryString(false);
    try {
      var response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/csv' } });
      if (!response.ok) {
        var payload = await response.json().catch(function () { return null; });
        throw new Error(payload && payload.error && payload.error.message
          ? payload.error.message
          : 'The CSV export could not be downloaded.');
      }
      var blob = await response.blob();
      var objectUrl = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'care-attendance-entries.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
      window.HrmToast.success('Entries exported.');
    } catch (error) {
      window.HrmToast.error(error.message || 'The CSV export could not be downloaded.');
    }
  }

  filterForm.addEventListener('submit', function (event) {
    event.preventDefault();
    state.page = 1;
    void load();
  });
  document.getElementById('reset-entry-filters').addEventListener('click', function () {
    filterForm.reset();
    state.page = 1;
    void load();
  });
  document.getElementById('refresh-entries').addEventListener('click', function () {
    void load();
  });
  document.getElementById('export-entries').addEventListener('click', exportCsv);
  perPageSelect.addEventListener('change', function () {
    state.perPage = Number(perPageSelect.value);
    state.page = 1;
    void load();
  });
  previousButton.addEventListener('click', function () {
    if (state.page <= 1) return;
    state.page -= 1;
    void load();
  });
  nextButton.addEventListener('click', function () {
    if (state.page >= state.pages) return;
    state.page += 1;
    void load();
  });
  document.querySelector('table').addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('.admin-sort[data-sort]') : null;
    if (!button) return;
    var sort = button.getAttribute('data-sort');
    if (state.sort === sort) state.order = state.order === 'asc' ? 'desc' : 'asc';
    else {
      state.sort = sort;
      state.order = sort === 'date' ? 'desc' : 'asc';
    }
    state.page = 1;
    void load();
  });
  body.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!button) return;
    var id = button.getAttribute('data-id');
    if (button.getAttribute('data-action') === 'edit') {
      var entry = findEntry(id);
      if (entry) openEditor(entry);
    } else if (button.getAttribute('data-action') === 'delete') {
      void deleteEntry(id);
    }
  });
  editForm.addEventListener('submit', saveEntry);
  document.addEventListener('hrm:layout-ready', function () {
    loadLocations()
      .then(load)
      .catch(function (error) {
        window.HrmToast.error(error.message || 'Locations could not be loaded for entry filters.');
        void load();
      });
  });
})();
