/**
 * Step A browser verification — public check-in page and dashboard.
 *
 *   node scripts/verify-checkin.mjs
 *
 * Drives the installed Chrome against a scratch server, captures screenshots
 * into .verify/ and prints one line per problem (console, CSP, HTTP, stray
 * text, layout). Exits non-zero when anything failed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3210';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = new URL('../.verify/', import.meta.url);

const problems = [];
const notes = [];

function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.log(`  FAIL ${message}`);
    problems.push(message);
  }
}

async function open({ width, height }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__csp.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      // Chrome repeats every non-2xx response as a console error; the
      // response listener below already records those (and classifies them).
      if (/^Failed to load resource/.test(message.text())) return;
      problems.push(`console.error: ${message.text()}`);
    }
    if (message.type() === 'warning') notes.push(`console.warning: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`),
  );
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() < 400) return;
    // login.html asks /api/auth/me whether someone is already signed in, and
    // "not signed in" is the normal answer to that probe.
    if (response.status() === 401 && url.endsWith('/api/auth/me')) {
      notes.push(`expected 401 probe on ${url}`);
      return;
    }
    problems.push(`HTTP ${response.status()}: ${url}`);
  });

  return page;
}

async function shot(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(name, SHOTS)) });
}

/** Everything that must hold on the public form, in any viewport or theme. */
async function checkPublicForm(page, label) {
  const sixFields = await page.evaluate(() => {
    const ids = [
      'checkin-user-type',
      'checkin-name',
      'checkin-direction',
      'checkin-hour',
      'checkin-minute',
      'checkin-period',
      'checkin-location',
      'checkin-notes',
    ];
    const missing = ids.filter((id) => !document.getElementById(id));
    const markers = ['checkin-user-type', 'checkin-name', 'checkin-direction', 'checkin-location', 'checkin-notes']
      .filter((id) => !document.querySelector(`label[for="${id}"] .checkin-required`));
    const radios = document.querySelectorAll('input[type="radio"]').length;
    const unselected = ['checkin-user-type', 'checkin-direction', 'checkin-location', 'checkin-hour', 'checkin-minute', 'checkin-period']
      .filter((id) => document.getElementById(id).value !== '');
    return { missing, markers, radios, unselected };
  });
  check(sixFields.missing.length === 0, `${label}: all six fields present`);
  check(sixFields.markers.length === 0, `${label}: every required field has a red *`);
  check(sixFields.radios === 0, `${label}: no radio buttons remain`);
  check(sixFields.unselected.length === 0, `${label}: no field is preselected`);

  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    requiredNote: /\*\s*Required/.test(document.body.textContent),
    strays: ['undefined', '[object Object]', 'NaN'].filter((word) => document.body.textContent.includes(word)),
    cookies: document.cookie,
    robots: document.querySelector('meta[name="robots"]')?.content,
    noindex: document.documentElement.outerHTML.includes('noindex') ? null : 'meta present',
    locationWrap: (() => {
      const select = document.getElementById('checkin-location');
      const full = document.getElementById('checkin-location-full');
      return {
        canOverflow: select.scrollWidth > select.clientWidth,
        wrap: getComputedStyle(full).overflowWrap || getComputedStyle(full).wordBreak,
        textOverflow: full.scrollWidth > full.clientWidth + 1,
      };
    })(),
  }));
  check(layout.overflow <= 1, `${label}: no horizontal page scroll (${layout.overflow}px)`);
  check(layout.requiredNote, `${label}: "* Required" note shown`);
  check(layout.strays.length === 0, `${label}: no stray text (${layout.strays.join(', ')})`);
  check(layout.cookies === '', `${label}: no cookies were set (${JSON.stringify(layout.cookies)})`);
  check(layout.robots === 'noindex, nofollow', `${label}: meta robots is noindex`);
  check(layout.locationWrap.textOverflow === false, `${label}: the full address under the select does not clip`);

  const csp = await page.evaluate(() => window.__csp);
  check(csp.length === 0, `${label}: no CSP violations (${csp.join('; ')})`);
}

async function checkValidation(page, label) {
  await page.click('#checkin-submit');
  await page.waitForFunction(
    () => document.getElementById('checkin-name-error').textContent.length > 0,
    { timeout: 3000 },
  );

  const state = await page.evaluate(() => {
    const errors = [
      'checkin-user-type-error',
      'checkin-name-error',
      'checkin-direction-error',
      'checkin-time-error',
      'checkin-location-error',
      'checkin-notes-error',
    ];
    return {
      shown: errors.filter((id) => document.getElementById(id).textContent.trim().length > 0).length,
      focused: document.activeElement?.id,
      aria: document.getElementById('checkin-name').getAttribute('aria-invalid'),
      described: document.getElementById('checkin-name').getAttribute('aria-describedby'),
      posted: document.querySelector('input[name="locationId"]') !== null,
    };
  });
  check(state.shown === 6, `${label}: all six inline errors are shown (${state.shown}/6)`);
  check(state.focused === 'checkin-user-type', `${label}: focus moved to the first error (${state.focused})`);
  check(state.aria === 'true', `${label}: aria-invalid set on the name field`);
  check((state.described || '').includes('checkin-name-error'), `${label}: aria-describedby points at the error`);
}

