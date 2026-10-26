/**
 * Public check-in form.
 *
 * This page is deliberately cookie-free: both requests are sent with
 * `credentials: 'omit'` and the API only returns the id and name of active
 * locations. An unknown or inactive `?location=` value is simply ignored.
 */
(function () {
  var form = document.getElementById('checkin-form');
  var nameInput = document.getElementById('checkin-name');
  var locationSelect = document.getElementById('checkin-location');
  var submitButton = document.getElementById('checkin-submit');
  var alertBox = document.getElementById('checkin-alert');
  var successBox = document.getElementById('checkin-success');
  var requestedLocation = new URLSearchParams(window.location.search).get('location');

  function showError(message) {
    successBox.classList.add('d-none');
    successBox.textContent = '';
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
  }

  function clearError() {
    alertBox.classList.add('d-none');
    alertBox.textContent = '';
    nameInput.removeAttribute('aria-invalid');
    locationSelect.removeAttribute('aria-invalid');
  }

  function hideSuccess() {
    successBox.classList.add('d-none');
    successBox.textContent = '';
  }

  function selectedDirection() {
    var checked = form.querySelector('input[name="direction"]:checked');
    return checked ? checked.value : 'in';
  }

  function updateSubmitLabel() {
    submitButton.textContent = selectedDirection() === 'out' ? 'Check out' : 'Check in';
  }

  function renderLocations(locations) {
    locationSelect.textContent = '';

    if (!locations.length) {
      var none = document.createElement('option');
      none.value = '';
      none.textContent = 'No active locations available';
      locationSelect.appendChild(none);
      locationSelect.disabled = true;
      submitButton.disabled = true;
      showError('No active check-in locations are available. Please ask an administrator.');
      return;
    }

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a location';
    locationSelect.appendChild(placeholder);

    var matched = false;
    locations.forEach(function (location) {
      var option = document.createElement('option');
      option.value = location.id;
      option.textContent = location.name;
      locationSelect.appendChild(option);
      if (requestedLocation && location.id === requestedLocation) matched = true;
    });

    locationSelect.disabled = false;
    submitButton.disabled = false;

    if (matched) {
      locationSelect.value = requestedLocation;
    } else {
      locationSelect.value = '';
    }
  }

  async function loadLocations() {
    try {
      var response = await fetch('/api/public/locations', {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      var payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          (payload.error && payload.error.message) || 'The locations could not be loaded.',
        );
      }

      renderLocations(payload.data.locations || []);
    } catch (error) {
      locationSelect.textContent = '';
      var failed = document.createElement('option');
      failed.value = '';
      failed.textContent = 'Locations could not be loaded';
      locationSelect.appendChild(failed);
      locationSelect.disabled = true;
      submitButton.disabled = true;
      showError(error.message || 'The locations could not be loaded. Please try again.');
    }
  }

  form.addEventListener('change', function (event) {
    if (event.target && event.target.name === 'direction') {
      updateSubmitLabel();
    }
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();
    hideSuccess();

    var name = nameInput.value.trim();
    var locationId = locationSelect.value;

    if (!name) {
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
      showError('Enter your name.');
      return;
    }

    if (!locationId) {
      locationSelect.setAttribute('aria-invalid', 'true');
      locationSelect.focus();
      showError('Choose a location.');
      return;
    }

    var direction = selectedDirection();
    submitButton.disabled = true;
    submitButton.textContent = 'Saving…';

    try {
      var response = await fetch('/api/public/entries', {
        method: 'POST',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          locationId: locationId,
          direction: direction,
        }),
      });
      var payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          (payload.error && payload.error.message) || 'Your entry could not be saved.',
        );
      }

      var entry = payload.data.entry;
      successBox.textContent =
        'Thank you, ' +
        entry.name +
        '. You checked ' +
        (entry.direction === 'out' ? 'out' : 'in') +
        ' at ' +
        entry.location.name +
        '.';
      successBox.classList.remove('d-none');
      nameInput.value = '';
      nameInput.focus();
    } catch (error) {
      showError(error.message || 'Your entry could not be saved. Please try again.');
    } finally {
      submitButton.disabled = false;
      updateSubmitLabel();
    }
  });

  updateSubmitLabel();
  void loadLocations();
})();
