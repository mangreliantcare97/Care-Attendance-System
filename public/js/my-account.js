/**
 * My Account — change the signed-in administrator's own password.
 *
 * The endpoint still verifies the current password and keeps the current
 * session alive, exactly as the old admins page did.
 */
(function () {
  var form = document.getElementById('my-account-form');
  var currentPassword = document.getElementById('current-password');
  var newPassword = document.getElementById('new-password');
  var strengthMeter = document.getElementById('password-strength-meter');
  var strengthText = document.getElementById('password-strength-text');
  var submitButton = document.getElementById('update-password');
  var refreshStrength = function () {};
  var started = false;
  var submitting = false;

  function clearErrors() {
    window.HrmForms.clear(form);
  }

  function collectErrors() {
    var errors = [];

    if (!currentPassword.value) {
      errors.push({ path: 'currentPassword', message: 'Enter your current password.' });
    }
    if (!newPassword.value) {
      errors.push({ path: 'newPassword', message: 'Enter a new password.' });
    } else if (newPassword.value.length < 8) {
      errors.push({ path: 'newPassword', message: 'Use at least 8 characters.' });
    }

    return errors;
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;

    clearErrors();
    var errors = collectErrors();
    if (errors.length) {
      window.HrmForms.showErrors(form, { details: errors });
      return;
    }

    submitting = true;
    window.HrmForms.setBusy(submitButton, true, 'Updating…');

    try {
      await window.HrmApi.post('/api/admins/me/password', {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      });
      form.reset();
      refreshStrength();
      HrmToast.success('Your password was updated.');
      currentPassword.focus();
    } catch (error) {
      if (Array.isArray(error.details) && error.details.length && window.HrmForms.showErrors(form, error)) {
        return;
      }

      if (error.code === 'invalid_password') {
        window.HrmAdminUi.showFieldError(form, 'currentPassword', error.message);
        return;
      }

      HrmToast.error(error.message || 'Your password could not be updated.');
    } finally {
      submitting = false;
      window.HrmForms.setBusy(submitButton, false);
    }
  }

  function init() {
    if (started) return;
    started = true;

    refreshStrength = window.HrmAdminUi.bindPasswordStrength(
      newPassword,
      strengthMeter,
      strengthText,
    );
    window.HrmAdminUi.initPasswordToggles(document);
    form.addEventListener('submit', function (event) {
      void submit(event);
    });
  }

  document.addEventListener('hrm:layout-ready', init);
})();
