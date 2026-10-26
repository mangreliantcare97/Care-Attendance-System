/**
 * The employee list.
 *
 * The list is paginated and filtered on the server. The photo is never part
 * of the list answer — it is loaded from `/api/employees/:id/photo`.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('employees-body');
  var form = document.getElementById('employee-form');
  var searchForm = document.getElementById('search-form');
  var departmentFilter = document.getElementById('filter-department');
  var departmentSelect = document.getElementById('employee-department');
  var photoInput = document.getElementById('employee-photo-input');
  var photoPreview = document.getElementById('employee-photo-preview');

  var editingId = null;
  var pendingPhoto = null;
  var removePhoto = false;
  var currentPage = 1;

  function statusBadge(status) {
    if (status === 'active') return html`<span class="badge-soft badge-soft-success">Active</span>`;
    if (status === 'terminated') return html`<span class="badge-soft badge-soft-danger">Terminated</span>`;
    return html`<span class="badge-soft badge-soft-muted">Inactive</span>`;
  }

  function initials(name) {
    var parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  }

  function departmentName(employee) {
    if (!employee.departmentId) return '—';
    if (typeof employee.departmentId === 'string') return '—';
    return employee.departmentId.name || '—';
  }

  function photoCell(employee) {
    if (!employee.id) {
      return html`<td class="employee-photo-cell" data-label="Photo">—</td>`;
    }

    return html`<td class="employee-photo-cell" data-label="Photo">
      <span class="list-photo">
        <span class="avatar-initials" aria-hidden="true">${initials(employee.name)}</span>
        ${employee.hasPhoto
          ? html`<img src="/api/employees/${employee.id}/photo" alt="${employee.name}" width="40" height="40"
                 loading="lazy" decoding="async" data-photo="1" class="list-photo-img img-circle elevation-1">`
          : ''}
      </span>
    </td>`;
  }

  /** Hide a broken photo image but leave the initials fallback visible. */
  function bindPhotoErrors() {
    var images = body.querySelectorAll('img[data-photo]');
    for (var index = 0; index < images.length; index += 1) {
      images[index].addEventListener('error', function () {
        this.hidden = true;
      });
    }
  }

  function option(value, label) {
    var element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    return element;
  }

  async function loadDepartments() {
    try {
      var response = await window.HrmApi.get('/api/departments');
      var currentFilter = departmentFilter.value;
      var currentSelect = departmentSelect.value;

      departmentFilter.textContent = '';
      departmentSelect.textContent = '';
      departmentFilter.appendChild(option('all', 'All departments'));
      departmentSelect.appendChild(option('', 'No department'));

      response.data.departments.forEach(function (department) {
        departmentFilter.appendChild(option(department.id, department.name));
        departmentSelect.appendChild(option(department.id, department.name));
      });

      departmentFilter.value = currentFilter || 'all';
      departmentSelect.value = currentSelect || '';
    } catch (error) {
      // The list itself can still load without the department filter.
      departmentFilter.textContent = '';
      departmentFilter.appendChild(option('all', 'All departments'));
      window.HrmToast.error('Departments could not be loaded. The employee list is still available.');
    }
  }

  function filters() {
    var params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('perPage', '20');

    var search = document.getElementById('filter-search').value.trim();
    if (search) params.set('search', search);

    var department = departmentFilter.value;
    if (department && department !== 'all') params.set('departmentId', department);

    var status = document.getElementById('filter-status').value;
    if (status && status !== 'all') params.set('status', status);

    return params;
  }

  function render(employees) {
    window.HrmDom.renderRows(
      body,
      employees.map(function (employee) {
        return [
          photoCell(employee),
          html`<td class="employee-name-cell" data-label="Name"><a href="/employee.html?id=${employee.id}"><strong>${employee.name}</strong></a></td>`,
          html`<td data-label="Email">${employee.email || '—'}</td>`,
          html`<td data-label="Phone">${employee.phone || '—'}</td>`,
          html`<td data-label="Department">${departmentName(employee)}</td>`,
          html`<td data-label="Position">${employee.position || '—'}</td>`,
          html`<td data-label="Status">${statusBadge(employee.status)}</td>`,
          html`<td class="no-print employee-actions" data-label="Actions">
            <a href="/employee.html?id=${employee.id}" class="btn btn-sm btn-info" aria-label="View profile for ${employee.name}" title="View profile"><i class="fa fa-eye" aria-hidden="true"></i></a>
            <button type="button" class="btn btn-sm btn-primary" data-edit="${employee.id}" aria-label="Edit ${employee.name}" title="Edit"><i class="fa fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-sm btn-secondary" data-status="${employee.id}" data-current="${employee.status}" aria-label="${employee.status === 'active' ? 'Deactivate' : 'Activate'} ${employee.name}" title="Activate / deactivate"><i class="fa fa-power-off" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-sm btn-danger" data-delete="${employee.id}" data-name="${employee.name}" aria-label="Delete ${employee.name}" title="Delete"><i class="fa fa-trash" aria-hidden="true"></i></button>
          </td>`,
        ];
      }),
      8,
      'No employees found.',
    );

    bindPhotoErrors();
  }

  async function load() {
    var submit = searchForm.querySelector('[type="submit"]');
    window.HrmForms.setBusy(submit, true, 'Searching…');
    window.HrmDom.renderListState(body, 8, { type: 'loading', message: 'Loading employees…' });
    body.setAttribute('aria-busy', 'true');

    try {
      var response = await window.HrmApi.get('/api/employees?' + filters().toString());
      var employees = response.data.employees;
      var meta = response.meta || {};

      if (!employees.length) {
        var hasFilters =
          document.getElementById('filter-search').value.trim() !== '' ||
          departmentFilter.value !== 'all' ||
          document.getElementById('filter-status').value !== 'all';

        window.HrmDom.renderListState(body, 8, {
          type: 'empty',
          message: hasFilters ? 'No employees match these filters.' : 'No employees yet.',
          help: hasFilters
            ? 'Try a different search, department or status, or reset the filters.'
            : 'Use “Add Employee” to create the first profile.',
        });
      } else {
        render(employees);
      }

      document.getElementById('employees-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' employee' : ' employees')
        : '';

      window.HrmDom.renderPagination(document.getElementById('employees-pagination'), meta, function (page) {
        currentPage = page;
        void load();
      });
    } catch (error) {
      window.HrmDom.renderListState(body, 8, {
        type: 'error',
        message: error.message,
        help: 'The employee list could not be loaded. Check your connection and try again.',
        onRetry: function () {
          void load();
        },
      });
      window.HrmToast.error(error.message);
    } finally {
      body.setAttribute('aria-busy', 'false');
      window.HrmForms.setBusy(submit, false);
    }
  }

  function resetPhoto() {
    pendingPhoto = null;
    removePhoto = false;
    photoInput.value = '';
    photoPreview.src = '/assets/img/admin.jpg';
  }

  function openModal(employee) {
    editingId = employee ? employee.id : null;
    resetPhoto();
    window.HrmForms.clear(form);

    document.getElementById('employee-modal-title').textContent = employee ? 'Edit employee' : 'Add employee';
    document.getElementById('employee-name').value = employee ? employee.name : '';
    document.getElementById('employee-email').value = employee && employee.email ? employee.email : '';
    document.getElementById('employee-phone').value = employee && employee.phone ? employee.phone : '';
    document.getElementById('employee-position').value = employee && employee.position ? employee.position : '';
    document.getElementById('employee-hire-date').value = employee && employee.hireDate ? employee.hireDate : '';
    document.getElementById('employee-status').value = employee ? employee.status : 'active';

    var departmentId =
      employee && employee.departmentId && typeof employee.departmentId === 'object'
        ? employee.departmentId.id || employee.departmentId._id
        : '';
    departmentSelect.value = departmentId || '';

    if (employee && employee.id && employee.hasPhoto) {
      photoPreview.src = '/api/employees/' + employee.id + '/photo';
    }

    window.jQuery('#employee-modal').modal('show');
  }

  document.getElementById('add-employee').addEventListener('click', function () {
    openModal(null);
  });

  photoInput.addEventListener('change', async function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file) return;

    try {
      pendingPhoto = await window.HrmPhoto.downscale(file);
      removePhoto = false;
      photoPreview.src = 'data:' + pendingPhoto.mime + ';base64,' + pendingPhoto.data;
    } catch (error) {
      resetPhoto();
      window.HrmToast.error(error.message);
    }
  });

  document.getElementById('employee-photo-clear').addEventListener('click', function () {
    resetPhoto();
    removePhoto = true;
    photoPreview.src = '/assets/img/admin.jpg';
  });

  searchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    currentPage = 1;
    void load();
  });

  document.getElementById('reset-filters').addEventListener('click', function () {
    window.setTimeout(function () {
      currentPage = 1;
      void load();
    }, 0);
  });

  body.addEventListener('click', async function (event) {
    var editButton = event.target.closest('[data-edit]');
    if (editButton) {
      window.HrmForms.setBusy(editButton, true, 'Loading…');
      try {
        var response = await window.HrmApi.get('/api/employees/' + editButton.getAttribute('data-edit'));
        openModal(response.data.employee);
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(editButton, false);
      }
      return;
    }

    var statusButton = event.target.closest('[data-status]');
    if (statusButton) {
      var id = statusButton.getAttribute('data-status');
      var current = statusButton.getAttribute('data-current');
      var next = current === 'active' ? 'inactive' : 'active';
      var name = statusButton.getAttribute('aria-label') || 'this employee';

      var changeConfirmed = await window.HrmConfirm({
        title: next === 'inactive' ? 'Deactivate employee?' : 'Activate employee?',
        message:
          next === 'inactive'
            ? 'Deactivate ' + name + '? They will stop appearing on the attendance sheet.'
            : 'Activate ' + name + '? They will appear on the attendance sheet again.',
        confirmLabel: next === 'inactive' ? 'Deactivate' : 'Activate',
        variant: next === 'inactive' ? 'danger' : 'primary',
      });
      if (!changeConfirmed) return;

      window.HrmForms.setBusy(statusButton, true, 'Saving…');
      try {
        await window.HrmApi.patch('/api/employees/' + id, { status: next });
        window.HrmToast.success('The employee was ' + next + '.');
        await load();
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(statusButton, false);
      }
      return;
    }

    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      var deleteName = deleteButton.getAttribute('data-name');
      var confirmed = await window.HrmConfirm({
        title: 'Delete employee?',
        message: 'Delete “' + deleteName + '” for good? This cannot be undone.',
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!confirmed) return;

      window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
      try {
        await window.HrmApi.delete('/api/employees/' + deleteButton.getAttribute('data-delete'));
        window.HrmToast.success('The employee was deleted.');
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
    window.HrmForms.clear(form);

    var payload = {
      name: document.getElementById('employee-name').value.trim(),
      email: document.getElementById('employee-email').value.trim() || null,
      phone: document.getElementById('employee-phone').value.trim() || null,
      departmentId: departmentSelect.value || null,
      position: document.getElementById('employee-position').value.trim() || null,
      hireDate: document.getElementById('employee-hire-date').value || null,
      status: document.getElementById('employee-status').value,
    };

    if (pendingPhoto) payload.photo = pendingPhoto;
    if (removePhoto) payload.photo = null;

    var submit = form.querySelector('[type="submit"]');
    window.HrmForms.setBusy(submit, true, 'Saving…');

    try {
      if (editingId) {
        await window.HrmApi.patch('/api/employees/' + editingId, payload);
        window.HrmToast.success('The employee was updated.');
      } else {
        await window.HrmApi.post('/api/employees', payload);
        window.HrmToast.success('The employee was created.');
      }

      form.reset();
      resetPhoto();
      window.jQuery('#employee-modal').modal('hide');
      await load();
    } catch (error) {
      window.HrmForms.showErrors(form, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(submit, false);
    }
  });

  document.addEventListener('hrm:layout-ready', async function () {
    await loadDepartments();
    await load();
  });
})();
