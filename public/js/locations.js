/**
 * Locations.
 *
 * The copy action builds `${APP_BASE_URL}/?location=<id>` from the value the
 * server read from the environment. It never uses window.location or request
 * headers, so copying from a proxy or a preview host cannot poison a printed
 * QR code.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('locations-body');
  var form = document.getElementById('location-form');
  var editingId = null;
  var locations = [];

  function checkInUrl(id) {
    var base = window.HrmCheckInBaseUrl || '';
    return base ? base + '/?location=' + encodeURIComponent(id) : '';
  }

  function statusBadge(location) {
    return location.isActive
      ? html`<span class="badge badge-success">Active</span>`
      : html`<span class="badge badge-secondary">Inactive</span>`;
  }

  async function load() {
    window.HrmDom.renderListState(body, 5, {
      type: 'loading',
      message: 'Loading locations…',
    });

    try {
      var response = await window.HrmApi.get('/api/locations');
      locations = response.data.locations || [];

      if (!locations.length) {
        window.HrmDom.renderListState(body, 5, {
          type: 'empty',
          message: 'No locations yet.',
          help: 'Add the first location so staff can check in.',
        });
        return;
      }

      window.HrmDom.renderRows(
        body,
        locations.map(function (location) {
          return [
            html`<td>
              <strong>${location.name}</strong>
              ${location.note ? html`<div class="small text-muted">${location.note}</div>` : ''}
            </td>`,
            html`<td>${statusBadge(location)}</td>`,
            html`<td>${location.entryCount}</td>`,
            html`<td class="no-print">
              <button type="button" class="btn btn-sm btn-outline-primary" data-copy="${location.id}"
                      data-name="${location.name}" aria-label="Copy check-in link for ${location.name}">
                <i class="fa fa-copy mr-1" aria-hidden="true"></i>Copy check-in link
              </button>
            </td>`,
            html`<td class="no-print text-nowrap">
              <button type="button" class="btn btn-sm btn-primary" data-edit="${location.id}"
                      aria-label="Edit ${location.name}" title="Edit">
                <i class="fa fa-pen" aria-hidden="true"></i>
              </button>
            </td>`,
          ];
        }),
        5,
        'No locations yet.',
      );
    } catch (error) {
      window.HrmDom.renderListState(body, 5, {
        type: 'error',
        message: 'The locations could not be loaded.',
        help: error.message,
        onRetry: load,
      });
      window.HrmToast.error(error.message);
    }
  }

  function openModal(location) {
    editingId = location ? location.id : null;
    document.getElementById('location-modal-title').textContent = location
      ? 'Edit location'
      : 'Add location';
    document.getElementById('location-name').value = location ? location.name : '';
    document.getElementById('location-note').value = location && location.note ? location.note : '';
    document.getElementById('location-active').checked = location ? location.isActive : true;
    $('#location-modal').modal('show');
  }

  document.getElementById('add-location').addEventListener('click', function () {
    openModal(null);
  });

  body.addEventListener('click', async function (event) {
    var editButton = event.target.closest('[data-edit]');
    if (editButton) {
      var location = locations.filter(function (item) {
        return item.id === editButton.getAttribute('data-edit');
      })[0];
      if (location) openModal(location);
      return;
    }

    var copyButton = event.target.closest('[data-copy]');
    if (!copyButton) return;

    var url = checkInUrl(copyButton.getAttribute('data-copy'));
    if (!url) {
      window.HrmToast.error('The public check-in URL is not configured.');
      return;
    }

    try {
      await window.HrmClipboard.copy(url);
      window.HrmToast.success('The check-in link for ' + copyButton.getAttribute('data-name') + ' was copied.');
    } catch (error) {
      window.HrmToast.error(error.message || 'The check-in link could not be copied.');
    }
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var payload = {
      name: document.getElementById('location-name').value.trim(),
      note: document.getElementById('location-note').value.trim() || null,
      isActive: document.getElementById('location-active').checked,
    };

    var saveButton = document.getElementById('location-save');
    window.HrmForms.clear(form);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      if (editingId) {
        await window.HrmApi.patch('/api/locations/' + editingId, payload);
        window.HrmToast.success('The location was updated.');
      } else {
        await window.HrmApi.post('/api/locations', payload);
        window.HrmToast.success('The location was created.');
      }

      form.reset();
      $('#location-modal').modal('hide');
      await load();
    } catch (error) {
      window.HrmForms.showErrors(form, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  document.addEventListener('hrm:layout-ready', load);
})();
