/**
 * Regression tests for the browser DOM helpers.
 *
 * `HrmDom.html` must return a SafeHtml value. Nested fragments and arrays of
 * fragments are trusted markup, while every plain string is escaped. These
 * tests deliberately use student names that look like markup.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const domSource = readFileSync(new URL('../public/js/dom.js', import.meta.url), 'utf8');
const adminUiSource = readFileSync(new URL('../public/js/admin-ui.js', import.meta.url), 'utf8');
const adminsSource = readFileSync(new URL('../public/js/admins.js', import.meta.url), 'utf8');
const adminFormSource = readFileSync(new URL('../public/js/admin-form.js', import.meta.url), 'utf8');
const myAccountSource = readFileSync(new URL('../public/js/my-account.js', import.meta.url), 'utf8');
const adminsPage = readFileSync(new URL('../public/admins.html', import.meta.url), 'utf8');
const adminFormPage = readFileSync(new URL('../public/admin-form.html', import.meta.url), 'utf8');
const myAccountPage = readFileSync(new URL('../public/my-account.html', import.meta.url), 'utf8');
const studentPage = readFileSync(new URL('../public/student.html', import.meta.url), 'utf8');
const leavesPage = readFileSync(new URL('../public/leaves.html', import.meta.url), 'utf8');
const studentSource = readFileSync(new URL('../public/js/student.js', import.meta.url), 'utf8');
const leavesSource = readFileSync(new URL('../public/js/leaves.js', import.meta.url), 'utf8');

const strayTemplateText = /\$\{|undefined|NaN|\[object Object\]/;

function parsePage(markup: string, url: string) {
  return new JSDOM(markup, { url }).window.document;
}

function referencedIds(source: string): string[] {
  const ids = new Set<string>();
  for (const match of source.matchAll(/getElementById\('([^']+)'\)/g)) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}

function createDocument() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'http://localhost/attendance.html',
  });
  dom.window.eval(domSource);
  return dom;
}

test('HrmDom.html returns a SafeHtml value and escapes plain strings', () => {
  const dom = createDocument();
  const { HrmDom } = dom.window;
  const name = '<script>alert(1)</script>';

  const fragment = HrmDom.html`<p class="student-name">${name}</p>`;

  assert.ok(fragment instanceof HrmDom.SafeHtml);
  dom.window.document.body.innerHTML = fragment;

  assert.equal(dom.window.document.querySelector('script'), null);
  assert.equal(dom.window.document.querySelector('.student-name')?.textContent, name);
  assert.equal(dom.window.document.body.textContent?.includes('<script>'), true);
});

test('nested fragments and arrays are inserted as markup, not escaped twice', () => {
  const dom = createDocument();
  const { HrmDom } = dom.window;
  const { document } = dom.window;

  const meta = HrmDom.html`<span class="student-card-meta">${'Analyst'} · ${'Operations'}</span>`;
  const row = HrmDom.html`
    <article class="student-card">
      <strong class="student-card-name">${'Ada Lovelace'}</strong>
      ${meta}
      <ul>${[
        HrmDom.html`<li>${'First item'}</li>`,
        HrmDom.html`<li>${'Second item'}</li>`,
      ]}</ul>
    </article>
  `;

  document.body.innerHTML = row;

  const metaElement = document.querySelector('.student-card-meta');
  assert.equal(metaElement?.tagName, 'SPAN');
  assert.equal(metaElement?.textContent, 'Analyst · Operations');
  assert.equal(document.body.textContent?.includes('<span'), false);
  assert.equal(document.querySelectorAll('.student-card li').length, 2);
  assert.equal(document.querySelector('.student-card')?.textContent?.includes('class='), false);
});

test('malicious student names stay text and never create script or image elements', () => {
  const dom = createDocument();
  const { HrmDom } = dom.window;
  const { document } = dom.window;

  for (const name of ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>']) {
    const meta = HrmDom.html`<span class="student-card-meta">${'Analyst'} · ${'Operations'}</span>`;
    const card = HrmDom.html`
      <div class="student-card">
        <strong class="student-card-name">${name}</strong>
        ${meta}
      </div>
    `;

    document.body.innerHTML = card;

    assert.equal(document.querySelectorAll('script').length, 0);
    assert.equal(document.querySelectorAll('img').length, 0);
    assert.equal(document.querySelector('.student-card-name')?.textContent, name);
    assert.equal(document.querySelector('.student-card-meta')?.textContent, 'Analyst · Operations');
    assert.equal(document.body.textContent?.includes('<span'), false);
  }
});

test('renderRows uses the same escaping rules for every cell', () => {
  const dom = createDocument();
  const { HrmDom } = dom.window;
  const { document } = dom.window;
  const body = document.createElement('tbody');

  HrmDom.renderRows(
    body,
    [
      [
        HrmDom.html`<td>${'<script>alert(1)</script>'}</td>`,
        HrmDom.html`<td>${HrmDom.html`<span class="badge-soft">${'Opened'}</span>`}</td>`,
      ],
    ],
    2,
    'Nothing here.',
  );

  document.body.appendChild(body);

  assert.equal(document.querySelectorAll('script').length, 0);
  assert.equal(document.querySelector('.badge-soft')?.textContent, 'Opened');
  assert.equal(document.body.textContent?.includes('<span'), false);
});

test('the student profile allowance card has every scripted element and no stray text', () => {
  const doc = parsePage(studentPage, 'http://localhost/student.html?id=1');
  const card = doc.getElementById('allowance-card');

  assert.ok(card, 'student.html must contain the allowance card');
  assert.match(card.textContent || '', /Holiday allowance/);
  assert.match(card.textContent || '', /Holiday used/);
  assert.match(studentPage, /Unused days do not carry over to the next year\./);
  assert.match(studentSource, /Holiday remaining/);
  assert.match(studentSource, /summary\.remainingLabel/);
  assert.match(studentSource, /summary\.expiredNote/);
  assert.equal(studentPage.includes('allowance-carry'), false);
  assert.equal(studentPage.includes('carryOver'), false);
  assert.equal(studentSource.includes('carryOver'), false);
  assert.equal(strayTemplateText.test(card.textContent || ''), false);

  for (const id of referencedIds(studentSource)) {
    assert.ok(doc.getElementById(id), `student.html is missing #${id}`);
  }

  assert.equal(card.querySelectorAll('[onclick], [onchange], [onsubmit]').length, 0);
});

test('the Allowances tab has every scripted element and no stray text', () => {
  const doc = parsePage(leavesPage, 'http://localhost/leaves.html');
  const pane = doc.getElementById('allowance-list-tab');

  assert.ok(pane, 'leaves.html must contain the allowances tab pane');
  assert.match(pane.textContent || '', /Holiday allowance/i);
  assert.match(pane.textContent || '', /Approved vacation/i);
  assert.match(leavesPage, /Unused days do not carry over to the next year\./);
  assert.match(pane.textContent || '', /Holiday remaining/);
  assert.equal(leavesPage.includes('allowance-carry'), false);
  assert.equal(leavesPage.includes('carryOver'), false);
  assert.equal(leavesSource.includes('carryOver'), false);
  assert.equal(strayTemplateText.test(pane.textContent || ''), false);

  const tab = doc.getElementById('allowance-list-tab-link');
  assert.equal(tab?.getAttribute('role'), 'tab');
  assert.equal(tab?.getAttribute('aria-controls'), 'allowance-list-tab');

  for (const id of referencedIds(leavesSource)) {
    assert.ok(doc.getElementById(id), `leaves.html is missing #${id}`);
  }

  const monthColumn = doc.getElementById('allowance-month-column');
  assert.equal(monthColumn?.classList.contains('d-none'), true);

  const remainingColumn = doc.getElementById('allowance-remaining-column');
  assert.equal(remainingColumn?.textContent, 'Holiday remaining');
  assert.ok(doc.getElementById('allowances-expired-note'));
});

function normalisedText(node: Element | null): string {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

test('the admins page has the required list controls and no stale password UI', () => {
  const doc = parsePage(adminsPage, 'http://localhost/admins.html');

  assert.equal(doc.body.getAttribute('data-page'), 'admins');
  assert.match(normalisedText(doc.querySelector('h1')), /^Admins & Settings$/);
  assert.equal(
    normalisedText(doc.getElementById('admin-records-count')),
    '(0) Records Found',
  );

  for (const id of ['filter-name', 'filter-email', 'filter-status', 'search-admins', 'reset-filters']) {
    assert.ok(doc.getElementById(id), `admins.html is missing #${id}`);
  }

  const columns = [...doc.querySelectorAll('thead th')].map((cell) => normalisedText(cell));
  assert.deepEqual(columns, [
    '',
    'Name',
    'Email (login)',
    'User Role',
    'Status',
    'Last login',
    'Actions',
  ]);
  assert.equal(doc.querySelectorAll('.admin-sort').length, 4);
  assert.equal(doc.querySelector('.admin-sort')?.getAttribute('data-sort'), 'name');
  assert.equal(doc.querySelector('.admin-btn-add')?.getAttribute('href'), '/admin-form.html');

  const toggle = doc.getElementById('admin-filter-toggle');
  assert.equal(toggle?.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle?.getAttribute('aria-controls'), 'admin-filter-panel');
  assert.equal(doc.getElementById('admin-selection-bar')?.hasAttribute('hidden'), true);
  assert.ok(doc.getElementById('admin-bulk-error')?.getAttribute('role') === 'alert');
  assert.equal(strayTemplateText.test(doc.body.textContent || ''), false);

  // The own-password form now lives on my-account.html, not here.
  assert.equal(adminsPage.includes('current-password'), false);
  assert.equal(adminsPage.includes('my-account-form'), false);
  assert.equal(adminsPage.includes('admin-password'), false);

  for (const id of referencedIds(adminsSource)) {
    assert.ok(doc.getElementById(id), `admins.html is missing #${id}`);
  }

  assert.equal(doc.querySelectorAll('[onclick], [onchange], [onsubmit]').length, 0);
});

test('the admin form keeps the exact Cloudflare helper and password controls', () => {
  const doc = parsePage(adminFormPage, 'http://localhost/admin-form.html');

  assert.equal(doc.body.getAttribute('data-page'), 'admins');
  assert.equal(normalisedText(doc.getElementById('admin-form-title')), 'Add Admin');
  assert.equal(
    normalisedText(doc.getElementById('email-help')),
    'This address must be verified in Cloudflare (Email Routing > Destination addresses) before it can receive password reset emails.',
  );
  assert.equal(
    normalisedText(doc.getElementById('password-help')),
    'For a strong password, please use a hard to guess combination of text with upper and lower case characters, symbols and numbers',
  );
  assert.equal(normalisedText(doc.querySelector('.admin-required-note')), '* Required');
  assert.equal(normalisedText(doc.getElementById('status-help')), 'Disabled admins keep their history but cannot sign in.');

  const email = doc.getElementById('admin-email');
  assert.equal(email?.getAttribute('aria-describedby'), 'email-help');
  assert.equal(doc.getElementById('admin-name')?.hasAttribute('required'), true);
  assert.equal(doc.getElementById('admin-password')?.getAttribute('minlength'), '8');
  assert.equal(doc.getElementById('admin-confirm-password')?.getAttribute('minlength'), '8');
  assert.equal(doc.querySelectorAll('[data-password-toggle]').length, 2);
  assert.equal(doc.getElementById('password-strength-meter')?.getAttribute('role'), 'progressbar');
  assert.ok(doc.getElementById('admin-form-cancel'));
  assert.ok(doc.getElementById('admin-form-save'));

  assert.equal(strayTemplateText.test(doc.body.textContent || ''), false);
  for (const id of referencedIds(adminFormSource)) {
    assert.ok(doc.getElementById(id), `admin-form.html is missing #${id}`);
  }

  assert.equal(doc.querySelectorAll('[onclick], [onchange], [onsubmit]').length, 0);
});

test('my-account.html owns the old own-password form', () => {
  const doc = parsePage(myAccountPage, 'http://localhost/my-account.html');

  assert.equal(doc.body.getAttribute('data-page'), 'admins');
  assert.equal(doc.body.classList.contains('page-admins'), true);
  assert.match(normalisedText(doc.querySelector('h1')), /^My Account$/);
  assert.ok(doc.getElementById('current-password'));
  assert.ok(doc.getElementById('new-password'));
  assert.ok(doc.getElementById('update-password'));
  assert.equal(doc.getElementById('new-password')?.getAttribute('minlength'), '8');
  assert.equal(strayTemplateText.test(doc.body.textContent || ''), false);

  for (const id of referencedIds(myAccountSource)) {
    assert.ok(doc.getElementById(id), `my-account.html is missing #${id}`);
  }

  assert.equal(doc.querySelectorAll('[onclick], [onchange], [onsubmit]').length, 0);
});

test('rendered admin rows escape hostile names and emails', async () => {
  const dom = new JSDOM(adminsPage, {
    runScripts: 'outside-only',
    url: 'http://localhost/admins.html',
  });
  const { window } = dom;
  const { document } = window;
  const name = '<img src=x onerror="window.__adminXss = 1"> Evil Admin';
  const email = '<script>window.__adminEmailXss = 1</script>@example.com';

  window.eval(domSource);
  window.eval(adminUiSource);
  window.eval(adminsSource);

  window.HrmCurrentAdmin = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb' };
  window.HrmApi = {
    get: async () => ({
      data: {
        admins: [
          {
            id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            name,
            email,
            role: 'admin',
            isActive: true,
            lastLoginAt: null,
          },
        ],
      },
      meta: { total: 1, page: 1, perPage: 20, pages: 1 },
    }),
  };
  window.HrmToast = { success() {}, error() {} };
  window.HrmForms = { setBusy() {}, clear() {}, showErrors() { return true; } };
  window.HrmConfirm = async () => false;

  document.dispatchEvent(new window.Event('hrm:layout-ready'));
  await new Promise((resolve) => window.setTimeout(resolve, 20));

  const body = document.getElementById('admin-list-body');
  assert.ok(body);
  assert.equal(body.querySelectorAll('script, img, svg').length, 0);
  assert.equal(body.textContent?.includes(name), true);
  assert.equal(body.textContent?.includes(email), true);
  assert.equal((window as unknown as { __adminXss?: number }).__adminXss, undefined);
  assert.equal((window as unknown as { __adminEmailXss?: number }).__adminEmailXss, undefined);
  assert.equal(strayTemplateText.test(body.textContent || ''), false);
});
