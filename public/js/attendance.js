/**
 * The daily attendance sheet.
 *
 * The sheet is a local, editable copy of the day's records. Filters only hide
 * rows, so search and department changes never discard an unsaved mark. The
 * save request contains only rows whose values differ from the server copy.
 */
(function () {
  var html = window.HrmDom.html;

  var body = document.getElementById('sheet-body');
  var dateInput = document.getElementById('sheet-date');
  var loadButton = document.getElementById('load-sheet');
  var departmentSelect = document.getElementById('sheet-department');
  var searchInput = document.getElementById('sheet-search');
  var markAllButton = document.getElementById('mark-all-present');
  var saveButton = document.getElementById('save-sheet');
  var saveStatus = document.getElementById('sheet-save-status');
  var sheetTitle = document.getElementById('sheet-title');
  var sheetSummary = document.getElementById('sheet-summary');

  var STATUSES = [
    { value: 'present', label: 'Present', icon: 'fa-check' },
    { value: 'late', label: 'Late', icon: 'fa-clock' },
    { value: 'absent', label: 'Absent', icon: 'fa-times' },
    { value: 'on_leave', label: 'Leave', icon: 'fa-calendar-times' },
    { value: 'vacation', label: 'Vacation', icon: 'fa-umbrella-beach' },
  ];

  var state = {
    date: '',
    today: '',
    employees: [],
    loading: false,
    saving: false,
    visibleCount: 0,
  };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function todayLocal() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function isDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

  function departmentOf(employee) {
    var department = employee && employee.departmentId;
    if (!department) return { id: '', name: '' };
    if (typeof department === 'string') return { id: department, name: '' };
    return {
      id: String(department.id || department._id || ''),
      name: department.name || '',
    };
  }

  function normaliseRecord(record) {
    if (!record) return null;
    return {
      status: record.status || '',
      checkIn: record.checkIn || '',
      checkOut: record.checkOut || '',
      note: record.note || '',
    };
  }

  function currentValues(employee) {
    return {
      status: employee.status || '',
      checkIn: employee.checkIn || '',
      checkOut: employee.checkOut || '',
      note: employee.note || '',
    };
  }

  function isDirty(employee) {
    var current = currentValues(employee);
    if (!employee.initial) return Boolean(current.status);

    return (
      current.status !== employee.initial.status ||
      current.checkIn !== employee.initial.checkIn ||
      current.checkOut !== employee.initial.checkOut ||
      current.note !== employee.initial.note
    );
  }

  function dirtyEmployees() {
    return state.employees.filter(isDirty);
  }

  function hasDirty() {
    return dirtyEmployees().length > 0;
  }

  function updateCounters() {
    var counts = {
      marked: 0,
      notMarked: 0,
      present: 0,
      late: 0,
      absent: 0,
    };

    state.employees.forEach(function (employee) {
      var marked = Boolean(employee.initial || employee.status);
      if (marked) counts.marked += 1;
      else counts.notMarked += 1;

      if (employee.status === 'present') counts.present += 1;
      if (employee.status === 'late') counts.late += 1;
      if (employee.status === 'absent') counts.absent += 1;
    });

    Object.keys(counts).forEach(function (key) {
      var target = document.querySelector('[data-counter="' + key + '"]');
      if (target) target.textContent = String(counts[key]);
    });
  }

  function updateMarkAllAvailability() {
    if (!markAllButton) return;
    var eligible = state.employees.filter(function (employee) {
      return !employee.initial && !employee.status;
    }).length;
    markAllButton.disabled = state.loading || state.saving || eligible === 0;
    markAllButton.title =
      eligible === 0
        ? 'Every employee already has a saved mark or an unsaved change.'
        : 'Mark ' + eligible + ' employee' + (eligible === 1 ? '' : 's') + ' as Present.';
  }

  function updateSaveBar() {
    var dirty = dirtyEmployees().length;
    var busy = state.loading || state.saving;

    saveButton.disabled = busy || dirty === 0;
    saveStatus.textContent = state.loading
      ? 'Loading the sheet…'
      : state.saving
        ? 'Saving changes…'
        : dirty === 0
          ? 'No unsaved changes'
          : dirty + ' unsaved change' + (dirty === 1 ? '' : 's');

    document.body.classList.toggle('sheet-dirty', dirty > 0);
    updateMarkAllAvailability();
  }

  function updateRow(employee) {
    if (!employee.row) return;

    var dirty = isDirty(employee);
    employee.row.classList.toggle('is-changed', dirty);
    employee.row.classList.toggle('is-unmarked', !employee.initial && !employee.status);

    var badge = employee.stateBadge;
    if (badge) {
      if (dirty) {
        badge.textContent = 'Changed';
        badge.className = 'badge-soft badge-soft-warning state-badge';
      } else if (employee.initial) {
        badge.textContent = 'Saved';
        badge.className = 'badge-soft badge-soft-success state-badge';
      } else {
        badge.textContent = 'Not marked';
        badge.className = 'badge-soft badge-soft-muted state-badge';
      }
    }

    for (var index = 0; index < employee.statusInputs.length; index += 1) {
      employee.statusInputs[index].checked = employee.statusInputs[index].value === employee.status;
    }

    var disabled = !employee.status;
    if (employee.checkInInput) {
      employee.checkInInput.disabled = disabled;
      if (document.activeElement !== employee.checkInInput) employee.checkInInput.value = employee.checkIn;
    }
    if (employee.checkOutInput) {
      employee.checkOutInput.disabled = disabled;
      if (document.activeElement !== employee.checkOutInput) employee.checkOutInput.value = employee.checkOut;
    }
    if (employee.noteInput) {
      employee.noteInput.disabled = disabled;
      if (document.activeElement !== employee.noteInput) employee.noteInput.value = employee.note;
    }
  }

  function readInput(employee, input) {
    if (!input) return;
    if (input === employee.checkInInput) employee.checkIn = input.value;
    if (input === employee.checkOutInput) employee.checkOut = input.value;
    if (input === employee.noteInput) employee.note = input.value;
    updateRow(employee);
    updateCounters();
    updateSaveBar();
  }

  function makeInputCell(employee, label, type, value, maxLength) {
    var cell = document.createElement('td');
    cell.className = type === 'time' ? 'time-cell' : 'note-cell';
    cell.setAttribute('data-label', label);

    var input = document.createElement('input');
    input.type = type;
    input.className = 'form-control form-control-sm';
    input.value = value || '';
    input.setAttribute('aria-label', label + ' for ' + employee.name);
    if (maxLength) input.maxLength = maxLength;
    input.disabled = !employee.status;

    cell.appendChild(input);
    return { cell: cell, input: input };
  }

  function renderEmployees() {
    body.textContent = '';

    if (!state.employees.length) {
      window.HrmDom.renderListState(body, 7, {
        type: 'empty',
        message: 'No active employees to mark.',
        help: 'Add an active employee first, then reload this sheet.',
      });
      return;
    }

    var fragment = document.createDocumentFragment();

    state.employees.forEach(function (employee) {
      var row = document.createElement('tr');
      row.className = 'attendance-row';
      row.setAttribute('data-employee-id', employee.id);

      var employeeCell = document.createElement('td');
      employeeCell.className = 'employee-cell';
      var meta = [employee.position, employee.departmentName].filter(Boolean).join(' · ');
      employeeCell.innerHTML = html`
        <div class="attendance-employee">
          <span class="avatar-initials" aria-hidden="true">${initials(employee.name)}</span>
          <div class="attendance-employee-text">
            <strong>${employee.name}</strong>
            ${meta ? html`<span class="employee-card-meta">${meta}</span>` : ''}
          </div>
        </div>
      `;
      row.appendChild(employeeCell);

      var departmentCell = document.createElement('td');
      departmentCell.className = 'department-cell';
      departmentCell.setAttribute('data-label', 'Department');
      departmentCell.textContent = employee.departmentName || '—';
      row.appendChild(departmentCell);

      var statusCell = document.createElement('td');
      statusCell.className = 'status-cell';
      var group = document.createElement('div');
      group.className = 'status-segmented';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Status for ' + employee.name);

      employee.statusInputs = [];
      STATUSES.forEach(function (status) {
        var label = document.createElement('label');
        label.className = 'status-segment';

        var input = document.createElement('input');
        input.type = 'radio';
        input.className = 'status-radio';
        input.name = 'status-' + employee.id;
        input.value = status.value;
        input.id = 'status-' + employee.id + '-' + status.value;
        input.checked = employee.status === status.value;

        var visible = document.createElement('span');
        visible.className = 'status-segment-label';
        visible.innerHTML = html`<i class="fa ${status.icon}" aria-hidden="true"></i><span>${status.label}</span>`;

        label.appendChild(input);
        label.appendChild(visible);
        group.appendChild(label);
        employee.statusInputs.push(input);
      });
      statusCell.appendChild(group);
      row.appendChild(statusCell);

      var checkIn = makeInputCell(employee, 'Check in', 'time', employee.checkIn);
      employee.checkInInput = checkIn.input;
      row.appendChild(checkIn.cell);

      var checkOut = makeInputCell(employee, 'Check out', 'time', employee.checkOut);
      employee.checkOutInput = checkOut.input;
      row.appendChild(checkOut.cell);

      var note = makeInputCell(employee, 'Note', 'text', employee.note, 500);
      note.input.placeholder = 'Optional note';
      employee.noteInput = note.input;
      row.appendChild(note.cell);

      var stateCell = document.createElement('td');
      stateCell.className = 'state-cell';
      stateCell.setAttribute('data-label', 'State');
      var badge = document.createElement('span');
      badge.className = 'badge-soft badge-soft-muted state-badge';
      badge.textContent = 'Not marked';
      stateCell.appendChild(badge);
      row.appendChild(stateCell);
      employee.stateBadge = badge;
      employee.row = row;

      fragment.appendChild(row);
      updateRow(employee);
    });

    var filterEmpty = document.createElement('tr');
    filterEmpty.id = 'sheet-filter-empty';
    filterEmpty.className = 'd-none';
    var filterCell = document.createElement('td');
    filterCell.colSpan = 7;
    filterCell.className = 'text-center py-4 text-muted';
    filterCell.textContent = 'No employees match this filter. Clear the search or choose another department.';
    filterEmpty.appendChild(filterCell);
    fragment.appendChild(filterEmpty);

    body.appendChild(fragment);
  }

  function rebuildDepartments() {
    var current = departmentSelect.value;
    var departments = [];
    var seen = {};

    state.employees.forEach(function (employee) {
      if (!employee.departmentId || seen[employee.departmentId]) return;
      seen[employee.departmentId] = true;
      departments.push({ id: employee.departmentId, name: employee.departmentName || 'Unnamed department' });
    });

    departments.sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });

    departmentSelect.textContent = '';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'All departments';
    departmentSelect.appendChild(all);

    departments.forEach(function (department) {
      var option = document.createElement('option');
      option.value = department.id;
      option.textContent = department.name;
      departmentSelect.appendChild(option);
    });

    departmentSelect.value = seen[current] ? current : '';
  }

  function applyFilters() {
    if (!state.employees.length) {
      state.visibleCount = 0;
      sheetSummary.textContent = '';
      return;
    }

    var query = searchInput.value.trim().toLowerCase();
    var department = departmentSelect.value;
    var visible = 0;

    state.employees.forEach(function (employee) {
      var matchesName = !query || employee.name.toLowerCase().indexOf(query) !== -1;
      var matchesDepartment = !department || employee.departmentId === department;
      var matches = matchesName && matchesDepartment;
      employee.row.hidden = !matches;
      if (matches) visible += 1;
    });

    state.visibleCount = visible;
    var filterEmpty = document.getElementById('sheet-filter-empty');
    if (filterEmpty) filterEmpty.classList.toggle('d-none', visible !== 0);
    sheetSummary.textContent =
      visible + ' of ' + state.employees.length + ' employee' + (state.employees.length === 1 ? '' : 's') + ' shown';
  }

  function setDateLabel() {
    sheetTitle.textContent = state.date ? 'Daily sheet — ' + state.date : 'Daily sheet';
    document.title = (state.date ? state.date + ' attendance' : 'Attendance') + ' | Human Resource';
  }

  function showLoadingState() {
    window.HrmDom.renderListState(body, 7, {
      type: 'loading',
      message: 'Loading the attendance sheet…',
    });
    body.setAttribute('aria-busy', 'true');
  }

  async function loadSheet(date, force) {
    if (!isDateString(date)) {
      window.HrmToast.error('Choose a valid date.');
      return;
    }

    if (!force && hasDirty()) {
      var discard = await window.HrmConfirm({
        title: 'Discard unsaved changes?',
        message: 'Loading another day will discard the changes you have not saved yet.',
        confirmLabel: 'Discard and load',
        variant: 'danger',
      });
      if (!discard) {
        dateInput.value = state.date || dateInput.value;
        return;
      }
    }

    state.loading = true;
    state.employees = [];
    updateSaveBar();
    updateCounters();
    showLoadingState();
    loadButton.disabled = true;
    saveButton.disabled = true;

    try {
      var response = await window.HrmApi.get('/api/attendance/sheet?date=' + encodeURIComponent(date));
      var data = response.data;

      state.date = data.date;
      state.today = data.today;
      dateInput.value = data.date;
      dateInput.max = data.today || todayLocal();
      setDateLabel();

      state.employees = data.employees.map(function (item) {
        var employee = item.employee || {};
        var department = departmentOf(employee);
        var initial = normaliseRecord(item.record);

        return {
          id: String(employee.id || employee._id || ''),
          name: employee.name || 'Unnamed employee',
          position: employee.position || '',
          departmentId: department.id,
          departmentName: department.name,
          initial: initial,
          status: initial ? initial.status : '',
          checkIn: initial ? initial.checkIn : '',
          checkOut: initial ? initial.checkOut : '',
          note: initial ? initial.note : '',
          row: null,
          stateBadge: null,
          statusInputs: [],
          checkInInput: null,
          checkOutInput: null,
          noteInput: null,
        };
      });

      rebuildDepartments();
      renderEmployees();
      applyFilters();
      updateCounters();
      updateSaveBar();

      if (!window.location.search.includes('date=')) {
        var nextUrl = window.location.pathname + '?date=' + encodeURIComponent(data.date);
        window.history.replaceState(null, '', nextUrl);
      }
    } catch (error) {
      state.employees = [];
      window.HrmDom.renderListState(body, 7, {
        type: 'error',
        message: error.message,
        help: 'The sheet could not be loaded. Check your connection and try again.',
        onRetry: function () {
          void loadSheet(state.date || dateInput.value || todayLocal(), true);
        },
      });
      sheetSummary.textContent = '';
      updateCounters();
      window.HrmToast.error(error.message);
    } finally {
      state.loading = false;
      loadButton.disabled = false;
      body.setAttribute('aria-busy', 'false');
      updateSaveBar();
    }
  }

  async function saveSheet() {
    if (state.saving || state.loading) return;

    var changed = dirtyEmployees().filter(function (employee) {
      return Boolean(employee.status);
    });

    if (!changed.length) {
      window.HrmToast.info('There are no changed rows to save.');
      return;
    }

    var entries = changed.map(function (employee) {
      return {
        employeeId: employee.id,
        status: employee.status,
        checkIn: employee.checkIn || null,
        checkOut: employee.checkOut || null,
        note: employee.note || null,
      };
    });

    state.saving = true;
    window.HrmForms.setBusy(saveButton, true, 'Saving…');
    updateSaveBar();

    try {
      var response = await window.HrmApi.post('/api/attendance/sheet', {
        date: state.date,
        entries: entries,
      });

      changed.forEach(function (employee) {
        employee.initial = currentValues(employee);
        updateRow(employee);
      });

      updateCounters();
      window.HrmToast.success(
        'Saved ' +
          response.data.saved +
          ' changed row' +
          (response.data.saved === 1 ? '' : 's') +
          '.',
      );
    } catch (error) {
      window.HrmToast.error(error.message);
    } finally {
      state.saving = false;
      window.HrmForms.setBusy(saveButton, false);
      updateSaveBar();
    }
  }

  async function markAllPresent() {
    var eligible = state.employees.filter(function (employee) {
      return !employee.initial && !employee.status;
    });

    if (!eligible.length) {
      window.HrmToast.info('Every employee already has a mark or an unsaved change.');
      return;
    }

    var confirmed = await window.HrmConfirm({
      title: 'Mark employees present?',
      message:
        'Mark ' +
        eligible.length +
        ' unmarked employee' +
        (eligible.length === 1 ? '' : 's') +
        ' as Present for ' +
        state.date +
        '? You can still edit them before saving.',
      confirmLabel: 'Mark present',
      variant: 'primary',
    });

    if (!confirmed) return;

    eligible.forEach(function (employee) {
      employee.status = 'present';
      updateRow(employee);
    });

    updateCounters();
    updateSaveBar();
    window.HrmToast.success('Marked ' + eligible.length + ' employee' + (eligible.length === 1 ? '' : 's') + ' present.');
  }

  body.addEventListener('change', function (event) {
    var radio = event.target.closest('.status-radio');
    if (!radio) return;
    var row = radio.closest('[data-employee-id]');
    if (!row) return;
    var employee = state.employees.find(function (item) {
      return item.id === row.getAttribute('data-employee-id');
    });
    if (!employee) return;

    employee.status = radio.value;
    updateRow(employee);
    updateCounters();
    updateSaveBar();
  });

  body.addEventListener('input', function (event) {
    var row = event.target.closest('[data-employee-id]');
    if (!row) return;
    var employee = state.employees.find(function (item) {
      return item.id === row.getAttribute('data-employee-id');
    });
    if (!employee) return;

    if (
      event.target === employee.checkInInput ||
      event.target === employee.checkOutInput ||
      event.target === employee.noteInput
    ) {
      readInput(employee, event.target);
    }
  });

  departmentSelect.addEventListener('change', applyFilters);
  searchInput.addEventListener('input', applyFilters);

  loadButton.addEventListener('click', function () {
    void loadSheet(dateInput.value || todayLocal(), false);
  });

  dateInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void loadSheet(dateInput.value || todayLocal(), false);
    }
  });

  saveButton.addEventListener('click', function () {
    void saveSheet();
  });

  markAllButton.addEventListener('click', function () {
    void markAllPresent();
  });

  window.addEventListener('beforeunload', function (event) {
    if (!hasDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('hrm:layout-ready', function () {
    var requested = new URLSearchParams(window.location.search).get('date');
    var initial = isDateString(requested) ? requested : todayLocal();
    dateInput.max = todayLocal();
    dateInput.value = initial;
    void loadSheet(initial, true);
  });
})();
