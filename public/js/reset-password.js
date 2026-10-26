/**
 * "Reset password".
 *
 * The token is read from the address bar and immediately removed from it, so
 * it cannot end up in the browser history, in a bookmark or in a referrer
 * header.
 */
(function () {
  var form = document.getElementById('reset-form');
  var alertBox = document.getElementById('reset-alert');
  var submitButton = document.getElementById('reset-submit');

  var params = new URLSearchParams(window.location.search);
  var token = params.get('token') || '';

  // Take the token out of the address bar.
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function showAlert(message, variant) {
    alertBox.className = 'alert alert-' + (variant || 'danger');
    alertBox.textContent = message;
  }

  if (!token) {
    showAlert('This reset link is incomplete. Please ask for a new one.', 'danger');
    form.querySelectorAll('input, button').forEach(function (element) {
      element.disabled = true;
    });
    return;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var password = document.getElementById('reset-password').value;
    var confirmation = document.getElementById('reset-confirmation').value;

    if (password.length < 8) {
      showAlert('Use at least 8 characters.');
      return;
    }

    if (password !== confirmation) {
      showAlert('The two passwords are not the same.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';

    try {
      var response = await window.HrmApi.post('/api/auth/reset-password', {
        token: token,
        password: password,
      });

      showAlert(response.data.message, 'success');
      form.reset();
      form.querySelectorAll('input, button').forEach(function (element) {
        element.disabled = true;
      });
    } catch (error) {
      showAlert(error.message || 'The password could not be changed. Please ask for a new link.');
      submitButton.disabled = false;
      submitButton.textContent = 'Save';
    }
  });
})();
