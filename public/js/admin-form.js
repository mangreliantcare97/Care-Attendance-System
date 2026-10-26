/**
 * Add / edit administrator.
 *
 * The server remains the source of truth for every rule. This script mirrors
 * the shape of the form, focuses the first server-side error and warns before
 * discarding changes.
 */
(function () {
  var form = document.getElementById('admin-form');
  var title = document.getElementById('admin-form-title');
  var subtitle = document.getElementById('admin-form-subtitle');
  var stateBox = document.getElementById('admin-form-state');
  var stateMessage = document.getElementById('admin-form-state-message');
  var stateSpinner = stateBox.querySelector('.spinner-border');
  var retryButton = document.getElementById('admin-form-retry');
  var stateBack = document.getElementById('admin-form-state-back');
  var generalError = document.getElementById('admin-form-error');
  var nameInput = document.getElementById('admin-name');
  var emailInput = document.getElementById('admin-email');
  var statusSelect = document.getElementById('admin-status');
  var statusHelp = document.getElementById('status-help');
  var changeRow = document.getElementById('change-password-row');
  var changeCheckbox = document.getElementById('change-password');
  var ownNote = document.getElementById('own-account-note');
  var passwordPanel = document.getElementById('admin-password-panel');
  var passwordInput = document.getElementById('admin-password');
  var confirmInput = document.getElementById('admin-confirm-password');
  var strengthMeter = document.getElementById('password-strength-meter');
  var strengthText = document.getElementById('password-strength-text');
  var saveButton = document.getElementById('admin-form-save');
  var cancelButton = document.getElementById('admin-form-cancel');

  var state = {
    mode: 'add',
    id: null,
    own: false,
    loaded: false,
    dirty: false,
    baseline: '',
    submitting: false,
    started: false,
    refreshStrength: function () {},
  };

  var DEFAULT_STATUS_HELP = 'Disabled admins keep their history but cannot sign in.';

  function trim(value) {
    return String(value || '').trim();
  }

  function showLoading(message) {
    stateBox.hidden = false;
    stateBox.setAttribute('role', 'status');
    stateSpinner.hidden = false;
    retryButton.hidden = true;
    stateBack.hidden = true;
    stateMessage.textContent = message || 'Loading admin…';
    form.hidden = true;
  }

  function showLoadError(error) {
    stateBox.hidden = false;
    stateBox.setAttribute('role', 'alert');
    stateSpinner.hidden = true;
    retryButton.hidden = false;
    stateBack.hidden = false;
    stateMessage.textContent = error.message || 'The administrator could not be loaded.';
    form.hidden = true;
  }

  function showForm() {
    stateBox.hidden = true;
    form.hidden = false;
    state.loaded = true;
  }

  function setTitle(mode, own) {
    if (mode === 'add') {
      title.textContent = 'Add Admin';
      subtitle.textContent = 'Create another administrator account with full access.';
      document.title = 'Add Admin | Care Attendance';
      return;
    }

    title.textContent = 'Edit Admin';
    subtitle.textContent = own
      ? 'Update your own profile. Use My Account to change your password.'
      : 'Update this administrator’s profile and access.';
    document.title = 'Edit Admin | Care Attendance';
  }

  function refreshStrength() {
    state.refreshStrength();
  }

  function setPasswordPanel(visible) {
    passwordPanel.hidden = !visible;
    passwordInput.disabled = !visible;
    confirmInput.disabled = !visible;
    passwordInput.required = visible;
    confirmInput.required = visible;

    if (!visible) {
      passwordInput.value = '';
      confirmInput.value = '';
      refreshStrength();
    }
  }

  function snapshot() {
    return JSON.stringify({
      name: nameInput.value,
      email: emailInput.value,
      status: statusSelect.value,
      changePassword: !changeRow.hidden && changeCheckbox.checked,
      password: passwordInput.value,
      confirmPassword: confirmInput.value,
    });
  }

  function markBaseline() {
    state.baseline = snapshot();
    state.dirty = false;
  }

  function updateDirty() {
    if (!state.loaded) return;
    state.dirty = snapshot() !== state.baseline;
  }

  function clearErrors() {
    window.HrmForms.clear(form);
    generalError.hidden = true;
    generalError.textContent = '';
  }

  async function loadAdmin() {
    if (state.mode === 'add') {
      setTitle('add', false);
      form.reset();
      statusSelect.value = 'enabled';
      statusSelect.disabled = false;
      statusHelp.textContent = DEFAULT_STATUS_HELP;
      changeRow.hidden = true;
      ownNote.hidden = true;
      setPasswordPanel(true);
      showForm();
      markBaseline();
      return;
    }

    setTitle('edit', false);
    showLoading('Loading admin…');

    try {
      var response = await window.HrmApi.get('/api/admins/' + encodeURIComponent(state.id));
      var admin = response.data.admin;
      var currentId = window.HrmCurrentAdmin ? window.HrmCurrentAdmin.id : null;

      state.own = admin.id === currentId;
      setTitle('edit', state.own);

      nameInput.value = admin.name || '';
      emailInput.value = admin.email || '';
      statusSelect.value = admin.isActive ? 'enabled' : 'disabled';
      statusSelect.disabled = state.own;
      statusHelp.textContent = state.own
        ? 'You cannot disable your own account.'
        : DEFAULT_STATUS_HELP;

      changeRow.hidden = state.own;
      changeCheckbox.checked = false;
      ownNote.hidden = !state.own;
      setPasswordPanel(false);

      clearErrors();
      showForm();
      markBaseline();
    } catch (error) {
      showLoadError(error);
    }
  }

  function collectErrors(wantsPassword) {
    var errors = [];
    var name = trim(nameInput.value);
    var email = trim(emailInput.value);

    if (name.length < 2) {
      errors.push({ path: 'name', message: 'Enter the admin’s name.' });
    }

    if (!email) {
      errors.push({ path: 'email', message: 'Enter a valid email address.' });
    } else if (typeof emailInput.checkValidity === 'function' && !emailInput.checkValidity()) {
      errors.push({ path: 'email', message: 'Enter a valid email address.' });
    }

    if (wantsPassword) {
      if (!passwordInput.value) {
        errors.push({ path: 'password', message: 'Enter a password.' });
      } else if (passwordInput.value.length < 8) {
        errors.push({ path: 'password', message: 'Use at least 8 characters.' });
      }

      if (passwordInput.value && passwordInput.value !== confirmInput.value) {
        errors.push({ path: 'confirmPassword', message: 'Passwords do not match.' });
      }
    }

    return errors;
  }

  function handleServerError(error) {
    if (Array.isArray(error.details) && error.details.length) {
      if (window.HrmForms.showErrors(form, error)) return;
    }

    if (error.code === 'email_taken') {
      window.HrmAdminUi.showFieldError(form, 'email', error.message);
      return;
    }

    if (error.code === 'cannot_deactivate_self' || error.code === 'cannot_deactivate_last_admin') {
      window.HrmAdminUi.showFieldError(form, 'status', error.message);
      return;
    }

    generalError.textContent = error.message || 'The administrator could not be saved.';
    generalError.hidden = false;
    HrmToast.error(generalError.textContent);
  }

  async function submit(event) {
    event.preventDefault();
    if (state.submitting) return;

    clearErrors();
    var wantsPassword =
      state.mode === 'add' || (!state.own && !changeRow.hidden && changeCheckbox.checked);
    var errors = collectErrors(wantsPassword);

    if (errors.length) {
      window.HrmForms.showErrors(form, { details: errors });
      return;
    }

    var payload = {
      name: trim(nameInput.value),
      email: trim(emailInput.value).toLowerCase(),
      status: statusSelect.value,
    };

    if (wantsPassword) {
      payload.password = passwordInput.value;
      payload.confirmPassword = confirmInput.value;
    }

    state.submitting = true;
    cancelButton.disabled = true;
    window.HrmForms.setBusy(saveButton, true, 'Saving…');

    try {
      var response;
      if (state.mode === 'add') {
        response = await window.HrmApi.post('/api/admins', payload);
        writeFlash('The administrator was created.');
      } else {
        response = await window.HrmApi.patch(
          '/api/admins/' + encodeURIComponent(state.id),
          payload,
        );
        if (response.data && response.data.passwordChanged) {
          writeFlash('The administrator was updated and all of their sessions were signed out.');
        } else if (payload.status === 'disabled') {
          writeFlash('The administrator was updated and signed out.');
        } else {
          writeFlash('The administrator was updated.');
        }
      }

      state.dirty = false;
      window.HrmForms.setBusy(saveButton, false);
      window.location.href = '/admins.html';
    } catch (error) {
      state.submitting = false;
      cancelButton.disabled = false;
      window.HrmForms.setBusy(saveButton, false);
      handleServerError(error);
    }
  }

  async function cancel() {
    if (state.dirty) {
      var confirmed = await window.HrmConfirm({
        title: 'Discard unsaved changes?',
        message: 'The changes to this administrator will be lost.',
        confirmLabel: 'Discard changes',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    state.dirty = false;
    window.location.href = '/admins.html';
  }

  function writeFlash(message) {
    try {
      window.sessionStorage.setItem('hrm.admin.flash', message);
    } catch (error) {
      /* storage unavailable — the redirect still works */
    }
  }

  function init() {
    if (state.started) return;
    state.started = true;

    var params = new URLSearchParams(window.location.search);
    var id = (params.get('id') || '').trim();
    state.mode = id ? 'edit' : 'add';
    state.id = id || null;

    state.refreshStrength = window.HrmAdminUi.bindPasswordStrength(
      passwordInput,
      strengthMeter,
      strengthText,
    );
    window.HrmAdminUi.enhanceSelects(document);
    window.HrmAdminUi.initPasswordToggles(document);

    changeCheckbox.addEventListener('change', function () {
      setPasswordPanel(changeCheckbox.checked);
      updateDirty();
      if (changeCheckbox.checked) passwordInput.focus();
    });

    form.addEventListener('input', updateDirty);
    form.addEventListener('change', updateDirty);
    form.addEventListener('submit', function (event) {
      void submit(event);
    });
    cancelButton.addEventListener('click', function () {
      void cancel();
    });
    retryButton.addEventListener('click', function () {
      void loadAdmin();
    });

    window.addEventListener('beforeunload', function (event) {
      if (!state.dirty || state.submitting) return;
      event.preventDefault();
      event.returnValue = '';
      return '';
    });

    void loadAdmin();
  }

  document.addEventListener('hrm:layout-ready', init);
})();
