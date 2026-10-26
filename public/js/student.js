/**
 * The student profile: personal record, attendance and leave history.
 */
(function () {
  var html = window.HrmDom.html;

  var studentId = new URLSearchParams(window.location.search).get('id');
  var monthInput = document.getElementById('profile-month');

  var allowanceYearSelect = document.getElementById('allowance-year');
  var allowanceMonthSelect = document.getElementById('allowance-month');
  var allowanceEditButton = document.getElementById('allowance-edit');
  var allowanceStudent = null;
  var allowanceSummary = null;
  var allowanceSummaryRequest = 0;
  var allowanceMonthRequest = 0;

  var MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  function currentMonth() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function statusBadge(status) {
    if (status === 'active') return html`<span class="badge-soft badge-soft-success">Active</span>`;
    if (status === 'terminated') return html`<span class="badge-soft badge-soft-danger">Terminated</span>`;
    return html`<span class="badge-soft badge-soft-muted">Inactive</span>`;
  }

  function attendanceBadge(status) {
    if (status === 'present') return html`<span class="badge-soft badge-soft-success">Present</span>`;
    if (status === 'late') return html`<span class="badge-soft badge-soft-warning">Late</span>`;
    if (status === 'absent') return html`<span class="badge-soft badge-soft-danger">Absent</span>`;
    if (status === 'on_leave') return html`<span class="badge-soft badge-soft-info">On leave</span>`;
    return html`<span class="badge-soft badge-soft-muted">Vacation</span>`;
  }

  function leaveBadge(status) {
    if (status === 'approved') return html`<span class="badge-soft badge-soft-success">Approved</span>`;
    if (status === 'rejected') return html`<span class="badge-soft badge-soft-danger">Rejected</span>`;
    return html`<span class="badge-soft badge-soft-warning">Pending</span>`;
  }

  function leaveTypeLabel(type) {
    if (type === 'vacation') return 'Vacation';
    if (type === 'time_off') return 'Time off';
    return 'Leave';
  }

  function detail(label, value) {
    return html`<dt class="col-sm-3 text-muted">${label}</dt><dd class="col-sm-9">${value || '—'}</dd>`;
  }

  // ---- holiday allowance --------------------------------------------------

  function formatDays(value) {
    var number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }

  function roundHalf(value) {
    return Math.round(value * 2) / 2;
  }

  /** Today in the application timezone, as configured on the server. */
  function appToday() {
    var timeZone = window.HrmAppTimezone;
    if (timeZone && window.Intl && Intl.DateTimeFormat) {
      try {
        var parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        var values = {};
        parts.forEach(function (part) {
          values[part.type] = part.value;
        });
        if (values.year && values.month) {
          return { year: Number(values.year), month: Number(values.month) };
        }
      } catch (error) {
        /* fall back to the browser clock */
      }
    }
    var now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  function monthName(month) {
    return MONTH_NAMES[month - 1] || String(month);
  }

  function buildYearOptions(student) {
    var current = appToday().year;
    var hireYear = student && student.hireDate ? Number(student.hireDate.slice(0, 4)) : null;
    var min = hireYear && hireYear >= 2000 ? Math.min(hireYear, current) : current;
    var max = Math.max(current + 1, hireYear || 0);
    var previous = Number(allowanceYearSelect.value);
    var options = [];

    for (var year = max; year >= min; year -= 1) {
      options.push(html`<option value="${year}">${year}</option>`);
    }

    allowanceYearSelect.innerHTML = html`${options}`;
    allowanceYearSelect.value = String(
      previous >= min && previous <= max ? previous : current,
    );
  }

  function buildMonthOptions(summary) {
    var previous = allowanceMonthSelect.value;
    var months = (summary && summary.months) || [];
    var options = [html`<option value="">All months</option>`];

    for (var month = 1; month <= 12; month += 1) {
      var point = months[month - 1];
      var used = point ? point.used : 0;
      var label = monthName(month) + ' - ' + (used ? formatDays(used) + (used === 1 ? ' day' : ' days') : 'no holiday');
      options.push(html`<option value="${month}">${label}</option>`);
    }

    allowanceMonthSelect.innerHTML = html`${options}`;
    allowanceMonthSelect.value = previous || '';
  }

  function statBox(label, value, subtitle, variant, icon, valueClass) {
    return html`<div class="col-6 col-lg-3 mb-2">
      <div class="info-box allowance-stat" data-stat="${label}">
        <span class="info-box-icon bg-${variant}"><i class="fa ${icon}" aria-hidden="true"></i></span>
        <span class="info-box-content">
          <span class="info-box-text">${label}</span>
          <span class="info-box-number ${valueClass || ''}">${value}</span>
          <span class="allowance-stat-subtitle">${subtitle}</span>
        </span>
      </div>
    </div>`;
  }

  function renderAllowance(summary) {
    var total = Number(summary.total) || 0;
    var used = Number(summary.used) || 0;
    var pending = Number(summary.pending) || 0;
    var remaining = Number(summary.remaining) || 0;
    var expired = Boolean(summary.expired);
    var remainingLabel = summary.remainingLabel || 'Holiday remaining';
    var expiredNote = summary.expiredNote || '';
    var expiredPositive = expired && remaining >= 0;

    var remainingVariant = remaining < 0
      ? 'danger'
      : expiredPositive
        ? 'secondary'
        : remaining <= 3
          ? 'warning'
          : 'success';
    var remainingClass = remaining < 0
      ? 'text-danger'
      : expiredPositive
        ? 'text-muted'
        : remaining <= 3
          ? 'text-warning'
          : '';

    var boxes = [
      statBox(
        'Holiday allowance',
        formatDays(total) + ' days',
        formatDays(total) + ' days per year',
        'primary',
        'fa-calendar-alt',
      ),
      statBox(
        'Holiday used',
        formatDays(used) + ' days',
        'of ' + formatDays(total) + ' days',
        'info',
        'fa-plane',
      ),
      statBox(
        remainingLabel,
        formatDays(remaining) + ' days',
        remaining < 0
          ? 'Over by ' + formatDays(Math.abs(remaining)) + ' days'
          : expiredNote || formatDays(remaining) + ' days left',
        remainingVariant,
        remaining < 0 ? 'fa-exclamation-circle' : 'fa-check-circle',
        remainingClass,
      ),
      statBox(
        'Pending',
        formatDays(pending) + ' days',
        pending > 0 ? 'Awaiting approval' : 'Nothing pending',
        'warning',
        'fa-hourglass-half',
      ),
    ];

    document.getElementById('allowance-stats').innerHTML = html`${boxes}`;

    var percent = total > 0 ? Math.min(100, (used / total) * 100) : used > 0 ? 100 : 0;
    var bar = document.getElementById('allowance-progress-bar');
    bar.className =
      'progress-bar ' + (remaining < 0 ? 'bg-danger' : remaining <= 3 ? 'bg-warning' : 'bg-success');
    bar.style.width = percent.toFixed(1) + '%';

    var progress = document.getElementById('allowance-progress');
    progress.setAttribute('aria-valuenow', String(Math.round(percent)));
    progress.setAttribute(
      'aria-valuetext',
      formatDays(used) + ' of ' + formatDays(total) + ' days used',
    );

    document.getElementById('allowance-progress-value').textContent =
      formatDays(used) + ' of ' + formatDays(total) + ' days used';

    allowanceEditButton.disabled = false;
  }

  function showAllowanceError(error) {
    var box = document.getElementById('allowance-error');
    box.textContent = '';
    box.classList.remove('d-none');

    var message = document.createElement('span');
    message.textContent = error.message;
    box.appendChild(message);

    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-sm btn-outline-danger ml-2';
    retry.textContent = 'Try again';
    retry.addEventListener('click', loadAllowance);
    box.appendChild(retry);
  }

  function clearAllowanceError() {
    var box = document.getElementById('allowance-error');
    box.classList.add('d-none');
    box.textContent = '';
  }

  function announceAllowance(message) {
    document.getElementById('allowance-live').textContent = message;
  }

  async function loadAllowanceMonth() {
    var body = document.getElementById('allowance-month-body');
    var foot = document.getElementById('allowance-month-foot');
    var month = Number(allowanceMonthSelect.value);
    var year = Number(allowanceYearSelect.value);

    foot.textContent = '';
    allowanceMonthSelect.disabled = true;

    if (!month) {
      window.HrmDom.renderListState(body, 7, {
        type: 'empty',
        message: 'Choose a month to see the holiday days.',
        help: 'The table shows the approved vacation days counted in one month.',
      });
      allowanceMonthSelect.disabled = false;
      return;
    }

    var request = ++allowanceMonthRequest;
    window.HrmDom.renderListState(body, 7, {
      type: 'loading',
      message: 'Loading ' + monthName(month) + '…',
    });

    try {
      var response = await window.HrmApi.get(
        '/api/students/' +
          studentId +
          '/allowance/month?year=' +
          year +
          '&month=' +
          month,
      );
      if (request !== allowanceMonthRequest) return;

      var result = response.data.month;

      if (!result.leaves.length) {
        window.HrmDom.renderListState(body, 7, {
          type: 'empty',
          message: 'No holiday used in ' + monthName(month) + '.',
          help: 'Approved vacation that counts in this month will appear here.',
        });
        announceAllowance('No holiday used in ' + monthName(month) + '.');
      } else {
        window.HrmDom.renderRows(
          body,
          result.leaves.map(function (leave) {
            return [
              html`<td data-label="From">${leave.startDate}</td>`,
              html`<td data-label="To">${leave.endDate}</td>`,
              html`<td data-label="Weekday">${weekdaySummary(leave.dates)}</td>`,
              html`<td data-label="Category">${leave.category || '—'}</td>`,
              html`<td class="text-center" data-label="Days counted">${formatDays(leave.days)}</td>`,
              html`<td data-label="Reason">${leave.reason || '—'}</td>`,
              html`<td data-label="Leave"><a href="/leaves.html?studentId=${studentId}&from=${leave.startDate}&to=${leave.endDate}">View leave</a></td>`,
            ];
          }),
          7,
          'No holiday used in ' + monthName(month) + '.',
        );

        foot.innerHTML = html`<tr>
          <th scope="row" colspan="4" class="text-right">Month total</th>
          <td class="text-center"><strong>${formatDays(result.total)}</strong></td>
          <td colspan="2"></td>
        </tr>`;

        announceAllowance(
          formatDays(result.total) +
            (result.total === 1 ? ' holiday day' : ' holiday days') +
            ' used in ' +
            monthName(month) +
            '.',
        );
      }
    } catch (error) {
      if (request !== allowanceMonthRequest) return;
      window.HrmDom.renderListState(body, 7, {
        type: 'error',
        message: 'The holiday days for this month could not be loaded.',
        help: error.message,
        onRetry: loadAllowanceMonth,
      });
      announceAllowance('The holiday days for this month could not be loaded.');
      window.HrmToast.error(error.message);
    } finally {
      if (request === allowanceMonthRequest) allowanceMonthSelect.disabled = false;
    }
  }

  function weekdaySummary(dates) {
    if (!dates || !dates.length) return '—';

    var labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var seen = {};
    dates.forEach(function (date) {
      var day = new Date(date + 'T00:00:00Z').getUTCDay();
      seen[labels[day]] = true;
    });
    var picked = order.filter(function (label) {
      return seen[label];
    });
    if (picked.length === 5 && picked.join(',') === 'Mon,Tue,Wed,Thu,Fri') return 'Mon–Fri';
    return picked.join(', ');
  }

  async function loadAllowance() {
    if (!allowanceStudent) return;

    var year = Number(allowanceYearSelect.value);
    var request = ++allowanceSummaryRequest;

    clearAllowanceError();
    allowanceEditButton.disabled = true;
    document.getElementById('allowance-content').setAttribute('aria-busy', 'true');
    announceAllowance('Loading holiday allowance for ' + year + '…');

    try {
      var response = await window.HrmApi.get(
        '/api/students/' + studentId + '/allowance?year=' + year,
      );
      if (request !== allowanceSummaryRequest) return;

      allowanceSummary = response.data.allowance;
      renderAllowance(allowanceSummary);
      buildMonthOptions(allowanceSummary);
      await loadAllowanceMonth();

      announceAllowance(
        'Holiday allowance for ' +
          year +
          ' loaded: ' +
          formatDays(allowanceSummary.used) +
          ' used, ' +
          formatDays(allowanceSummary.remaining) +
          ' remaining.',
      );
    } catch (error) {
      if (request !== allowanceSummaryRequest) return;
      allowanceSummary = null;
      showAllowanceError(error);
      announceAllowance('The holiday allowance could not be loaded.');
      window.HrmToast.error(error.message);
    } finally {
      if (request === allowanceSummaryRequest) {
        document.getElementById('allowance-content').removeAttribute('aria-busy');
      }
    }
  }

  function proRataHint(allowance) {
    if (!allowanceStudent || !allowanceStudent.hireDate) return '';
    var year = Number(allowanceYearSelect.value);
    var hireYear = Number(allowanceStudent.hireDate.slice(0, 4));
    var hireMonth = Number(allowanceStudent.hireDate.slice(5, 7));

    if (hireYear !== year || !(hireMonth > 1)) return '';

    var fullMonths = 12 - hireMonth + 1;
    var suggested = roundHalf((Number(allowance) || 0) * fullMonths / 12);
    return (
      'Mid-year hire: ' +
      formatDays(allowance) +
      ' × ' +
      fullMonths +
      ' full months ÷ 12 ≈ ' +
      formatDays(suggested) +
      ' days (nearest half day). This is only a suggestion and is not applied automatically.'
    );
  }

  function updateProRataHint() {
    var hint = document.getElementById('allowance-prorata');
    var allowance = Number(document.getElementById('allowance-input').value);
    hint.textContent = proRataHint(allowance);
    hint.classList.toggle('d-none', !hint.textContent);
  }

  function openAllowanceModal() {
    if (!allowanceSummary || !allowanceStudent) return;

    var form = document.getElementById('allowance-form');
    window.HrmForms.clear(form);

    document.getElementById('allowance-modal-subtitle').textContent =
      allowanceStudent.name + ' — ' + allowanceSummary.year;
    document.getElementById('allowance-input').value = formatDays(allowanceSummary.allowance);
    document.getElementById('allowance-note').value = allowanceSummary.note || '';
    updateProRataHint();

    var modal = window.jQuery('#allowance-modal');
    var allowanceInput = document.getElementById('allowance-input');
    modal.one('shown.bs.modal', function () {
      allowanceInput.focus();
      allowanceInput.select();
    });
    modal.modal('show');
  }

  async function initAllowance(student) {
    allowanceStudent = student;
    buildYearOptions(student);
    buildMonthOptions(null);
    await loadAllowance();
  }

  async function loadProfile() {
    if (!studentId) {
      window.HrmToast.error('No student was selected.');
      return;
    }

    try {
      var response = await window.HrmApi.get('/api/students/' + studentId);
      var student = response.data.student;

      document.getElementById('profile-title').textContent = student.name;
      var photo = document.getElementById('profile-photo');
      photo.src = student.hasPhoto
        ? '/api/students/' + student.id + '/photo'
        : '/assets/img/admin.jpg';
      photo.alt = student.hasPhoto ? student.name : 'No photo';

      var department = student.departmentId && typeof student.departmentId === 'object'
        ? student.departmentId.name
        : null;

      document.getElementById('profile-details').innerHTML = html`${[
        detail('Name', student.name),
        detail('Email', student.email),
        detail('Phone', student.phone),
        detail('Department', department),
        detail('Position', student.position),
        detail('Hire date', student.hireDate),
        detail('Status', statusBadge(student.status)),
      ]}`;

      await initAllowance(student);
    } catch (error) {
      window.HrmToast.error(error.message);
    }
  }

  async function loadAttendance() {
    var month = monthInput.value || currentMonth();
    var body = document.getElementById('profile-attendance-body');

    window.HrmDom.renderListState(body, 5, {
      type: 'loading',
      message: 'Loading attendance…',
    });

    try {
      var response = await window.HrmApi.get('/api/students/' + studentId + '/attendance?month=' + month);
      var records = response.data.records;
      var counts = response.data.counts;

      var boxes = [
        { label: 'Present', value: counts.present, variant: 'success' },
        { label: 'Late', value: counts.late, variant: 'warning' },
        { label: 'Absent', value: counts.absent, variant: 'danger' },
        { label: 'On leave', value: counts.on_leave, variant: 'info' },
        { label: 'Vacation', value: counts.vacation, variant: 'secondary' },
      ];

      document.getElementById('profile-counts').innerHTML = html`${boxes.map(function (box) {
        return html`<div class="col-6 col-md-2 mb-2">
          <div class="info-box" style="min-height: 78px;">
            <span class="info-box-icon bg-${box.variant}"><i class="fa fa-calendar" aria-hidden="true"></i></span>
            <span class="info-box-content">
              <span class="info-box-text" data-count="${box.label}">${box.label}</span>
              <span class="info-box-number">${box.value}</span>
            </span>
          </div>
        </div>`;
      })}`;

      if (!records.length) {
        window.HrmDom.renderListState(body, 5, {
          type: 'empty',
          message: 'No attendance records for this month.',
          help: 'Choose another month to see earlier records.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          records.map(function (record) {
            return [
              html`<td>${record.date}</td>`,
              html`<td>${attendanceBadge(record.status)}</td>`,
              html`<td>${record.checkIn || '—'}</td>`,
              html`<td>${record.checkOut || '—'}</td>`,
              html`<td>${record.note || '—'}</td>`,
            ];
          }),
          5,
          'No attendance records for this month.',
        );
      }
    } catch (error) {
      window.HrmDom.renderListState(body, 5, {
        type: 'error',
        message: 'The attendance history could not be loaded.',
        help: error.message,
        onRetry: loadAttendance,
      });
      window.HrmToast.error(error.message);
    }
  }

  async function loadLeaves() {
    var body = document.getElementById('profile-leaves-body');

    window.HrmDom.renderListState(body, 7, {
      type: 'loading',
      message: 'Loading leave history…',
    });

    try {
      var response = await window.HrmApi.get('/api/students/' + studentId + '/leaves');

      if (!response.data.leaves.length) {
        window.HrmDom.renderListState(body, 7, {
          type: 'empty',
          message: 'No leave records.',
          help: 'Leave and vacation requests will appear here.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          response.data.leaves.map(function (leave) {
            return [
              html`<td>${leaveTypeLabel(leave.type)}</td>`,
              html`<td>${leave.category || '—'}</td>`,
              html`<td>${leave.startDate}</td>`,
              html`<td>${leave.endDate}</td>`,
              html`<td>${leave.days}</td>`,
              html`<td>${leaveBadge(leave.status)}</td>`,
              html`<td>${leave.reason || '—'}</td>`,
            ];
          }),
          7,
          'No leave records.',
        );
      }
    } catch (error) {
      window.HrmDom.renderListState(body, 7, {
        type: 'error',
        message: 'The leave history could not be loaded.',
        help: error.message,
        onRetry: loadLeaves,
      });
      window.HrmToast.error(error.message);
    }
  }

  async function loadLeaveTotals() {
    var body = document.getElementById('profile-leave-totals-body');

    window.HrmDom.renderListState(body, 5, {
      type: 'loading',
      message: 'Loading yearly totals…',
    });

    try {
      var response = await window.HrmApi.get('/api/students/' + studentId + '/leave-totals');

      if (!response.data.totalsByYear.length) {
        window.HrmDom.renderListState(body, 5, {
          type: 'empty',
          message: 'No approved leave days yet.',
          help: 'Approved leave will be counted by year here.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          response.data.totalsByYear.map(function (year) {
            return [
              html`<td><strong>${year.year}</strong></td>`,
              html`<td class="text-center">${year.leave}</td>`,
              html`<td class="text-center">${year.vacation}</td>`,
              html`<td class="text-center">${year.time_off}</td>`,
              html`<td class="text-center"><strong>${year.total}</strong></td>`,
            ];
          }),
          5,
          'No approved leave days yet.',
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

  monthInput.addEventListener('change', loadAttendance);

  allowanceYearSelect.addEventListener('change', function () {
    // Changing the year always starts from the whole-year view again.
    allowanceMonthSelect.value = '';
    loadAllowance();
  });

  allowanceMonthSelect.addEventListener('change', loadAllowanceMonth);
  allowanceEditButton.addEventListener('click', openAllowanceModal);
  document
    .getElementById('allowance-input')
    .addEventListener('input', updateProRataHint);

  document.getElementById('allowance-form').addEventListener('submit', async function (event) {
    event.preventDefault();

    var form = event.currentTarget;
    var year = Number(allowanceYearSelect.value);
    var saveButton = document.getElementById('allowance-save');

    var payload = {
      allowance: Number(document.getElementById('allowance-input').value),
      note: document.getElementById('allowance-note').value.trim(),
    };

    window.HrmForms.clear(form);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      await window.HrmApi.request(
        '/api/students/' + studentId + '/allowance/' + year,
        { method: 'PUT', body: payload },
      );
      window.jQuery('#allowance-modal').modal('hide');
      window.HrmToast.success('The holiday allowance was saved.');
      await loadAllowance();
    } catch (error) {
      window.HrmForms.showErrors(form, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  document.addEventListener('hrm:layout-ready', async function () {
    monthInput.value = currentMonth();
    await loadProfile();
    await loadAttendance();
    await loadLeaves();
    await loadLeaveTotals();
  });
})();
