import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.resolve(process.env.E2E_APP_ROOT || root);
const shotsDir = path.join(root, '.verify');
const mutation = process.env.E2E_MUTATION || '';
const baseline = process.env.E2E_BASELINE === '1';
const timezone = 'Europe/London';

const failures = [];
const milliseconds = (value) => new Promise((resolve) => setTimeout(resolve, value));

function check(condition, message, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  if (condition) {
    console.log(`  PASS ${message}${suffix}`);
  } else {
    console.log(`  FAIL ${message}${suffix}`);
    failures.push(message);
  }
}

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port.');
  await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

async function waitForServer(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // The server is still starting.
    }
    await milliseconds(250);
  }
  return false;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  await Promise.race([closed, milliseconds(5000)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'close'), milliseconds(2000)]);
  }
}

async function runChild(args, env, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  const [code, signal] = await once(child, 'close');
  if (code !== 0) throw new Error(`${path.basename(args[0])} exited with ${code ?? signal ?? 'unknown status'}.`);
}

function trackPage(page, label) {
  const events = [];
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push(`${request.method()} ${url.pathname}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') events.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => events.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    events.push(`requestfailed: ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
  });
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.pathname.startsWith('/api/')) requests.push(`${response.status()} ${responseUrl.pathname}`);
    if (response.status() < 400) return;
    const url = response.url();
    if (response.status() === 401 && url.includes('/api/auth/me')) return;
    events.push(`HTTP ${response.status()}: ${url}`);
  });
  return { label, events, requests };
}

async function faultRequests(page, mode, checkinScript) {
  if (!mode) return;
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    try {
      if (mode === 'hang-locations' && url.pathname === '/api/locations') {
        console.log(`  intentionally held request open: ${request.method()} ${url.pathname}`);
        return;
      }
      if (mode === 'submit-handler' && url.pathname === '/js/checkin.js') {
        const from = "form.addEventListener('submit', handleSubmit);";
        const to = "form.addEventListener('submit', missingSubmitHandler);";
        if (!checkinScript.includes(from)) throw new Error('Could not locate the submit binding for mutation.');
        await request.respond({
          status: 200,
          contentType: 'application/javascript',
          body: checkinScript.replace(from, to),
        });
        return;
      }
      if (mode === 'missing-script' && url.pathname === '/js/checkin.js') {
        await request.respond({ status: 404, contentType: 'text/plain', body: 'Not Found' });
        return;
      }
      if (mode === 'locations-500' && url.pathname === '/api/public/locations') {
        await request.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { code: 'test_failure', message: 'Injected 500' } }),
        });
        return;
      }
      await request.continue();
    } catch (error) {
      console.error(`Request mutation failed: ${error.message}`);
      if (!request.isInterceptResolutionHandled()) await request.abort('failed');
    }
  });
}

async function openPage(browser, width, height, mode = '') {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const telemetry = trackPage(page, `${width}x${height}`);
  const script = mode ? await readFile(path.join(appRoot, 'public', 'js', 'checkin.js'), 'utf8') : '';
  await faultRequests(page, mode, script);
  return { page, telemetry };
}

async function waitForDialog(page) {
  await page.waitForFunction(() => {
    const dialog = document.getElementById('checkin-dialog');
    return dialog && !dialog.classList.contains('d-none');
  }, { timeout: 8000 });
}

async function chooseLocation(page, selector = '#checkin-location', index = 1) {
  await page.waitForFunction((id) => {
    const select = document.querySelector(id);
    return select && select.options.length > 1 && !select.disabled;
  }, { timeout: 10000 }, selector);
  const value = await page.$eval(selector, (select, optionIndex) => select.options[optionIndex]?.value || '', index);
  if (!value) throw new Error(`No location option ${index} in ${selector}.`);
  await page.select(selector, value);
  return value;
}

async function fillCurrentEntry(page, { name, direction = 'in', locationIndex = 1, notes = 'Automated e2e entry' }) {
  await page.select('#checkin-user-type', 'staff');
  await page.type('#checkin-name', name);
  await page.select('#checkin-direction', direction);
  await page.click('#checkin-now');
  const time = await page.$eval('#checkin-time-choice', (element) => element.textContent.replace('Time: ', ''));
  const locationId = await chooseLocation(page, '#checkin-location', locationIndex);
  await page.type('#checkin-notes', notes);
  return { time, locationId };
}

function londonDate() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function screenshot(page, filename) {
  await page.screenshot({ path: path.join(shotsDir, filename), fullPage: true });
  console.log(`  screenshot: .verify/${filename}`);
}

async function clickLocationAction(page, name, action) {
  const index = await page.$$eval(
    '#locations-body tr',
    (rows, searchName) => rows.findIndex((row) => row.textContent.includes(searchName)),
    name,
  );
  if (index < 0) throw new Error(`Could not find a row for ${name}.`);
  await page.click(`#locations-body tr:nth-child(${index + 1}) [data-action="${action}"]`);
}