async function checkNowButton(page, label) {
  await page.evaluate(() => {
    document.getElementById('checkin-hour').value = '';
    document.getElementById('checkin-minute').value = '';
    document.getElementById('checkin-period').value = '';
  });

  // Read the reference clock first, so the click and the expectation are as
  // close together as possible; a minute may still tick over in between.
  const before = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());

  await page.click('#checkin-now');
  const state = await page.evaluate(() => ({
    hour: document.getElementById('checkin-hour').value,
    minute: document.getElementById('checkin-minute').value,
    period: document.getElementById('checkin-period').value,
    choice: document.getElementById('checkin-time-choice').textContent,
  }));

  const [eh, em] = before.split(':');
  const chosen = (Number(state.hour) % 12) + (state.period === 'PM' ? 12 : 0);
  const wanted = Number(eh);
  const hourDrift = Math.min(Math.abs(chosen - wanted), 24 - Math.abs(chosen - wanted));
  const minuteDrift = Math.min(
    Math.abs(Number(state.minute) - Number(em)),
    60 - Math.abs(Number(state.minute) - Number(em)),
  );
  check(hourDrift <= 1 && minuteDrift <= 1,
    `${label}: Now filled ${state.hour}:${state.minute} ${state.period} (London ${before})`);
  check(state.choice === `Time: ${String(state.hour).padStart(2, '0')}:${state.minute} ${state.period}`,
    `${label}: chosen time shown underneath ("${state.choice}")`);
}

async function checkDropdown(page, label) {
  const state = await page.evaluate(() => {
    const select = document.getElementById('checkin-location');
    return {
      count: select.options.length,
      first: select.options[0].textContent,
      names: Array.from(select.options).slice(1).map((option) => option.textContent),
      disabled: select.disabled,
    };
  });
  check(state.count === 19 && state.first === '-- Select --',
    `${label}: dropdown holds ${state.count - 1} addresses behind "${state.first}"`);
  check(state.names.includes('33 Chandos Road, Harrow, HA1 4QX') &&
        state.names.includes('35 Chandos Road, Harrow, HA1 4QX'),
    `${label}: both Chandos Road addresses are listed`);
  check(state.disabled === false, `${label}: the location select is enabled`);
}

async function checkSubmission(page, label, baseUrl) {
  // Open the page the way the printed link does: ?location=<id>.
  const locationId = await page.evaluate(() =>
    document.getElementById('checkin-location').options[1].value);
  await page.goto(`${baseUrl}/?location=${locationId}`, { waitUntil: 'networkidle0' });
  const preselected = await page.evaluate(() => document.getElementById('checkin-location').value);
  check(preselected === locationId, `${label}: ?location=${locationId.slice(0, 8)}… preselects the address`);

  await page.select('#checkin-user-type', 'staff');
  await page.type('#checkin-name', 'Ada Lovelace');
  await page.select('#checkin-direction', 'in');
  await page.click('#checkin-now');
  await page.select('#checkin-location', locationId);
  await page.type('#checkin-notes', 'Start of shift');

  await page.click('#checkin-submit');
  await page.waitForSelector('#checkin-success:not(.d-none)', { timeout: 5000 });
  const success = await page.evaluate(() => document.getElementById('checkin-success').textContent.trim());
  check(/^Thank you, Ada Lovelace\. Your check in at \d{2}:\d{2} (AM|PM) has been recorded\.$/.test(success),
    `${label}: confirmation reads "${success}"`);

  const busy = await page.evaluate(() => document.getElementById('checkin-submit').textContent);
  check(busy !== 'Sending…', `${label}: the button label returned to Submit`);

  await page.waitForFunction(
    () => document.getElementById('checkin-name').value === '' &&
          document.getElementById('checkin-success').classList.contains('d-none'),
    { timeout: 8000 },
  );
  const reset = await page.evaluate(() => ({
    name: document.getElementById('checkin-name').value,
    type: document.getElementById('checkin-user-type').value,
    direction: document.getElementById('checkin-direction').value,
    notes: document.getElementById('checkin-notes').value,
    time: document.getElementById('checkin-hour').value,
    counter: document.getElementById('checkin-notes-count').textContent,
    locationKept: document.getElementById('checkin-location').value !== '',
  }));
  check(reset.name === '' && reset.type === '' && reset.direction === '' && reset.notes === '' &&
        reset.time === '' && reset.counter === '0 / 500',
    `${label}: the form reset itself for the next person`);
  check(reset.locationKept, `${label}: the ?location= preselection survived the reset`);
}

