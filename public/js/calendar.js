/**
 * Calendar.
 *
 * FullCalendar 5 is used without jQuery. All dates travel as `YYYY-MM-DD`
 * strings: the API stores an inclusive end date, while FullCalendar wants an
 * exclusive one, so the feed adds a day. Keeping everything date-only means a
 * BST change cannot shift an all-day event to the day before or after.
 */
(function () {
  var calendarElement = document.getElementById('calendar');
  var form = document.getElementById('event-form');
  var modalTitle = document.getElementById('event-modal-title');
  var deleteButton = document.getElementById('delete-event');
  var saveButton = document.getElementById('event-save');

  var editingId = null;
  var calendar = null;
  var autoList = false;
  var smallScreen = window.matchMedia('(max-width: 767.98px)');

  var TYPE_LABELS = {
    holiday: 'Bank / company holiday',
    deadline: 'Deadline',
    meeting: 'Meeting',
    event: 'Event',
    leave: 'Leave',
    vacation: 'Vacation',
    time_off: 'Time off',
  };

  function todayString() {
    var now = new Date();
    return (
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0')
    );
  }

  /** Add days to a date-only string using UTC arithmetic (no DST shifts). */
  function addDays(date, days) {
    var parts = date.split('-').map(Number);
    var value = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function classFor(item) {
    if (item.kind === 'leave') return 'hrm-cal-leave';
    return 'hrm-cal-' + (item.type || 'event');
  }

  function toFullCalendarEvent(item) {
    var description = item.description || '';

    return {
      id: (item.kind === 'leave' ? 'leave:' : 'event:') + item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      allDay: true,
      classNames: [classFor(item)],
      extendedProps: { item: item },
      description: description,
    };
  }

  function openModal(item, date) {
    var event = item && item.kind === 'hr' ? item : null;
    editingId = event ? event.id : null;

    window.HrmForms.clear(form);
    modalTitle.textContent = event ? 'Edit event' : 'Add event';
    document.getElementById('event-type').value = event ? event.type : 'event';
    document.getElementById('event-title').value = event ? event.title : '';
    document.getElementById('event-description').value = event ? event.description || '' : '';

    var start = event ? event.startDate : date || todayString();
    var end = event ? event.endDate : start;
    document.getElementById('event-start').value = start;
    document.getElementById('event-end').value = end;

    deleteButton.classList.toggle('d-none', !event);
    window.jQuery('#event-modal').modal('show');
  }

  function closeModal() {
    window.jQuery('#event-modal').modal('hide');
  }

  function fetchEvents(fetchInfo, successCallback, failureCallback) {
    // FullCalendar's end is exclusive. The API (and our inclusive storage)
    // wants the last day, so subtract one day from the requested end.
    var start = fetchInfo.startStr.slice(0, 10);
    var inclusiveEnd = addDays(fetchInfo.endStr.slice(0, 10), -1);

    window.HrmApi.get(
      '/api/calendar?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(inclusiveEnd),
    )
      .then(function (response) {
        successCallback(response.data.events.map(toFullCalendarEvent));
      })
      .catch(function (error) {
        window.HrmToast.error('The calendar could not be loaded.');
        failureCallback(error);
      });
  }

  function applyResponsiveView() {
    if (!calendar) return;

    if (smallScreen.matches && calendar.view.type !== 'listMonth') {
      autoList = true;
      calendar.changeView('listMonth');
    } else if (!smallScreen.matches && autoList && calendar.view.type === 'listMonth') {
      autoList = false;
      calendar.changeView('dayGridMonth');
    }
  }

  function initCalendar() {
    calendar = new window.FullCalendar.Calendar(calendarElement, {
      initialView: 'dayGridMonth',
      firstDay: 1,
      height: 'auto',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listMonth',
      },
      buttonText: {
        today: 'Today',
        month: 'Month',
        week: 'Week',
        list: 'List',
      },
      dayMaxEvents: 2,
      displayEventTime: false,
      navLinks: true,
      events: fetchEvents,
      dateClick: function (info) {
        openModal(null, info.dateStr.slice(0, 10));
      },
      eventClick: function (info) {
        var item = info.event.extendedProps.item;
        info.jsEvent.preventDefault();

        if (item.kind === 'leave') {
          // Approved leave is managed in its own module.
          window.location.href = item.url || '/leaves.html';
          return;
        }

        openModal(item);
      },
      eventDidMount: function (info) {
        var item = info.event.extendedProps.item;
        var text = item.title + ' — ' + (TYPE_LABELS[item.type] || item.type);
        if (item.description) text += '\n' + item.description;
        info.el.title = text;
      },
      viewDidMount: function () {
        if (smallScreen.matches && calendar.view.type !== 'listMonth') {
          // A user-chosen grid view on a small screen is still allowed; only
          // the initial/resize switch is automatic.
        }
      },
    });

    calendar.render();
    applyResponsiveView();

    if (smallScreen.addEventListener) {
      smallScreen.addEventListener('change', applyResponsiveView);
    } else if (smallScreen.addListener) {
      smallScreen.addListener(applyResponsiveView);
    }
  }

  document.getElementById('add-event').addEventListener('click', function () {
    openModal(null, todayString());
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var startDate = document.getElementById('event-start').value;
    var endDate = document.getElementById('event-end').value;

    if (!startDate || !endDate) {
      window.HrmToast.warning('Choose a start and an end date.');
      return;
    }

    if (endDate < startDate) {
      window.HrmToast.error('The end date cannot be before the start date.');
      return;
    }

    var payload = {
      type: document.getElementById('event-type').value,
      title: document.getElementById('event-title').value.trim(),
      description: document.getElementById('event-description').value.trim() || null,
      startDate: startDate,
      endDate: endDate,
    };

    window.HrmForms.clear(form);
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      if (editingId) {
        await window.HrmApi.patch('/api/events/' + editingId, payload);
        window.HrmToast.success('The event was updated.');
      } else {
        await window.HrmApi.post('/api/events', payload);
        window.HrmToast.success('The event was created.');
      }

      closeModal();
      calendar.refetchEvents();
    } catch (error) {
      window.HrmForms.showErrors(form, error);
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(saveButton, false);
    }
  });

  deleteButton.addEventListener('click', async function () {
    if (!editingId) return;

    var confirmed = await window.HrmConfirm({
      title: 'Delete calendar event',
      message: 'Delete this calendar event? This cannot be undone.',
      confirmLabel: 'Delete event',
    });
    if (!confirmed) return;

    window.HrmForms.setBusy(deleteButton, true, 'Deleting…');
    try {
      await window.HrmApi.delete('/api/events/' + editingId);
      window.HrmToast.success('The event was deleted.');
      closeModal();
      calendar.refetchEvents();
    } catch (error) {
      window.HrmToast.error(error.message);
    } finally {
      window.HrmForms.setBusy(deleteButton, false);
    }
  });

  document.addEventListener('hrm:layout-ready', function () {
    if (calendar) return;
    initCalendar();
  });
})();