async function login(page, baseUrl) {
  await page.goto(`${baseUrl}/login.html`, { waitUntil: 'networkidle0' });
  if (new URL(page.url()).pathname !== '/login.html') return;
  await page.type('#login-email', 'e2e-admin@example.com');
  await page.type('#login-password', 'TestPass123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 12000 }).catch(() => undefined),
    page.click('#login-submit'),
  ]);
  await page.waitForFunction(() => location.pathname !== '/login.html', { timeout: 10000 });
}

async function runBaselineDiagnostic(browser, baseUrl) {
  console.log('\nPre-fix worktree diagnostic');
  const publicResult = await openPage(browser, 390, 844);
  const page = publicResult.page;
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
  const locationId = await chooseLocation(page);
  await page.select('#checkin-user-type', 'staff');
  await page.type('#checkin-name', 'Baseline Browser Test');
  await page.select('#checkin-direction', 'in');
  await page.select('#checkin-hour', '9');
  await page.select('#checkin-minute', '05');
  await page.select('#checkin-period', 'AM');
  await page.type('#checkin-notes', 'Pre-fix verification');
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/public/entries' && response.request().method() === 'POST',
    { timeout: 10000 },
  );
  await page.click('#checkin-submit');
  const entryResponse = await responsePromise;
  await milliseconds(300);
  const formResult = await page.evaluate(() => ({
    dialogExists: Boolean(document.getElementById('checkin-dialog')),
    inlineSuccess: Boolean(document.getElementById('checkin-success')
      && !document.getElementById('checkin-success').classList.contains('d-none')),
    message: document.getElementById('checkin-success')?.textContent || '',
  }));
  console.log(`Form submission: HTTP ${entryResponse.status()} from POST /api/public/entries`);
  console.log(`Form result: ${JSON.stringify(formResult)}`);
  console.log(`Browser errors: ${JSON.stringify(publicResult.telemetry.events)}`);
  console.log(`Conclusion: request ${entryResponse.ok() ? 'succeeded' : 'failed'}; the form ${entryResponse.ok() ? 'did not do nothing' : 'did not record an entry'}.`);
  check(entryResponse.status() === 201 && formResult.inlineSuccess, 'pre-fix form submit reaches the API and shows its legacy inline confirmation');
  check(formResult.dialogExists, 'pre-fix success popup is present');
  await page.close();

  const normalAdmin = await openPage(browser, 1440, 900);
  await login(normalAdmin.page, baseUrl);
  await normalAdmin.page.goto(`${baseUrl}/locations.html`, { waitUntil: 'networkidle0' });
  const normalLocationStatus = await normalAdmin.page.evaluate(() => ({
    text: document.getElementById('locations-body').textContent.trim().replace(/\s+/g, ' '),
    rows: document.querySelectorAll('#locations-body tr').length,
  }));
  console.log(`Normal Locations response: rows=${normalLocationStatus.rows}, text="${normalLocationStatus.text}"`);
  console.log(`Normal Locations API trace: ${JSON.stringify(normalAdmin.telemetry.requests)}`);
  check(
    normalAdmin.telemetry.requests.includes('200 /api/locations') && normalLocationStatus.rows === 18,
    'pre-fix successful Locations response renders all 18 rows',
    `rows=${normalLocationStatus.rows}; ${normalLocationStatus.text}`,
  );
  await normalAdmin.page.close();

  const adminResult = await openPage(browser, 1440, 900);
  const adminPage = adminResult.page;
  await login(adminPage, baseUrl);
  await faultRequests(adminPage, 'hang-locations', '');
  await adminPage.goto(`${baseUrl}/locations.html`, { waitUntil: 'domcontentloaded' });
  await milliseconds(2000);
  const status = await adminPage.$eval('#locations-body', (body) => ({
    text: body.textContent.trim().replace(/\s+/g, ' '),
    rows: body.querySelectorAll('tr').length,
  }));
  console.log('GET /api/locations: deliberately left pending; response not received.');
  console.log(`Locations UI after 2 seconds: ${JSON.stringify(status)}`);
  console.log(`Browser errors: ${JSON.stringify(adminResult.telemetry.events)}`);
  console.log(`API trace: ${JSON.stringify(adminResult.telemetry.requests)}`);
  check(!status.text.includes('Loading'), 'pre-fix hung Locations request exits loading state', status.text);
  console.log('Conclusion: a never-resolving API request leaves the pre-fix spinner indefinitely because the old loader has no timeout/abort.');
  await adminPage.close();
}

