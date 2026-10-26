/**
 * Reports.
 *
 * Three tabs use the existing APIs:
 *  - attendance summary: GET /api/reports/attendance-summary (+ CSV)
 *  - overtime: GET /api/overtime/summary (reused as-is)
 *  - leave activity: GET /api/leaves plus the per-employee leave totals
 *
 * All data is loaded on page load, so the print stylesheet can print every tab.
 */
(function () {
  var html = window.HrmDom.html;

  var attendancePage = 1;
  var leavePage = 1;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function todayString() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function currentMonth() {
    return todayString().slice(0, 7);
  }

  function firstOfMonth() {
    return currentMonth() + '-01';
  }

  function firstOfYear() {
    return todayString().slice(0, 4) + '-01-01';
  }

  function lastOfYear() {
    return todayString().slice(0, 4) + '-12-31';
  }

  function typeLabel(type) {
    if (type === 'vacation') return 'Vacation';
    if (type === 'time_off') return 'Time off';
    return 'Leave';
  }

  function statusBadge(status) {
    if (status === 'approved') return html`<span class="badge-soft badge-soft-success">Approved</span>`;
    if (status === 'rejected') return html`<span class="badge-soft badge-soft-danger">Rejected</span>`;
    return html`<span class="badge-soft badge-soft-warning">Pending</span>`;
  }

  function rateBadge(rate) {
    if (rate === null || rate === undefined) {
      return html`<span class="badge-soft badge-soft-muted">—</span>`;
    }

    var variant = rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger';
    return html`<span class="badge-soft badge-soft-${variant}">${rate}%</span>`;
  }

  function employeeOf(record) {
    return record.employeeId && typeof record.employeeId === 'object' ? record.employeeId : {};
  }

  function departmentOf(record) {
    var employee = employeeOf(record);
    return employee.departmentId && typeof employee.departmentId === 'object'
      ? employee.departmentId.name
      : null;
  }

  function fillSelect(select, placeholder, items) {
    select.innerHTML = html`<option value="">${placeholder}</option>${items.map(function (item) {
      return html`<option value="${item.id}">${item.name}</option>`;
    })}`;
  }

  async function loadFilters() {
    var [departmentsResponse, employeesResponse] = await Promise.all([
      window.HrmApi.get('/api/departments'),
      window.HrmApi.get('/api/employees?perPage=100'),
    ]);

    var departments = departmentsResponse.data.departments;
    var employees = employeesResponse.data.employees;

    fillSelect(document.getElementById('attendance-department'), 'All departments', departments);
    fillSelect(document.getElementById('overtime-department'), 'All departments', departments);
    fillSelect(document.getElementById('attendance-employee'), 'All employees', employees);
    fillSelect(document.getElementById('leave-employee'), 'All employees', employees);
  }

  // -------------------------------------------------------------------------
  // Attendance summary
  // -------------------------------------------------------------------------

  function attendanceParams(includePagination) {
    var params = new URLSearchParams();

    var from = document.getElementById('attendance-from').value;
    var to = document.getElementById('attendance-to').value;
    var department = document.getElementById('attendance-department').value;
    var employee = document.getElementById('attendance-employee').value;

    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (department) params.set('departmentId', department);
    if (employee) params.set('employeeId', employee);

    if (includePagination) {
      params.set('page', String(attendancePage));
      params.set('perPage', '25');
    }

    return params;
  }

  async function loadAttendance() {
    window.HrmDom.renderListState(document.getElementById('attendance-body'), 9, {
      type: 'loading',
      message: 'Loading the attendance summary…',
    });

    try {
      var response = await window.HrmApi.get(
        '/api/reports/attendance-summary?' + attendanceParams(true).toString(),
      );
      var rows = response.data.rows;
      var totals = response.data.totals;
      var meta = response.meta || {};

      if (!rows.length) {
        window.HrmDom.renderListState(document.getElementById('attendance-body'), 9, {
          type: 'empty',
          message: 'No attendance in this range.',
          help: 'Change the dates, department or employee and try again.',
        });
      } else {
        window.HrmDom.renderRows(
          document.getElementById('attendance-body'),
          rows.map(function (row) {
            return [
              html`<td><a href="/employee.html?id=${row.employeeId}"><strong>${row.name}</strong></a></td>`,
              html`<td>${row.department || '—'}</td>`,
              html`<td>${row.position || '—'}</td>`,
              html`<td class="text-center">${row.present}</td>`,
              html`<td class="text-center">${row.late}</td>`,
              html`<td class="text-center">${row.absent}</td>`,
              html`<td class="text-center">${row.onLeave}</td>`,
              html`<td class="text-center">${row.vacation}</td>`,
              html`<td class="text-center">${rateBadge(row.rate)}</td>`,
            ];
          }),
          9,
          'No attendance in this range.',
        );
      }

      document.getElementById('attendance-totals').innerHTML = html`<tr class="font-weight-bold">
        <td colspan="3">Total</td>
        <td class="text-center">${totals.present}</td>
        <td class="text-center">${totals.late}</td>
        <td class="text-center">${totals.absent}</td>
        <td class="text-center">${totals.onLeave}</td>
        <td class="text-center">${totals.vacation}</td>
        <td class="text-center">${rateBadge(totals.rate)}</td>
      </tr>`;

      document.getElementById('attendance-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' employee' : ' employees')
        : 'No employees';

      window.HrmDom.renderPagination(
        document.getElementById('attendance-pagination'),
        meta,
        function (page) {
          attendancePage = page;
          loadAttendance();
        },
      );
    } catch (error) {
      document.getElementById('attendance-totals').textContent = '';
      document.getElementById('attendance-count').textContent = '';
      window.HrmDom.renderPagination(
        document.getElementById('attendance-pagination'),
        null,
        function () {},
      );
      window.HrmDom.renderListState(document.getElementById('attendance-body'), 9, {
        type: 'error',
        message: 'The attendance summary could not be loaded.',
        help: error.message,
        onRetry: loadAttendance,
      });
      window.HrmToast.error(error.message);
    }
  }

  // -------------------------------------------------------------------------
  // Overtime
  // -------------------------------------------------------------------------

  function overtimeParams() {
    var params = new URLSearchParams();
    var month = document.getElementById('overtime-month').value;
    var department = document.getElementById('overtime-department').value;

    if (month) params.set('month', month);
    if (department) params.set('departmentId', department);

    return params;
  }

  async function loadOvertime() {
    window.HrmDom.renderListState(document.getElementById('overtime-body'), 4, {
      type: 'loading',
      message: 'Loading the overtime summary…',
    });

    try {
      var response = await window.HrmApi.get('/api/overtime/summary?' + overtimeParams().toString());
      var data = response.data;

      if (!data.rows.length) {
        window.HrmDom.renderListState(document.getElementById('overtime-body'), 4, {
          type: 'empty',
          message: 'No overtime in this month.',
          help: 'Choose another month or department.',
        });
      } else {
        window.HrmDom.renderRows(
          document.getElementById('overtime-body'),
          data.rows.map(function (row) {
            return [
              html`<td><a href="/employee.html?id=${row.employeeId}"><strong>${row.name}</strong></a></td>`,
              html`<td>${row.department || '—'}</td>`,
              html`<td class="text-center">${row.entries}</td>`,
              html`<td class="text-center">${row.totalHours}</td>`,
            ];
          }),
          4,
          'No overtime in this month.',
        );
      }

      document.getElementById('overtime-totals').innerHTML = html`<tr class="font-weight-bold">
        <td colspan="2">Total</td>
        <td class="text-center">${data.totals.entries}</td>
        <td class="text-center">${data.totals.hours}</td>
      </tr>`;
    } catch (error) {
      document.getElementById('overtime-totals').textContent = '';
      window.HrmDom.renderListState(document.getElementById('overtime-body'), 4, {
        type: 'error',
        message: 'The overtime summary could not be loaded.',
        help: error.message,
        onRetry: loadOvertime,
      });
      window.HrmToast.error(error.message);
    }
  }

  // -------------------------------------------------------------------------
  // Leave activity
  // -------------------------------------------------------------------------

  function leaveParams(includePagination) {
    var params = new URLSearchParams();

    var from = document.getElementById('leave-from').value;
    var to = document.getElementById('leave-to').value;
    var type = document.getElementById('leave-type').value;
    var status = document.getElementById('leave-status').value;
    var employee = document.getElementById('leave-employee').value;

    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (employee) params.set('employeeId', employee);

    if (includePagination) {
      params.set('page', String(leavePage));
      params.set('perPage', '50');
    }

    return params;
  }

  async function loadLeaveTotals() {
    var select = document.getElementById('leave-employee');
    var employeeId = select.value;
    var body = document.getElementById('leave-totals-body');
    var title = document.getElementById('leave-totals-title');

    if (!employeeId) {
      title.textContent = 'Approved leave totals by year';
      body.innerHTML = html`<tr><td colspan="5" class="text-muted text-center py-3">Choose an employee to see their yearly totals.</td></tr>`;
      return;
    }

    window.HrmDom.renderListState(body, 5, {
      type: 'loading',
      message: 'Loading yearly leave totals…',
    });

    try {
      var response = await window.HrmApi.get('/api/employees/' + employeeId + '/leave-totals');
      var totals = response.data.totalsByYear || [];
      var name = select.options[select.selectedIndex].textContent;
      title.textContent = 'Approved leave totals — ' + name;

      if (!totals.length) {
        window.HrmDom.renderListState(body, 5, {
          type: 'empty',
          message: 'No approved leave for this employee.',
          help: 'Approved leave will be counted by year here.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          totals.map(function (year) {
            return [
              html`<td>${year.year}</td>`,
              html`<td class="text-center">${year.leave}</td>`,
              html`<td class="text-center">${year.vacation}</td>`,
              html`<td class="text-center">${year.time_off}</td>`,
              html`<td class="text-center"><strong>${year.total}</strong></td>`,
            ];
          }),
          5,
          'No approved leave for this employee.',
        );
      }
    } catch (error) {
      window.HrmDom.renderListState(body, 5, {
        type: 'error',
        message: 'The yearly leave totals could not be loaded.',
        help: error.message,
        onRetry: loadLeaveTotals,
      });
      window.HrmToast.error(error.message);
    }
  }

  async function loadLeave() {
    window.HrmDom.renderListState(document.getElementById('leave-body'), 8, {
      type: 'loading',
      message: 'Loading leave activity…',
    });

    try {
      var response = await window.HrmApi.get('/api/leaves?' + leaveParams(true).toString());
      var leaves = response.data.leaves;
      var meta = response.meta || {};

      if (!leaves.length) {
        window.HrmDom.renderListState(document.getElementById('leave-body'), 8, {
          type: 'empty',
          message: 'No leave records match these filters.',
          help: 'Change the dates, type, status or employee and try again.',
        });
      } else {
        window.HrmDom.renderRows(
          document.getElementById('leave-body'),
          leaves.map(function (leave) {
            var employee = employeeOf(leave);

            return [
              html`<td><a href="/employee.html?id=${employee.id}"><strong>${employee.name || '—'}</strong></a></td>`,
              html`<td>${departmentOf(leave) || '—'}</td>`,
              html`<td>${typeLabel(leave.type)}</td>`,
              html`<td>${leave.category || '—'}</td>`,
              html`<td>${leave.startDate}</td>`,
              html`<td>${leave.endDate}</td>`,
              html`<td class="text-center">${leave.days}</td>`,
              html`<td>${statusBadge(leave.status)}</td>`,
            ];
          }),
          8,
          'No leave records match these filters.',
        );
      }

      document.getElementById('leave-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' leave' : ' leaves')
        : 'No leaves';

      window.HrmDom.renderPagination(
        document.getElementById('leave-pagination'),
        meta,
        function (page) {
          leavePage = page;
          loadLeave();
        },
      );
    } catch (error) {
      document.getElementById('leave-count').textContent = '';
      window.HrmDom.renderPagination(
        document.getElementById('leave-pagination'),
        null,
        function () {},
      );
      window.HrmDom.renderListState(document.getElementById('leave-body'), 8, {
        type: 'error',
        message: 'The leave activity could not be loaded.',
        help: error.message,
        onRetry: loadLeave,
      });
      window.HrmToast.error(error.message);
    }
  }

  // -------------------------------------------------------------------------
  // Filter events
  // -------------------------------------------------------------------------

  function setDefaults() {
    document.getElementById('attendance-from').value = firstOfMonth();
    document.getElementById('attendance-to').value = todayString();
    document.getElementById('overtime-month').value = currentMonth();
    document.getElementById('leave-from').value = firstOfYear();
    document.getElementById('leave-to').value = lastOfYear();
  }

  document.getElementById('attendance-filter-form').addEventListener('submit', function (event) {
    event.preventDefault();
    attendancePage = 1;
    loadAttendance();
  });

  document.getElementById('attendance-reset').addEventListener('click', function () {
    window.setTimeout(function () {
      document.getElementById('attendance-from').value = firstOfMonth();
      document.getElementById('attendance-to').value = todayString();
      attendancePage = 1;
      loadAttendance();
    }, 0);
  });

  document.getElementById('attendance-export').addEventListener('click', function () {
    window.location.href =
      '/api/reports/attendance-summary.csv?' + attendanceParams(false).toString();
  });

  document.getElementById('overtime-filter-form').addEventListener('submit', function (event) {
    event.preventDefault();
    loadOvertime();
  });

  document.getElementById('overtime-reset').addEventListener('click', function () {
    window.setTimeout(function () {
      document.getElementById('overtime-month').value = currentMonth();
      loadOvertime();
    }, 0);
  });

  document.getElementById('overtime-export').addEventListener('click', function () {
    window.location.href = '/api/overtime/summary.csv?' + overtimeParams().toString();
  });

  document.getElementById('leave-filter-form').addEventListener('submit', function (event) {
    event.preventDefault();
    leavePage = 1;
    loadLeave();
    loadLeaveTotals();
  });

  document.getElementById('leave-reset').addEventListener('click', function () {
    window.setTimeout(function () {
      document.getElementById('leave-from').value = firstOfYear();
      document.getElementById('leave-to').value = lastOfYear();
      leavePage = 1;
      loadLeave();
      loadLeaveTotals();
    }, 0);
  });

  document.getElementById('leave-employee').addEventListener('change', loadLeaveTotals);

  document.getElementById('leave-export').addEventListener('click', function () {
    window.location.href = '/api/leaves/export.csv?' + leaveParams(false).toString();
  });

  document.getElementById('print-report').addEventListener('click', function () {
    window.print();
  });

  document.addEventListener('hrm:layout-ready', async function () {
    setDefaults();

    try {
      await loadFilters();
    } catch (error) {
      window.HrmToast.error(error.message);
    }

    loadAttendance();
    loadOvertime();
    loadLeave();
    loadLeaveTotals();
  });
})();
