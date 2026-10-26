/**
 * Login screen.
 *
 * On success the browser is sent to the page it was trying to reach, or to
 * the dashboard. The `next` parameter is only used when it is a local path,
 * so the login page can never be used to redirect somewhere else.
 */
(function () {
  var form = document.getElementById('login-form');
  var alertBox = document.getElementById('login-alert');
  var submitButton = document.getElementById('login-submit');

  function showAlert(message, variant) {
    alertBox.className = 'alert alert-' + (variant || 'danger');
    alertBox.textContent = message;
  }

  function hideAlert() {
    alertBox.className = 'alert d-none';
    alertBox.textContent = '';
  }

  function safeNext() {
    var next = new URLSearchParams(window.location.search).get('next');
    if (!next) return '/dashboard.html';
    if (next.charAt(0) !== '/' || next.charAt(1) === '/') return '/dashboard.html';
    return next;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    hideAlert();

    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;

    if (!email || !password) {
      showAlert('Please enter your email address and your password.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Signing in…';

    try {
      var response = await window.HrmApi.post('/api/auth/login', { email: email, password: password });
      window.HrmApi.setCsrfToken(response.meta && response.meta.csrfToken);
      window.location.href = safeNext();
    } catch (error) {
      showAlert(error.message || 'Sign in failed. Please try again.');
      submitButton.disabled = false;
      submitButton.textContent = 'Sign In';
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
    }
  });

  // Already signed in? Skip the form.
  window.HrmApi.get('/api/auth/me')
    .then(function () {
      window.location.href = safeNext();
    })
    .catch(function () {
      /* not signed in — the form stays */
    });
})();
