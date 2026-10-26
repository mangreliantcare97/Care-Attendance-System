/**
 * Toast notifications.
 *
 * Uses the vendored Toastr when it is on the page and falls back to a plain
 * `alert()` so that a missing script never swallows a message.
 */
(function () {
  function show(type, message) {
    if (window.toastr) {
      window.toastr[type](message);
      return;
    }
    window.alert(message);
  }

  window.HrmToast = {
    success: function (message) {
      show('success', message);
    },
    error: function (message) {
      show('error', message);
    },
    info: function (message) {
      show('info', message);
    },
    warning: function (message) {
      show('warning', message);
    },
  };
})();