// ---- the run --------------------------------------------------------------

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
});

try {
  console.log(`\n== public page, 360x740, light ==`);
  let page = await open({ width: 360, height: 740 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.HrmTheme.apply('light', true));
  await checkPublicForm(page, '360 light');
  await checkDropdown(page, '360 light');
  await checkValidation(page, '360 light');
  await shot(page, 'checkin-360-light-validation.png');
  await checkNowButton(page, '360 light');
  await checkSubmission(page, '360 light', BASE);
  await shot(page, 'checkin-360-light.png');
  await page.close();

  console.log(`\n== public page, 360x740, dark ==`);
  page = await open({ width: 360, height: 740 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.HrmTheme.apply('dark', true));
  await checkPublicForm(page, '360 dark');
  await shot(page, 'checkin-360-dark.png');
  await checkValidation(page, '360 dark');
  await shot(page, 'checkin-360-dark-validation.png');
  await page.close();

  console.log(`\n== public page, 1440x900, light ==`);
  page = await open({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.HrmTheme.apply('light', true));
  await checkPublicForm(page, '1440 light');
  await checkDropdown(page, '1440 light');
  await shot(page, 'checkin-1440-light.png');
  await page.close();

  console.log(`\n== public page, 1440x900, dark ==`);
  page = await open({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.HrmTheme.apply('dark', true));
  await checkPublicForm(page, '1440 dark');
  await shot(page, 'checkin-1440-dark.png');
  await page.close();

  console.log(`\n== dashboard, signed in ==`);
  const password = readFileSync(new URL('../.verify/.scratch-password', import.meta.url), 'utf8').trim();
  page = await open({ width: 1440, height: 900 });
  await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle0' });
  await page.type('#login-email', 'verify-admin@example.com');
  await page.type('#login-password', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {}),
    page.click('#login-submit'),
  ]);
  check(page.url().includes('dashboard.html'), `signed in and landed on ${page.url()}`);
  await page.evaluate(() => window.HrmTheme.apply('light', true));

  const link = await page.evaluate(() => ({
    value: document.getElementById('public-link')?.value,
    open: document.getElementById('open-public-link')?.getAttribute('href'),
    warning: document.getElementById('no-locations-warning')?.hidden,
    text: document.body.textContent.includes('undefined') ? 'stray undefined' : '',
  }));
  check(link.value === `${BASE}/`, `dashboard link card shows ${link.value}`);
  check(link.open === `${BASE}/`, `the Open button points at ${link.open}`);
  check(link.warning === true, `the zero-locations warning stays hidden while 18 are active`);
  check(link.text === '', `dashboard has no stray text`);
  await shot(page, 'dashboard-1440-light.png');

  // With every location deactivated the warning must appear.
  const { MongoClient } = await import('mongodb');
  const mongo = await MongoClient.connect(process.env.VERIFY_MONGODB_URI);
  await mongo.db().collection('locations').updateMany({}, { $set: { active: false } });
  await mongo.close();

  await page.reload({ waitUntil: 'networkidle0' });
  const warned = await page.evaluate(() => ({
    hidden: document.getElementById('no-locations-warning').hidden,
    message: document.getElementById('no-locations-warning').textContent.replace(/\s+/g, ' ').trim(),
  }));
  check(warned.hidden === false, `the zero-locations warning appears when none is active`);
  check(/The public check-in form cannot be used/.test(warned.message),
    `warning reads "${warned.message.slice(0, 90)}…"`);
  await shot(page, 'dashboard-1440-light-no-locations.png');

  // And the public dropdown must be empty at the same time.
  const anon = await open({ width: 360, height: 740 });
  await anon.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const empty = await anon.evaluate(() => ({
    message: document.getElementById('checkin-location-message').textContent.trim(),
    disabled: document.getElementById('checkin-location').disabled,
  }));
  check(empty.message === 'No active locations are available. Please ask an administrator.',
    `empty state reads "${empty.message}"`);
  check(empty.disabled === true, `the location select is disabled when the list is empty`);
  await shot(anon, 'checkin-360-light-empty.png');
  await anon.close();
  await page.close();
} finally {
  await browser.close();
}

console.log('\n-- notes --');
for (const note of notes) console.log(`  ${note}`);
console.log(`\n${problems.length} problem(s)`);
for (const problem of problems) console.log(`  ! ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);
