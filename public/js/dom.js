/**
 * Small DOM helpers.
 *
 * `html` is a tagged template that escapes every interpolated value, so user
 * data can never end up in the page as markup. It returns a SafeHtml value:
 * nested `html` fragments and arrays of fragments are inserted as-is, while
 * plain strings are always escaped.
 */
(function () {
  var ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  function SafeHtml(value) {
    this.value = String(value);
  }

  SafeHtml.prototype.toString = function () {
    return this.value;
  };

  SafeHtml.prototype.toJSON = function () {
    return this.value;
  };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (character) {
      return ENTITIES[character];
    });
  }

  /** Explicitly mark static, developer-authored markup as trusted. */
  function raw(value) {
    return value instanceof SafeHtml ? value : new SafeHtml(String(value));
  }

  function renderValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    return escapeHtml(value);
  }

  function html(strings) {
    var values = Array.prototype.slice.call(arguments, 1);
    var output = '';

    for (var index = 0; index < strings.length; index += 1) {
      output += strings[index];
      if (index < values.length) output += renderValue(values[index]);
    }

    return new SafeHtml(output);
  }

  /**
   * Replace the content of a table body with the given rows.
   *
   * `rows` is a list of rows, every row a list of cells. A cell is a piece of
   * markup — build it with the `html` tagged template so that user data is
   * escaped.
   */
  function renderRows(target, rows, columns, emptyMessage) {
    target.textContent = '';

    if (!rows.length) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = columns;
      emptyCell.className = 'text-center py-4';
      emptyCell.textContent = emptyMessage || 'Nothing to show.';
      emptyRow.appendChild(emptyCell);
      target.appendChild(emptyRow);
      return;
    }

    rows.forEach(function (cells) {
      var tr = document.createElement('tr');
      tr.innerHTML = cells.map(renderValue).join('');
      target.appendChild(tr);
    });
  }

  /**
   * Replace the content of a table body with a loading, empty or error state.
   *
   * The state is a full-width row so it works in every list table. Error
   * states receive a retry button; the caller owns the retry callback.
   */
  function renderListState(target, columns, options) {
    var settings = options || {};
    var type = settings.type || 'empty';

    target.textContent = '';

    var row = document.createElement('tr');
    var cell = document.createElement('td');
    cell.colSpan = columns;
    cell.className = 'py-0';

    var box = document.createElement('div');
    box.className = 'list-state list-state-' + type;
    box.setAttribute('role', type === 'error' ? 'alert' : 'status');

    var icon;
    if (type === 'loading') {
      icon = document.createElement('span');
      icon.className = 'spinner-border spinner-border-sm list-state-spinner';
      icon.setAttribute('aria-hidden', 'true');
    } else {
      icon = document.createElement('i');
      icon.className =
        'fa ' +
        (type === 'error' ? 'fa-exclamation-triangle' : 'fa-inbox') +
        ' list-state-icon';
      icon.setAttribute('aria-hidden', 'true');
    }
    box.appendChild(icon);

    var title = document.createElement('p');
    title.className = 'list-state-title';
    title.textContent = settings.message || (type === 'loading' ? 'Loading…' : 'Nothing to show.');
    box.appendChild(title);

    if (settings.help) {
      var help = document.createElement('p');
      help.className = 'list-state-help';
      help.textContent = settings.help;
      box.appendChild(help);
    }

    if (type === 'error' && typeof settings.onRetry === 'function') {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-sm btn-outline-primary';
      retry.textContent = settings.retryLabel || 'Try again';
      retry.addEventListener('click', settings.onRetry);
      box.appendChild(retry);
    }

    cell.appendChild(box);
    row.appendChild(cell);
    target.appendChild(row);
  }

  /** A simple Bootstrap style pagination block. */
  function renderPagination(target, meta, onPage) {
    target.textContent = '';

    if (!meta || meta.pages <= 1) {
      return;
    }

    var nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Pagination');

    var list = document.createElement('ul');
    list.className = 'pagination pagination-sm mb-0';

    for (var page = 1; page <= meta.pages; page += 1) {
      var item = document.createElement('li');
      item.className = 'page-item';
      if (page === meta.page) item.classList.add('active');

      var link = document.createElement('a');
      link.className = 'page-link';
      link.href = '#';
      link.textContent = String(page);
      link.setAttribute('aria-label', 'Page ' + page + ' of ' + meta.pages);
      if (page === meta.page) link.setAttribute('aria-current', 'page');
      (function (targetPage) {
        link.addEventListener('click', function (event) {
          event.preventDefault();
          onPage(targetPage);
        });
      })(page);

      item.appendChild(link);
      list.appendChild(item);
    }

    nav.appendChild(list);
    target.appendChild(nav);
  }

  // ---- forms -------------------------------------------------------------

  function clearFieldErrors(form) {
    if (!form) return;
    var invalid = form.querySelectorAll('.is-invalid');
    for (var index = 0; index < invalid.length; index += 1) {
      invalid[index].classList.remove('is-invalid');
      invalid[index].removeAttribute('aria-invalid');
    }
    var feedback = form.querySelectorAll('[data-server-error]');
    for (var item = 0; item < feedback.length; item += 1) {
      feedback[item].remove();
    }
  }

  function fieldFor(form, path) {
    if (!form || !path) return null;

    var direct = form.elements.namedItem(path);
    if (direct && direct.nodeType === 1) return direct;

    var escaped = String(path).replace(/"/g, '\\"');
    var named = form.querySelector('[name="' + escaped + '"]');
    if (named) return named;

    // A nested server path such as `entries.0.status` still maps to a field
    // named `status` when there is exactly one of them in this form.
    var last = String(path).split('.').pop();
    if (last && last !== path) {
      var candidates = form.querySelectorAll('[name="' + String(last).replace(/"/g, '\\"') + '"]');
      if (candidates.length === 1) return candidates[0];
    }

    return null;
  }

  function showFieldErrors(form, error) {
    clearFieldErrors(form);
    if (!form || !error || !Array.isArray(error.details)) return false;

    var first = null;
    error.details.forEach(function (issue) {
      var field = fieldFor(form, issue.path);
      if (!field) return;

      field.classList.add('is-invalid');
      field.setAttribute('aria-invalid', 'true');

      var group = field.closest('.form-group') || field.parentNode;
      var feedback = document.createElement('div');
      feedback.className = 'invalid-feedback d-block';
      feedback.setAttribute('data-server-error', '');
      feedback.textContent = String(issue.message || 'This value is not valid.');
      group.appendChild(feedback);

      var describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      var feedbackId = 'error-' + Math.random().toString(36).slice(2, 9);
      feedback.id = feedbackId;
      describedBy.push(feedbackId);
      field.setAttribute('aria-describedby', describedBy.join(' '));

      if (!first) first = field;
    });

    if (first) {
      first.focus();
      return true;
    }
    return false;
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      if (button.disabled) return;
      button.dataset.hrmReady = 'true';
      button.dataset.hrmLabel = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = html`<span class="spinner-border spinner-border-sm mr-1" role="status" aria-hidden="true"></span>${busyLabel || 'Working…'}`;
    } else if (button.dataset.hrmReady === 'true') {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = button.dataset.hrmLabel || button.innerHTML;
      delete button.dataset.hrmReady;
      delete button.dataset.hrmLabel;
    }
  }

  // ---- shared confirmation modal ----------------------------------------

  var confirmState = { resolve: null, lastFocus: null, modal: null };

  function confirmFallback(options) {
    return Promise.resolve(
      window.confirm((options.title ? options.title + '\n\n' : '') + (options.message || '')),
    );
  }

  function ensureConfirmModal() {
    if (confirmState.modal) return confirmState.modal;

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html`
      <div class="modal fade" id="hrm-confirm-modal" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="hrm-confirm-title" aria-describedby="hrm-confirm-message">
        <div class="modal-dialog modal-dialog-centered" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <h2 class="modal-title h5" id="hrm-confirm-title">Confirm</h2>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body" id="hrm-confirm-message"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="hrm-confirm-ok">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;

    var modal = wrapper.firstElementChild;
    document.body.appendChild(modal);

    var description = modal.querySelector('#hrm-confirm-message');
    var confirmButton = modal.querySelector('#hrm-confirm-ok');
    var title = modal.querySelector('#hrm-confirm-title');

    function finish(value) {
      var resolve = confirmState.resolve;
      confirmState.resolve = null;
      if (resolve) resolve(value);
    }

    confirmButton.addEventListener('click', function () {
      finish(true);
      if (window.jQuery) window.jQuery(modal).modal('hide');
      else if (window.bootstrap && window.bootstrap.Modal) window.bootstrap.Modal.getOrCreateInstance(modal).hide();
    });

    // Esc must close the dialog no matter which control currently has focus.
    // Bootstrap's own handler is not reliable once the browser has moved focus
    // onto one of the modal buttons after a Tab.
    modal.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !confirmState.resolve) return;
      event.preventDefault();
      event.stopPropagation();
      if (window.jQuery) window.jQuery(modal).modal('hide');
      else if (window.bootstrap && window.bootstrap.Modal) window.bootstrap.Modal.getOrCreateInstance(modal).hide();
    }, true);

    if (window.jQuery) {
      window.jQuery(modal).on('hidden.bs.modal', function () {
        finish(false);
        if (confirmState.lastFocus && document.contains(confirmState.lastFocus)) {
          confirmState.lastFocus.focus();
        }
        confirmState.lastFocus = null;
      });
    }

    confirmState.modal = modal;
    confirmState.description = description;
    confirmState.confirmButton = confirmButton;
    confirmState.title = title;
    return modal;
  }

  function confirmAction(options) {
    var settings = options || {};
    if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.modal) {
      return confirmFallback(settings);
    }

    var modal = ensureConfirmModal();
    if (confirmState.resolve) confirmState.resolve(false);

    confirmState.lastFocus = document.activeElement;
    confirmState.title.textContent = settings.title || 'Please confirm';
    confirmState.description.textContent = settings.message || 'Are you sure?';
    confirmState.confirmButton.textContent = settings.confirmLabel || 'Delete';
    confirmState.confirmButton.className =
      'btn ' + (settings.variant === 'primary' ? 'btn-primary' : 'btn-danger');

    window.jQuery(modal).modal({ keyboard: true, backdrop: 'static', show: true });

    return new Promise(function (resolve) {
      confirmState.resolve = resolve;
    });
  }

  // Trap Tab inside any visible Bootstrap modal and return focus when it
  // closes. Bootstrap 4 handles Esc and the backdrop; this fills the keyboard
  // focus gap consistently across every modal on the page.
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var modal = document.querySelector('.modal.show');
    if (!modal) return;

    var candidates = modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    var focusable = Array.prototype.filter.call(candidates, function (element) {
      return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
    });
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (window.jQuery) {
    window.jQuery(document).on('show.bs.modal', '.modal', function () {
      this._hrmReturnFocus = document.activeElement;
    });
    window.jQuery(document).on('hidden.bs.modal', '.modal', function () {
      var target = this._hrmReturnFocus;
      if (target && document.contains(target) && typeof target.focus === 'function') {
        target.focus();
      }
      this._hrmReturnFocus = null;
    });
  }

  window.HrmConfirm = function (options) {
    return confirmAction(options);
  };

  window.HrmForms = {
    clear: clearFieldErrors,
    showErrors: showFieldErrors,
    setBusy: setBusy,
  };

  window.HrmDom = {
    SafeHtml: SafeHtml,
    escape: escapeHtml,
    raw: raw,
    html: html,
    renderRows: renderRows,
    renderListState: renderListState,
    renderPagination: renderPagination,
  };
})();
