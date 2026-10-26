/**
 * The attendance report.
 *
 * The counts come from the server and only cover records that were actually
 * written — an employee without a record is not counted as absent.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('report-body');
  var recordForm = document.getElementById('record-form');
  var currentPage = 1;
  var recordsById = {};
  var editingRecordId = null;

  function statusBadge(status) {
    if (status === 'present') return html`<span class="badge-soft badge-soft-success">Present</span>`;
    if (status === 'late') return html`<span class="badge-soft badge-soft-warning">Late</span>`;
    if (status === 'absent') return html`<span class="badge-soft badge-soft-danger">Absent</span>`;
    if (status === 'on_leave') return html`<span class="badge-soft badge-soft-info">On leave</span>`;
    return html`<span class="badge-soft badge-soft-muted">Vacation</span>`;
  }

  function filters() {
    var params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('perPage', '25');

    var from = document.getElementById('filter-from').value;
    if (from) params.set('from', from);

    var to = document.getElementById('filter-to').value;
    if (to) params.set('to', to);

    var department = document.getElementById('filter-department').value;
    if (department) params.set('departmentId', department);

    var employee = document.getElementById('filter-employee').value;
    if (employee) params.set('employeeId', employee);

    return params;
  }

  function renderCounts(counts) {
    var boxes = [
      { label: 'Present', value: counts.present, variant: 'success' },
      { label: 'Late', value: counts.late, variant: 'warning' },
      { label: 'Absent', value: counts.absent, variant: 'danger' },
      { label: 'On leave', value: counts.on_leave, variant: 'info' },
      { label: 'Vacation', value: counts.vacation, variant: 'secondary' },
    ];

    document.getElementById('report-counts').innerHTML = html`${boxes.map(function (box) {
      return html`<div class="col-6 col-md-4 col-lg-2 mb-2">
        <div class="small-box bg-${box.variant} shadow-sm" style="min-height: 86px;">
          <div class="inner">
            <h3>${box.value}</h3>
            <p>${box.label}</p>
          </div>
          <div class="icon"><i class="fa fa-calendar-alt" aria-hidden="true"></i></div>
        </div>
      </div>`;
    })}`;
  }

  async function load() {
    window.HrmDom.renderListState(body, 9, {
      type: 'loading',
      message: 'Loading attendance records…',
    });

    try {
      var response = await window.HrmApi.get('/api/attendance?' + filters().toString());
      var records = response.data.records;
      var meta = response.meta || {};

      recordsById = {};
      records.forEach(function (record) {
        recordsById[record.id] = record;
      });

      renderCounts(response.data.counts);

      if (!records.length) {
        window.HrmDom.renderListState(body, 9, {
          type: 'empty',
          message: 'No records match these filters.',
          help: 'Change the filters, or reset them to see the full report.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          records.map(function (record) {
            var employee = record.employeeId && typeof record.employeeId === 'object' ? record.employeeId : {};
            var department = employee.departmentId && typeof employee.departmentId === 'object'
              ? employee.departmentId.name
              : null;

            return [
              html`<td>${record.date}</td>`,
              html`<td><a href="/employee.html?id=${employee.id}">${employee.name || '—'}</a></td>`,
              html`<td>${department || '—'}</td>`,
              html`<td>${employee.position || '—'}</td>`,
              html`<td>${statusBadge(record.status)}</td>`,
              html`<td>${record.checkIn || '—'}</td>`,
              html`<td>${record.checkOut || '—'}</td>`,
              html`<td>${record.note || '—'}</td>`,
              html`<td class="no-print text-nowrap">
                <button type="button" class="btn btn-sm btn-primary" data-edit="${record.id}" aria-label="Edit attendance for ${employee.name || 'employee'}" title="Edit"><i class="fa fa-pen" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-delete="${record.id}" aria-label="Delete attendance for ${employee.name || 'employee'}" title="Delete"><i class="fa fa-trash" aria-hidden="true"></i></button>
              </td>`,
            ];
          }),
          9,
          'No records match these filters.',
        );
      }

      document.getElementById('report-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' record' : ' records')
        : '';

      window.HrmDom.renderPagination(document.getElementById('report-pagination'), meta, function (page) {
        currentPage = page;
        load();
      });
    } catch (error) {
      window.HrmDom.renderListState(body, 9, {
        type: 'error',
        message: 'The attendance report could not be loaded.',
        help: error.message,
        onRetry: load,
      });
      document.getElementById('report-count').textContent = '';
      window.HrmDom.renderPagination(document.getElementById('report-pagination'), null, function () {});
      window.HrmToast.error(error.message);
    }
  }

  async function loadFilters() {
    try {
      var departments = await window.HrmApi.get('/api/departments');
      document.getElementById('filter-department').innerHTML = html`<option value="">All departments</option>${departments.data.departments.map(
        function (department) {
          return html`<option value="${department.id}">${department.name}</option>`;
        },
      )}`;

      var employees = await window.HrmApi.get('/api/employees?perPage=100');
      document.getElementById('filter-employee').innerHTML = html`<option value="">All employees</option>${employees.data.employees.map(
        function (employee) {
          return html`<option value="${employee.id}">${employee.name}</option>`;
        },
      )}`;
    } catch (error) {
      window.HrmToast.error(error.message);
    }
  }

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

  document.getElementById('print-report').addEventListener('click', function () {
    window.print();
  });

  document.getElementById('export-csv').addEventListener('click', function () {
    var params = filters();
    params.delete('page');
    params.delete('perPage');
    window.location.href = '/api/attendance/export.csv?' + params.toString();
  });

  body.addEventListener('click', async function (event) {
    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      var confirmed = await window.HrmConfirm({
        title: 'Delete attendance record',
        message: 'Delete this attendance record? This cannot be undone.',
        confirmLabel: 'Delete record',
      });
      if (!confirmed) return;

      window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
      try {
        await window.HrmApi.delete('/api/attendance/' + deleteButton.getAttribute('data-delete'));
        window.HrmToast.success('The record was deleted.');
        await load();
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(deleteButton, false);
      }
      return;
    }

    var editButton = event.target.closest('[data-edit]');
    if (editButton) {
      var id = editButton.getAttribute('data-edit');
      var record = recordsById[id];
      if (!record) {
        window.HrmToast.error('That record is no longer on this page — reload the report.');
        return;
      }

      var employee = record.employeeId && typeof record.employeeId === 'object' ? record.employeeId : {};

      document.getElementById('record-modal-title').textContent =
        'Edit ' + (employee.name || 'record') + ' — ' + record.date;
      document.getElementById('record-status').value = record.status;
      document.getElementById('record-check-in').value = record.checkIn || '';
      document.getElementById('record-check-out').value = record.checkOut || '';
      document.getElementById('record-note').value = record.note || '';

      editingRecordId = record.id;
      $('#record-modal').modal('show');
    }
  });

  recordForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (!editingRecordId) return;

    var payload = {
      status: document.getElementById('record-status').value,
      checkIn: document.getElementById('record-check-in').value || null,
      checkOut: document.getElementById('record-check-out').value || null,
      note: document.getElementById('record-note').value.trim() || null,
    };

    var saveButton = document.getElementById('record-save');
    window.HrmForms.clear(recordForm);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      await window.HrmApi.patch('/api/attendance/' + editingRecordId, payload);
      window.HrmToast.success('The record was updated.');
      $('#record-modal').modal('hide');
      await load();
    } catch (error) {
      window.HrmForms.showErrors(recordForm, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  document.addEventListener('hrm:layout-ready', async function () {
    await loadFilters();
    await load();
  });
})();
