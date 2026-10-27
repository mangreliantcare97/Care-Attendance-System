/**
 * Public check-in form.
 *
 * Cookie-free by design: both requests use `credentials: 'omit'`. The page
 * never shows an existing entry, never autocompletes names from the database
 * and never prefills the time — the person always chooses it.
 */
(function () {
  var form = document.getElementById('checkin-form');
  var userType = document.getElementById('checkin-user-type');
  var nameInput = document.getElementById('checkin-name');
  var direction = document.getElementById('checkin-direction');
  var hourSelect = document.getElementById('checkin-hour');
  var minuteSelect = document.getElementById('checkin-minute');
  var periodSelect = document.getElementById('checkin-period');
  var nowButton = document.getElementById('checkin-now');
  var timeChoice = document.getElementById('checkin-time-choice');
  var locationSelect = document.getElementById('checkin-location');
  var locationFull = document.getElementById('checkin-location-full');
  var locationState = document.getElementById('checkin-location-state');
  var locationMessage = document.getElementById('checkin-location-message');
  var retryButton = document.getElementById('checkin-retry');
  var notes = document.getElementById('checkin-notes');
  var notesCount = document.getElementById('checkin-notes-count');
  var company = document.getElementById('checkin-company');
  var submitButton = document.getElementById('checkin-submit');
  var alertBox = document.getElementById('checkin-alert');
  var successBox = document.getElementById('checkin-success');
  var dialog = document.getElementById('checkin-dialog');
  var dialogBackdrop = document.getElementById('checkin-dialog-backdrop');
  var dialogCard = dialog ? dialog.querySelector('.checkin-dialog-card') : null;
  var dialogIcon = document.getElementById('checkin-dialog-icon');
  var dialogTitle = document.getElementById('checkin-dialog-title');
  var dialogBody = document.getElementById('checkin-dialog-body');
  var dialogButton = document.getElementById('checkin-dialog-button');

  var requestedLocation = new URLSearchParams(window.location.search).get('location');
  var locations = [];
  var firstInvalid = null;
  var resetTimer = null;
  var dialogTimer = null;
  var lastFocusedElement = null;
  /** The server's timezone, delivered with the location list (APP_TIMEZONE). */
  var appTimezone = '';

  var EMPTY_LOCATION_MESSAGE = 'No active locations are available. Please ask an administrator.';
  var FAILED_LOCATION_MESSAGE = 'Could not load locations.';
  var RESET_AFTER_MS = 10000;

  // ---- time helpers -------------------------------------------------------

  function pad(value) {
    return String(value).length < 2 ? '0' + String(value) : String(value);
  }

  function format12Hour(hour24, minute) {
    var suffix = hour24 < 12 ? 'AM' : 'PM';
    var hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return pad(hour12) + ':' + pad(minute) + ' ' + suffix;
  }

  function formatClockString(value) {
    var parts = String(value).split(':');
    return format12Hour(Number(parts[0]), Number(parts[1]));
  }

  function fillTimeOptions() {
    for (var hour = 1; hour <= 12; hour += 1) {
      var hourOption = document.createElement('option');
      hourOption.value = String(hour);
      hourOption.textContent = pad(hour);
      hourSelect.appendChild(hourOption);
    }

    for (var minute = 0; minute < 60; minute += 1) {
      var minuteOption = document.createElement('option');
      minuteOption.value = pad(minute);
      minuteOption.textContent = pad(minute);
      minuteSelect.appendChild(minuteOption);
    }
  }

  /** "09:05 AM" under the picker, or nothing while the time is incomplete. */
  function updateTimeChoice() {
    var value = chosenTime();
    if (!timeChoice) return;
    if (value) {
      timeChoice.textContent = 'Time: ' + formatClockString(value);
      timeChoice.hidden = false;
    } else {
      timeChoice.textContent = '';
      timeChoice.hidden = true;
    }
  }

  /** The three selects as 24h `HH:mm`, or '' when any part is missing. */
  function chosenTime() {
    if (!hourSelect.value || !minuteSelect.value || !periodSelect.value) return '';
    var hour = Number(hourSelect.value) % 12;
    if (periodSelect.value === 'PM') hour += 12;
    return pad(hour) + ':' + pad(Number(minuteSelect.value));
  }

  /**
   * The current wall clock in APP_TIMEZONE.
   *
   * The device on a shared kiosk may sit in another timezone (or have its
   * clock wrong), and the server decides the date from APP_TIMEZONE — so "Now"
   * reads the same clock the server does. Falls back to the device time when
   * the timezone was never delivered.
   */
  function currentTimeParts() {
    var options = {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    };
    if (appTimezone) options.timeZone = appTimezone;

    var parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(new Date());
    var hour = '';
    var minute = '';
    parts.forEach(function (part) {
      if (part.type === 'hour') hour = part.value;
      if (part.type === 'minute') minute = part.value;
    });
    return { hour: Number(hour), minute: Number(minute) };
  }

  function fillTimeFromClock() {
    var now = currentTimeParts();
    var hour24 = now.hour % 24;
    var hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    hourSelect.value = String(hour12);
    minuteSelect.value = pad(now.minute);
    periodSelect.value = hour24 < 12 ? 'AM' : 'PM';
    updateTimeChoice();
    clearError(['checkin-hour', 'checkin-minute', 'checkin-period'], 'checkin-time-error');
  }

  // ---- messages -----------------------------------------------------------

  function showAlert(message) {
    if (successBox) {
      successBox.classList.add('d-none');
      successBox.textContent = '';
    }
    if (alertBox) {
      alertBox.textContent = message;
      alertBox.classList.remove('d-none');
    }
  }

  function hideAlert() {
    if (alertBox) {
      alertBox.classList.add('d-none');
      alertBox.textContent = '';
    }
  }

  function showSuccess(message) {
    if (successBox) {
      successBox.textContent = message;
      successBox.classList.remove('d-none');
    }
  }

  function hideSuccess() {
    if (successBox) {
      successBox.classList.add('d-none');
      successBox.textContent = '';
    }
  }

  // ---- field errors -------------------------------------------------------

  function describedByFor(field, errorId) {
    var ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (ids.indexOf(errorId) === -1) ids.push(errorId);
    return ids.join(' ');
  }

  function markError(fieldIds, errorId, message) {
    var errorBox = document.getElementById(errorId);
    if (errorBox) errorBox.textContent = message;

    fieldIds.forEach(function (id, index) {
      var field = document.getElementById(id);
      if (!field) return;
      field.setAttribute('aria-invalid', 'true');
      if (errorBox) field.setAttribute('aria-describedby', describedByFor(field, errorId));
      if (index === 0 && !firstInvalid) firstInvalid = field;
    });
  }

  function clearError(fieldIds, errorId) {
    var errorBox = document.getElementById(errorId);
    if (errorBox) errorBox.textContent = '';

    fieldIds.forEach(function (id) {
      var field = document.getElementById(id);
      if (!field) return;
      field.removeAttribute('aria-invalid');
      var ids = (field.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .filter(function (value) { return value !== errorId; });
      if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
      else field.removeAttribute('aria-describedby');
    });
  }

  var FIELDS = [
    { ids: ['checkin-user-type'], error: 'checkin-user-type-error' },
    { ids: ['checkin-name'], error: 'checkin-name-error' },
    { ids: ['checkin-direction'], error: 'checkin-direction-error' },
    { ids: ['checkin-hour', 'checkin-minute', 'checkin-period'], error: 'checkin-time-error' },
    { ids: ['checkin-location'], error: 'checkin-location-error' },
    { ids: ['checkin-notes'], error: 'checkin-notes-error' },
  ];

  function clearAllErrors() {
    firstInvalid = null;
    FIELDS.forEach(function (field) {
      clearError(field.ids, field.error);
    });
  }

  // ---- locations ---------------------------------------------------------

  function updateLocationLabel() {
    var option = locationSelect.options[locationSelect.selectedIndex];
    if (locationFull) {
      locationFull.textContent = locationSelect.value && option ? option.textContent : '';
    }
  }

  function showLocationState(message, showRetry) {
    if (!locationMessage || !locationState || !retryButton) return;
    locationMessage.textContent = message;
    locationState.hidden = false;
    retryButton.hidden = !showRetry;
    if (showRetry) retryButton.focus();
  }

  function hideLocationState() {
    if (!locationState || !retryButton || !locationMessage) return;
    locationState.hidden = true;
    retryButton.hidden = true;
    locationMessage.textContent = '';
  }

  function renderLocations(list) {
    locations = list || [];
    locationSelect.textContent = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select --';
    locationSelect.appendChild(placeholder);

    if (!locations.length) {
      locationSelect.disabled = true;
      submitButton.disabled = true;
      if (locationFull) locationFull.textContent = '';
      hideAlert();
      hideSuccess();
      showLocationState(EMPTY_LOCATION_MESSAGE, false);
      return;
    }

    var matched = false;
    locations.forEach(function (location) {
      var option = document.createElement('option');
      option.value = location.id;
      option.textContent = location.name;
      locationSelect.appendChild(option);
      if (requestedLocation && location.id === requestedLocation) matched = true;
    });

    hideLocationState();
    locationSelect.disabled = false;
    submitButton.disabled = false;
    locationSelect.value = matched ? requestedLocation : '';
    updateLocationLabel();
  }

  async function loadLocations() {
    if (!locationSelect) return;
    locationSelect.disabled = true;
    if (retryButton) retryButton.hidden = true;
    if (locationState) locationState.hidden = true;

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutId = controller ? window.setTimeout(function () { controller.abort(); }, 15000) : null;

    try {
      var response = await fetch('/api/public/locations', {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      });
      var payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          (payload.error && payload.error.message) || FAILED_LOCATION_MESSAGE,
        );
      }

      if (payload.meta && payload.meta.timezone) appTimezone = String(payload.meta.timezone);
      if (timeoutId) window.clearTimeout(timeoutId);
      renderLocations(payload.data.locations || []);
    } catch (error) {
      if (timeoutId) window.clearTimeout(timeoutId);
      locationSelect.disabled = true;
      submitButton.disabled = true;
      if (locationFull) locationFull.textContent = '';
      showLocationState(FAILED_LOCATION_MESSAGE, true);
    }
  }

  // ---- validation ---------------------------------------------------------

  var FIELD_BY_PATH = {
    userType: FIELDS[0],
    name: FIELDS[1],
    direction: FIELDS[2],
    time: FIELDS[3],
    locationId: FIELDS[4],
    notes: FIELDS[5],
  };

  function validate() {
    clearAllErrors();

    if (!userType.value) {
      markError(FIELDS[0].ids, FIELDS[0].error, 'Choose a user type.');
    }

    var name = nameInput.value.trim();
    if (!name) {
      markError(FIELDS[1].ids, FIELDS[1].error, 'Enter your name.');
    } else if (name.length < 2) {
      markError(FIELDS[1].ids, FIELDS[1].error, 'Enter a name of at least 2 characters.');
    } else if (name.length > 80) {
      markError(FIELDS[1].ids, FIELDS[1].error, 'The name must be 80 characters or fewer.');
    } else if (/[\u0000-\u001F\u007F]/.test(name)) {
      markError(FIELDS[1].ids, FIELDS[1].error, 'That name contains characters that are not allowed.');
    }

    if (!direction.value) {
      markError(FIELDS[2].ids, FIELDS[2].error, 'Choose check in or check out.');
    }

    if (!chosenTime()) {
      markError(FIELDS[3].ids, FIELDS[3].error, 'Choose the hour, minute and AM/PM.');
    }

    if (locationSelect.disabled || !locationSelect.value) {
      markError(FIELDS[4].ids, FIELDS[4].error, 'Choose a location.');
    }

    var notesValue = notes.value.trim();
    if (!notesValue) {
      markError(FIELDS[5].ids, FIELDS[5].error, 'Enter a note for the record.');
    } else if (notesValue.length > 500) {
      markError(FIELDS[5].ids, FIELDS[5].error, 'Notes must be 500 characters or fewer.');
    }

    return firstInvalid === null;
  }

  /** Paint the field errors the server reported; true when at least one mapped. */
  function applyServerErrors(details) {
    if (!Array.isArray(details) || !details.length) return false;

    var applied = false;
    details.forEach(function (issue) {
      var field = FIELD_BY_PATH[issue.path];
      if (!field) return;
      markError(field.ids, field.error, String(issue.message || 'This value is not valid.'));
      applied = true;
    });
    return applied;
  }

  function focusFirstError() {
    if (firstInvalid && typeof firstInvalid.focus === 'function' && !firstInvalid.disabled) {
      firstInvalid.focus();
    }
  }

  // ---- dialog -------------------------------------------------------------

  function closeDialog() {
    if (!dialog) return;
    dialog.classList.add('d-none');
    if (dialogTimer) {
      window.clearTimeout(dialogTimer);
      dialogTimer = null;
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      try {
        lastFocusedElement.focus();
      } catch (e) {}
    }
    lastFocusedElement = null;
  }

  function openDialog(options) {
    if (!dialog || !dialogTitle || !dialogBody || !dialogButton || !dialogIcon) return;
    lastFocusedElement = document.activeElement;
    dialogIcon.textContent = options.type === 'error' ? '!' : '✓';
    dialogIcon.classList.toggle('is-error', options.type === 'error');
    dialogTitle.textContent = options.title || '';
    dialogBody.innerHTML = '';
    if (Array.isArray(options.lines)) {
      options.lines.forEach(function (line) {
        var p = document.createElement('p');
        p.textContent = line;
        dialogBody.appendChild(p);
      });
    } else if (options.text) {
      var p2 = document.createElement('p');
      p2.textContent = options.text;
      dialogBody.appendChild(p2);
    }
    dialog.classList.remove('d-none');
    window.setTimeout(function () {
      if (dialogCard && typeof dialogCard.focus === 'function') {
        dialogCard.focus();
      }
    }, 0);
    if (dialogTimer) window.clearTimeout(dialogTimer);
    if (options.autoClose) {
      dialogTimer = window.setTimeout(closeDialog, options.autoCloseMs || 10000);
    }
    dialogButton.onclick = function () {
      closeDialog();
      if (typeof options.onClose === 'function') options.onClose();
    };
  }

  // ---- submit -------------------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();
    hideSuccess();
    hideAlert();

    if (resetTimer) {
      window.clearTimeout(resetTimer);
      resetTimer = null;
    }

    if (!validate()) {
      focusFirstError();
      return;
    }

    if (locationSelect.disabled || !locationSelect.value) {
      markError(FIELDS[4].ids, FIELDS[4].error, 'Choose a location.');
      focusFirstError();
      return;
    }

    var body = {
      userType: userType.value,
      name: nameInput.value.trim(),
      direction: direction.value,
      time: chosenTime(),
      locationId: locationSelect.value,
      notes: notes.value.trim(),
      company: company ? company.value : '',
    };

    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';

    try {
      var response = await fetch('/api/public/entries', {
        method: 'POST',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      var payload = {};
      try {
        payload = await response.json();
      } catch (e) {
        payload = {};
      }

      if (!response.ok || !payload.success) {
        var err = payload.error || {};
        var code = err.code || '';
        var details = err.details;
        var message = err.message || 'Your entry could not be saved.';

        if (code === 'time_in_future') {
          openDialog({
            type: 'error',
            title: 'Check the time',
            text: 'That time is later than now. Please check AM/PM.',
            autoClose: true,
            autoCloseMs: 10000,
          });
          submitButton.textContent = 'Submit';
          submitButton.disabled = false;
          return;
        }
        if (code === 'duplicate_entry') {
          openDialog({
            type: 'error',
            title: 'Already recorded',
            text: 'This entry was already recorded.',
            autoClose: true,
            autoCloseMs: 10000,
          });
          submitButton.textContent = 'Submit';
          submitButton.disabled = false;
          return;
        }
        if (response.status === 429) {
          openDialog({
            type: 'error',
            title: 'Too many submissions',
            text: 'Too many submissions. Please wait a few minutes and try again.',
            autoClose: true,
            autoCloseMs: 10000,
          });
          submitButton.textContent = 'Submit';
          submitButton.disabled = false;
          return;
        }
        if (response.status >= 500) {
          openDialog({
            type: 'error',
            title: 'Server error',
            text: 'Could not reach the server. Your entry was NOT saved. Please try again.',
            autoClose: true,
            autoCloseMs: 10000,
          });
          submitButton.textContent = 'Submit';
          submitButton.disabled = false;
          return;
        }

        var mapped = applyServerErrors(details);
        if (mapped) {
          focusFirstError();
          openDialog({
            type: 'error',
            title: 'Check the form',
            lines: (Array.isArray(details) ? details.map(function (d) { return d && d.message ? String(d.message) : message; }) : [message]),
            autoClose: true,
            autoCloseMs: 10000,
          });
        } else {
          openDialog({
            type: 'error',
            title: 'Something went wrong',
            text: message,
            autoClose: true,
            autoCloseMs: 10000,
          });
        }
        submitButton.textContent = 'Submit';
        submitButton.disabled = false;
        return;
      }

      var entry = payload.data && payload.data.entry ? payload.data.entry : {};
      var locationName = locationSelect && locationSelect.options[locationSelect.selectedIndex]
        ? locationSelect.options[locationSelect.selectedIndex].textContent
        : '';
      var successTitle = entry.direction === 'out' ? 'Check out recorded' : 'Check in recorded';
      var entryTime = entry.time ? formatClockString(entry.time) : chosenTime() ? formatClockString(chosenTime()) : '';
      var entryDate = entry.date ? formatDisplayDate(entry.date) : formatDisplayDateFromParts();

      // Maintain backward compatibility with existing tests
      try {
        if (successBox) {
          showSuccess(
            'Thank you, ' +
              (entry.name || (nameInput ? nameInput.value.trim() : '')) +
              '. Your ' +
              ((entry.direction || direction.value) === 'out' ? 'check out' : 'check in') +
              ' at ' +
              entryTime +
              ' has been recorded.',
          );
        }
      } catch (e) {}

      scheduleReset();
      if (dialog) {
        try {
          openDialog({
            type: 'success',
            title: successTitle,
            lines: [
              'Name: ' + (entry.name || (nameInput ? nameInput.value.trim() : '')),
              'User type: ' + getUserTypeLabel(userType ? userType.value : ''),
              (entry.direction || direction.value) === 'out' ? 'Direction: Check out' : 'Direction: Check in',
              'Time: ' + entryTime,
              'Date: ' + entryDate,
              locationName ? 'Location: ' + locationName : '',
            ].filter(Boolean),
            autoClose: true,
            autoCloseMs: 10000,
            onClose: function () {
              resetForm();
            },
          });
        } catch (e) {}
      }
      if (submitButton) {
        submitButton.textContent = 'Submit';
        submitButton.disabled = locations.length === 0 || (locationSelect ? locationSelect.disabled : true);
      }
    } catch (error) {
      openDialog({
        type: 'error',
        title: 'Could not reach the server',
        text: 'Could not reach the server. Your entry was NOT saved. Please try again.',
        autoClose: true,
        autoCloseMs: 10000,
      });
      submitButton.textContent = 'Submit';
      submitButton.disabled = false;
    }
  }

  function getUserTypeLabel(value) {
    if (value === 'staff') return 'Staff Member';
    if (value === 'service_user') return 'Service User';
    if (value === 'visitor') return 'Visitor';
    return value || '';
  }

  function formatDisplayDate(isoDate) {
    try {
      var parts = String(isoDate).split('-');
      if (parts.length === 3) {
        var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '');
      }
    } catch (e) {}
    return isoDate || '';
  }

  function formatDisplayDateFromParts() {
    var d = new Date();
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '');
  }

  // ---- reset for the next person ------------------------------------------

  function scheduleReset() {
    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(resetForm, dialog ? 100 : RESET_AFTER_MS);
  }

  function resetForm() {
    resetTimer = null;
    hideSuccess();
    hideAlert();
    clearAllErrors();

    if (userType) userType.value = '';
    if (nameInput) nameInput.value = '';
    if (direction) direction.value = '';
    if (hourSelect) hourSelect.value = '';
    if (minuteSelect) minuteSelect.value = '';
    if (periodSelect) periodSelect.value = '';
    if (notes) notes.value = '';
    if (locationSelect) locationSelect.value = '';

    if (notesCount) updateNotesCount();
    updateTimeChoice();
    updateLocationLabel();

    if (requestedLocation && locationSelect && locations.some(function (item) { return item.id === requestedLocation; })) {
      locationSelect.value = requestedLocation;
      updateLocationLabel();
    }

    if (submitButton) {
      submitButton.textContent = 'Submit';
      submitButton.disabled = locations.length === 0 || (locationSelect ? locationSelect.disabled : true);
    }
    if (nameInput && typeof nameInput.focus === 'function') {
      try { nameInput.focus(); } catch (e) {}
    }
  }

  function updateNotesCount() {
    if (!notesCount || !notes) return;
    notesCount.textContent = String(notes.value.length) + ' / 500';
  }

  // ---- wiring ------------------------------------------------------------

  function bindFieldError(field, ids, errorId) {
    if (!field) return;
    field.addEventListener('change', function () {
      clearError(ids, errorId);
    });
    field.addEventListener('input', function () {
      clearError(ids, errorId);
    });
  }

  bindFieldError(userType, FIELDS[0].ids, FIELDS[0].error);
  bindFieldError(nameInput, FIELDS[1].ids, FIELDS[1].error);
  bindFieldError(direction, FIELDS[2].ids, FIELDS[2].error);
  bindFieldError(notes, FIELDS[5].ids, FIELDS[5].error);

  [hourSelect, minuteSelect, periodSelect].forEach(function (select) {
    if (!select) return;
    select.addEventListener('change', function () {
      clearError(FIELDS[3].ids, FIELDS[3].error);
      updateTimeChoice();
    });
  });

  if (locationSelect) {
    locationSelect.addEventListener('change', function () {
      clearError(FIELDS[4].ids, FIELDS[4].error);
      updateLocationLabel();
    });
  }

  if (notes) notes.addEventListener('input', updateNotesCount);
  if (nowButton) nowButton.addEventListener('click', fillTimeFromClock);
  if (retryButton) {
    retryButton.addEventListener('click', function () {
      void loadLocations();
    });
  }
  if (form) form.addEventListener('submit', handleSubmit);

  if (dialogBackdrop) {
    dialogBackdrop.addEventListener('click', closeDialog);
  }
  if (dialogButton) {
    dialogButton.addEventListener('click', closeDialog);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && !dialog.classList.contains('d-none')) {
      e.preventDefault();
      closeDialog();
    }
  });
  if (dialog) {
    dialog.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  fillTimeOptions();
  updateNotesCount();
  updateTimeChoice();
  void loadLocations();
})();
