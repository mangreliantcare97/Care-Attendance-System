/**
 * Theme handling.
 *
 * Loaded synchronously in <head> before any stylesheet so the correct palette
 * is applied before the first paint (no flash of the wrong theme).
 *
 * The theme is stored in `localStorage`; when nothing is stored the operating
 * system preference (`prefers-color-scheme`) decides. OS changes are followed
 * only until the user makes an explicit choice.
 */
(function () {
  var STORAGE_KEY = 'hrm.theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function read() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function hasExplicitChoice() {
    var saved = read();
    return saved === 'light' || saved === 'dark';
  }

  function write(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* storage disabled — the theme simply will not persist */
    }
  }

  function preferred() {
    var saved = read();
    if (saved === 'light' || saved === 'dark') return saved;
    return media && media.matches ? 'dark' : 'light';
  }

  function syncControls(theme) {
    if (document.body) {
      document.body.classList.toggle('dark-mode', theme === 'dark');
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#17191d' : '#ffffff');

    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      var icon = button.querySelector('i');
      var dark = theme === 'dark';

      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      if (icon) {
        icon.classList.toggle('fa-moon', !dark);
        icon.classList.toggle('fa-sun', dark);
      }
    }
  }

  function apply(theme, persist) {
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark-mode', theme === 'dark');
    syncControls(theme);
    if (persist) write(theme);
    document.dispatchEvent(new CustomEvent('hrm:theme', { detail: { theme: theme } }));
  }

  function current() {
    return root.getAttribute('data-theme') || 'light';
  }

  function toggle() {
    apply(current() === 'dark' ? 'light' : 'dark', true);
  }

  function onSystemChange(event) {
    // An explicit choice wins forever; only an unset preference follows the OS.
    if (hasExplicitChoice()) return;
    apply(event.matches ? 'dark' : 'light', false);
  }

  // Apply as early as possible.
  apply(preferred(), false);

  document.addEventListener('DOMContentLoaded', function () {
    syncControls(current());
  });

  document.addEventListener('hrm:layout-ready', function () {
    syncControls(current());
  });

  if (media) {
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onSystemChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onSystemChange);
    }
  }

  document.addEventListener('click', function (event) {
    var toggleButton = event.target.closest('[data-theme-toggle]');
    if (!toggleButton) return;
    event.preventDefault();
    toggle();
  });

  window.HrmTheme = {
    apply: apply,
    current: current,
    toggle: toggle,
    syncControls: function () {
      syncControls(current());
    },
  };
})();
