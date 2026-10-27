import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, '.verify');

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(port, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {}
    await wait(500);
  }
  return false;
}

async function main() {
  await mkdir(shotsDir, { recursive: true });

  const dir = await mkdtemp(path.join(tmpdir(), 'care-e2e-'));
  const dbName = 'care-attendance-e2e-' + Date.now();
  const mongoUri = `mongodb://127.0.0.1:27017/${dbName}`;
  const port = 3215;

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    MONGODB_URI: mongoUri,
    SESSION_SECRET: 'test-session-secret-e2e-' + Date.now(),
    SESSION_COOKIE_NAME: 'care.e2e.sid',
    TRUST_PROXY: '1',
    APP_URL: `http://127.0.0.1:${port}`,
    APP_BASE_URL: `http://127.0.0.1:${port}`,
    APP_TIMEZONE: 'Europe/London',
    MAIL_PROVIDER: 'none',
    SEED_ADMIN_EMAIL: 'e2e-admin@example.com',
    SEED_ADMIN_PASSWORD: 'TestPass123!',
  };

  console.log('Starting test server...');
  const server = spawn(process.execPath, ['server.ts'], { cwd: root, env, stdio: 'pipe' });
  server.stdout.on('data', d => process.stdout.write('[srv] ' + d));
  server.stderr.on('data', d => process.stderr.write('[srv-err] ' + d));

  const up = await waitForServer(port);
  if (!up) {
    console.error('Server failed to start');
    server.kill();
    process.exit(1);
  }
  console.log('Server up');

  // seed admin
  const seedAdmin = spawn(process.execPath, ['seed/seed.ts'], { cwd: root, env, stdio: 'inherit' });
  await new Promise(r => seedAdmin.on('close', r));
  // seed locations
  const seedLoc = spawn(process.execPath, ['seed/seed-locations.ts'], { cwd: root, env, stdio: 'inherit' });
  await new Promise(r => seedLoc.on('close', r));

  // connect puppeteer
  const chrome = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
    });
  } catch (e) {
    console.error('Failed to launch chrome:', e.message);
    server.kill();
    process.exit(1);
  }

  const problems = [];
  const logs = [];

  async function openPage(w, h) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    page.on('console', msg => {
      if (msg.type() === 'error') logs.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', err => logs.push(`pageerror: ${err.message}`));
    page.on('response', res => {
      if (res.status() >= 400) {
        const url = res.url();
        if (res.status() === 401 && url.includes('/api/auth/me')) return;
        logs.push(`HTTP ${res.status()}: ${url}`);
      }
    });
    return page;
  }

  try {
    // (b) empty submit shows six field errors
    console.log('Test: public form empty validation');
    let page = await openPage(360, 740);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
    await page.click('#checkin-submit');
    await page.waitForFunction(() => document.getElementById('checkin-name-error')?.textContent?.length > 0, { timeout: 3000 });
    const errs = await page.evaluate(() => {
      const ids = ['checkin-user-type-error','checkin-name-error','checkin-direction-error','checkin-time-error','checkin-location-error','checkin-notes-error'];
      return ids.map(id => document.getElementById(id)?.textContent?.trim() || '');
    });
    if (errs.filter(e => e.length > 0).length !== 6) problems.push('Empty submit did not show 6 field errors');
    else console.log('  ok: 6 errors shown');
    await page.screenshot({ path: path.join(shotsDir, 'public form empty.png') });
    await page.screenshot({ path: path.join(shotsDir, 'with validation errors.png') });
    await page.close();

    // (c) time later than now shows error popup
    console.log('Test: time in future');
    page = await openPage(360, 740);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      document.getElementById('checkin-user-type').value = 'staff';
      document.getElementById('checkin-name').value = 'Test User';
      document.getElementById('checkin-direction').value = 'in';
      document.getElementById('checkin-hour').value = '11';
      document.getElementById('checkin-minute').value = '59';
      document.getElementById('checkin-period').value = 'PM';
      document.getElementById('checkin-notes').value = 'test';
      // pick first location
      const loc = document.getElementById('checkin-location');
      if (loc.options.length > 1) loc.value = loc.options[1].value;
    });
    await page.click('#checkin-submit');
    await page.waitForTimeout(1000);
    const futureErr = await page.evaluate(() => {
      const dialog = document.getElementById('checkin-dialog');
      return dialog && !dialog.classList.contains('d-none') ? dialog.textContent : '';
    });
    if (!futureErr.toLowerCase().includes('later than now')) problems.push('Time in future did not show expected error');
    else console.log('  ok: time in future error shown');
    await page.screenshot({ path: path.join(shotsDir, 'error popup.png') });
    await page.close();

    // (a) filled form shows success popup and entry exists in DB
    console.log('Test: successful submission');
    page = await openPage(360, 740);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      document.getElementById('checkin-user-type').value = 'staff';
      document.getElementById('checkin-name').value = 'Ada Lovelace';
      document.getElementById('checkin-direction').value = 'in';
      document.getElementById('checkin-hour').value = '9';
      document.getElementById('checkin-minute').value = '00';
      document.getElementById('checkin-period').value = 'AM';
      document.getElementById('checkin-notes').value = 'Start of shift';
      const loc = document.getElementById('checkin-location');
      if (loc.options.length > 1) loc.value = loc.options[1].value;
    });
    await page.screenshot({ path: path.join(shotsDir, 'filled.png') });
    await page.click('#checkin-submit');
    await page.waitForFunction(() => {
      const d = document.getElementById('checkin-dialog');
      return d && !d.classList.contains('d-none');
    }, { timeout: 5000 });
    const successDialog = await page.evaluate(() => {
      const d = document.getElementById('checkin-dialog');
      return d ? d.textContent : '';
    });
    if (!successDialog.toLowerCase().includes('check in recorded')) problems.push('Success dialog not shown');
    else console.log('  ok: success dialog shown');
    await page.screenshot({ path: path.join(shotsDir, 'success popup.png') });
    // close dialog
    await page.click('#checkin-dialog-button');
    await page.waitForTimeout(500);
    await page.close();

    // Check DB
    const mongoose = (await import('mongoose')).default;
    await mongoose.connect(mongoUri);
    const { EntryModel } = await import('./src/models/Entry.ts');
    const entry = await EntryModel.findOne({ name: 'Ada Lovelace' }).lean();
    if (!entry) problems.push('Entry not found in DB');
    else {
      console.log('  ok: entry in DB', { date: entry.date, time: entry.enteredTime, direction: entry.direction, userType: entry.userType });
    }
    await mongoose.disconnect();

    // (d) duplicate
    console.log('Test: duplicate submission');
    page = await openPage(360, 740);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      document.getElementById('checkin-user-type').value = 'staff';
      document.getElementById('checkin-name').value = 'Dup User';
      document.getElementById('checkin-direction').value = 'in';
      document.getElementById('checkin-hour').value = '8';
      document.getElementById('checkin-minute').value = '00';
      document.getElementById('checkin-period').value = 'AM';
      document.getElementById('checkin-notes').value = 'test';
      const loc = document.getElementById('checkin-location');
      if (loc.options.length > 1) loc.value = loc.options[1].value;
    });
    await page.click('#checkin-submit');
    await page.waitForFunction(() => document.getElementById('checkin-dialog') && !document.getElementById('checkin-dialog').classList.contains('d-none'), { timeout: 5000 });
    await page.click('#checkin-dialog-button');
    await page.waitForTimeout(500);
    // submit again
    await page.evaluate(() => {
      document.getElementById('checkin-hour').value = '8';
      document.getElementById('checkin-minute').value = '01';
      document.getElementById('checkin-period').value = 'AM';
    });
    await page.click('#checkin-submit');
    await page.waitForFunction(() => document.getElementById('checkin-dialog') && !document.getElementById('checkin-dialog').classList.contains('d-none'), { timeout: 5000 });
    const dup = await page.evaluate(() => document.getElementById('checkin-dialog').textContent);
    if (!dup.toLowerCase().includes('already')) problems.push('Duplicate not detected');
    else console.log('  ok: duplicate detected');
    await page.close();

    // (f) admin login and locations page
    console.log('Test: admin locations');
    page = await openPage(1440, 900);
    await page.goto(`http://127.0.0.1:${port}/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#login-email', 'e2e-admin@example.com');
    await page.type('#login-password', 'TestPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(()=>{}),
      page.click('#login-submit'),
    ]);
    await page.goto(`http://127.0.0.1:${port}/locations.html`, { waitUntil: 'networkidle0' });
    await page.waitForTimeout(2000);
    const locPage = await page.evaluate(() => {
      const body = document.getElementById('locations-body');
      const rows = body ? body.querySelectorAll('tr').length : 0;
      const hasSpinner = body ? body.textContent.includes('Loading') : false;
      return { rows, hasSpinner, text: body ? body.textContent.substring(0, 200) : '' };
    });
    if (locPage.hasSpinner) problems.push('Locations page stuck loading');
    if (locPage.rows < 18) problems.push(`Locations page has ${locPage.rows} rows, expected >=18`);
    else console.log(`  ok: locations page has ${locPage.rows} rows`);
    await page.screenshot({ path: path.join(shotsDir, 'Locations page with 18 rows.png') });
    await page.close();

    // (g) console errors on admin pages
    console.log('Test: console errors on admin pages');
    page = await openPage(1440, 900);
    await page.goto(`http://127.0.0.1:${port}/login.html`, { waitUntil: 'networkidle0' });
    await page.type('#login-email', 'e2e-admin@example.com');
    await page.type('#login-password', 'TestPass123!');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(()=>{}),
      page.click('#login-submit'),
    ]);
    const pages = ['/dashboard.html', '/entries.html', '/locations.html', '/admins.html'];
    for (const p of pages) {
      await page.goto(`http://127.0.0.1:${port}${p}`, { waitUntil: 'networkidle0' });
      await page.waitForTimeout(1500);
    }
    if (logs.filter(l => l.includes('console.error') && !l.includes('Failed to load resource')).length > 0) {
      problems.push('Console errors on admin pages: ' + logs.join(' | '));
    } else {
      console.log('  ok: no console errors on admin pages');
    }
    await page.close();

    console.log('\nScreenshots saved in .verify/:');
    console.log('  - public form empty.png');
    console.log('  - with validation errors.png');
    console.log('  - filled.png');
    console.log('  - success popup.png');
    console.log('  - error popup.png');
    console.log('  - Locations page with 18 rows.png');

  } finally {
    await browser.close();
    server.kill();
  }

  if (problems.length) {
    console.error('\nFAILURES:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('\nAll e2e checks passed');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
