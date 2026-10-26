/**
 * Fullscreen handling.
 *
 * AdminLTE ships a fullscreen widget of its own, but it neither remembers the
 * state nor swaps the icon. This handler uses the Fullscreen API directly and
 * keeps the button in sync with the actual state.
 */
(function () {
  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isFullscreen() {
    return Boolean(fullscreenElement());
  }

  function supported() {
    if (typeof document.fullscreenEnabled === 'boolean') return document.fullscreenEnabled;
    if (typeof document.webkitFullscreenEnabled === 'boolean') return document.webkitFullscreenEnabled;
    return Boolean(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  }

  function updateButtons() {
    var buttons = document.querySelectorAll('[data-fullscreen-toggle]');
    var active = isFullscreen();
    var available = supported();

    for (var index = 0; index < buttons.length; index += 1) {
      var button = buttons[index];
      var icon = button.querySelector('i');

      button.hidden = !available;
      button.classList.toggle('d-none', !available);

      if (icon) {
        icon.classList.toggle('fa-expand-arrows-alt', !active);
        icon.classList.toggle('fa-compress-arrows-alt', active);
      }

      button.setAttribute('aria-label', active ? 'Exit full screen' : 'Full screen');
      button.setAttribute('title', active ? 'Exit full screen' : 'Full screen');
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  function toggle() {
    if (!supported()) return;

    if (isFullscreen()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        try {
          Promise.resolve(exit.call(document)).catch(function () {
            /* the browser may have left fullscreen already */
          });
        } catch (error) {
          /* ignore a browser that refuses the exit */
        }
      }
      return;
    }

    var root = document.documentElement;
    var request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (request) {
      try {
        Promise.resolve(request.call(root)).catch(function (error) {
          console.warn('fullscreen request was refused', error);
        });
      } catch (error) {
        console.warn('fullscreen request was refused', error);
      }
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-fullscreen-toggle]');
    if (!button) return;
    event.preventDefault();
    toggle();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !isFullscreen()) return;
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  });

  document.addEventListener('fullscreenchange', updateButtons);
  document.addEventListener('webkitfullscreenchange', updateButtons);
  document.addEventListener('DOMContentLoaded', updateButtons);
  document.addEventListener('hrm:layout-ready', updateButtons);

  window.HrmFullscreen = {
    toggle: toggle,
    isFullscreen: isFullscreen,
  };
})();
