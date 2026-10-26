/**
 * Public entries list.
 *
 * This is the read-only record of the cookie-free check-in form. The location
 * name is joined on the server; creating entries always happens publicly.
 */
(function () {
  var html = window.HrmDom.html;
  var body = document.getElementById('entries-body');
  var summary = document.getElementById('entries-summary');
  var pagination = document.getElementById('entries-pagination');
  var currentPage = 1;

  function formatWhen(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function directionBadge(direction) {
    return direction === 'out'
      ? html`<span class="badge badge-warning">Check out</span>`
      : html`<span class="badge badge-success">Check in</span>`;
  }

  async function load(page) {
    currentPage = page || 1;
    window.HrmDom.renderListState(body, 4, {
      type: 'loading',
      message: 'Loading entries…',
    });

    try {
      var response = await window.HrmApi.get(
        '/api/entries?page=' + encodeURIComponent(currentPage) + '&perPage=20',
      );
      var entries = response.data.entries || [];
      var meta = response.meta && response.meta.pagination;

      if (!entries.length) {
        window.HrmDom.renderListState(body, 4, {
          type: 'empty',
          message: 'No entries yet.',
          help: 'Completed public check-ins will appear here.',
        });
        summary.textContent = '0 entries';
        pagination.textContent = '';
        return;
      }

      window.HrmDom.renderRows(
        body,
        entries.map(function (entry) {
          return [
            html`<td>${formatWhen(entry.occurredAt)}</td>`,
            html`<td><strong>${entry.name}</strong></td>`,
            html`<td>${entry.location ? entry.location.name : '—'}</td>`,
            html`<td>${directionBadge(entry.direction)}</td>`,
          ];
        }),
        4,
        'No entries yet.',
      );

      summary.textContent =
        'Showing ' +
        entries.length +
        ' of ' +
        (meta ? meta.total : entries.length) +
        ' entries';

      if (meta) {
        window.HrmDom.renderPagination(pagination, meta, function (nextPage) {
          void load(nextPage);
        });
      } else {
        pagination.textContent = '';
      }
    } catch (error) {
      window.HrmDom.renderListState(body, 4, {
        type: 'error',
        message: 'The entries could not be loaded.',
        help: error.message,
        onRetry: function () {
          void load(currentPage);
        },
      });
      summary.textContent = '';
      pagination.textContent = '';
      window.HrmToast.error(error.message);
    }
  }

  document.getElementById('refresh-entries').addEventListener('click', function () {
    void load(1);
  });

  document.addEventListener('hrm:layout-ready', function () {
    void load(1);
  });
})();
