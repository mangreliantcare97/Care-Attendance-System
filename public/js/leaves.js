/**
 * Leave & vacation.
 *
 * `days` is computed by the server as the number of working days in the range
 * (Monday–Friday by default), skipping bank/company holiday events. Only
 * approved vacation consumes the holiday allowance; the server owns that
 * decision and the UI only asks the admin to confirm an over-allowance.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('leaves-body');
  var form = document.getElementById('leave-form');
  var studentSelect = document.getElementById('leave-student');
  var filterStudent = document.getElementById('filter-student');
  var filterDepartment = document.getElementById('filter-department');
  var typeSelect = document.getElementById('leave-type');
  var startInput = document.getElementById('leave-start');
  var endInput = document.getElementById('leave-end');
  var previewBox = document.getElementById('leave-preview');

  var editingId = null;
  var currentPage = 1;
  var previewTimer = null;
  var previewRequest = 0;

  var allowanceBody = document.getElementById('allowances-body');
  var allowanceForm = document.getElementById('allowance-form');
  var allowanceYear = document.getElementById('allowance-year');
  var allowanceDepartment = document.getElementById('allowance-department');
  var allowanceSearch = document.getElementById('allowance-search');
  var allowanceMonth = document.getElementById('allowance-month-filter');
  var allowancePage = 1;
  var allowancesLoaded = false;
  var allowanceEditing = null;

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

  function studentOf(leave) {
    return leave.studentId && typeof leave.studentId === 'object' ? leave.studentId : {};
  }

  function departmentOf(leave) {
    var student = studentOf(leave);
    return student.departmentId && typeof student.departmentId === 'object'
      ? student.departmentId.name
      : null;
  }

  function formatDays(value) {
    var number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }

  function monthName(month) {
    return MONTH_NAMES[month - 1] || String(month);
  }

  /** The current year in the application timezone configured on the server. */
  function currentYear() {
    var timeZone = window.HrmAppTimezone;
    if (timeZone && window.Intl && Intl.DateTimeFormat) {
      try {
        var parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: timeZone,
          year: 'numeric',
        }).formatToParts(new Date());
        var year = parts.find(function (part) {
          return part.type === 'year';
        });
        if (year) return Number(year.value);
      } catch (error) {
        /* fall back to the browser clock */
      }
    }
    return new Date().getFullYear();
  }

  // ---- leave list ---------------------------------------------------------

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

    var type = document.getElementById('filter-type').value;
    if (type) params.set('type', type);

    var status = document.getElementById('filter-status').value;
    if (status) params.set('status', status);

    return params;
  }

  async function load() {
    window.HrmDom.renderListState(body, 10, {
      type: 'loading',
      message: 'Loading leave records…',
    });

    try {
      var response = await window.HrmApi.get('/api/leaves?' + filters().toString());
      var leaves = response.data.leaves;
      var meta = response.meta || {};

      if (!leaves.length) {
        window.HrmDom.renderListState(body, 10, {
          type: 'empty',
          message: 'No leave records match these filters.',
          help: 'Change the filters, or reset them to see every leave request.',
        });
      } else {
        window.HrmDom.renderRows(
          body,
          leaves.map(function (leave) {
            var student = studentOf(leave);

            return [
              html`<td class="leave-student-cell" data-label="Student"><a href="/student.html?id=${student.id}"><strong>${student.name || '—'}</strong></a></td>`,
              html`<td data-label="Department">${departmentOf(leave) || '—'}</td>`,
              html`<td data-label="Type">${typeLabel(leave.type)}</td>`,
              html`<td data-label="Category">${leave.category || '—'}</td>`,
              html`<td data-label="From">${leave.startDate}</td>`,
              html`<td data-label="To">${leave.endDate}</td>`,
              html`<td class="text-center" data-label="Days">${leave.days}</td>`,
              html`<td data-label="Status">${statusBadge(leave.status)}</td>`,
              html`<td class="leave-reason-cell" data-label="Reason">${leave.reason || '—'}</td>`,
              html`<td class="no-print text-nowrap leave-actions-cell" data-label="Actions">
                <button type="button" class="btn btn-sm btn-primary" data-edit="${leave.id}" aria-label="Edit leave for ${student.name || 'student'}" title="Edit"><i class="fa fa-pen" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-danger" data-delete="${leave.id}" aria-label="Delete leave for ${student.name || 'student'}" title="Delete"><i class="fa fa-trash" aria-hidden="true"></i></button>
              </td>`,
            ];
          }),
          10,
          'No leave records match these filters.',
        );
      }

      document.getElementById('leaves-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' leave' : ' leaves')
        : '';

      window.HrmDom.renderPagination(document.getElementById('leaves-pagination'), meta, function (page) {
        currentPage = page;
        load();
      });
    } catch (error) {
      window.HrmDom.renderListState(body, 10, {
        type: 'error',
        message: 'The leave records could not be loaded.',
        help: error.message,
        onRetry: load,
      });
      document.getElementById('leaves-count').textContent = '';
      window.HrmDom.renderPagination(document.getElementById('leaves-pagination'), null, function () {});
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
      allowanceDepartment.innerHTML = html`<option value="">All departments</option>${departmentOptions}`;

      var students = await window.HrmApi.get('/api/students?perPage=100');
      var options = students.data.students.map(function (student) {
        return html`<option value="${student.id}">${student.name}</option>`;
      });

      filterStudent.innerHTML = html`<option value="">All students</option>${options}`;
      studentSelect.innerHTML = html`<option value="">Choose a student</option>${options}`;

      // A profile "View leave" link can pre-select the student and range.
      var params = new URLSearchParams(window.location.search);
      var presetStudent = params.get('studentId');
      var presetFrom = params.get('from');
      var presetTo = params.get('to');
      if (presetStudent) filterStudent.value = presetStudent;
      if (presetFrom) document.getElementById('filter-from').value = presetFrom;
      if (presetTo) document.getElementById('filter-to').value = presetTo;
    } catch (error) {
      window.HrmToast.error(error.message);
    }
  }

  function openModal(leave) {
    editingId = leave ? leave.id : null;

    document.getElementById('leave-modal-title').textContent = leave ? 'Edit leave' : 'Add leave';
    document.getElementById('leave-type').value = leave ? leave.type : 'leave';
    document.getElementById('leave-category').value = leave && leave.category ? leave.category : '';
    document.getElementById('leave-start').value = leave ? leave.startDate : '';
    document.getElementById('leave-end').value = leave ? leave.endDate : '';
    document.getElementById('leave-status').value = leave ? leave.status : 'approved';
    document.getElementById('leave-reason').value = leave && leave.reason ? leave.reason : '';

    var student = leave ? studentOf(leave) : {};
    studentSelect.value = student.id || '';

    schedulePreview();
    $('#leave-modal').modal('show');
  }

  // ---- live preview -------------------------------------------------------

  function schedulePreview() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updatePreview, 300);
  }

  function previewMessage(preview) {
    var days = formatDays(preview.days);
    var text = days + ' working ' + (preview.days === 1 ? 'day' : 'days') + ' counted';

    var skipped = [];
    var weekends = preview.skippedWeekendDates.length;
    if (weekends > 0) {
      skipped.push(weekends === 2 ? 'Sat-Sun' : weekends + ' weekend days');
    }

    var holidays = preview.skippedHolidayDates.length;
    if (holidays > 0) {
      skipped.push(holidays + ' bank ' + (holidays === 1 ? 'holiday' : 'holidays'));
    }

    if (skipped.length) text += '; ' + skipped.join(' and ') + ' skipped';
    text += '.';

    if (!preview.consumesAllowance) {
      return text + ' Does not use holiday allowance.';
    }

    if (preview.years && preview.years.length > 1) {
      var balances = preview.years.map(function (entry) {
        var remaining = Number(entry.remaining) || 0;
        var balance = entry.expired
          ? remaining < 0
            ? formatDays(Math.abs(remaining)) + ' over allowance'
            : formatDays(remaining) + ' unused (expired)'
          : formatDays(remaining) + ' remaining';
        return (
          entry.year +
          ': ' +
          formatDays(entry.usedAfter) +
          ' used, ' +
          balance +
          ' of ' +
          formatDays(entry.total)
        );
      });
      text += ' Per year: ' + balances.join('; ') + '.';
    } else if (preview.allowanceTotal !== null) {
      text +=
        ' Remaining after: ' +
        formatDays(preview.remainingAfter) +
        ' of ' +
        formatDays(preview.allowanceTotal) +
        '.';
    }

    if (preview.wouldExceed) {
      var over = preview.years
        .filter(function (entry) {
          return entry.remaining < 0;
        })
        .map(function (entry) {
          return entry.year + ': ' + formatDays(Math.abs(entry.remaining)) + ' over';
        })
        .join(', ');
      if (over) text += ' This would exceed the allowance (' + over + ').';
    }

    return text;
  }

  async function updatePreview() {
    var studentId = studentSelect.value;
    var type = typeSelect.value;
    var startDate = startInput.value;
    var endDate = endInput.value;

    if (!studentId || !type || !startDate || !endDate) {
      previewBox.textContent = 'Choose a student and dates to see the holiday days.';
      previewBox.classList.remove('leave-preview-warning');
      return;
    }

    if (endDate < startDate) {
      previewBox.textContent = 'The end date cannot be before the start date.';
      previewBox.classList.add('leave-preview-warning');
      return;
    }

    var request = ++previewRequest;
    previewBox.textContent = 'Counting the working days…';
    previewBox.classList.remove('leave-preview-warning');

    var params = new URLSearchParams({
      studentId: studentId,
      type: type,
      startDate: startDate,
      endDate: endDate,
    });
    if (editingId) params.set('excludeLeaveId', editingId);

    try {
      var response = await window.HrmApi.get('/api/leaves/preview?' + params.toString());
      if (request !== previewRequest) return;

      var preview = response.data.preview;
      previewBox.textContent = previewMessage(preview);
      previewBox.classList.toggle('leave-preview-warning', preview.wouldExceed);
    } catch (error) {
      if (request !== previewRequest) return;
      previewBox.textContent = error.message;
      previewBox.classList.add('leave-preview-warning');
    }
  }

  // ---- allowance list -----------------------------------------------------

  function buildAllowanceYears() {
    var current = currentYear();
    var selected = Number(allowanceYear.value) || current;
    var options = [];

    for (var year = current + 1; year >= current - 5; year -= 1) {
      options.push(html`<option value="${year}">${year}</option>`);
    }

    allowanceYear.innerHTML = html`${options}`;
    allowanceYear.value = String(selected);
  }

  function buildAllowanceMonths(totals) {
    var selected = allowanceMonth.value;
    var points = totals || [];
    var options = [html`<option value="">All months</option>`];

    for (var month = 1; month <= 12; month += 1) {
      var point = points[month - 1];
      var used = point ? point.used : 0;
      var label =
        monthName(month) +
        ' - ' +
        (used ? formatDays(used) + (used === 1 ? ' day' : ' days') : 'no holiday');
      options.push(html`<option value="${month}">${label}</option>`);
    }

    allowanceMonth.innerHTML = html`${options}`;
    allowanceMonth.value = selected || '';
  }

  function allowanceFilters() {
    var params = new URLSearchParams();
    params.set('year', allowanceYear.value || String(currentYear()));
    params.set('page', String(allowancePage));
    params.set('perPage', '25');

    if (allowanceDepartment.value) params.set('departmentId', allowanceDepartment.value);
    if (allowanceSearch.value.trim()) params.set('search', allowanceSearch.value.trim());
    if (allowanceMonth.value) params.set('month', allowanceMonth.value);

    return params;
  }

  function remainingCell(row) {
    var remaining = Number(row.remaining) || 0;
    var expired = Boolean(row.expired);
    var className = remaining < 0
      ? 'text-danger'
      : expired
        ? 'text-muted'
        : remaining <= 3
          ? 'text-warning'
          : '';
    var label = row.remainingLabel || 'Holiday remaining';
    var overNote =
      expired && remaining < 0
        ? html`<span class="d-block small">Over allowance</span>`
        : '';
    return html`<td class="text-center ${className}" data-label="${label}"><strong>${formatDays(remaining)}</strong>${overNote}</td>`;
  }

  async function loadAllowances() {
    allowancesLoaded = true;

    var month = Number(allowanceMonth.value) || null;
    var columns = month ? 9 : 8;
    var monthColumn = document.getElementById('allowance-month-column');
    monthColumn.classList.toggle('d-none', !month);
    if (month) monthColumn.textContent = 'Used in ' + monthName(month);

    window.HrmDom.renderListState(allowanceBody, columns, {
      type: 'loading',
      message: 'Loading holiday allowances…',
    });

    try {
      var response = await window.HrmApi.get('/api/leaves/allowances?' + allowanceFilters().toString());
      var rows = response.data.allowances;
      var meta = response.meta || {};

      buildAllowanceMonths(response.data.monthTotals);

      document.getElementById('allowance-remaining-column').textContent =
        response.data.remainingHeading || 'Holiday remaining';
      var expiredNote = document.getElementById('allowances-expired-note');
      expiredNote.textContent = response.data.expiredNote || '';
      expiredNote.classList.toggle('d-none', !response.data.expiredNote);

      if (!rows.length) {
        window.HrmDom.renderListState(allowanceBody, columns, {
          type: 'empty',
          message: 'No students match these filters.',
          help: 'Change the year, department or search, then try again.',
        });
      } else {
        window.HrmDom.renderRows(
          allowanceBody,
          rows.map(function (row) {
            var cells = [
              html`<td class="allowance-student-cell" data-label="Student"><a href="/student.html?id=${row.studentId}"><strong>${row.name}</strong></a></td>`,
              html`<td data-label="Department">${row.department || '—'}</td>`,
              html`<td class="text-center" data-label="Allowance">${formatDays(row.allowance)}</td>`,
              html`<td class="text-center" data-label="Total"><strong>${formatDays(row.total)}</strong></td>`,
              html`<td class="text-center" data-label="Used">${formatDays(row.used)}</td>`,
              html`<td class="text-center" data-label="Pending">${formatDays(row.pending)}</td>`,
              remainingCell(row),
            ];

            if (month) {
              cells.push(
                html`<td class="text-center" data-label="Used in ${monthName(month)}">${formatDays(row.usedInMonth || 0)}</td>`,
              );
            }

            cells.push(
              html`<td class="no-print text-nowrap allowance-actions-cell" data-label="Actions">
                <button type="button" class="btn btn-sm btn-outline-primary" data-edit-allowance="${row.studentId}" data-name="${row.name}" data-year="${row.year}" data-allowance="${row.allowance}" data-note="${row.note || ''}" aria-label="Edit the holiday allowance of ${row.name}">Edit allowance</button>
              </td>`,
            );

            return cells;
          }),
          columns,
          'No students match these filters.',
        );
      }

      document.getElementById('allowances-count').textContent = meta.total
        ? meta.total + (meta.total === 1 ? ' student' : ' students')
        : '';

      window.HrmDom.renderPagination(document.getElementById('allowances-pagination'), meta, function (page) {
        allowancePage = page;
        loadAllowances();
      });
    } catch (error) {
      window.HrmDom.renderListState(allowanceBody, columns, {
        type: 'error',
        message: 'The holiday allowances could not be loaded.',
        help: error.message,
        onRetry: loadAllowances,
      });
      document.getElementById('allowances-count').textContent = '';
      window.HrmDom.renderPagination(document.getElementById('allowances-pagination'), null, function () {});
      window.HrmToast.error(error.message);
    }
  }

  function openAllowanceModal(button) {
    var studentId = button.getAttribute('data-edit-allowance');
    var year = button.getAttribute('data-year');

    allowanceEditing = { studentId: studentId, year: year };
    window.HrmForms.clear(allowanceForm);

    document.getElementById('allowance-modal-subtitle').textContent =
      button.getAttribute('data-name') + ' — ' + year;
    document.getElementById('allowance-input').value = formatDays(
      button.getAttribute('data-allowance'),
    );
    document.getElementById('allowance-note').value = button.getAttribute('data-note') || '';

    var modal = window.jQuery('#allowance-modal');
    var allowanceInput = document.getElementById('allowance-input');
    modal.one('shown.bs.modal', function () {
      allowanceInput.focus();
      allowanceInput.select();
    });
    modal.modal('show');
  }

  // ---- events -------------------------------------------------------------

  document.getElementById('add-leave').addEventListener('click', function () {
    openModal(null);
  });

  body.addEventListener('click', async function (event) {
    var editButton = event.target.closest('[data-edit]');
    if (editButton) {
      window.HrmForms.setBusy(editButton, true, 'Loading…');
      try {
        var response = await window.HrmApi.get('/api/leaves/' + editButton.getAttribute('data-edit'));
        openModal(response.data.leave);
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(editButton, false);
      }
      return;
    }

    var deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      var confirmed = await window.HrmConfirm({
        title: 'Delete leave',
        message: 'Delete this leave? Its generated attendance entries will be removed too.',
        confirmLabel: 'Delete leave',
      });
      if (!confirmed) return;

      window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
      try {
        await window.HrmApi.delete('/api/leaves/' + deleteButton.getAttribute('data-delete'));
        window.HrmToast.success('The leave was deleted.');
        await load();
        if (allowancesLoaded) await loadAllowances();
      } catch (error) {
        window.HrmToast.error(error.message);
      } finally {
        window.HrmForms.setBusy(deleteButton, false);
      }
    }
  });

  allowanceBody.addEventListener('click', function (event) {
    var editButton = event.target.closest('[data-edit-allowance]');
    if (editButton) {
      openAllowanceModal(editButton);
      return;
    }

    if (event.target.closest('a')) return;

    // The student link is the accessible route; the whole row is a convenience.
    var row = event.target.closest('tr');
    var link = row && row.querySelector('a[href^="/student.html"]');
    if (link) window.location.href = link.getAttribute('href');
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var startDate = startInput.value;
    var endDate = endInput.value;

    if (startDate && endDate && endDate < startDate) {
      window.HrmToast.error('The end date cannot be before the start date.');
      return;
    }

    var payload = {
      studentId: studentSelect.value,
      type: typeSelect.value,
      category: document.getElementById('leave-category').value.trim() || null,
      startDate: startDate,
      endDate: endDate,
      status: document.getElementById('leave-status').value,
      reason: document.getElementById('leave-reason').value.trim() || null,
    };

    var saveButton = document.getElementById('leave-save');
    window.HrmForms.clear(form);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    async function persist(requestPayload, allowConfirmation) {
      try {
        if (editingId) return await window.HrmApi.patch('/api/leaves/' + editingId, requestPayload);
        return await window.HrmApi.post('/api/leaves', requestPayload);
      } catch (error) {
        if (allowConfirmation && error.code === 'allowance_exceeded') {
          var confirmed = await window.HrmConfirm({
            title: 'Holiday allowance exceeded',
            message: error.message,
            confirmLabel: 'Book anyway',
            variant: 'primary',
          });
          if (confirmed) {
            return persist(
              Object.assign({}, requestPayload, { confirmOverAllowance: true }),
              false,
            );
          }
          var cancelled = new Error('The over-allowance booking was cancelled.');
          cancelled.code = 'confirm_cancelled';
          throw cancelled;
        }
        throw error;
      }
    }

    try {
      await persist(payload, true);
      window.HrmToast.success(editingId ? 'The leave was updated.' : 'The leave was created.');

      form.reset();
      editingId = null;
      $('#leave-modal').modal('hide');
      await load();
      if (allowancesLoaded) await loadAllowances();
    } catch (error) {
      if (error.code !== 'confirm_cancelled') {
        window.HrmForms.showErrors(form, error);
        window.HrmToast.error(error.message);
      }
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  allowanceForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!allowanceEditing) return;

    var saveButton = document.getElementById('allowance-save');
    var payload = {
      allowance: Number(document.getElementById('allowance-input').value),
      note: document.getElementById('allowance-note').value.trim(),
    };

    window.HrmForms.clear(allowanceForm);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      await window.HrmApi.request(
        '/api/students/' +
          allowanceEditing.studentId +
          '/allowance/' +
          allowanceEditing.year,
        { method: 'PUT', body: payload },
      );
      $('#allowance-modal').modal('hide');
      window.HrmToast.success('The holiday allowance was saved.');
      await loadAllowances();
    } catch (error) {
      window.HrmForms.showErrors(allowanceForm, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  typeSelect.addEventListener('change', schedulePreview);
  studentSelect.addEventListener('change', schedulePreview);
  startInput.addEventListener('change', schedulePreview);
  endInput.addEventListener('change', schedulePreview);
  startInput.addEventListener('input', schedulePreview);
  endInput.addEventListener('input', schedulePreview);

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
    window.location.href = '/api/leaves/export.csv?' + params.toString();
  });

  document.getElementById('allowance-filter-form').addEventListener('submit', function (event) {
    event.preventDefault();
    allowancePage = 1;
    loadAllowances();
  });

  document.getElementById('allowance-reset').addEventListener('click', function () {
    window.setTimeout(function () {
      allowanceYear.value = String(currentYear());
      allowanceDepartment.value = '';
      allowanceSearch.value = '';
      allowanceMonth.value = '';
      allowancePage = 1;
      loadAllowances();
    }, 0);
  });

  document.getElementById('allowance-export-csv').addEventListener('click', function () {
    var params = allowanceFilters();
    params.delete('page');
    params.delete('perPage');
    window.location.href = '/api/leaves/allowances/export.csv?' + params.toString();
  });

  document.getElementById('allowance-list-tab-link').addEventListener('click', function () {
    if (!allowancesLoaded) loadAllowances();
  });

  document.addEventListener('hrm:layout-ready', async function () {
    buildAllowanceYears();
    buildAllowanceMonths(null);
    await loadFilters();
    await load();
  });
})();
