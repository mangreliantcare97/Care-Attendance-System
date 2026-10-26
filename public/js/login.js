/**
 * Login screen.
 *
 * On success the browser is sent to the protected page it was trying to reach,
 * or to the dashboard. The server validates `next` against the protected page
 * allowlist before returning `redirectTo`; this page never builds the target
 * itself.
 */
(function () {
  var form = document.getElementById('login-form');
  var alertBox = document.getElementById('login-alert');
  var submitButton = document.getElementById('login-submit');
  var params = new URLSearchParams(window.location.search);
  var next = params.get('next') || '';

  function showAlert(message, variant) {
    alertBox.className = 'alert alert-' + (variant || 'danger');
    alertBox.textContent = message;
  }

  function hideAlert() {
    alertBox.className = 'alert d-none';
    alertBox.textContent = '';
  }

  if (params.get('signedOut') === '1') {
    showAlert('You have been signed out.', 'success');
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
      var response = await window.HrmApi.post('/api/auth/login', {
        email: email,
        password: password,
        next: next || undefined,
      });
      window.HrmApi.setCsrfToken(response.meta && response.meta.csrfToken);
      window.location.href =
        (response.data && response.data.redirectTo) || '/dashboard.html';
    } catch (error) {
      showAlert(error.message || 'Sign in failed. Please try again.');
      submitButton.disabled = false;
      submitButton.textContent = 'Sign In';
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
    }
  });

  // Already signed in? The server normally never serves this page, but a
  // stale tab or a cached page must not show the form again.
  window.HrmApi.get('/api/auth/me')
    .then(function () {
      window.location.href = '/dashboard.html';
    })
    .catch(function () {
      /* not signed in — the form stays */
    });
})();
