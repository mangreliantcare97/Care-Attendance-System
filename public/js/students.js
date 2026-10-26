/**
 * The student list.
 *
 * The list is paginated and filtered on the server. The photo is never part
 * of the list answer — it is loaded from `/api/students/:id/photo`.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('students-body');
  var form = document.getElementById('student-form');
  var searchForm = document.getElementById('search-form');
  var departmentFilter = document.getElementById('filter-department');
  var departmentSelect = document.getElementById('student-department');
  var photoInput = document.getElementById('student-photo-input');
  var photoPreview = document.getElementById('student-photo-preview');

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

  function departmentName(student) {
    if (!student.departmentId) return '—';
    if (typeof student.departmentId === 'string') return '—';
    return student.departmentId.name || '—';
  }

  function photoCell(student) {
    if (!student.id) {
      return html`<td class="student-photo-cell" data-label="Photo">—</td>`;
    }

    return html`<td class="student-photo-cell" data-label="Photo">
      <span class="list-photo">
        <span class="avatar-initials" aria-hidden="true">${initials(student.name)}</span>
        ${student.hasPhoto
          ? html`<img src="/api/students/${student.id}/photo" alt="${student.name}" width="40" height="40"
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
      window.HrmToast.error('Departments could not be loaded. The student list is still available.');
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

  function render(students) {
    window.HrmDom.renderRows(
      body,
      students.map(function (student) {
        return [
          photoCell(student),
          html`<td class="student-name-cell" data-label="Name"><a href="/student.html?id=${student.id}"><strong>${student.name}</strong></a></td>`,
          html`<td data-label="Email">${student.email || '—'}</td>`,
          html`<td data-label="Phone">${student.phone || '—'}</td>`,
          html`<td data-label="Department">${departmentName(student)}</td>`,
          html`<td data-label="Position">${student.position || '—'}</td>`,
          html`<td data-label="Status">${statusBadge(student.status)}</td>`,
          html`<td class="no-print student-actions" data-label="Actions">
            <a href="/student.html?id=${student.id}" class="btn btn-sm btn-info" aria-label="View profile for ${student.name}" title="View profile"><i class="fa fa-eye" aria-hidden="true"></i></a>
            <button type="button" class="btn btn-sm btn-primary" data-edit="${student.id}" aria-label="Edit ${student.name}" title="Edit"><i class="fa fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-sm btn-secondary" data-status="${student.id}" data-current="${student.status}" aria-label="${student.status === 'active' ? 'Deactivate' : 'Activate'} ${student.name}" title="Activate / deactivate"><i class="fa fa-power-off" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-sm btn-danger" data-delete="${student.id}" data-name="${student.name}" aria-label="Delete ${student.name}" title="Delete"><i class="fa fa-trash" aria-hidden="true"></i></button>
          </td>`,
        ];
      }),
      8,
      'No students found.',
    );

    bindPhotoErrors();
  }

  async function load() {
    var submit = searchForm.querySelector('[type="submit"]');
    window.HrmForms.setBusy(submit, true, 'Searching…');
    window.HrmDom.renderListState(body, 8, { type: 'loading', message: 'Loading students…' });
    body.setAttribute('aria-busy', 'true');

    try {
      var response = await window.HrmApi.get('/api/students?' + filters().toString());
      var students = response.data.students;
      var meta = response.meta || {};

      if (!students.length) {
        var hasFilters =
          document.getElementById('filter-search').value.trim() !== '' ||
          departmentFilter.value !== 'all' ||
          document.getElementById('filter-status').value !== 'all';

        window.HrmDom.renderListState(body, 8, {
          type: 'empty',
          message: hasFilters ? 'No students match these filters.' : 'No students yet.',
          help: hasFilters
            ? 'Try a different search, department or status, or reset the filters.'
            : 'Use “Add Student” to create the first profile.',
        });
      } else {
        render(students);
      }

      document.getElementById('students-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' student' : ' students')
        : '';

      window.HrmDom.renderPagination(document.getElementById('students-pagination'), meta, function (page) {
        currentPage = page;
        void load();
      });
    } catch (error) {
      window.HrmDom.renderListState(body, 8, {
        type: 'error',
        message: error.message,
        help: 'The student list could not be loaded. Check your connection and try again.',
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

  function openModal(student) {
    editingId = student ? student.id : null;
    resetPhoto();
    window.HrmForms.clear(form);

    document.getElementById('student-modal-title').textContent = student ? 'Edit student' : 'Add student';
    document.getElementById('student-name').value = student ? student.name : '';
    document.getElementById('student-email').value = student && student.email ? student.email : '';
    document.getElementById('student-phone').value = student && student.phone ? student.phone : '';
    document.getElementById('student-position').value = student && student.position ? student.position : '';
    document.getElementById('student-hire-date').value = student && student.hireDate ? student.hireDate : '';
    document.getElementById('student-status').value = student ? student.status : 'active';

    var departmentId =
      student && student.departmentId && typeof student.departmentId === 'object'
        ? student.departmentId.id || student.departmentId._id
        : '';
    departmentSelect.value = departmentId || '';

    if (student && student.id && student.hasPhoto) {
      photoPreview.src = '/api/students/' + student.id + '/photo';
    }

    window.jQuery('#student-modal').modal('show');
  }

  document.getElementById('add-student').addEventListener('click', function () {
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

  document.getElementById('student-photo-clear').addEventListener('click', function () {
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
        var response = await window.HrmApi.get('/api/students/' + editButton.getAttribute('data-edit'));
        openModal(response.data.student);
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
      var name = statusButton.getAttribute('aria-label') || 'this student';

      var changeConfirmed = await window.HrmConfirm({
        title: next === 'inactive' ? 'Deactivate student?' : 'Activate student?',
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
        await window.HrmApi.patch('/api/students/' + id, { status: next });
        window.HrmToast.success('The student was ' + next + '.');
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
        title: 'Delete student?',
        message: 'Delete “' + deleteName + '” for good? This cannot be undone.',
        confirmLabel: 'Delete',
        variant: 'danger',
      });
      if (!confirmed) return;

      window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
      try {
        await window.HrmApi.delete('/api/students/' + deleteButton.getAttribute('data-delete'));
        window.HrmToast.success('The student was deleted.');
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
      name: document.getElementById('student-name').value.trim(),
      email: document.getElementById('student-email').value.trim() || null,
      phone: document.getElementById('student-phone').value.trim() || null,
      departmentId: departmentSelect.value || null,
      position: document.getElementById('student-position').value.trim() || null,
      hireDate: document.getElementById('student-hire-date').value || null,
      status: document.getElementById('student-status').value,
    };

    if (pendingPhoto) payload.photo = pendingPhoto;
    if (removePhoto) payload.photo = null;

    var submit = form.querySelector('[type="submit"]');
    window.HrmForms.setBusy(submit, true, 'Saving…');

    try {
      if (editingId) {
        await window.HrmApi.patch('/api/students/' + editingId, payload);
        window.HrmToast.success('The student was updated.');
      } else {
        await window.HrmApi.post('/api/students', payload);
        window.HrmToast.success('The student was created.');
      }

      form.reset();
      resetPhoto();
      window.jQuery('#student-modal').modal('hide');
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
