/**
 * Browser-side behaviour of the public check-in form, driven in jsdom.
 *
 * The server tests prove the API only exposes active locations. These tests
 * drive the real checkin.js and checkin.html to cover the other half: the six
 * required fields, local validation, the URL preselection, the two location
 * messages, the cookie-free fetch calls, the confirmation text and the reset
 * dialog text and the reset after the success dialog closes.
 *
 * The project compiles without the DOM lib, so the elements are described by
 * the handful of members these tests actually touch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

const pageSource = readFileSync(new URL('../public/checkin.html', import.meta.url), 'utf8');
const scriptSource = readFileSync(new URL('../public/js/checkin.js', import.meta.url), 'utf8');
const seedLocations = JSON.parse(
  readFileSync(new URL('../seed/locations.json', import.meta.url), 'utf8'),
) as Array<{ name: string; postcode: string }>;

/** The real seed labels, so the tests run against the longest addresses. */
const LOCATIONS = seedLocations.map((location, index) => ({
  id: `64b0000000000000000000${String(index + 1).padStart(2, '0')}`,
  name: location.name,
}));

const FIRST = LOCATIONS[0];
const SECOND = LOCATIONS[1];

interface OptionLike {
  textContent: string | null;
}

interface ElemLike {
  id: string;
  value: string;
  textContent: string | null;
  innerHTML: string;
  disabled: boolean;
  hidden: boolean;
  required: boolean;
  options: ArrayLike<OptionLike>;
  classList: { contains(name: string): boolean };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): ArrayLike<unknown>;
  click(): void;
  dispatchEvent(event: unknown): boolean;
  closest(selector: string): unknown;
}

interface DocLike {
  body: { textContent: string | null };
  activeElement: { id: string } | null;
  defaultView: { Event: new (type: string, init?: Record<string, unknown>) => unknown };
  getElementById(id: string): ElemLike | null;
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): ArrayLike<unknown>;
}

interface HarnessOptions {
  search?: string;
  /** Deliver this list; `null` means the server returned an empty list. */
  locations?: Array<{ id: string; name: string }> | null;
  /** Simulate a network failure on the location feed. */
  failLocations?: boolean;
}

