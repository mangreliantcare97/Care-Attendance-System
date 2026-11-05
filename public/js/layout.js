/**
 * Shared layout.
 *
 * Every authenticated page is its own HTML file. The glass navigation rail and
 * header live in shared partials, fetched once and injected into the page, so
 * the shell and its behaviour only exist in one place.
 *
 * When the partials and session are ready the script dispatches
 * `hrm:layout-ready`; every page module waits for that event before it looks
 * up elements inside the injected header.
 */
(function () {
  var PARTIALS = {
    header: { target: 'glass-header-placeholder', url: '/partials/navbar.html' },
    nav: { target: 'glass-nav-placeholder', url: '/partials/sidebar.html' },
  };

  var NAV_ALIASES = {
    'attendance-report': 'reports',
    overtime: 'reports',
  };

  var SEARCH_COPY = {
    dashboard: 'Search students or departments…',
    students: 'Search students…',
    departments: 'Search departments…',
    attendance: 'Search attendance…',
    'attendance-report': 'Search attendance records…',
    reports: 'Search reports…',
    overtime: 'Search overtime…',
    leaves: 'Search leave records…',
    calendar: 'Search events…',
    admins: 'Search admins…',
  };

  function pageName() {
    return (document.body && document.body.getAttribute('data-page')) || '';
  }

  function inject(placeholder) {
    var target = document.getElementById(placeholder.target);
    if (!target) return Promise.resolve();

    return fetch(placeholder.url, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Could not load ' + placeholder.url);
        return response.text();
      })
      .then(function (html) {
        target.outerHTML = html;
      });
  }

  function setActiveNav() {
    var activePage = NAV_ALIASES[pageName()] || pageName();
    var links = document.querySelectorAll('[data-nav-link]');

    for (var index = 0; index < links.length; index += 1) {
      var link = links[index];
      var active = link.getAttribute('data-nav-link') === activePage;
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  function fillAdmin(admin) {
    if (!admin) return;

    var names = document.querySelectorAll('[data-admin-name]');
    for (var index = 0; index < names.length; index += 1) {
      names[index].textContent = admin.name || 'Administrator';
    }

    var emails = document.querySelectorAll('[data-admin-email]');
    for (var emailIndex = 0; emailIndex < emails.length; emailIndex += 1) {
      emails[emailIndex].textContent = admin.email || '';
    }
  }

  function longDate(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function setHeaderDate() {
    var summaryDate = document.getElementById('summary-date');
    if (summaryDate) summaryDate.textContent = longDate(new Date());
  }

  function setGreeting() {
    var greeting = document.getElementById('dashboard-greeting');
    if (!greeting) return;

    var hour = new Date().getHours();
    greeting.textContent =
      hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  function setSearchCopy() {
    var input = document.getElementById('dashboard-search');
    if (!input) return;

    var copy = SEARCH_COPY[pageName()] || 'Search this page…';
    input.setAttribute('placeholder', copy);
    input.setAttribute('aria-label', copy);
  }

  function filterPageRows(query) {
    var needle = String(query || '').trim().toLowerCase();
    var rows = document.querySelectorAll('.page-content table tbody tr');

    for (var index = 0; index < rows.length; index += 1) {
      var row = rows[index];
      if (!needle) {
        row.hidden = false;
      } else {
        row.hidden = row.textContent.toLowerCase().indexOf(needle) === -1;
      }
    }
  }

  function bindHeaderControls() {
    var input = document.getElementById('dashboard-search');
    var refresh = document.getElementById('refresh-dashboard');
    if (pageName() === 'dashboard') return;

    if (input) {
      input.addEventListener('input', function () {
        filterPageRows(input.value);
      });

      input.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        input.value = '';
        filterPageRows('');
      });
    }

    if (refresh) {
      refresh.addEventListener('click', function () {
        window.location.reload();
      });
    }
  }

  function redirectToLogin() {
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/login.html?next=' + next;
  }

  async function logout() {
    try {
      await window.HrmApi.post('/api/auth/logout');
    } catch (error) {
      /* signing out locally is enough */
    }
    window.location.href = '/login.html';
  }

  async function init() {
    try {
      await Promise.all([inject(PARTIALS.nav), inject(PARTIALS.header)]);
    } catch (error) {
      console.error('[layout] the shell could not be loaded', error);
    }

    // Confirm the session and pick up the CSRF token.
    try {
      var response = await window.HrmApi.get('/api/auth/me');
      window.HrmApi.setCsrfToken(response.meta && response.meta.csrfToken);
      window.HrmCurrentAdmin = response.data.admin;
      window.HrmAppTimezone = response.data.timezone;
      fillAdmin(response.data.admin);
    } catch (error) {
      redirectToLogin();
      return;
    }

    setActiveNav();
    setHeaderDate();
    setGreeting();
    setSearchCopy();
    bindHeaderControls();

    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-logout]')) {
        event.preventDefault();
        void logout();
      }
    });

    if (window.HrmTheme) window.HrmTheme.syncControls();

    document.dispatchEvent(
      new CustomEvent('hrm:layout-ready', { detail: { page: pageName() } }),
    );
  }

  document.addEventListener('hrm:unauthenticated', redirectToLogin);
  document.addEventListener('DOMContentLoaded', init);
})();
