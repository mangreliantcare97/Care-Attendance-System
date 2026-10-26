/**
 * "Forgot password".
 *
 * The answer is always the same — the page never reveals whether an address
 * belongs to an administrator.
 */
(function () {
  var form = document.getElementById('forgot-form');
  var alertBox = document.getElementById('forgot-alert');
  var submitButton = document.getElementById('forgot-submit');

  function showAlert(message, variant) {
    alertBox.className = 'alert alert-' + (variant || 'danger');
    alertBox.textContent = message;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var email = document.getElementById('forgot-email').value.trim();
    if (!email) {
      showAlert('Please enter your email address.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';

    try {
      var response = await window.HrmApi.post('/api/auth/forgot-password', { email: email });
      showAlert(response.data.message, 'success');
      form.reset();
    } catch (error) {
      showAlert(error.message || 'The request could not be sent. Please try again.');
    }

    submitButton.disabled = false;
    submitButton.textContent = 'Send';
  });
})();
