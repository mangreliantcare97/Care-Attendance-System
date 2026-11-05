/**
 * Dashboard page.
 *
 * The page is a single HTML file driven by /js/dashboard.js. These tests keep
 * the two in sync and render the summary, ring, chart control and tables from
 * a stubbed API payload — no database and no Chart.js required.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const pageMarkup = readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8');
const navMarkup = readFileSync(new URL('../public/partials/sidebar.html', import.meta.url), 'utf8');
const headerMarkup = readFileSync(new URL('../public/partials/navbar.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/js/dashboard.js', import.meta.url), 'utf8');
const layoutScript = readFileSync(new URL('../public/js/layout.js', import.meta.url), 'utf8');
const domSource = readFileSync(new URL('../public/js/dom.js', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../public/css/dashboard-glass.css', import.meta.url), 'utf8');

const strayTemplateText = /\$\{|undefined|NaN|\[object Object\]/;

function composePage(markup = pageMarkup): string {
  return markup
    .replace('<div id="glass-nav-placeholder"></div>', navMarkup.trim())
    .replace('<div id="glass-header-placeholder"></div>', headerMarkup.trim());
}

const page = composePage();

function parsePage() {
  return new JSDOM(page, { url: 'http://localhost/dashboard.html' }).window.document;
}

function normalisedText(node: Element | null): string {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

test('dashboard.html owns every id the dashboard script looks up', () => {
  const doc = parsePage();

  assert.equal(doc.body.getAttribute('data-page'), 'dashboard');
  assert.equal(doc.querySelectorAll('[data-nav-link]').length, 8);
  assert.equal(
    doc.querySelector('[data-nav-link="dashboard"]')?.getAttribute('href'),
    '/dashboard.html',
  );
  assert.equal(doc.querySelector('[data-nav-link="reports"]')?.getAttribute('href'), '/reports.html');
  assert.ok(doc.getElementById('dashboard-search'));
  assert.ok(doc.getElementById('glass-nav-placeholder') === null);

  for (const match of script.matchAll(/getElementById\('([^']+)'\)/g)) {
    const id = match[1];
    assert.ok(doc.getElementById(id), `dashboard.html is missing #${id}`);
  }

  assert.equal(doc.querySelectorAll('[onclick], [onchange], [onsubmit]').length, 0);
  assert.equal(strayTemplateText.test(doc.body.textContent || ''), false);

  // The stylesheet was once corrupted by a stray shell command; keep it clean.
  assert.equal(stylesheet.includes('Set-Content'), false);
  assert.equal(stylesheet.includes('-Encoding'), false);
});

test('the shared layout highlights the rail item and fills the header identity', async () => {
  const dom = new JSDOM(composePage(), {
    runScripts: 'outside-only',
    url: 'http://localhost/dashboard.html',
  });
  const { window } = dom;
  const { document } = window;

  window.fetch = (async () => {
    throw new Error('the partials are already composed in this test');
  }) as typeof window.fetch;
  (window as unknown as { HrmApi: unknown }).HrmApi = {
    get: async () => ({
      data: { admin: { name: 'Ada Admin', email: 'ada@example.com' }, timezone: 'UTC' },
      meta: { csrfToken: 'test-token' },
    }),
    setCsrfToken() {},
  };

  window.eval(layoutScript);
  document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise((resolve) => window.setTimeout(resolve, 40));

  const active = document.querySelector('.glass-nav__item.is-active');
  assert.equal(active?.getAttribute('data-nav-link'), 'dashboard');
  assert.equal(document.querySelectorAll('.glass-nav__item.is-active').length, 1);
  assert.equal(document.querySelector('[data-nav-link="dashboard"]')?.getAttribute('aria-current'), 'page');
  assert.equal(normalisedText(document.querySelector('[data-admin-name]')), 'Ada Admin');
  assert.notEqual(normalisedText(document.getElementById('summary-date')), '—');

  window.close();
});

test('the layout maps the overtime and attendance-report pages to Reports', async () => {
  for (const pageId of ['overtime', 'attendance-report']) {
    const markup = pageMarkup.replace('data-page="dashboard"', `data-page="${pageId}"`);
    const dom = new JSDOM(composePage(markup), {
      runScripts: 'outside-only',
      url: `http://localhost/${pageId}.html`,
    });
    const { window } = dom;
    const { document } = window;

    (window as unknown as { HrmApi: unknown }).HrmApi = {
      get: async () => ({
        data: { admin: { name: 'Ada Admin', email: 'ada@example.com' }, timezone: 'UTC' },
        meta: { csrfToken: 'test-token' },
      }),
      setCsrfToken() {},
    };

    window.eval(layoutScript);
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise((resolve) => window.setTimeout(resolve, 40));

    const active = document.querySelector('.glass-nav__item.is-active');
    assert.equal(active?.getAttribute('data-nav-link'), 'reports', pageId);
    assert.equal(document.querySelectorAll('.glass-nav__item.is-active').length, 1, pageId);

    window.close();
  }
});

test('the dashboard renders the summary, ring, chart series and tables from the API', async () => {
  const dom = new JSDOM(page, { runScripts: 'outside-only', url: 'http://localhost/dashboard.html' });
  const { window } = dom;
  const { document } = window;

  window.eval(domSource);

  const charts: Array<{ config: { type: string; data: { labels: string[]; datasets: Array<{ label: string; data: number[] }> }; options: { cutoutPercentage?: number } } }> = [];

  (window as unknown as { HTMLCanvasElement: { prototype: { getContext: () => object } } }).HTMLCanvasElement.prototype.getContext = () => ({});
  (window as unknown as { Chart: unknown }).Chart = function Chart(this: unknown, _context: unknown, config: (typeof charts)[number]['config']) {
    (this as { config: unknown }).config = config;
    (this as { destroy: () => void }).destroy = () => {};
    charts.push({ config });
  };

  const days = [
    { date: '2026-11-01', label: '1', attendance: 10, absence: 1, leave: 0 },
    { date: '2026-11-02', label: '2', attendance: 12, absence: 0, leave: 1 },
  ];
  const summary = {
    date: '2026-11-05',
    isWorkingDay: true,
    isHoliday: false,
    holidayTitle: null,
    totalStudents: 20,
    present: 12,
    late: 2,
    absent: 3,
    onLeave: 3,
    notMarked: 0,
    departments: [
      { id: 'a', name: 'Operations', activeStudents: 12 },
      { id: 'b', name: 'Sales', activeStudents: 8 },
    ],
  };

  (window as unknown as { HrmApi: unknown }).HrmApi = {
    get: async (path: string) => {
      if (path.startsWith('/api/dashboard/summary')) return { data: summary };
      if (path.startsWith('/api/dashboard/year')) {
        return {
          data: {
            months: Array.from({ length: 12 }, (_, index) => ({
              month: `2026-${String(index + 1).padStart(2, '0')}`,
              label: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index],
              attendance: 0,
              absence: 0,
              leave: 0,
            })),
          },
        };
      }
      return {
        data: {
          month: '2026-11',
          days,
          topStudents: [
            {
              studentId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
              name: 'Ada Lovelace',
              position: 'Analyst',
              department: 'Operations',
              score: 12,
              present: 4,
              late: 0,
              absent: 0,
            },
          ],
        },
      };
    },
  };
  (window as unknown as { HrmToast: unknown }).HrmToast = {
    error() {},
    success() {},
    info() {},
    warning() {},
  };

  window.eval(script);
  document.dispatchEvent(new window.Event('hrm:layout-ready'));
  await new Promise((resolve) => window.setTimeout(resolve, 40));

  // Today's headline, date and rate ring.
  assert.equal(normalisedText(document.querySelector('.hero-card__value')), '12');
  assert.equal(
    normalisedText(document.querySelector('.hero-card__label [data-summary="totalStudents"]')),
    '20',
  );
  const longDate = normalisedText(document.getElementById('summary-date-long'));
  assert.match(longDate, /^Thursday/);
  assert.match(longDate, /5/);
  assert.match(longDate, /2026/);
  assert.equal(normalisedText(document.getElementById('day-status')), 'Working day');
  assert.equal(normalisedText(document.getElementById('coverage-percent')), '70%');
  assert.equal(
    normalisedText(document.getElementById('coverage-caption')),
    '14 of 20 students present or late',
  );
  assert.match(document.getElementById('coverage-ring-value')?.getAttribute('style') || '', /stroke-dashoffset/);
  assert.match(
    document.querySelector('.coverage-ring__svg')?.getAttribute('aria-label') || '',
    /Attendance rate 70%/,
  );

  // 2x2 stat cards and their share bars.
  assert.equal(normalisedText(document.querySelector('[data-stat-share="present"]')), '60%');
  assert.equal(normalisedText(document.querySelector('[data-stat-share="late"]')), '10%');
  assert.match(
    document.querySelector('[data-stat-bar="present"]')?.getAttribute('style') || '',
    /width:\s*60%/,
  );

  // Chart cards.
  const bar = charts.find((chart) => chart.config.type === 'bar');
  assert.ok(bar, 'the month card must render a bar chart');
  assert.equal(bar.config.data.datasets[0].label, 'Attendance');
  assert.deepEqual(bar.config.data.datasets[0].data, [10, 12]);
  assert.deepEqual(bar.config.data.labels, ['1', '2']);
  assert.match(normalisedText(document.getElementById('month-chart-caption')), /22 attendance records/);

  const doughnut = charts.find((chart) => chart.config.type === 'doughnut');
  assert.ok(doughnut, 'the department card must render a doughnut chart');
  assert.deepEqual(doughnut.config.data.labels, ['Operations', 'Sales']);

  // Tables.
  const departmentRows = [...document.querySelectorAll('#departments-body tr')];
  assert.equal(departmentRows.length, 2);
  const departmentCells = [...departmentRows[0].querySelectorAll('td')];
  assert.equal(departmentCells.length, 3);
  assert.equal(normalisedText(departmentCells[0]), 'Operations');
  assert.equal(normalisedText(departmentCells[1]), '12');
  assert.equal(normalisedText(departmentCells[2]), '60%');

  assert.equal(document.querySelectorAll('#top-students-body tr').length, 1);
  assert.match(normalisedText(document.querySelector('#top-students-body tr')), /Ada Lovelace/);

  // The segmented control switches the visible series.
  const absenceButton = document.querySelector('[data-series="absence"]') as HTMLElement;
  absenceButton.click();
  await new Promise((resolve) => window.setTimeout(resolve, 20));

  assert.equal(absenceButton.getAttribute('aria-pressed'), 'true');
  assert.equal(
    document.querySelector('[data-series="attendance"]')?.getAttribute('aria-pressed'),
    'false',
  );
  const switched = charts[charts.length - 1];
  assert.equal(switched.config.data.datasets[0].label, 'Absence');
  assert.deepEqual(switched.config.data.datasets[0].data, [1, 0]);
  assert.match(normalisedText(document.getElementById('month-chart-caption')), /1 absence record/);

  // Search filters both tables.
  const search = document.getElementById('dashboard-search') as HTMLInputElement;
  search.value = 'Sales';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));

  assert.equal(document.querySelectorAll('#departments-body tr')[0].hasAttribute('hidden'), true);
  assert.equal(document.querySelectorAll('#departments-body tr')[1].hasAttribute('hidden'), false);
  assert.equal(document.querySelectorAll('#top-students-body tr')[0].hasAttribute('hidden'), true);

  window.close();
});
