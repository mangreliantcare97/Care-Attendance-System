/**
 * Locations page.
 *
 * The list is small (one row per site), so search and sorting happen in the
 * browser; the server keeps the unique (name, postcode) rule and the
 * "deactivate instead of delete" guard. Every dynamic value is rendered
 * through HrmDom.html, so an address can never become markup.
 */
(function () {
  var html = window.HrmDom.html;

  var body;
  var summary;
  var searchInput;
  var form;
  var modal;
  var title;
  var saveButton;
  var nameInput;
  var postcodeInput;
  var activeInput;

  var editId = null;
  var loading = false;
  var state = { locations: [], search: '', sort: { key: 'name', dir: 1 } };

  function renderLoading() {
    if (!body) return;
    window.HrmDom.renderListState(body, 5, { type: 'loading', message: 'Loading locations…' });
    if (summary) summary.textContent = '';
  }

  function renderError(message) {
    if (!body) return;
    window.HrmDom.renderListState(body, 5, {
      type: 'error',
      message: message || 'The locations could not be loaded.',
      help: 'Check your connection and try again.',
      onRetry: load,
    });
    if (summary) summary.textContent = '';
  }

  async function load() {
    loading = true;
    renderLoading();

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutId = controller ? window.setTimeout(function () { controller.abort(); }, 15000) : null;

    try {
      var response = await window.HrmApi.request('/api/locations', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
      });
      if (timeoutId) window.clearTimeout(timeoutId);
      state.locations = (response.data && response.data.locations) ? response.data.locations : [];
    } catch (error) {
      if (timeoutId) window.clearTimeout(timeoutId);
      var msg = error && error.message ? error.message : 'The locations could not be loaded.';
      if (error && error.code === 'network_error') {
        msg = 'The locations could not be loaded.';
      }
      renderError(msg);
      return;
    } finally {
      loading = false;
    }
    render();
  }

  function matchesSearch(location) {
    if (!state.search) return true;
    var term = state.search;
    return (
      location.name.toLowerCase().indexOf(term) !== -1 ||
      location.postcode.toLowerCase().indexOf(term) !== -1
    );
  }

  function compare(a, b) {
    var key = state.sort.key;
    var left = a[key];
    var right = b[key];

    if (typeof left === 'boolean' || typeof right === 'boolean') {
      return ((left ? 1 : 0) - (right ? 1 : 0)) * state.sort.dir;
    }
    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * state.sort.dir;
    }
    return String(left).localeCompare(String(right)) * state.sort.dir;
  }

  function visibleLocations() {
    return state.locations.filter(matchesSearch).sort(compare);
  }

  function updateSortIcons() {
    var buttons = document.querySelectorAll('.admin-sort[data-sort]');
    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      var icon = button.querySelector('i');
      if (!icon) continue;
      var active = button.getAttribute('data-sort') === state.sort.key;
      icon.classList.remove('fa-sort', 'fa-sort-up', 'fa-sort-down');
      icon.classList.add(!active ? 'fa-sort' : state.sort.dir === 1 ? 'fa-sort-up' : 'fa-sort-down');
      button.setAttribute(
        'aria-label',
        button.textContent.trim() +
          (active ? (state.sort.dir === 1 ? ' — sorted ascending' : ' — sorted descending') : ''),
      );
    }
  }

  function activeBadge(location) {
    return location.active
      ? html`<span class="badge badge-success"><i class="fa fa-check-circle" aria-hidden="true"></i> Active</span>`
      : html`<span class="badge badge-secondary"><i class="fa fa-ban" aria-hidden="true"></i> Inactive</span>`;
  }

  function actionButtons(location) {
    return html`
      <div class="btn-group btn-group-sm" role="group" aria-label="Actions for ${location.name}">
        <button type="button" class="btn btn-outline-primary" data-action="copy"
                data-id="${location.id}" title="Copy check-in link"
                aria-label="Copy check-in link for ${location.name}">
          <i class="fa fa-link" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn-outline-secondary" data-action="edit"
                data-id="${location.id}" title="Edit" aria-label="Edit ${location.name}">
          <i class="fa fa-pencil-alt" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn-outline-danger" data-action="delete"
                data-id="${location.id}" title="${location.active ? 'Delete or deactivate' : 'Delete'}"
                aria-label="Delete ${location.name}">
          <i class="fa fa-trash" aria-hidden="true"></i>
        </button>
      </div>`;
  }

  function render() {
    if (loading) return;
    if (!body) return;

    if (!state.locations.length) {
      window.HrmDom.renderListState(body, 5, {
        type: 'empty',
        message: 'No locations yet. Add one, or run npm run seed:locations to load the standard list.',
      });
      if (summary) summary.textContent = '';
      updateSortIcons();
      return;
    }

    var list = visibleLocations();

    if (!list.length) {
      window.HrmDom.renderListState(body, 5, {
        type: 'empty',
        message: 'No locations match your search.',
      });
      if (summary) summary.textContent = '(0) Records Found';
      updateSortIcons();
      return;
    }

    var rows = list.map(function (location) {
      return [
        html`<strong>${location.name}</strong>`,
        html`<span class="location-postcode">${location.postcode}</span>`,
        activeBadge(location),
        html`${location.entryCount}`,
        actionButtons(location),
      ];
    });

    window.HrmDom.renderRows(body, rows, 5, 'No locations to show.');
    if (summary) summary.textContent = '(' + list.length + ') Records Found';
    updateSortIcons();
  }

  function findLocation(id) {
    for (var index = 0; index < state.locations.length; index += 1) {
      if (state.locations[index].id === id) return state.locations[index];
    }
    return null;
  }

  /** The printed link is built from APP_BASE_URL, never from the page origin. */
  async function copyLink(id) {
    if (!window.HrmCheckInBaseUrl) {
      window.HrmToast.error('The public check-in link is not available yet.');
      return;
    }

    var url = window.HrmCheckInBaseUrl.replace(/\/$/, '') + '/?location=' + id;
    try {
      await window.HrmClipboard.copy(url);
      window.HrmToast.success('Check-in link copied.');
    } catch (error) {
      window.HrmToast.error('The link could not be copied.');
    }
  }

  function openModal(location) {
    editId = location ? location.id : null;
    title.textContent = location ? 'Edit location' : 'Add location';
    window.HrmForms.clear(form);
    nameInput.value = location ? location.name : '';
    postcodeInput.value = location ? location.postcode : '';
    activeInput.checked = location ? Boolean(location.active) : true;
    window.jQuery(modal).modal('show');
    window.setTimeout(function () {
      nameInput.focus();
    }, 350);
  }

  function normalisePostcode(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  function validateForm() {
    var errors = [];
    var name = nameInput.value.trim();

    if (name.length < 3) {
      errors.push({ path: 'name', message: 'Enter a location name of at least 3 characters.' });
    } else if (name.length > 160) {
      errors.push({ path: 'name', message: 'The location name must be 160 characters or fewer.' });
    }

    var postcode = normalisePostcode(postcodeInput.value);
    if (!/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(postcode)) {
      errors.push({ path: 'postcode', message: 'Enter a valid UK postcode.' });
    }

    if (errors.length) {
      window.HrmForms.showErrors(form, { details: errors });
      var first = form.querySelector('.is-invalid');
      if (first) first.focus();
      return null;
    }

    return { name: name, postcode: postcode, active: activeInput.checked };
  }

  async function save(event) {
    event.preventDefault();
    var payload = validateForm();
    if (!payload) return;

    var wasEdit = Boolean(editId);
    var targetId = editId;
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      if (wasEdit) {
        await window.HrmApi.patch('/api/locations/' + encodeURIComponent(targetId), payload);
      } else {
        await window.HrmApi.post('/api/locations', payload);
      }

      editId = null;
      window.jQuery(modal).modal('hide');
      window.HrmToast.success(wasEdit ? 'Location updated.' : 'Location added.');
      await load();
    } catch (error) {
      var mapped = error.details && window.HrmForms.showErrors(form, error);
      if (!mapped) {
        window.HrmToast.error(error.message || 'The location could not be saved.');
      }
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  }

  async function deactivateInstead(location) {
    var confirmed = await window.HrmConfirm({
      title: 'Deactivate instead',
      message:
        location.name +
        ' has ' +
        location.entryCount +
        ' entries and cannot be deleted. Deactivate it instead?',
      confirmLabel: 'Deactivate',
      variant: 'primary',
    });
    if (!confirmed) return;

    try {
      await window.HrmApi.patch('/api/locations/' + encodeURIComponent(location.id), {
        active: false,
      });
      window.HrmToast.success('Location deactivated.');
      await load();
    } catch (error) {
      window.HrmToast.error(error.message || 'The location could not be changed.');
    }
  }

  async function removeLocation(id) {
    var location = findLocation(id);
    if (!location) return;

    if (location.entryCount > 0) {
      await deactivateInstead(location);
      return;
    }

    var confirmed = await window.HrmConfirm({
      title: 'Delete location',
      message: 'Delete ' + location.name + '? This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    try {
      await window.HrmApi.delete('/api/locations/' + encodeURIComponent(id));
      window.HrmToast.success('Location deleted.');
      await load();
    } catch (error) {
      // The guard may have kicked in since the list was loaded.
      window.HrmToast.error(error.message || 'The location could not be deleted.');
      await load();
    }
  }

  function init() {
    body = document.getElementById('locations-body');
    summary = document.getElementById('locations-summary');
    searchInput = document.getElementById('location-search');
    form = document.getElementById('location-form');
    modal = document.getElementById('location-modal');
    title = document.getElementById('location-modal-title');
    saveButton = document.getElementById('location-save');
    nameInput = document.getElementById('location-name');
    postcodeInput = document.getElementById('location-postcode');
    activeInput = document.getElementById('location-active');

    document.getElementById('add-location').addEventListener('click', function () {
      openModal(null);
    });
    document.getElementById('refresh-locations').addEventListener('click', function () {
      void load();
    });
    document.getElementById('sort-az').addEventListener('click', function () {
      state.sort = { key: 'name', dir: 1 };
      render();
    });
    searchInput.addEventListener('input', function () {
      state.search = searchInput.value.trim().toLowerCase();
      render();
    });

    var table = document.querySelector('table');
    if (table) {
      table.addEventListener('click', function (event) {
        var button = event.target.closest ? event.target.closest('.admin-sort[data-sort]') : null;
        if (!button) return;
        var key = button.getAttribute('data-sort');
        if (state.sort.key === key) {
          state.sort.dir *= -1;
        } else {
          state.sort = { key: key, dir: 1 };
        }
        render();
      });
    }

    body.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-action]') : null;
      if (!button) return;
      var id = button.getAttribute('data-id');
      var action = button.getAttribute('data-action');

      if (action === 'copy') void copyLink(id);
      else if (action === 'edit') openModal(findLocation(id));
      else if (action === 'delete') void removeLocation(id);
    });

    form.addEventListener('submit', save);

    void load();
  }

  document.addEventListener('hrm:layout-ready', init);
})();
