/**
 * Overtime.
 *
 * Hours only — there is no money anywhere in this module. Several entries per
 * day are allowed, but the server refuses a day total above 24 hours.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('overtime-body');
  var form = document.getElementById('overtime-form');
  var studentSelect = document.getElementById('overtime-student');
  var filterStudent = document.getElementById('filter-student');
  var filterDepartment = document.getElementById('filter-department');
  var summaryDepartment = document.getElementById('summary-department');
  var summaryMonth = document.getElementById('summary-month');

  var editingId = null;
  var currentPage = 1;
  var recordsById = {};

  function currentMonth() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function formatHours(value) {
    return Number(value).toString();
  }

  function studentOf(record) {
    return record.studentId && typeof record.studentId === 'object' ? record.studentId : {};
  }

  function departmentOf(record) {
    var student = studentOf(record);
    return student.departmentId && typeof student.departmentId === 'object'
      ? student.departmentId.name
      : null;
  }

  function filters() {
    var params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('perPage', '25');

    var from = document.getElementById('filter-from').value;
    if (from) params.set('from', from);

    var to = document.getElementById('filter-to').value;
    if (to) params.set('to', to);

    var student = filterStudent.value;
    if (student) params.set('studentId', student);

    var department = filterDepartment.value;
    if (department) params.set('departmentId', department);

    return params;
  }

  async function load() {
    window.HrmDom.renderListState(body, 6, {
      type: 'loading',
      message: 'Loading overtime entries…',
    });

    try {
      var response = await window.HrmApi.get('/api/overtime?' + filters().toString());
      var records = response.data.records;
      var meta = response.meta || {};

      recordsById = {};
      records.forEach(function (record) {
        recordsById[record.id] = record;
      });

      if (!records.length) {
        window.HrmDom.renderListState(body, 6, {
          type: 'empty',
          message: 'No overtime entries match these filters.',
          help: 'Change the filters, or reset them to see every entry.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          records.map(function (record) {
            var student = studentOf(record);

            return [
              html`<td><a href="/student.html?id=${student.id}"><strong>${student.name || '—'}</strong></a></td>`,
              html`<td>${departmentOf(record) || '—'}</td>`,
              html`<td>${record.date}</td>`,
              html`<td class="text-center">${formatHours(record.hours)}</td>`,
              html`<td>${record.note || '—'}</td>`,
              html`<td class="no-print text-nowrap">
                <button type="button" class="btn btn-sm btn-primary" data-edit="${record.id}" aria-label="Edit overtime for ${student.name || 'student'}" title="Edit"><i class="fa fa-pen" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-delete="${record.id}" aria-label="Delete overtime for ${student.name || 'student'}" title="Delete"><i class="fa fa-trash" aria-hidden="true"></i></button>
              </td>`,
            ];
          }),
          6,
          'No overtime entries match these filters.',
        );
      }

      var count = meta.total ? meta.total + (meta.total === 1 ? ' entry' : ' entries') : '';
      document.getElementById('overtime-count').textContent =
        count + (meta.total ? ' — ' + formatHours(response.data.totalHours) + ' hours in total' : '');

      window.HrmDom.renderPagination(document.getElementById('overtime-pagination'), meta, function (page) {
        currentPage = page;
        load();
      });
    } catch (error) {
      window.HrmDom.renderListState(body, 6, {
        type: 'error',
        message: 'The overtime entries could not be loaded.',
        help: error.message,
        onRetry: load,
      });
      document.getElementById('overtime-count').textContent = '';
      window.HrmDom.renderPagination(document.getElementById('overtime-pagination'), null, function () {});
      window.HrmToast.error(error.message);
    }
  }

  async function loadFilters() {
    try {
      var departments = await window.HrmApi.get('/api/departments');
      var departmentOptions = departments.data.departments.map(function (department) {
        return html`<option value="${department.id}">${department.name}</option>`;
      });

      filterDepartment.innerHTML = html`<option value="">All departments</option>${departmentOptions}`;
      summaryDepartment.innerHTML = html`<option value="">All departments</option>${departmentOptions}`;

      var students = await window.HrmApi.get('/api/students?perPage=100');
      var studentOptions = students.data.students.map(function (student) {
        return html`<option value="${student.id}">${student.name}</option>`;
      });

      filterStudent.innerHTML = html`<option value="">All students</option>${studentOptions}`;
      studentSelect.innerHTML = html`<option value="">Choose a student</option>${studentOptions}`;
    } catch (error) {
      window.HrmToast.error(error.message);
    }
  }

  function openModal(record) {
    editingId = record ? record.id : null;

    document.getElementById('overtime-modal-title').textContent = record
      ? 'Edit overtime'
      : 'Add overtime';
    document.getElementById('overtime-date').value = record ? record.date : '';
    document.getElementById('overtime-hours').value = record ? record.hours : '';
    document.getElementById('overtime-note').value = record && record.note ? record.note : '';

    var student = record ? studentOf(record) : {};
    studentSelect.value = student.id || '';

    $('#overtime-modal').modal('show');
  }

  async function loadSummary() {
    var month = summaryMonth.value || currentMonth();
    var params = new URLSearchParams();
    params.set('month', month);

    if (summaryDepartment.value) params.set('departmentId', summaryDepartment.value);

    try {
      var response = await window.HrmApi.get('/api/overtime/summary?' + params.toString());
      var result = response.data;

      if (!result.rows.length) {
        window.HrmDom.renderListState(document.getElementById('summary-body'), 4, {
          type: 'empty',
          message: 'No overtime in this month.',
          help: 'Choose another month or department.',
        });
      } else {
        window.HrmDom.renderRows(
          document.getElementById('summary-body'),
          result.rows.map(function (row) {
            return [
              html`<td><a href="/student.html?id=${row.studentId}"><strong>${row.name}</strong></a></td>`,
              html`<td>${row.department}</td>`,
              html`<td class="text-center">${row.entries}</td>`,
              html`<td class="text-right">${formatHours(row.totalHours)}</td>`,
            ];
          }),
          4,
          'No overtime in this month.',
        );
      }

      document.getElementById('summary-total').textContent =
        formatHours(result.totals.hours) + ' hours across ' + result.totals.entries +
        (result.totals.entries === 1 ? ' entry' : ' entries') + ' — ' + result.month;
    } catch (error) {
      window.HrmDom.renderListState(document.getElementById('summary-body'), 4, {
        type: 'error',
        message: 'The overtime summary could not be loaded.',
        help: error.message,
        onRetry: loadSummary,
      });
      document.getElementById('summary-total').textContent = '';
      window.HrmToast.error(error.message);
    }
  }

  document.getElementById('add-overtime').addEventListener('click', function () {
    openModal(null);
  });

  body.addEventListener('click', async function (event) {
    var editButton = event.target.closest('[data-edit]');
    if (editButton) {
      var record = recordsById[editButton.getAttribute('data-edit')];
      if (record) openModal(record);
      return;
    }

    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      var confirmed = await window.HrmConfirm({
        title: 'Delete overtime entry',
        message: 'Delete this overtime entry? This cannot be undone.',
        confirmLabel: 'Delete entry',
      });
      if (!confirmed) return;

      window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
      try {
        await window.HrmApi.delete('/api/overtime/' + deleteButton.getAttribute('data-delete'));
        window.HrmToast.success('The overtime entry was deleted.');
        await load();
        await loadSummary();
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(deleteButton, false);
      }
    }
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var hours = Number(document.getElementById('overtime-hours').value);

    if (!Number.isFinite(hours) || Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-9) {
      window.HrmToast.error('Hours are booked in steps of 0.25.');
      return;
    }

    var payload = {
      studentId: studentSelect.value,
      date: document.getElementById('overtime-date').value,
      hours: hours,
      note: document.getElementById('overtime-note').value.trim() || null,
    };

    var saveButton = document.getElementById('overtime-save');
    window.HrmForms.clear(form);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      if (editingId) {
        await window.HrmApi.patch('/api/overtime/' + editingId, payload);
        window.HrmToast.success('The overtime entry was updated.');
      } else {
        await window.HrmApi.post('/api/overtime', payload);
        window.HrmToast.success('The overtime entry was created.');
      }

      form.reset();
      $('#overtime-modal').modal('hide');
      await load();
      await loadSummary();
    } catch (error) {
      window.HrmForms.showErrors(form, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  document.getElementById('filter-form').addEventListener('submit', function (event) {
    event.preventDefault();
    currentPage = 1;
    load();
  });

  document.getElementById('reset-filters').addEventListener('click', function () {
    window.setTimeout(function () {
      currentPage = 1;
      load();
    }, 0);
  });

  document.getElementById('export-csv').addEventListener('click', function () {
    var params = filters();
    params.delete('page');
    params.delete('perPage');
    window.location.href = '/api/overtime/export.csv?' + params.toString();
  });

  document.getElementById('load-summary').addEventListener('click', loadSummary);
  summaryMonth.addEventListener('change', loadSummary);
  summaryDepartment.addEventListener('change', loadSummary);

  document.getElementById('export-summary').addEventListener('click', function () {
    var params = new URLSearchParams();
    params.set('month', summaryMonth.value || currentMonth());
    if (summaryDepartment.value) params.set('departmentId', summaryDepartment.value);
    window.location.href = '/api/overtime/summary.csv?' + params.toString();
  });

  document.addEventListener('hrm:layout-ready', async function () {
    summaryMonth.value = currentMonth();
    await loadFilters();
    await load();
    await loadSummary();
  });
})();
