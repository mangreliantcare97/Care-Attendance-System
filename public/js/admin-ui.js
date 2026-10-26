/**
 * Small shared pieces of the Admins & Settings UI.
 *
 * Native selects are kept; only a decorative caret chip is added. Password
 * visibility buttons are ordinary buttons with an aria-label and aria-pressed.
 */
(function () {
  function enhanceSelects(root) {
    var scope = root || document;
    var selects = scope.querySelectorAll('.admin-select select');

    for (var index = 0; index < selects.length; index += 1) {
      (function (select) {
        var wrapper = select.closest('.admin-select');
        if (!wrapper) return;

        function open() {
          wrapper.classList.add('is-open');
        }

        function close() {
          wrapper.classList.remove('is-open');
        }

        select.addEventListener('focus', open);
        select.addEventListener('mousedown', open);
        select.addEventListener('blur', close);
        select.addEventListener('change', close);
        select.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') close();
        });
      })(selects[index]);
    }
  }

  function initPasswordToggles(root) {
    var scope = root || document;
    var toggles = scope.querySelectorAll('[data-password-toggle]');

    for (var index = 0; index < toggles.length; index += 1) {
      toggles[index].addEventListener('click', function () {
        var control = this.closest('.admin-password-control');
        var input = control ? control.querySelector('input') : null;
        if (!input) return;

        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        this.setAttribute('aria-pressed', show ? 'true' : 'false');
        this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');

        var icon = this.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-eye', !show);
          icon.classList.toggle('fa-eye-slash', show);
        }
      });
    }
  }

  function showFieldError(form, path, message) {
    if (!form || !window.HrmForms) return false;
    return window.HrmForms.showErrors(form, {
      details: [{ path: path, message: message }],
    });
  }

  function initials(name) {
    var parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  }

  /**
   * A small, text-backed password-strength indicator.
   *
   * The bar is never the only signal: the text label and the progressbar's
   * aria-valuenow carry the same information.
   */
  function scorePassword(value) {
    var password = String(value || '');
    if (!password) {
      return { score: 0, label: 'Enter a password to see its strength.' };
    }
    if (password.length < 8) {
      return { score: 1, label: 'Too weak — use at least 8 characters.' };
    }

    var score = 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (password.length >= 12 && score < 4) score += 1;

    if (score >= 4) return { score: 4, label: 'Strong' };
    if (score === 3) return { score: 3, label: 'Good' };
    if (score === 2) return { score: 2, label: 'Fair' };
    return { score: 1, label: 'Weak' };
  }

  function updatePasswordStrength(input, meter, text) {
    if (!input || !meter) return;
    var result = scorePassword(input.value);
    meter.setAttribute('data-strength', String(result.score));
    meter.setAttribute('aria-valuenow', String(result.score));
    if (text) text.textContent = result.label;
  }

  function bindPasswordStrength(input, meter, text) {
    if (!input || !meter) return function () {};
    function update() {
      updatePasswordStrength(input, meter, text);
    }
    input.addEventListener('input', update);
    update();
    return update;
  }

  window.HrmAdminUi = {
    enhanceSelects: enhanceSelects,
    initPasswordToggles: initPasswordToggles,
    showFieldError: showFieldError,
    initials: initials,
    scorePassword: scorePassword,
    updatePasswordStrength: updatePasswordStrength,
    bindPasswordStrength: bindPasswordStrength,
  };
})();
