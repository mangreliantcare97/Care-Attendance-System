/**
 * Desktop dashboard.
 *
 * Every card is filled from the three dashboard endpoints; nothing is
 * hard-coded. Chart.js 2.9.4 reads its colours from the same CSS custom
 * properties as the rest of the theme, so a light/dark switch only has to
 * destroy and rebuild the charts.
 */
(function () {
  var html = window.HrmDom.html;

  var yearSelect = document.getElementById('year-select');
  var monthSelect = document.getElementById('month-select');
  var notMarkedCard = document.getElementById('not-marked-card');
  var notMarkedLink = document.getElementById('not-marked-link');
  var notice = document.getElementById('non-working-notice');
  var noticeText = document.getElementById('non-working-text');
  var summaryDateLong = document.getElementById('summary-date-long');
  var clock = document.getElementById('dashboard-clock');
  var dayStatus = document.getElementById('day-status');
  var ringValue = document.getElementById('coverage-ring-value');
  var ringPercent = document.getElementById('coverage-percent');
  var ringCaption = document.getElementById('coverage-caption');
  var ringSvg = document.querySelector('.coverage-ring__svg');
  var monthCaption = document.getElementById('month-chart-caption');
  var seriesButtons = document.querySelectorAll('[data-series]');

  var RING_RADIUS = 52;
  var RING_LENGTH = 2 * Math.PI * RING_RADIUS;

  var SERIES = {
    attendance: { label: 'Attendance', accent: '#5C83EC' },
    absence: { label: 'Absence', accent: '#F2A51A' },
    leave: { label: 'Leave & vacation', accent: '#8B63E8' },
  };

  var STAT_KEYS = ['present', 'late', 'absent', 'onLeave'];
  var DONUT_COLORS = ['#5C83EC', '#8B63E8', '#F2A51A', '#4E8F77', '#D98B72', '#7FA6D9'];

  var activeSeries = 'attendance';
  var charts = { year: null, month: null, departments: null };
  var lastData = { year: null, month: null, departments: [] };

  function cssVar(name, fallback) {
    var value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function palette() {
    return {
      text: cssVar('--hrm-text', '#303934'),
      muted: cssVar('--hrm-text-muted', '#65716D'),
      border: cssVar('--hrm-border', '#dee2e6'),
      surface: cssVar('--hrm-surface', '#ffffff'),
    };
  }

  function hexToRgba(value, alpha) {
    var hex = String(value).replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (!/^[0-9a-f]{6}$/i.test(hex)) return value;

    return (
      'rgba(' +
      parseInt(hex.slice(0, 2), 16) +
      ', ' +
      parseInt(hex.slice(2, 4), 16) +
      ', ' +
      parseInt(hex.slice(4, 6), 16) +
      ', ' +
      alpha +
      ')'
    );
  }

  function destroyChart(name) {
    if (charts[name]) {
      charts[name].destroy();
      charts[name] = null;
    }
  }

  function monthLabel(key) {
    var parts = String(key || '').split('-');
    if (parts.length < 2) return key || '';
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    if (isNaN(date.getTime())) return key;
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function formatLongDate(value) {
    var parts = String(value || '').split('-');
    if (parts.length !== 3) return value || '—';
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function tickClock() {
    if (!clock) return;
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    clock.textContent = (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
    clock.setAttribute('datetime', now.toISOString());
  }

  // ---- charts ------------------------------------------------------------

  function renderMonthChart() {
    if (!lastData.month) return;
    destroyChart('month');

    var canvas = document.getElementById('month-chart');
    if (!canvas || !window.Chart) return;

    var meta = SERIES[activeSeries] || SERIES.attendance;
    var days = lastData.month.days;
    var values = days.map(function (day) {
      return Number(day[activeSeries]) || 0;
    });
    var total = values.reduce(function (sum, value) {
      return sum + value;
    }, 0);
    var colors = palette();
    var label = monthLabel(lastData.month.month);
    var chartWidth = (canvas.parentNode && canvas.parentNode.clientWidth) || window.innerWidth;
    var tickLimit = chartWidth < 480 ? 7 : chartWidth < 760 ? 10 : 16;

    canvas.setAttribute('aria-label', meta.label + ' per day for ' + label);

    if (monthCaption) {
      monthCaption.textContent =
        label +
        ' · ' +
        total +
        ' ' +
        meta.label.toLowerCase() +
        ' record' +
        (total === 1 ? '' : 's');
    }

    charts.month = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: days.map(function (day) {
          return day.label;
        }),
        datasets: [
          {
            label: meta.label,
            data: values,
            backgroundColor: hexToRgba(meta.accent, 0.55),
            hoverBackgroundColor: meta.accent,
            borderWidth: 0,
            barPercentage: 0.82,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        legend: { display: false },
        tooltips: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function (tooltipItem, data) {
              return data.datasets[0].label + ': ' + tooltipItem.yLabel;
            },
          },
        },
        scales: {
          xAxes: [
            {
              gridLines: { display: false },
              ticks: {
                fontColor: colors.muted,
                autoSkip: true,
                maxTicksLimit: tickLimit,
                maxRotation: 0,
                minRotation: 0,
              },
            },
          ],
          yAxes: [
            {
              beginAtZero: true,
              gridLines: {
                color: hexToRgba(colors.border, 0.6),
                zeroLineColor: hexToRgba(colors.border, 0.6),
                drawBorder: false,
              },
              ticks: { precision: 0, beginAtZero: true, fontColor: colors.muted },
            },
          ],
        },
      },
    });
  }

  function renderYearChart() {
    if (!lastData.year) return;
    destroyChart('year');

    var canvas = document.getElementById('year-chart');
    if (!canvas || !window.Chart) return;

    var colors = palette();
    var months = lastData.year.months;
    var chartWidth = (canvas.parentNode && canvas.parentNode.clientWidth) || window.innerWidth;
    var tickLimit = chartWidth < 480 ? 6 : 12;

    function series(label, key, accent) {
      return {
        label: label,
        data: months.map(function (point) {
          return point[key];
        }),
        borderColor: accent,
        backgroundColor: hexToRgba(accent, 0.12),
        pointBackgroundColor: accent,
        pointBorderColor: accent,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 14,
        fill: false,
        lineTension: 0.35,
      };
    }

    charts.year = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: months.map(function (point) {
          return point.label;
        }),
        datasets: [
          series('Attendance', 'attendance', '#5C83EC'),
          series('Absence', 'absence', '#F2A51A'),
          series('Leave & vacation', 'leave', '#8B63E8'),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          labels: { fontColor: colors.text, usePointStyle: true, boxWidth: 8 },
        },
        tooltips: { mode: 'index', intersect: false },
        scales: {
          xAxes: [
            {
              gridLines: { display: false },
              ticks: {
                fontColor: colors.muted,
                autoSkip: true,
                maxTicksLimit: tickLimit,
                maxRotation: 0,
                minRotation: 0,
              },
            },
          ],
          yAxes: [
            {
              beginAtZero: true,
              gridLines: {
                color: hexToRgba(colors.border, 0.6),
                zeroLineColor: hexToRgba(colors.border, 0.6),
                drawBorder: false,
              },
              ticks: { precision: 0, beginAtZero: true, fontColor: colors.muted },
            },
          ],
        },
      },
    });
  }

  function renderDepartments() {
    var departments = lastData.departments;
    var colors = palette();
    var canvas = document.getElementById('departments-chart');
    var empty = document.getElementById('departments-chart-empty');

    destroyChart('departments');

    if (!departments.length) {
      if (canvas) canvas.classList.add('d-none');
      if (empty) empty.classList.remove('d-none');
    } else {
      if (canvas) canvas.classList.remove('d-none');
      if (empty) empty.classList.add('d-none');

      charts.departments = new window.Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: departments.map(function (department) {
            return department.name;
          }),
          datasets: [
            {
              data: departments.map(function (department) {
                return department.activeStudents;
              }),
              backgroundColor: departments.map(function (department, index) {
                return DONUT_COLORS[index % DONUT_COLORS.length];
              }),
              borderColor: colors.surface,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutoutPercentage: 64,
          legend: {
            position: 'bottom',
            labels: {
              fontColor: colors.text,
              usePointStyle: true,
              boxWidth: 8,
              fontSize: 11,
              padding: 10,
            },
          },
          tooltips: {
            callbacks: {
              label: function (tooltipItem, data) {
                return (
                  data.labels[tooltipItem.index] +
                  ': ' +
                  data.datasets[0].data[tooltipItem.index] +
                  ' active'
                );
              },
            },
          },
        },
      });
    }

    var totalActive = departments.reduce(function (sum, department) {
      return sum + (Number(department.activeStudents) || 0);
    }, 0);

    window.HrmDom.renderRows(
      document.getElementById('departments-body'),
      departments.map(function (department) {
        var share = totalActive
          ? Math.round(((Number(department.activeStudents) || 0) / totalActive) * 100)
          : 0;
        return [
          html`<td>${department.name}</td>`,
          html`<td class="text-center"><strong>${department.activeStudents}</strong></td>`,
          html`<td><span class="table-share" aria-hidden="true"><span class="table-share__fill" style="width:${share}%"></span></span><span class="table-share__value">${share}%</span></td>`,
        ];
      }),
      3,
      'No departments yet.',
    );
  }

  function renderTopStudents(rows) {
    window.HrmDom.renderRows(
      document.getElementById('top-students-body'),
      rows.map(function (row, index) {
        var metaParts = [];
        if (row.position) metaParts.push(row.position);
        if (row.department) metaParts.push(row.department);
        var meta = metaParts.join(' · ');
        var metaMarkup = meta ? html`<div class="small text-muted">${meta}</div>` : '';

        return [
          html`<td><span class="dashboard-rank">${index + 1}</span></td>`,
          html`<td><strong>${row.name}</strong>${metaMarkup}</td>`,
          html`<td class="text-center"><strong>${row.score}</strong></td>`,
          html`<td class="text-center">${row.present}</td>`,
          html`<td class="text-center">${row.late}</td>`,
          html`<td class="text-center">${row.absent}</td>`,
        ];
      }),
      6,
      'No counted attendance in this month.',
    );
  }

  // ---- summary -----------------------------------------------------------

  function renderCoverage(summary) {
    var total = Number(summary.totalStudents) || 0;
    var present = (Number(summary.present) || 0) + (Number(summary.late) || 0);
    var rate = total ? Math.round((present / total) * 100) : 0;

    if (ringValue) {
      ringValue.style.strokeDasharray = String(RING_LENGTH);
      ringValue.style.strokeDashoffset = String(RING_LENGTH * (1 - rate / 100));
    }
    if (ringPercent) ringPercent.textContent = total ? rate + '%' : '—';
    if (ringCaption) {
      ringCaption.textContent = total
        ? present + ' of ' + total + ' students present or late'
        : 'No active students yet';
    }
    if (ringSvg) {
      ringSvg.setAttribute(
        'aria-label',
        'Attendance rate ' + rate + '%, ' + present + ' of ' + total + ' students present or late',
      );
    }
  }

  function renderSummary(summary) {
    var greeting = document.getElementById('dashboard-greeting');
    var summaryDate = document.getElementById('summary-date');

    if (greeting) {
      var hour = new Date().getHours();
      greeting.textContent =
        hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    }
    if (summaryDate) summaryDate.textContent = formatLongDate(summary.date);
    if (summaryDateLong) summaryDateLong.textContent = formatLongDate(summary.date);

    document.querySelectorAll('[data-summary]').forEach(function (element) {
      var key = element.getAttribute('data-summary');
      var value = summary[key];
      element.textContent = value === null || value === undefined ? '—' : String(value);
    });

    var total = Number(summary.totalStudents) || 0;
    STAT_KEYS.forEach(function (key) {
      var value = Number(summary[key]) || 0;
      var share = total ? Math.round((value / total) * 100) : 0;

      var shareElement = document.querySelector('[data-stat-share="' + key + '"]');
      if (shareElement) shareElement.textContent = share + '%';

      var bar = document.querySelector('[data-stat-bar="' + key + '"]');
      if (bar) bar.style.width = share + '%';
    });

    renderCoverage(summary);

    if (notMarkedLink) {
      notMarkedLink.href = '/attendance.html?date=' + encodeURIComponent(summary.date);
    }

    if (dayStatus) {
      if (summary.isHoliday) {
        dayStatus.textContent = 'Holiday';
        dayStatus.className = 'day-chip day-chip--warning';
      } else if (!summary.isWorkingDay) {
        dayStatus.textContent = 'Non-working day';
        dayStatus.className = 'day-chip day-chip--muted';
      } else {
        dayStatus.textContent = 'Working day';
        dayStatus.className = 'day-chip day-chip--positive';
      }
    }

    var hideNotMarked = summary.isHoliday || !summary.isWorkingDay;
    if (notMarkedCard) notMarkedCard.classList.toggle('d-none', hideNotMarked);

    if (notice && noticeText) {
      if (summary.isHoliday) {
        notice.className = 'glass-notice glass-notice--warning';
        noticeText.textContent =
          summary.date +
          ' is a holiday' +
          (summary.holidayTitle ? ': ' + summary.holidayTitle : '') +
          '. Attendance and leave days are unchanged.';
      } else if (!summary.isWorkingDay) {
        notice.className = 'glass-notice glass-notice--info';
        noticeText.textContent =
          summary.date + ' is not a working day — there is nothing to mark today.';
      } else {
        notice.className = 'glass-notice d-none';
      }
    }

    lastData.departments = summary.departments || [];
    renderDepartments();
    applySearch();
  }

  function applySearch() {
    var searchInput = document.getElementById('dashboard-search');
    if (!searchInput) return;
    var query = String(searchInput.value || '').toLowerCase().trim();
    var rows = document.querySelectorAll('#top-students-body tr, #departments-body tr');
    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index];
      row.hidden = query !== '' && row.textContent.toLowerCase().indexOf(query) === -1;
    }
  }

  // ---- data --------------------------------------------------------------

  async function loadSummary() {
    var response = await window.HrmApi.get('/api/dashboard/summary');
    renderSummary(response.data);
    return response.data;
  }

  async function loadYear() {
    var year = Number(yearSelect.value);
    if (!year) return;

    var response = await window.HrmApi.get('/api/dashboard/year?year=' + encodeURIComponent(year));
    lastData.year = response.data;
    renderYearChart();
  }

  async function loadMonth() {
    var month = monthSelect.value;
    if (!month) return;

    var response = await window.HrmApi.get('/api/dashboard/month?month=' + encodeURIComponent(month));
    lastData.month = response.data;
    renderMonthChart();
    renderTopStudents(response.data.topStudents);
    applySearch();
  }

  async function loadAll() {
    try {
      var summary = await loadSummary();

      if (yearSelect && !yearSelect.value) yearSelect.value = summary.date.slice(0, 4);
      if (monthSelect && !monthSelect.value) monthSelect.value = summary.date.slice(0, 7);

      await Promise.all([loadYear(), loadMonth()]);
    } catch (error) {
      window.HrmToast.error(error.message);
    }
  }

  // ---- controls ----------------------------------------------------------

  function selectSeries(key) {
    if (!SERIES[key] || key === activeSeries) return;
    activeSeries = key;
    for (var index = 0; index < seriesButtons.length; index += 1) {
      var button = seriesButtons[index];
      var active = button.getAttribute('data-series') === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    renderMonthChart();
  }

  for (var buttonIndex = 0; buttonIndex < seriesButtons.length; buttonIndex += 1) {
    (function (button) {
      button.addEventListener('click', function () {
        selectSeries(button.getAttribute('data-series'));
      });

      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();

        var buttons = Array.prototype.slice.call(seriesButtons);
        var index = buttons.indexOf(button);
        var nextIndex =
          event.key === 'ArrowRight'
            ? (index + 1) % buttons.length
            : (index - 1 + buttons.length) % buttons.length;

        buttons[nextIndex].focus();
        selectSeries(buttons[nextIndex].getAttribute('data-series'));
      });
    })(seriesButtons[buttonIndex]);
  }

  if (yearSelect) {
    yearSelect.addEventListener('change', function () {
      loadYear().catch(function (error) {
        window.HrmToast.error(error.message);
      });
    });
  }

  if (monthSelect) {
    monthSelect.addEventListener('change', function () {
      loadMonth().catch(function (error) {
        window.HrmToast.error(error.message);
      });
    });
  }

  document.addEventListener('hrm:theme', function () {
    renderYearChart();
    renderMonthChart();
    renderDepartments();
    applySearch();
  });

  document.addEventListener('hrm:layout-ready', function () {
    var searchInput = document.getElementById('dashboard-search');
    var refreshButton = document.getElementById('refresh-dashboard');

    if (refreshButton) refreshButton.addEventListener('click', loadAll);

    if (searchInput) {
      searchInput.addEventListener('input', applySearch);
      searchInput.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        searchInput.value = '';
        applySearch();
      });
    }

    tickClock();
    loadAll();
  });

  tickClock();
  window.setInterval(tickClock, 30000);
})();
