(function () {
  'use strict';

  var DISMISS_KEY = 'care-attendance-install-dismissed-until';
  var DISMISS_DAYS = 30;
  var deferredInstallPrompt = null;
  var registration = null;
  var reloadAfterUpdate = false;
  var installButton;
  var updateButton;
  var installPanel;
  var installStatus;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIosDevice() {
    var platform = window.navigator.userAgentData
      ? window.navigator.userAgentData.platform
      : window.navigator.platform;
    return /iPhone|iPad|iPod/i.test(platform || '')
      || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  function isDismissed() {
    try {
      return Number(window.localStorage.getItem(DISMISS_KEY)) > Date.now();
    } catch (error) {
      console.warn('[pwa] install preference could not be read', error);
      return false;
    }
  }

  function dismissInstall() {
    try {
      window.localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
      );
    } catch (error) {
      console.warn('[pwa] install preference could not be saved', error);
    }
    installButton.hidden = true;
    installPanel.hidden = true;
  }

  function makeButton(label, className) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }

  function makeInstallPanel() {
    var panel = document.createElement('section');
    panel.className = 'pwa-install-panel';
    panel.setAttribute('aria-label', 'Add Care Attendance to your Home Screen');

    var heading = document.createElement('h2');
    heading.textContent = 'Add Care Attendance to your Home Screen';

    var instructions = document.createElement('p');
    var userAgent = window.navigator.userAgent;
    var safari = /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);
    instructions.textContent = safari
      ? 'In Safari, tap Share, choose Add to Home Screen, then tap Add. If you see “Open as Web App”, leave it enabled.'
      : 'Open this website in Safari, tap Share, choose Add to Home Screen, then tap Add. If you see “Open as Web App”, leave it enabled.';

    var closeButton = makeButton('Got it', 'pwa-action-button');
    closeButton.addEventListener('click', dismissInstall);

    panel.append(heading, instructions, closeButton);
    return panel;
  }

  function createControls() {
    var controls = document.createElement('div');
    controls.className = 'pwa-controls';

    installButton = makeButton('Install app', 'pwa-action-button pwa-install-button');
    installButton.hidden = true;
    installStatus = document.createElement('p');
    installStatus.className = 'pwa-install-status';
    installStatus.setAttribute('role', 'status');
    installStatus.setAttribute('aria-live', 'polite');
    installStatus.hidden = true;

    installPanel = makeInstallPanel();
    installPanel.hidden = true;

    updateButton = makeButton('Update app', 'pwa-action-button pwa-update-button');
    updateButton.hidden = true;

    controls.append(installButton, installStatus, installPanel, updateButton);
    document.body.append(controls);
  }

  function refreshInstallButton() {
    if (isStandalone() || isDismissed()) {
      installButton.hidden = true;
      return;
    }

    installButton.hidden = !deferredInstallPrompt && !isIosDevice();
  }

  function showUpdateIfReady() {
    updateButton.hidden = !registration
      || !registration.waiting
      || !window.navigator.serviceWorker.controller;
  }

  function hasUnsavedChanges() {
    if (document.body.classList.contains('sheet-dirty')) {
      return true;
    }

    var fields = document.querySelectorAll('input, textarea, select');
    for (var index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      if (field instanceof window.HTMLInputElement) {
        if (['button', 'submit', 'reset', 'image', 'hidden'].includes(field.type)) {
          continue;
        }
        if (field.value !== field.defaultValue || field.checked !== field.defaultChecked) {
          return true;
        }
      } else if (field instanceof window.HTMLTextAreaElement) {
        if (field.value !== field.defaultValue) {
          return true;
        }
      } else if (field instanceof window.HTMLSelectElement) {
        for (var optionIndex = 0; optionIndex < field.options.length; optionIndex += 1) {
          if (field.options[optionIndex].selected !== field.options[optionIndex].defaultSelected) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function configureInstallation() {
    createControls();
    refreshInstallButton();

    installButton.addEventListener('click', async function () {
      if (isIosDevice()) {
        installPanel.hidden = !installPanel.hidden;
        return;
      }

      if (!deferredInstallPrompt) {
        return;
      }

      var installPrompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      refreshInstallButton();

      try {
        await installPrompt.prompt();
        var choice = await installPrompt.userChoice;
        if (choice.outcome === 'dismissed') {
          dismissInstall();
        } else {
          installButton.hidden = true;
        }
      } catch (error) {
        console.error('[pwa] the browser installation prompt failed', error);
        installStatus.textContent = 'Installation is unavailable right now. Use your browser menu to install this app if that option is available.';
        installStatus.hidden = false;
      }
    });

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      if (isStandalone() || isDismissed()) {
        return;
      }
      deferredInstallPrompt = event;
      refreshInstallButton();
    });

    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      installButton.hidden = true;
      installPanel.hidden = true;
    });
  }

  function configureUpdates() {
    updateButton.addEventListener('click', function () {
      if (!registration || !registration.waiting) {
        return;
      }
      if (hasUnsavedChanges()) {
        installStatus.textContent = 'Finish or save your current changes before updating the app.';
        installStatus.hidden = false;
        return;
      }

      reloadAfterUpdate = true;
      updateButton.disabled = true;
      updateButton.textContent = 'Updating…';
      try {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch (error) {
        reloadAfterUpdate = false;
        updateButton.disabled = false;
        updateButton.textContent = 'Update app';
        installStatus.textContent = 'The app could not be updated right now. Try again when you have a connection.';
        installStatus.hidden = false;
        console.error('[pwa] the waiting service worker could not be activated', error);
      }
    });

    window.navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloadAfterUpdate) {
        window.location.reload();
      }
    });
  }

  async function registerServiceWorker() {
    if (!window.isSecureContext || !('serviceWorker' in window.navigator)) {
      return;
    }

    try {
      registration = await window.navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      registration.addEventListener('updatefound', function () {
        var installing = registration.installing;
        if (!installing) {
          return;
        }
        installing.addEventListener('statechange', showUpdateIfReady);
      });
      showUpdateIfReady();
      configureUpdates();

      registration.update().catch(function (error) {
        console.warn('[pwa] service worker update check failed', error);
      });
    } catch (error) {
      console.error('[pwa] service worker registration failed', error);
    }
  }

  function init() {
    if (!document.body) {
      return;
    }
    configureInstallation();
    void registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}());
