/**
 * Shared layout.
 *
 * The app is a multi-page site: every module is its own HTML file. The
 * sidebar and the navbar are shared partials that are fetched once and
 * injected into the page, so the navigation only exists in one place.
 *
 * The partials are injected *before* AdminLTE is loaded, so that the vendored
 * AdminLTE plugins initialise against the finished DOM.
 */
(function () {
  var PARTIALS = {
    navbar: 'navbar-placeholder',
    sidebar: 'sidebar-placeholder',
  };

  var SIDEBAR_KEY = 'hrm.sidebar';
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 991.98px)') : null;

  function isMobile() {
    return mobileQuery ? mobileQuery.matches : window.innerWidth < 992;
  }

  function readSidebarState() {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY);
    } catch (error) {
      return null;
    }
  }

  function writeSidebarState(state) {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, state);
    } catch (error) {
      /* storage disabled — the state simply will not persist */
    }
  }

  function syncSidebarToggle() {
    var toggles = document.querySelectorAll('[data-widget="pushmenu"]');
    var expanded = isMobile()
      ? document.body.classList.contains('sidebar-open')
      : !document.body.classList.contains('sidebar-collapse');

    for (var index = 0; index < toggles.length; index += 1) {
      toggles[index].setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggles[index].setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
    }
  }

  function applySidebarState() {
    if (isMobile()) {
      document.body.classList.remove('sidebar-collapse');
      document.body.classList.remove('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
      document.body.classList.toggle('sidebar-collapse', readSidebarState() === 'collapsed');
    }
    syncSidebarToggle();
  }

  function closeMobileSidebar() {
    if (!isMobile()) return;
    document.body.classList.remove('sidebar-open');
    syncSidebarToggle();
  }

  /**
   * Replace the placeholder with the partial.
   *
   * `outerHTML` is used on purpose: the sidebar and the navbar have to become
   * direct children of `.wrapper`, otherwise AdminLTE's fixed layout does not
   * calculate the correct offsets.
   */
  function inject(targetId, url) {
    var target = document.getElementById(targetId);
    if (!target) return Promise.resolve();

    return fetch(url, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('Could not load ' + url);
        return response.text();
      })
      .then(function (html) {
        target.outerHTML = html;
      });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error('Could not load ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function setActiveNav(page) {
    var links = document.querySelectorAll('[data-nav-link]');
    for (var index = 0; index < links.length; index += 1) {
      var link = links[index];
      if (link.getAttribute('data-nav-link') === page) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    }
  }

  function fillAdmin(admin) {
    var names = document.querySelectorAll('[data-admin-name]');
    for (var index = 0; index < names.length; index += 1) {
      names[index].textContent = admin.name;
    }

    var emails = document.querySelectorAll('[data-admin-email]');
    for (var emailIndex = 0; emailIndex < emails.length; emailIndex += 1) {
      emails[emailIndex].textContent = admin.email;
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
    window.location.href = '/login.html?signedOut=1';
  }

  async function init() {
    try {
      await Promise.all([
        inject(PARTIALS.navbar, '/partials/navbar.html'),
        inject(PARTIALS.sidebar, '/partials/sidebar.html'),
      ]);
    } catch (error) {
      console.error('[layout] the shell could not be loaded', error);
    }

    applySidebarState();

    try {
      await loadScript('/vendor/adminlte.min.js');
    } catch (error) {
      console.error('[layout] AdminLTE could not be loaded', error);
    }

    // Confirm the session and pick up the CSRF token.
    try {
      var response = await window.HrmApi.get('/api/auth/me');
      window.HrmApi.setCsrfToken(response.meta && response.meta.csrfToken);
      window.HrmCurrentAdmin = response.data.admin;
      window.HrmAppTimezone = response.data.timezone;
      window.HrmCheckInBaseUrl = response.data.checkInBaseUrl;
      window.HrmCheckInUrl = response.data.checkInUrl;
      fillAdmin(response.data.admin);
    } catch (error) {
      redirectToLogin();
      return;
    }

    setActiveNav(document.body.getAttribute('data-page'));

    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-logout]')) {
        event.preventDefault();
        void logout();
        return;
      }

      if (event.target.closest('[data-widget="pushmenu"]')) {
        window.setTimeout(function () {
          // On mobile the open state is transient; only the desktop collapse
          // preference is remembered.
          if (!isMobile()) {
            writeSidebarState(
              document.body.classList.contains('sidebar-collapse') ? 'collapsed' : 'expanded',
            );
          }
          syncSidebarToggle();
        }, 0);
        return;
      }

      var sidebarLink = event.target.closest('.main-sidebar a[href]');
      if (sidebarLink) {
        var href = sidebarLink.getAttribute('href') || '';
        if (href && href.charAt(0) !== '#') closeMobileSidebar();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMobileSidebar();
    });

    if (mobileQuery) {
      if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', applySidebarState);
      } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(applySidebarState);
      }
    }

    if (window.HrmTheme) window.HrmTheme.syncControls();

    document.dispatchEvent(new CustomEvent('hrm:layout-ready', { detail: { page: document.body.getAttribute('data-page') } }));
  }

  document.addEventListener('hrm:unauthenticated', redirectToLogin);
  document.addEventListener('DOMContentLoaded', init);
})();
