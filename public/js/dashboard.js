/**
 * Dashboard — Phase 2, step A.
 *
 * Two cards live here for now: the warning that appears when no location is
 * active (the public form would be unusable), and the printed public check-in
 * link, which is always built from APP_BASE_URL through /api/auth/me — never
 * from the page origin. The metric cards and charts arrive with step C.
 */
(function () {
  var warning = document.getElementById('no-locations-warning');
  var linkInput = document.getElementById('public-link');
  var copyButton = document.getElementById('copy-public-link');
  var openButton = document.getElementById('open-public-link');
  var copyStatus = document.getElementById('public-link-status');

  function setLink(url) {
    if (!linkInput || !url) return;
    linkInput.value = url;
    if (openButton) openButton.setAttribute('href', url);
    if (copyButton) copyButton.disabled = false;
  }

  function report(message) {
    if (copyStatus) copyStatus.textContent = message;
  }

  /**
   * Show the warning only when the list is known to be empty. A failed
   * request keeps the card hidden — a transient error must not claim the
   * public form is broken.
   */
  async function checkLocations() {
    if (!warning) return;

    try {
      var response = await window.HrmApi.get('/api/locations');
      var locations = (response.data && response.data.locations) || [];
      var anyActive = locations.some(function (location) {
        return location.active !== false;
      });
      warning.hidden = anyActive;
    } catch (error) {
      /* leave the card hidden */
    }
  }

  async function copyLink() {
    if (!linkInput || !linkInput.value) return;

    try {
      await window.HrmClipboard.copy(linkInput.value);
      report('Check-in link copied.');
    } catch (error) {
      report('The link could not be copied. Select the text and copy it manually.');
    }
  }

  document.addEventListener('hrm:layout-ready', function () {
    setLink(window.HrmCheckInUrl);
    if (copyButton) copyButton.addEventListener('click', copyLink);
    void checkLocations();
  });
})();