async function runMutation(browser, baseUrl) {
  console.log(`\nMutation test: ${mutation}`);
  const { page, telemetry } = await openPage(browser, 390, 844, mutation);
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await milliseconds(700);

  if (mutation === 'submit-handler' || mutation === 'missing-script') {
    const buttonDisabled = await page.$eval('#checkin-submit', (button) => button.disabled);
    if (!buttonDisabled) {
      await page.click('#checkin-submit');
      await milliseconds(300);
    }
    const state = await page.evaluate(() => ({
      errors: [
        'checkin-user-type-error',
        'checkin-name-error',
        'checkin-direction-error',
        'checkin-time-error',
        'checkin-location-error',
        'checkin-notes-error',
      ].filter((id) => document.getElementById(id)?.textContent.trim()).length,
      locationState: document.getElementById('checkin-location-message')?.textContent.trim() || '',
    }));
    const caught = state.errors !== 6 || telemetry.events.length > 0;
    console.log(`Expected E2E assertion (six visible validation errors): ${state.errors}/6`);
    console.log(`Browser/network evidence: ${JSON.stringify(telemetry.events)}`);
    console.log(caught ? 'test:e2e: FAIL — mutation was detected.' : 'test:e2e: UNEXPECTED PASS — mutation escaped detection.');
    check(false, 'the normal e2e suite rejects a broken submit script', state.locationState);
    if (!caught) failures.push('Mutation was not detected.');
  } else if (mutation === 'locations-500') {
    await page.waitForFunction(
      () => document.getElementById('checkin-location-message')?.textContent.includes('Could not load locations'),
      { timeout: 5000 },
    ).catch(() => undefined);
    const state = await page.evaluate(() => ({
      disabled: document.getElementById('checkin-location').disabled,
      message: document.getElementById('checkin-location-message')?.textContent.trim() || '',
    }));
    console.log(`GET /api/public/locations: ${JSON.stringify(telemetry.events)}`);
    console.log(`Public form: ${JSON.stringify(state)}`);
    console.log('test:e2e: FAIL — injected HTTP 500 is observed and prevents the locations-ready assertion.');
    check(false, 'the normal e2e suite rejects a 500 locations feed', state.message);
  } else {
    throw new Error(`Unknown E2E_MUTATION value: ${mutation}`);
  }
  await page.close();
}

