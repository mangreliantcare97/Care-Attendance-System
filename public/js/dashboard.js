/**
 * Dashboard metrics, charts and recent activity.
 * The server calculates calendar dates in APP_TIMEZONE.
 */
(function () {
  var warning = document.getElementById('no-locations-warning');
  var linkInput = document.getElementById('public-link');
  var copyButton = document.getElementById('copy-public-link');
  var openButton = document.getElementById('open-public-link');
  var copyStatus = document.getElementById('public-link-status');
  var content = document.getElementById('dashboard-content');
  var errorRow = document.getElementById('dashboard-error-row');
  var errorMessage = document.getElementById('dashboard-error-message');
  var trendChart = null;
  var userTypeChart = null;
  var html = window.HrmDom.html;

  function setLink(url) {
    if (!linkInput || !url) return;
    linkInput.value = url;
    if (openButton) openButton.setAttribute('href', url);
    if (copyButton) copyButton.disabled = false;
  }

  function report(message) {
    if (copyStatus) copyStatus.textContent = message;
  }

  async function copyLink() {
    if (!linkInput || !linkInput.value) return;
    try {
      await window.HrmClipboard.copy(linkInput.value);
      report('Check-in link copied.');
    } catch (error) {
      report('The link could not be copied. Select the text and copy it manually.');
    }
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '—';
    return new Date(value + 'T12:00:00.000Z').toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  function renderRecent(entries) {
    var target = document.getElementById('dashboard-recent-entries');
    if (!entries.length) {
      window.HrmDom.renderListState(target, 5, {
        type: 'empty',
        message: 'No entries have been recorded yet.',
      });
      return;
    }
    window.HrmDom.renderRows(target, entries.map(function (entry) {
      return [
        html`<td>${formatDate(entry.date)}</td>`,
        html`<td>${entry.enteredTime}</td>`,
        html`<td><strong>${entry.name}</strong></td>`,
        html`<td>${entry.direction === 'out' ? 'Check out' : 'Check in'}</td>`,
        html`<td>${entry.location ? entry.location.name : 'Location unavailable'}</td>`,
      ];
    }), 5, 'No recent entries.');
  }

  function renderTrend(trend) {
    var labels = trend.map(function (point) { return formatDate(point.date); });
    var counts = trend.map(function (point) { return point.count; });
    if (trendChart) trendChart.destroy();
    trendChart = new window.Chart(document.getElementById('entries-trend-chart').getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Entries',
          data: counts,
          borderColor: '#0b6fc2',
          backgroundColor: 'rgba(11, 111, 194, 0.16)',
          pointBackgroundColor: '#0b6fc2',
          pointRadius: 3,
          fill: true,
          lineTension: 0.25,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        legend: { display: false },
        tooltips: { mode: 'index', intersect: false },
        scales: {
          yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }],
        },
      },
    });
  }

  function renderUserTypes(values) {
    if (userTypeChart) userTypeChart.destroy();
    userTypeChart = new window.Chart(
      document.getElementById('entries-user-type-chart').getContext('2d'),
      {
        type: 'doughnut',
        data: {
          labels: ['Staff Member', 'Service User', 'Visitor'],
          datasets: [{
            data: values.map(function (item) { return item.count; }),
            backgroundColor: ['#0b6fc2', '#28a745', '#f0ad4e'],
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          legend: { position: 'bottom' },
        },
      },
    );
  }

  function showError(error) {
    if (errorMessage) {
      errorMessage.textContent = error && error.message
        ? 'The dashboard summary could not be loaded: ' + error.message
        : 'The dashboard summary could not be loaded.';
    }
    if (errorRow) errorRow.hidden = false;
    if (content) content.hidden = true;
  }

  async function loadSummary() {
    if (errorRow) errorRow.hidden = true;
    try {
      var response = await window.HrmApi.get('/api/dashboard');
      var data = response.data;
      var metrics = data.metrics;
      document.getElementById('metric-entries-today').textContent = String(metrics.entriesToday);
      document.getElementById('metric-checkins-today').textContent = String(metrics.checkInsToday);
      document.getElementById('metric-checkouts-today').textContent = String(metrics.checkOutsToday);
      document.getElementById('metric-active-locations').textContent = String(metrics.activeLocations);
      document.getElementById('dashboard-report-date').textContent = 'Today: ' + formatDate(data.date);
      if (warning) warning.hidden = metrics.activeLocations > 0;
      if (content) content.hidden = false;
      renderTrend(data.trend);
      renderUserTypes(data.todayByUserType);
      renderRecent(data.recentEntries);
    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener('hrm:layout-ready', function () {
    setLink(window.HrmCheckInUrl);
    if (copyButton) copyButton.addEventListener('click', copyLink);
    var retryButton = document.getElementById('retry-dashboard');
    if (retryButton) retryButton.addEventListener('click', loadSummary);
    void loadSummary();
  });
})();
