/**
 * Dashboard.
 *
 * Chart.js 2.9.4 reads its colours from the same CSS custom properties as the
 * rest of the theme; every chart is destroyed and rebuilt on `hrm:theme` so a
 * light/dark switch never leaves a chart with the old palette.
 */
(function () {
  var html = window.HrmDom.html;

  var yearSelect = document.getElementById('year-select');
  var monthSelect = document.getElementById('month-select');
  var notMarkedCard = document.getElementById('not-marked-card');
  var notMarkedLink = document.getElementById('not-marked-link');
  var notice = document.getElementById('non-working-notice');

  var charts = { year: null, month: null, departments: null };
  var lastData = { year: null, month: null, departments: [] };

  function cssVar(name, fallback) {
    var value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function palette() {
    return {
      text: cssVar('--hrm-text', '#212529'),
      muted: cssVar('--hrm-text-muted', '#6c757d'),
      border: cssVar('--hrm-border', '#dee2e6'),
      primary: cssVar('--hrm-primary', '#007bff'),
      success: cssVar('--hrm-success', '#28a745'),
      warning: cssVar('--hrm-warning', '#ffc107'),
      danger: cssVar('--hrm-danger', '#dc3545'),
      info: cssVar('--hrm-info', '#17a2b8'),
    };
  }

  function hexToRgba(value, alpha) {
    var hex = value.replace('#', '');
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

  function lineChart(canvasId, labels, points) {
    var colors = palette();
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    return new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Attendance',
            data: points.map(function (point) {
              return point.attendance;
            }),
            borderColor: colors.primary,
            backgroundColor: hexToRgba(colors.primary, 0.12),
            pointBackgroundColor: colors.primary,
            pointBorderColor: colors.primary,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            fill: false,
          },
          {
            label: 'Absence',
            data: points.map(function (point) {
              return point.absence;
            }),
            borderColor: colors.danger,
            backgroundColor: hexToRgba(colors.danger, 0.12),
            pointBackgroundColor: colors.danger,
            pointBorderColor: colors.danger,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            fill: false,
          },
          {
            label: 'Leave & vacation',
            data: points.map(function (point) {
              return point.leave;
            }),
            borderColor: colors.success,
            backgroundColor: hexToRgba(colors.success, 0.12),
            pointBackgroundColor: colors.success,
            pointBorderColor: colors.success,
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          labels: { fontColor: colors.text, usePointStyle: true },
        },
        tooltips: { mode: 'index', intersect: false },
        scales: {
          xAxes: [
            {
              gridLines: { display: false },
              ticks: { fontColor: colors.muted, autoSkip: true, maxTicksLimit: 16 },
            },
          ],
          yAxes: [
            {
              beginAtZero: true,
              gridLines: { color: colors.border, zeroLineColor: colors.border, drawBorder: false },
              ticks: { precision: 0, beginAtZero: true, fontColor: colors.muted },
            },
          ],
        },
      },
    });
  }

  function renderYear() {
    if (!lastData.year) return;
    destroyChart('year');
    charts.year = lineChart(
      'year-chart',
      lastData.year.months.map(function (point) {
        return point.label;
      }),
      lastData.year.months,
    );
  }

  function renderMonth() {
    if (!lastData.month) return;
    destroyChart('month');
    charts.month = lineChart(
      'month-chart',
      lastData.month.days.map(function (point) {
        return point.label;
      }),
      lastData.month.days,
    );
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

      var paletteValues = [colors.primary, colors.info, colors.success, colors.warning, colors.danger];
      var background = departments.map(function (department, index) {
        return paletteValues[index % paletteValues.length];
      });

      charts.departments = new window.Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: departments.map(function (department) {
            return department.name;
          }),
          datasets: [
            {
              data: departments.map(function (department) {
                return department.activeEmployees;
              }),
              backgroundColor: background,
              borderColor: cssVar('--hrm-surface', '#ffffff'),
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutoutPercentage: 62,
          legend: {
            position: 'bottom',
            labels: { fontColor: colors.text, usePointStyle: true, boxWidth: 10 },
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

    window.HrmDom.renderRows(
      document.getElementById('departments-body'),
      departments.map(function (department) {
        return [
          html`<td>${department.name}</td>`,
          html`<td class="text-center">${department.activeEmployees}</td>`,
        ];
      }),
      2,
      'No departments yet.',
    );
  }

  function renderTopEmployees(rows) {
    window.HrmDom.renderRows(
      document.getElementById('top-employees-body'),
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

  function renderSummary(summary) {
    document.getElementById('summary-date').textContent = summary.date;

    document.querySelectorAll('[data-summary]').forEach(function (element) {
      var key = element.getAttribute('data-summary');
      var value = summary[key];
      element.textContent = value === null || value === undefined ? '—' : String(value);
    });

    if (notMarkedLink) {
      notMarkedLink.href = '/attendance.html?date=' + encodeURIComponent(summary.date);
    }

    if (summary.isHoliday) {
      notice.className = 'alert alert-warning';
      document.getElementById('non-working-text').textContent =
        summary.date +
        ' is a holiday' +
        (summary.holidayTitle ? ': ' + summary.holidayTitle : '') +
        '. Attendance and leave days are unchanged.';
      notice.classList.remove('d-none');
      notMarkedCard.classList.add('d-none');
    } else if (!summary.isWorkingDay) {
      notice.className = 'alert alert-info';
      document.getElementById('non-working-text').textContent =
        summary.date + ' is not a working day — there is nothing to mark today.';
      notice.classList.remove('d-none');
      notMarkedCard.classList.add('d-none');
    } else {
      notice.classList.add('d-none');
      notMarkedCard.classList.remove('d-none');
    }

    lastData.departments = summary.departments || [];
    renderDepartments();
  }

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
    renderYear();
  }

  async function loadMonth() {
    var month = monthSelect.value;
    if (!month) return;

    var response = await window.HrmApi.get('/api/dashboard/month?month=' + encodeURIComponent(month));
    lastData.month = response.data;
    renderMonth();
    renderTopEmployees(response.data.topEmployees);
  }

  async function loadAll() {
    try {
      var summary = await loadSummary();

      if (!yearSelect.value) yearSelect.value = summary.date.slice(0, 4);
      if (!monthSelect.value) monthSelect.value = summary.date.slice(0, 7);

      await Promise.all([loadYear(), loadMonth()]);
    } catch (error) {
      window.HrmToast.error(error.message);
    }
  }

  yearSelect.addEventListener('change', function () {
    loadYear().catch(function (error) {
      window.HrmToast.error(error.message);
    });
  });

  monthSelect.addEventListener('change', function () {
    loadMonth().catch(function (error) {
      window.HrmToast.error(error.message);
    });
  });

  document.getElementById('refresh-dashboard').addEventListener('click', loadAll);

  document.addEventListener('hrm:theme', function () {
    renderYear();
    renderMonth();
    renderDepartments();
  });

  document.addEventListener('hrm:layout-ready', loadAll);
})();