async function runCurrentSuite(browser, baseUrl, server, mongoUri) {
  console.log('\nPublic form');
  const publicResult = await openPage(browser, 390, 844);
  const page = publicResult.page;
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const select = document.getElementById('checkin-location');
    return select && !select.disabled && select.options.length === 19;
  }, { timeout: 10000 });

  const fieldErrorIds = [
    'checkin-user-type-error',
    'checkin-name-error',
    'checkin-direction-error',
    'checkin-time-error',
    'checkin-location-error',
    'checkin-notes-error',
  ];
  await screenshot(page, 'form-empty.png');
  await page.click('#checkin-submit');
  await page.waitForFunction(
    (ids) => ids.every((id) => document.getElementById(id)?.textContent.trim()),
    { timeout: 5000 },
    fieldErrorIds,
  );
  const validation = await page.evaluate((ids) => ({
    messages: ids.map((id) => document.getElementById(id).textContent.trim()),
    focus: document.activeElement?.id || '',
  }), fieldErrorIds);
  check(validation.messages.length === 6 && validation.messages.every(Boolean), 'empty submit shows all six field errors');
  check(validation.focus === 'checkin-user-type', 'empty submit focuses the first invalid field', validation.focus);
  await screenshot(page, 'form-six-errors.png');

  console.log('\nFuture-time validation');
  await page.select('#checkin-user-type', 'staff');
  await page.type('#checkin-name', 'Future Time Test');
  await page.select('#checkin-direction', 'in');
  const nowParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const nowValues = Object.fromEntries(nowParts.map(({ type, value }) => [type, value]));
  const nowTotal = Number(nowValues.hour) * 60 + Number(nowValues.minute);
  const futureTotal = nowTotal + 15;
  if (futureTotal > 23 * 60 + 59) {
    throw new Error('Cannot produce a same-day future time in the final 15 minutes before midnight.');
  }
  const futureHour24 = Math.floor(futureTotal / 60);
  const futureHour = String(futureHour24 % 12 || 12);
  const futureMinute = String(futureTotal % 60).padStart(2, '0');
  await page.select('#checkin-hour', futureHour);
  await page.select('#checkin-minute', futureMinute);
  await page.select('#checkin-period', futureHour24 < 12 ? 'AM' : 'PM');
  await chooseLocation(page);
  await page.type('#checkin-notes', 'Keep these values after error');
  await page.click('#checkin-submit');
  await waitForDialog(page);
  const futureText = await page.$eval('#checkin-dialog', (dialog) => dialog.textContent.trim());
  const futureValuesRetained = await page.$eval('#checkin-name', (input) => input.value === 'Future Time Test');
  check(futureText.includes('later than now'), 'future time shows the error popup', futureText);
  check(futureValuesRetained, 'future-time error keeps the submitted values');
  await screenshot(page, 'future-time-error-popup.png');
  await page.click('#checkin-dialog-button');
  await page.waitForFunction(() => document.getElementById('checkin-dialog').classList.contains('d-none'));

  console.log('\nValid submission and database assertion');
  await page.evaluate(() => {
    document.getElementById('checkin-user-type').value = '';
    document.getElementById('checkin-name').value = '';
    document.getElementById('checkin-direction').value = '';
    document.getElementById('checkin-hour').value = '';
    document.getElementById('checkin-minute').value = '';
    document.getElementById('checkin-period').value = '';
    document.getElementById('checkin-location').value = '';
    document.getElementById('checkin-notes').value = '';
  });
  await page.select('#checkin-user-type', 'staff');
  await page.type('#checkin-name', 'E2E Ada Lovelace');
  await page.select('#checkin-direction', 'in');
  await page.click('#checkin-now');
  const chosen = await page.$eval('#checkin-time-choice', (element) => element.textContent.replace('Time: ', ''));
  const selectedLocationId = await chooseLocation(page);
  const selectedLocationName = await page.$eval(
    '#checkin-location',
    (select) => select.options[select.selectedIndex].textContent.trim(),
  );
  await page.type('#checkin-notes', 'E2E database verification');
  await screenshot(page, 'form-filled.png');
  const entryResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/public/entries' && response.request().method() === 'POST',
    { timeout: 10000 },
  );
  await page.click('#checkin-submit');
  const entryResponse = await entryResponsePromise;
  const responsePayload = await entryResponse.json();
  await waitForDialog(page);
  const successText = await page.$eval('#checkin-dialog', (dialog) => dialog.textContent.trim().replace(/\s+/g, ' '));
  const responseEntry = responsePayload?.data?.entry;
  check(entryResponse.status() === 201, 'valid entry receives HTTP 201', String(entryResponse.status()));
  check(successText.includes('E2E Ada Lovelace'), 'success popup displays the name');
  check(successText.includes('Staff Member'), 'success popup displays the user type');
  check(successText.includes(chosen), 'success popup displays the chosen time', chosen);
  check(successText.includes(selectedLocationName), 'success popup displays the selected location');
  check(Boolean(responseEntry?.date), 'success response includes the server-decided date', String(responseEntry?.date));
  const [entryYear, entryMonth, entryDay] = responseEntry.date.split('-').map(Number);
  const displayDate = new Date(entryYear, entryMonth - 1, entryDay)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(',', '');
  check(successText.includes(displayDate), 'success popup displays the date', displayDate);
  await screenshot(page, 'success-popup.png');

  const retainedBeforeClose = await page.$eval('#checkin-name', (input) => input.value);
  await milliseconds(300);
  const retainedAfterDelay = await page.$eval('#checkin-name', (input) => input.value);
  check(
    retainedBeforeClose === 'E2E Ada Lovelace' && retainedAfterDelay === 'E2E Ada Lovelace',
    'success form remains populated until the popup closes',
  );

  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(mongoUri);
  const { EntryModel } = await import('../src/models/Entry.ts');
  const savedEntry = await EntryModel.findOne({ name: 'E2E Ada Lovelace' }).lean();
  const expectedTime = chosen.replace(/ (AM|PM)$/, '').split(':').map(Number);
  const expectedHour = String((expectedTime[0] % 12) + (chosen.endsWith('PM') ? 12 : 0)).padStart(2, '0');
  const expectedEnteredTime = `${expectedHour}:${String(expectedTime[1]).padStart(2, '0')}`;
  check(Boolean(savedEntry), 'valid entry exists in MongoDB');
  if (savedEntry) {
    check(savedEntry.date === londonDate(), 'saved entry has the APP_TIMEZONE date', `${savedEntry.date} vs ${londonDate()}`);
    check(savedEntry.enteredTime === expectedEnteredTime, 'saved entry has the selected clock time', savedEntry.enteredTime);
    check(savedEntry.direction === 'in', 'saved entry has the selected direction', savedEntry.direction);
    check(String(savedEntry.locationId) === selectedLocationId, 'saved entry has the selected location id');
    check(savedEntry.userType === 'staff', 'saved entry has the selected user type');
  }
  await mongoose.disconnect();

  await page.click('#checkin-dialog-button');
  await page.waitForFunction(() => document.getElementById('checkin-dialog').classList.contains('d-none'));
  const clearedAfterClose = await page.$eval('#checkin-name', (input) => input.value === '');
  check(clearedAfterClose, 'success form resets after the popup closes');

  console.log('\nDuplicate detection');
  const duplicateInput = await fillCurrentEntry(page, {
    name: 'E2E Duplicate Person',
    direction: 'out',
    notes: 'Duplicate test',
  });
  await page.click('#checkin-submit');
  await waitForDialog(page);
  await page.click('#checkin-dialog-button');
  await page.waitForFunction(() => document.getElementById('checkin-dialog').classList.contains('d-none'));
  await page.select('#checkin-user-type', 'staff');
  await page.type('#checkin-name', 'E2E Duplicate Person');
  await page.select('#checkin-direction', 'out');
  await page.click('#checkin-now');
  await page.select('#checkin-location', duplicateInput.locationId);
  await page.type('#checkin-notes', 'Duplicate test');
  await page.click('#checkin-submit');
  await waitForDialog(page);
  const duplicateText = await page.$eval('#checkin-dialog', (dialog) => dialog.textContent.trim());
  check(duplicateText.toLowerCase().includes('already recorded'), 'duplicate submission shows duplicate message', duplicateText);
  await screenshot(page, 'duplicate-message.png');
  await page.click('#checkin-dialog-button');
  await page.waitForFunction(() => document.getElementById('checkin-dialog').classList.contains('d-none'));
  await page.close();

  console.log('\nAdmin login and Locations');
  const adminResult = await openPage(browser, 1440, 900);
  const adminPage = adminResult.page;
  await login(adminPage, baseUrl);
  console.log(`  login landed at ${adminPage.url()}`);
  await adminPage.goto(`${baseUrl}/locations.html`, { waitUntil: 'networkidle0' });
  const locationsReady = await adminPage.waitForFunction(() => {
    const rows = document.querySelectorAll('#locations-body tr');
    return rows.length >= 18 && !document.getElementById('locations-body').textContent.includes('Loading');
  }, { timeout: 10000 }).then(() => true).catch(() => false);
  if (!locationsReady) {
    const state = await adminPage.evaluate(() => ({
      url: location.href,
      body: document.body.innerText.slice(0, 500),
      locations: document.getElementById('locations-body')?.innerText || '',
    }));
    console.log(`  Locations diagnostic: ${JSON.stringify(state)}`);
    console.log(`  Browser/network evidence: ${JSON.stringify(adminResult.telemetry.events)}`);
    console.log(`  API requests: ${JSON.stringify(adminResult.telemetry.requests)}`);
    console.log(`  Session cookie names: ${JSON.stringify((await adminPage.cookies()).map(({ name }) => name))}`);
    throw new Error('Authenticated Locations page did not render the seeded rows.');
  }

  const initialLocations = await adminPage.$$eval('#locations-body tr', (rows) => rows.map((row) => row.textContent.trim()));
  check(initialLocations.length === 18, 'Locations page shows all 18 seeded rows', String(initialLocations.length));
  const locationCellCount = await adminPage.$eval('#locations-body tr', (row) => row.cells.length);
  check(locationCellCount === 5, 'Locations rows render into the five table columns', String(locationCellCount));
  check(!initialLocations.some((text) => text.includes('Loading')), 'Locations spinner ends');
  await screenshot(adminPage, 'locations-page-18-rows.png');

  const hangingPage = await openPage(browser, 1440, 900);
  await login(hangingPage.page, baseUrl);
  await faultRequests(hangingPage.page, 'hang-locations', '');
  await hangingPage.page.goto(`${baseUrl}/locations.html`, { waitUntil: 'domcontentloaded' });
  await hangingPage.page.waitForFunction(
    () => document.getElementById('locations-body')?.textContent.includes('The locations could not be loaded.'),
    { timeout: 20000 },
  );
  const timedOutLocations = await hangingPage.page.$eval('#locations-body', (body) => body.textContent.trim().replace(/\s+/g, ' '));
  check(!timedOutLocations.includes('Loading') && timedOutLocations.includes('try again'), 'hung Locations API stops spinning and shows retry after timeout', timedOutLocations);
  console.log(`  Hanging API browser trace: ${JSON.stringify(hangingPage.telemetry.events)}`);
  await hangingPage.page.close();

  await adminPage.click('#sort-az');
  const sortedNames = await adminPage.$$eval('#locations-body tr', (rows) =>
    rows.map((row) => row.querySelector('strong')?.textContent.trim() || row.cells[0]?.textContent.trim() || ''),
  );
  const sortedAscending = await adminPage.evaluate(() => {
    const names = [...document.querySelectorAll('#locations-body tr td:first-child')]
      .map((cell) => cell.textContent.trim());
    return names.every((name, index) => !index || names[index - 1].localeCompare(name) <= 0);
  });
  check(sortedNames.length === 18 && sortedAscending, 'Sort A-Z sorts names ascending', sortedNames.join(' | '));

  await adminPage.type('#location-search', 'HA1');
  const postcodeMatches = await adminPage.$$eval('#locations-body tr', (rows) => rows.map((row) => row.querySelector('.location-postcode')?.textContent.trim() || ''));
  check(postcodeMatches.length > 0 && postcodeMatches.every((postcode) => postcode.includes('HA1')), 'search HA1 filters the table by postcode');
  await adminPage.$eval('#location-search', (input) => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await adminPage.waitForFunction(() => document.querySelectorAll('#locations-body tr').length === 18, { timeout: 5000 });

  await adminPage.click('#add-location');
  await adminPage.waitForFunction(() => document.getElementById('location-modal').classList.contains('show'));
  await milliseconds(400);
  await adminPage.type('#location-name', 'E2E Temporary Site');
  await adminPage.type('#location-postcode', 'HA1 2ZZ');
  await adminPage.click('#location-save');
  await adminPage.waitForFunction(() => document.querySelector('#locations-body').textContent.includes('E2E Temporary Site'), { timeout: 10000 });
  await adminPage.waitForFunction(() => !document.getElementById('location-modal').classList.contains('show'), { timeout: 5000 });
  check(true, 'saving a new location closes the editor dialog');
  check(true, 'administrator can add a location');
  await milliseconds(400);

  await clickLocationAction(adminPage, 'E2E Temporary Site', 'edit');
  await adminPage.waitForFunction(() => document.getElementById('location-modal').classList.contains('show'));
  await milliseconds(400);
  await adminPage.locator('#location-name').fill('E2E Edited Site');
  await adminPage.click('#location-save');
  const editSaved = await adminPage.waitForFunction(
    () => document.querySelector('#locations-body').textContent.includes('E2E Edited Site'),
    { timeout: 10000 },
  ).then(() => true).catch(() => false);
  if (!editSaved) {
    const state = await adminPage.evaluate(() => ({
      modalTitle: document.getElementById('location-modal-title')?.textContent,
      modalName: document.getElementById('location-name')?.value,
      rows: [...document.querySelectorAll('#locations-body tr')].map((row) => row.textContent.trim()),
      alerts: [...document.querySelectorAll('.toast, .invalid-feedback')].map((item) => item.textContent.trim()),
    }));
    console.log(`  Edit diagnostic: ${JSON.stringify(state)}`);
    console.log(`  Browser/network evidence: ${JSON.stringify(adminResult.telemetry.events)}`);
    console.log(`  API requests: ${JSON.stringify(adminResult.telemetry.requests)}`);
    throw new Error('Editing a location did not update the table.');
  }
  await adminPage.waitForFunction(() => !document.getElementById('location-modal').classList.contains('show'), { timeout: 5000 });
  check(true, 'administrator can edit a location');
  await milliseconds(400);

  await clickLocationAction(adminPage, 'E2E Edited Site', 'edit');
  await adminPage.waitForFunction(() => document.getElementById('location-modal').classList.contains('show'));
  await milliseconds(400);
  await adminPage.click('#location-active');
  await adminPage.click('#location-save');
  await adminPage.waitForFunction(() => {
    const row = [...document.querySelectorAll('#locations-body tr')]
      .find((item) => item.textContent.includes('E2E Edited Site'));
    return row && row.textContent.includes('Inactive');
  }, { timeout: 10000 });
  await adminPage.waitForFunction(() => !document.getElementById('location-modal').classList.contains('show'), { timeout: 5000 });
  check(true, 'administrator can deactivate a location');

  const publicAfterDeactivate = await openPage(browser, 390, 844);
  await publicAfterDeactivate.page.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
  const deactivatedIsAbsent = await publicAfterDeactivate.page.$eval(
    '#checkin-location',
    (select) => ![...select.options].some((option) => option.textContent.includes('E2E Edited Site')),
  );
  check(deactivatedIsAbsent, 'deactivated location is absent from the public dropdown');
  await publicAfterDeactivate.page.close();

  console.log('\nEntries admin workflows');
  await adminPage.goto(`${baseUrl}/entries.html`, { waitUntil: 'networkidle0' });
  const entriesReady = await adminPage.waitForFunction(
    () => document.querySelectorAll('#entries-body tr[data-entry-id]').length >= 1,
    { timeout: 10000 },
  ).then(() => true).catch(() => false);
  if (!entriesReady) {
    const state = await adminPage.evaluate(() => ({
      url: location.href,
      body: document.body.innerText.slice(0, 900),
      rows: document.getElementById('entries-body')?.innerText || '',
    }));
    console.log(`  Entries diagnostic: ${JSON.stringify(state)}`);
    console.log(`  Browser/network evidence: ${JSON.stringify(adminResult.telemetry.events)}`);
    console.log(`  API requests: ${JSON.stringify(adminResult.telemetry.requests)}`);
    throw new Error('Authenticated Entries page did not render its records.');
  }
  const entriesLoaded = await adminPage.$$eval('#entries-body tr[data-entry-id]', (rows) =>
    rows.map((row) => row.textContent.trim()),
  );
  check(entriesLoaded.length >= 2, 'Entries page shows the submitted records', String(entriesLoaded.length));

  await adminPage.locator('#entry-search').fill('E2E Ada Lovelace');
  await adminPage.click('#apply-entry-filters');
  await adminPage.waitForFunction(
    () => document.querySelectorAll('#entries-body tr[data-entry-id]').length === 1,
    { timeout: 10000 },
  );
  const filteredEntryName = await adminPage.$eval(
    '#entries-body tr[data-entry-id] td[data-label="Name"]',
    (cell) => cell.textContent.trim(),
  );
  check(filteredEntryName.includes('E2E Ada Lovelace'), 'Entries name filter returns the matching record');
  await screenshot(adminPage, 'entries-filtered.png');

  await adminPage.click('#export-entries');
  await adminPage.waitForFunction(
    () => [...document.querySelectorAll('.toast-message')].some((item) => item.textContent.includes('Entries exported')),
    { timeout: 5000 },
  );
  const csvResult = await adminPage.evaluate(async () => {
    const response = await fetch('/api/entries/export.csv?search=E2E+Ada+Lovelace', {
      headers: { Accept: 'text/csv' },
    });
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      text: await response.text(),
    };
  });
  check(
    csvResult.status === 200 && csvResult.text.includes('E2E Ada Lovelace'),
    'CSV export downloads the matching filtered entries',
    `HTTP ${csvResult.status}; ${csvResult.contentType}; matching row=${csvResult.text.includes('E2E Ada Lovelace')}`,
  );

  await adminPage.click('#entries-body tr[data-entry-id] [data-action="edit"]');
  await adminPage.waitForFunction(() => document.getElementById('entry-modal').classList.contains('show'));
  await milliseconds(400);
  await adminPage.locator('#edit-entry-name').fill('E2E Ada Lovelace Corrected');
  await adminPage.click('#save-entry');
  await adminPage.waitForFunction(
    () => document.querySelector('#entries-body').textContent.includes('E2E Ada Lovelace Corrected'),
    { timeout: 10000 },
  );
  await adminPage.waitForFunction(
    () => !document.getElementById('entry-modal').classList.contains('show'),
    { timeout: 5000 },
  );
  await milliseconds(400);
  check(true, 'administrator can edit a submitted entry');

  await adminPage.click('#entries-body tr[data-entry-id] [data-action="delete"]');
  const confirmShown = await adminPage.waitForFunction(
    () => document.getElementById('hrm-confirm-modal')?.classList.contains('show'),
    { timeout: 5000 },
  ).then(() => true).catch(() => false);
  if (!confirmShown) {
    const state = await adminPage.evaluate(() => ({
      rows: document.getElementById('entries-body')?.innerHTML,
      modal: document.getElementById('hrm-confirm-modal')?.outerHTML,
      events: document.getElementById('entries-body')?.textContent,
    }));
    console.log(`  Delete confirm diagnostic: ${JSON.stringify(state).slice(0, 1200)}`);
    console.log(`  Browser/network evidence: ${JSON.stringify(adminResult.telemetry.events)}`);
    throw new Error('Deleting an entry did not open the confirmation dialog.');
  }
  await adminPage.click('#hrm-confirm-ok');
  const entryDeleted = await adminPage.waitForFunction(
    () => !document.querySelector('#entries-body').textContent.includes('E2E Ada Lovelace Corrected'),
    { timeout: 10000 },
  ).then(() => true).catch(() => false);
  if (!entryDeleted) {
    const state = await adminPage.evaluate(() => ({
      rows: document.getElementById('entries-body')?.textContent,
      confirm: document.getElementById('hrm-confirm-modal')?.textContent,
      toasts: [...document.querySelectorAll('.toast-message')].map((item) => item.textContent),
    }));
    console.log(`  Delete diagnostic: ${JSON.stringify(state)}`);
    console.log(`  API requests: ${JSON.stringify(adminResult.telemetry.requests)}`);
    throw new Error('Deleting the entry did not remove it from the filtered list.');
  }
  check(entryDeleted, 'administrator can soft-delete an entry from the list');

  await adminPage.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'networkidle0' });
  await adminPage.waitForFunction(() => {
    const content = document.getElementById('dashboard-content');
    return content && !content.hidden && document.getElementById('metric-entries-today').textContent !== '—';
  }, { timeout: 10000 });
  const dashboardState = await adminPage.evaluate(() => ({
    entriesToday: document.getElementById('metric-entries-today').textContent,
    checkIns: document.getElementById('metric-checkins-today').textContent,
    checkOuts: document.getElementById('metric-checkouts-today').textContent,
    activeLocations: document.getElementById('metric-active-locations').textContent,
    recentRows: document.querySelectorAll('#dashboard-recent-entries tr').length,
    recentCells: document.querySelector('#dashboard-recent-entries tr')?.cells.length || 0,
    trendChart: Boolean(document.getElementById('entries-trend-chart').getContext('2d')),
    userTypeChart: Boolean(document.getElementById('entries-user-type-chart').getContext('2d')),
  }));
  check(Number(dashboardState.entriesToday) > 0, 'dashboard shows today’s entry metrics', JSON.stringify(dashboardState));
  check(Number(dashboardState.activeLocations) === 18, 'dashboard shows the active location metric');
  check(dashboardState.recentCells === 5, 'dashboard recent entries render in five columns');
  check(dashboardState.trendChart && dashboardState.userTypeChart, 'dashboard renders both charts');
  await screenshot(adminPage, 'dashboard-metrics-and-charts.png');

  console.log('\nAdmin pages: console and network checks');
  const adminPaths = [
    '/dashboard.html',
    '/entries.html',
    '/locations.html',
    '/admins.html',
    '/admin-form.html',
    '/my-account.html',
  ];
  const adminPageEvents = [];
  for (const route of adminPaths) {
    const result = await openPage(browser, 1440, 900);
    await result.page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle0' });
    await milliseconds(250);
    const landedPath = new URL(result.page.url()).pathname;
    check(landedPath === route, `${route} loads while authenticated`, landedPath);
    if (result.telemetry.events.length) {
      adminPageEvents.push(`${route}: ${result.telemetry.events.join(' | ')}`);
    }
    await result.page.close();
  }
  check(adminPageEvents.length === 0, 'all admin pages have zero console errors and failed requests', adminPageEvents.join(' || '));

  console.log('\nAPI unavailable');
  const offlineResult = await openPage(browser, 390, 844);
  const offlinePage = offlineResult.page;
  await offlinePage.goto(`${baseUrl}/`, { waitUntil: 'networkidle0' });
  await fillCurrentEntry(offlinePage, { name: 'E2E Offline Test', notes: 'Server shutdown test' });
  await stopChild(server);
  await offlinePage.click('#checkin-submit');
  await waitForDialog(offlinePage);
  const offlineMessage = await offlinePage.$eval('#checkin-dialog', (dialog) => dialog.textContent.trim());
  check(offlineMessage.toLowerCase().includes('could not reach the server'), 'stopped API shows the could-not-reach-server popup', offlineMessage);
  check(await offlinePage.$eval('#checkin-name', (input) => input.value === 'E2E Offline Test'), 'network error keeps the entered values');
  await offlinePage.close();
}