interface Harness {
  calls: Array<{ url: string; options: Record<string, unknown> }>;
  doc: DocLike;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const dom = new JSDOM(pageSource, {
    url: `http://localhost:3000/${options.search ?? ''}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const calls: Harness['calls'] = [];
  const window = dom.window;
  const doc = window.document as unknown as DocLike;
  const locationList = options.locations === undefined || options.locations === null
    ? (options.locations === null ? [] : LOCATIONS)
    : options.locations;

  const fakeFetch = async (url: string, fetchOptions: Record<string, unknown> = {}) => {
    calls.push({ url: String(url), options: fetchOptions });

    if (String(url) === '/api/public/locations') {
      if (options.failLocations) throw new Error('network down');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { locations: locationList },
          meta: { timezone: 'Europe/London' },
        }),
      };
    }

    if (String(url) === '/api/public/entries') {
      const body = JSON.parse(String(fetchOptions.body));
      const location = LOCATIONS.find((item) => item.id === body.locationId);
      // `notes` is the test's way of asking for the refused-location answer.
      if (!location || body.notes === 'force-location-error') {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: {
              code: 'invalid_location',
              message: 'Choose an active location.',
              details: [{ path: 'locationId', message: 'Choose an active location.' }],
            },
          }),
        };
      }

      return {
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            entry: {
              id: '64c000000000000000000001',
              name: body.name,
              direction: body.direction,
              time: body.time,
              date: '2026-10-26',
            },
          },
        }),
      };
    }

    throw new Error(`Unexpected fetch: ${String(url)}`);
  };

  (window as unknown as { fetch: typeof fakeFetch }).fetch = fakeFetch;
  window.eval(scriptSource);
  await tick();
  await tick();

  return { calls, doc };
}

function elem(doc: DocLike, id: string): ElemLike {
  const found = doc.getElementById(id);
  assert.ok(found, `#${id} is missing from the page`);
  return found;
}

function submit(doc: DocLike): void {
  const form = elem(doc, 'checkin-form');
  const Event = doc.defaultView.Event;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function change(doc: DocLike, id: string): void {
  const field = elem(doc, id);
  field.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
}

function fillValidForm(doc: DocLike, name = 'Ada Lovelace'): void {
  elem(doc, 'checkin-user-type').value = 'staff';
  elem(doc, 'checkin-name').value = name;
  elem(doc, 'checkin-direction').value = 'in';
  elem(doc, 'checkin-hour').value = '9';
  elem(doc, 'checkin-minute').value = '05';
  elem(doc, 'checkin-period').value = 'AM';
  elem(doc, 'checkin-location').value = FIRST.id;
  elem(doc, 'checkin-notes').value = 'Start of shift';
}

describe('public check-in form', () => {
  it('shows all six required fields, bound to their inputs and with no radio buttons', async () => {
    const { doc } = await harness();

    const labelled: Array<[string, string]> = [
      ['checkin-user-type', 'checkin-user-type'],
      ['checkin-name', 'checkin-name'],
      ['checkin-direction', 'checkin-direction'],
      ['checkin-location', 'checkin-location'],
      ['checkin-notes', 'checkin-notes'],
    ];

    for (const [id, target] of labelled) {
      assert.ok(doc.querySelector(`label[for="${target}"]`), `no label for ${target}`);
      assert.ok(
        doc.querySelector(`label[for="${target}"] .checkin-required`),
        `${target} has no required marker`,
      );
      assert.equal(elem(doc, id).required, true, `${id} should be required`);
    }

    // Time is a fieldset of three selects plus the Now button.
    for (const id of ['checkin-hour', 'checkin-minute', 'checkin-period']) {
      assert.equal(elem(doc, id).required, true, `${id} should be required`);
    }
    assert.ok(doc.getElementById('checkin-now'));

    // The radio buttons are gone and the direction is a plain select.
    assert.equal(doc.querySelectorAll('input[type="radio"]').length, 0);
    assert.equal(elem(doc, 'checkin-direction').options.length, 3);

    // Nothing is preselected and the "* Required" note is present.
    assert.equal(elem(doc, 'checkin-user-type').value, '');
    assert.equal(elem(doc, 'checkin-direction').value, '');
    assert.equal(elem(doc, 'checkin-location').value, '');
    assert.equal(elem(doc, 'checkin-hour').value, '');
    assert.equal(elem(doc, 'checkin-minute').value, '');
    assert.equal(elem(doc, 'checkin-period').value, '');
    assert.match(doc.body.textContent ?? '', /\*\s*Required/);

    // The honeypot and privacy note remain, but the shared-device notice is removed.
    assert.ok(elem(doc, 'checkin-company').closest('.checkin-hp'));
    assert.match(doc.body.textContent ?? '', /do not store your IP address/i);
    assert.doesNotMatch(doc.body.textContent ?? '', /Never sign in to the admin panel on it/i);
  });

  it('renders every real address label without stray text', async () => {
    const { doc } = await harness();

    const options = Array.from(elem(doc, 'checkin-location').options).map(
      (option) => option.textContent ?? '',
    );
    assert.equal(options[0], '-- Select --');
    assert.equal(options.length, LOCATIONS.length + 1);
    for (const location of LOCATIONS) {
      assert.ok(options.includes(location.name), `missing ${location.name}`);
    }

    const text = doc.body.textContent ?? '';
    for (const stray of ['undefined', '[object Object]', 'NaN', 'null']) {
      assert.equal(text.includes(stray), false, `stray text: ${stray}`);
    }
  });

  it('preselects a valid active location id from ?location=', async () => {
    const { doc } = await harness({ search: `?location=${SECOND.id}` });

    assert.equal(elem(doc, 'checkin-location').value, SECOND.id);
    assert.equal(elem(doc, 'checkin-location').disabled, false);
    assert.equal(elem(doc, 'checkin-submit').disabled, false);
    // The full address is shown underneath the select so it can wrap.
    assert.equal(elem(doc, 'checkin-location-full').textContent, SECOND.name);
  });

  it('ignores an unknown or malformed location id', async () => {
    for (const value of ['000000000000000000000000', 'not-a-real-id', '']) {
      const { doc } = await harness({ search: `?location=${encodeURIComponent(value)}` });

      assert.equal(elem(doc, 'checkin-location').value, '', value);
      assert.equal(elem(doc, 'checkin-location').disabled, false, value);
      assert.equal(elem(doc, 'checkin-location').options[0].textContent, '-- Select --', value);
    }
  });

  it('shows the empty-list message when no location is active', async () => {
    const { doc } = await harness({ locations: [] });

    assert.match(
      elem(doc, 'checkin-location-message').textContent ?? '',
      /No active locations are available/,
    );
    assert.equal(elem(doc, 'checkin-retry').hidden, true);
    assert.equal(elem(doc, 'checkin-location').disabled, true);
    assert.equal(elem(doc, 'checkin-submit').disabled, true);
  });

  it('shows the retry message when the location list cannot be loaded', async () => {
    const { doc, calls } = await harness({ failLocations: true });

    assert.match(
      elem(doc, 'checkin-location-message').textContent ?? '',
      /Could not load locations/,
    );
    assert.equal(elem(doc, 'checkin-retry').hidden, false);

    elem(doc, 'checkin-retry').click();
    await tick();
    assert.ok(calls.filter((call) => call.url === '/api/public/locations').length >= 2);
  });

  it('validates locally, inline, and moves the focus to the first error', async () => {
    const { doc, calls } = await harness();

    submit(doc);
    await tick();

    assert.equal(calls.some((call) => call.url === '/api/public/entries'), false);

    const order: Array<[string, string, RegExp]> = [
      ['checkin-user-type-error', 'checkin-user-type', /Choose a user type/],
      ['checkin-name-error', 'checkin-name', /Enter your name/],
      ['checkin-direction-error', 'checkin-direction', /Choose check in or check out/],
      ['checkin-time-error', 'checkin-hour', /Choose the hour/],
      ['checkin-location-error', 'checkin-location', /Choose a location/],
      ['checkin-notes-error', 'checkin-notes', /Enter a note/],
    ];

    for (const [errorId, fieldId, pattern] of order) {
      assert.match(elem(doc, errorId).textContent ?? '', pattern, errorId);

      const field = elem(doc, fieldId);
      assert.equal(field.getAttribute('aria-invalid'), 'true', fieldId);
      assert.ok(
        (field.getAttribute('aria-describedby') ?? '').split(/\s+/).includes(errorId),
        `${fieldId} should point at ${errorId}`,
      );
    }

    // Focus lands on the very first invalid control.
    assert.equal(doc.activeElement?.id, 'checkin-user-type');

    // Correcting one field clears only that error.
    elem(doc, 'checkin-user-type').value = 'visitor';
    change(doc, 'checkin-user-type');
    assert.equal(elem(doc, 'checkin-user-type-error').textContent, '');
    assert.match(elem(doc, 'checkin-name-error').textContent ?? '', /Enter your name/);
  });

  it('fills the picker with the current time in APP_TIMEZONE when Now is pressed', async () => {
    const { doc } = await harness();

    assert.equal(elem(doc, 'checkin-time-choice').textContent, '');

    elem(doc, 'checkin-now').click();

    const hour = elem(doc, 'checkin-hour').value;
    const minute = elem(doc, 'checkin-minute').value;
    const period = elem(doc, 'checkin-period').value;
    assert.notEqual(hour, '');
    assert.notEqual(minute, '');
    assert.ok(period === 'AM' || period === 'PM');

    const expected = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    const [expectedHour, expectedMinute] = expected.split(':');
    const hour24 = (Number(hour) % 12) + (period === 'PM' ? 12 : 0);

    const chosen = hour24 * 60 + Number(minute);
    const wanted = Number(expectedHour) * 60 + Number(expectedMinute);
    const distance = Math.min(
      Math.abs(chosen - wanted),
      1440 - Math.abs(chosen - wanted),
    );
    assert.ok(distance <= 1, `chosen ${chosen}, expected ${wanted} (${hour}:${minute} ${period})`);

    const padded = `${String(hour).padStart(2, '0')}:${minute}`;
    assert.equal(elem(doc, 'checkin-time-choice').textContent, `Time: ${padded} ${period}`);
    assert.equal(elem(doc, 'checkin-time-error').textContent, '');
  });

  it('shows the success dialog and resets only after it closes', async () => {
    const { doc, calls } = await harness({ search: `?location=${FIRST.id}` });

    fillValidForm(doc);
    submit(doc);
    await tick();

    const locationsCall = calls.find((call) => call.url === '/api/public/locations');
    assert.ok(locationsCall);
    assert.equal(locationsCall.options.credentials, 'omit');

    const entryCall = calls.find((call) => call.url === '/api/public/entries');
    assert.ok(entryCall, 'the form did not submit');
    assert.equal(entryCall.options.credentials, 'omit');
    assert.equal(
      (entryCall.options.headers as Record<string, string>)['Content-Type'],
      'application/json',
    );

    const sent = JSON.parse(String(entryCall.options.body));
    assert.deepEqual(sent, {
      userType: 'staff',
      name: 'Ada Lovelace',
      direction: 'in',
      time: '09:05',
      locationId: FIRST.id,
      notes: 'Start of shift',
      company: '',
    });

    const dialog = elem(doc, 'checkin-dialog');
    assert.equal(dialog.classList.contains('d-none'), false);
    const dialogText = elem(doc, 'checkin-dialog-body').textContent ?? '';
    assert.match(dialogText, /Name: Ada Lovelace/);
    assert.match(dialogText, /User type: Staff Member/);
    assert.match(dialogText, /Direction: Check in/);
    assert.match(dialogText, /Time: 09:05 AM/);
    assert.match(dialogText, /Date: 26 Oct 2026/);
    assert.ok(dialogText.includes(`Location: ${FIRST.name}`));
    assert.equal(doc.getElementById('checkin-success'), null);

    // Keep the submitted values visible until the person dismisses the dialog.
    assert.equal(elem(doc, 'checkin-name').value, 'Ada Lovelace');
    assert.equal(elem(doc, 'checkin-user-type').value, 'staff');
    assert.equal(elem(doc, 'checkin-direction').value, 'in');
    assert.equal(elem(doc, 'checkin-hour').value, '9');
    assert.equal(elem(doc, 'checkin-notes').value, 'Start of shift');

    elem(doc, 'checkin-dialog-button').click();
    assert.equal(elem(doc, 'checkin-name').value, '');
    assert.equal(elem(doc, 'checkin-user-type').value, '');
    assert.equal(elem(doc, 'checkin-direction').value, '');
    assert.equal(elem(doc, 'checkin-hour').value, '');
    assert.equal(elem(doc, 'checkin-notes').value, '');
    assert.equal(elem(doc, 'checkin-notes-count').textContent, '0 / 500');
    assert.equal(dialog.classList.contains('d-none'), true);
    // The location from the URL is preselected again.
    assert.equal(elem(doc, 'checkin-location').value, FIRST.id);
  });

  it('shows an XSS payload as plain text and never as markup', async () => {
    const { doc } = await harness({ search: `?location=${FIRST.id}` });
    const payload = '<img src=x onerror="alert(1)">';

    fillValidForm(doc, payload);
    elem(doc, 'checkin-notes').value = '"><script>alert(1)</script>';
    submit(doc);
    await tick();

    const dialog = elem(doc, 'checkin-dialog');
    const dialogBody = elem(doc, 'checkin-dialog-body');
    assert.match(dialogBody.textContent ?? '', /Name: <img src=x onerror="alert\(1\)">/);
    assert.equal(dialogBody.querySelectorAll('img').length, 0);
    assert.equal(dialogBody.querySelectorAll('script').length, 0);
    assert.equal(dialog.classList.contains('d-none'), false);
  });

  it('maps a server-side location error onto the location field', async () => {
    const { doc } = await harness();

    fillValidForm(doc);
    // The server refuses this one, and the answer lands on the field.
    elem(doc, 'checkin-notes').value = 'force-location-error';
    submit(doc);
    await tick();

    assert.match(elem(doc, 'checkin-location-error').textContent ?? '', /Choose an active location/);
    assert.equal(elem(doc, 'checkin-location').getAttribute('aria-invalid'), 'true');
    assert.equal(elem(doc, 'checkin-dialog').classList.contains('d-none'), false);
    assert.match(elem(doc, 'checkin-dialog-body').textContent ?? '', /Choose an active location/);
  });
});
