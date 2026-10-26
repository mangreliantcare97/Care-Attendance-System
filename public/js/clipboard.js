/**
 * Clipboard helper.
 *
 * Uses the async Clipboard API when the browser allows it and falls back to a
 * temporary textarea (older browsers, or a page that is not a secure context).
 * The promise always resolves with the copied text or rejects with an Error.
 */
(function () {
  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();

    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    } finally {
      textarea.remove();
    }

    if (!copied) return Promise.reject(new Error('Copy is not available in this browser.'));
    return Promise.resolve(text);
  }

  function copy(text) {
    if (!text) return Promise.reject(new Error('There is nothing to copy.'));

    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopy(text);
      });
    }
    return fallbackCopy(text);
  }

  window.HrmClipboard = { copy: copy };
})();
