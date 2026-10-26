/**
 * Departments.
 *
 * The student count comes from the server (an aggregation), so it is never
 * out of date. A department that still has students cannot be deleted.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('departments-body');
  var form = document.getElementById('department-form');
  var editingId = null;
  var departments = [];

  function badge(count) {
    if (!count) return html`<span class="badge-soft badge-soft-muted">0</span>`;
    return html`<span class="badge-soft badge-soft-info">${count}</span>`;
  }

  async function load() {
    window.HrmDom.renderListState(body, 5, {
      type: 'loading',
      message: 'Loading departments…',
    });

    try {
      var response = await window.HrmApi.get('/api/departments');
      departments = response.data.departments;

      if (!departments.length) {
        window.HrmDom.renderListState(body, 5, {
          type: 'empty',
          message: 'No departments yet.',
          help: 'Add the first department to start organising students.',
        });
        return;
      }

      window.HrmDom.renderRows(
        body,
        departments.map(function (department) {
          return [
            html`<td><strong>${department.name}</strong></td>`,
            html`<td>${department.location || '—'}</td>`,
            html`<td>${badge(department.studentCount)}</td>`,
            html`<td>${department.description || '—'}</td>`,
            html`<td class="no-print text-nowrap">
              <button type="button" class="btn btn-sm btn-primary" data-edit="${department.id}" aria-label="Edit ${department.name}" title="Edit"><i class="fa fa-pen" aria-hidden="true"></i></button>
              <button type="button" class="btn btn-sm btn-danger" data-delete="${department.id}" data-name="${department.name}" aria-label="Delete ${department.name}" title="Delete"><i class="fa fa-trash" aria-hidden="true"></i></button>
            </td>`,
          ];
        }),
        5,
        'No departments yet — add the first one.',
      );
    } catch (error) {
      window.HrmDom.renderListState(body, 5, {
        type: 'error',
        message: 'The departments could not be loaded.',
        help: error.message,
        onRetry: load,
      });
      window.HrmToast.error(error.message);
    }
  }

  function openModal(department) {
    editingId = department ? department.id : null;
    document.getElementById('department-modal-title').textContent = department
      ? 'Edit department'
      : 'Add department';
    document.getElementById('department-name').value = department ? department.name : '';
    document.getElementById('department-location').value = department && department.location ? department.location : '';
    document.getElementById('department-description').value = department && department.description ? department.description : '';
    $('#department-modal').modal('show');
  }

  document.getElementById('add-department').addEventListener('click', function () {
    openModal(null);
  });

  body.addEventListener('click', async function (event) {
    var editButton = event.target.closest('[data-edit]');
    if (editButton) {
      var department = departments.filter(function (item) {
        return item.id === editButton.getAttribute('data-edit');
      })[0];
      if (department) openModal(department);
      return;
    }

    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      var name = deleteButton.getAttribute('data-name');
      var confirmed = await window.HrmConfirm({
        title: 'Delete department',
        message: 'Delete the department "' + name + '"? Departments that still have students cannot be deleted.',
        confirmLabel: 'Delete department',
      });
      if (!confirmed) return;

      window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
      try {
        await window.HrmApi.delete('/api/departments/' + deleteButton.getAttribute('data-delete'));
        window.HrmToast.success('The department was deleted.');
        await load();
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(deleteButton, false);
      }
    }
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var payload = {
      name: document.getElementById('department-name').value.trim(),
      location: document.getElementById('department-location').value.trim() || null,
      description: document.getElementById('department-description').value.trim() || null,
    };

    var saveButton = document.getElementById('department-save');
    window.HrmForms.clear(form);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      if (editingId) {
        await window.HrmApi.patch('/api/departments/' + editingId, payload);
        window.HrmToast.success('The department was updated.');
      } else {
        await window.HrmApi.post('/api/departments', payload);
        window.HrmToast.success('The department was created.');
      }

      form.reset();
      $('#department-modal').modal('hide');
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