async function main() {
  await mkdir(shotsDir, { recursive: true });
  console.log(`Application worktree: ${appRoot}`);
  console.log('MongoDB for e2e: mongodb-memory-server (ephemeral; no local mongod or configured database is used).');

  const memoryServer = await MongoMemoryServer.create();
  const databaseName = `care-attendance-e2e-${Date.now()}`;
  const mongoUri = memoryServer.getUri(databaseName);
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    MONGODB_URI: mongoUri,
    SESSION_SECRET: `e2e-only-${Date.now()}-not-a-production-secret`,
    SESSION_COOKIE_NAME: 'care.e2e.sid',
    TRUST_PROXY: '1',
    APP_URL: baseUrl,
    APP_BASE_URL: baseUrl,
    APP_TIMEZONE: timezone,
    MAIL_PROVIDER: 'none',
    SEED_ADMIN_EMAIL: 'e2e-admin@example.com',
    SEED_ADMIN_PASSWORD: 'TestPass123!',
  };
  let server;
  let browser;

  try {
    console.log(`Starting test app on ${baseUrl}`);
    server = spawn(process.execPath, ['server.ts'], { cwd: appRoot, env, stdio: 'pipe' });
    server.stdout.on('data', (data) => process.stdout.write(`[srv] ${data}`));
    server.stderr.on('data', (data) => process.stderr.write(`[srv-err] ${data}`));
    if (!(await waitForServer(`${baseUrl}/api/health`, server))) {
      throw new Error('Test server did not become ready.');
    }

    await runChild(['seed/seed.ts'], env, appRoot);
    await runChild(['seed/seed-locations.ts'], env, appRoot);

    const chrome = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,1000'],
    });

    if (baseline) {
      await runBaselineDiagnostic(browser, baseUrl);
    } else if (mutation) {
      await runMutation(browser, baseUrl);
    } else {
      await runCurrentSuite(browser, baseUrl, server, mongoUri);
    }
  } finally {
    if (browser) await browser.close();
    await stopChild(server);
    await memoryServer.stop();
  }

  if (failures.length) {
    console.error('\nE2E failures:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(baseline ? '\nPre-fix diagnostic complete.' : mutation ? '\nMutation detection complete.' : '\nAll e2e checks passed.');
}

main().catch((error) => {
  console.error('E2E run failed:', error);
  process.exitCode = 1;
});
