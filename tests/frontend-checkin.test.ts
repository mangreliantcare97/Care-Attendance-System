/**
 * Browser-side behaviour of the public check-in form.
 *
 * The server tests prove the API only exposes active locations. These tests
 * drive the real checkin.js in jsdom to cover the other half: the URL
 * preselection and the cookie-free fetch calls.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

const pageSource = readFileSync(new URL('../public/checkin.html', import.meta.url), 'utf8');
const scriptSource = readFileSync(new URL('../public/js/checkin.js', import.meta.url), 'utf8');

const LOCATIONS = [
  { id: '64b000000000000000000001', name: 'Main Office' },
  { id: '64b000000000000000000002', name: 'North Clinic' },
];

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Harness {
  dom: JSDOM;
  calls: Array<{ url: string; options: Record<string, unknown> }>;
}

interface SelectLike {
  value: string;
  disabled: boolean;
  options: ArrayLike<{ textContent: string | null }>;
}

interface InputLike {
  value: string;
}

interface ElementLike {
  textContent: string | null;
  classList: { contains: (name: string) => boolean };
}

interface FormLike {
  dispatchEvent: (event: unknown) => boolean;
}

function byId(dom: JSDOM, id: string): ElementLike {
  return dom.window.document.getElementById(id) as unknown as ElementLike;
}

function selectById(dom: JSDOM, id: string): SelectLike {
  return dom.window.document.getElementById(id) as unknown as SelectLike;
}

async function harness(search: string): Promise<Harness> {
  const dom = new JSDOM(pageSource, {
    url: `http://localhost:3000/${search}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const calls: Harness['calls'] = [];
  const window = dom.window;

  const fakeFetch = async (url: string, options: Record<string, unknown> = {}) => {
    calls.push({ url: String(url), options });

    if (String(url) === '/api/public/locations') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { locations: LOCATIONS } }),
      };
    }

    if (String(url) === '/api/public/entries') {
      const body = JSON.parse(String(options.body));
      const location = LOCATIONS.find((item) => item.id === body.locationId);
      if (!location) {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            success: false,
            error: { code: 'invalid_location', message: 'Choose an active location.' },
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
              occurredAt: new Date().toISOString(),
              location,
            },
          },
        }),
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  (window as unknown as { fetch: typeof fakeFetch }).fetch = fakeFetch;

  window.eval(scriptSource);
  await tick();
  await tick();

  return { dom, calls };
}

describe('public check-in form', () => {
  it('preselects a valid active location id from ?location=', async () => {
    const { dom } = await harness(`?location=${LOCATIONS[1].id}`);
    const select = selectById(dom, 'checkin-location');

    assert.equal(select.value, LOCATIONS[1].id);
    assert.equal(select.disabled, false);
    assert.equal(
      (dom.window.document.getElementById('checkin-submit') as unknown as { hasAttribute: (name: string) => boolean }).hasAttribute('disabled'),
      false,
    );
  });

  it('ignores an unknown or inactive location id and leaves the placeholder selected', async () => {
    for (const value of ['000000000000000000000000', 'not-a-real-id', '']) {
      const { dom } = await harness(`?location=${encodeURIComponent(value)}`);
      const select = selectById(dom, 'checkin-location');

      assert.equal(select.value, '', value);
      assert.equal(select.disabled, false);
      assert.equal(select.options[0].textContent, 'Choose a location');
    }
  });

  it('submits without cookies and shows a safe confirmation', async () => {
    const { dom, calls } = await harness(`?location=${LOCATIONS[0].id}`);
    const document = dom.window.document;
    const form = document.getElementById('checkin-form') as unknown as FormLike;
    const name = document.getElementById('checkin-name') as unknown as InputLike;

    name.value = '  Ada Lovelace  ';
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    await tick();

    const locationsCall = calls.find((call) => call.url === '/api/public/locations');
    assert.ok(locationsCall);
    assert.equal(locationsCall.options.credentials, 'omit');

    const entryCall = calls.find((call) => call.url === '/api/public/entries');
    assert.ok(entryCall);
    assert.equal(entryCall.options.credentials, 'omit');
    assert.equal((entryCall.options.headers as Record<string, string>)['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(String(entryCall.options.body)), {
      name: 'Ada Lovelace',
      locationId: LOCATIONS[0].id,
      direction: 'in',
    });

    const success = byId(dom, 'checkin-success');
    assert.match(success.textContent ?? '', /Thank you, Ada Lovelace\./);
    assert.match(success.textContent ?? '', /Main Office/);
    assert.equal(success.classList.contains('d-none'), false);
    assert.equal(name.value, '');
  });

  it('validates locally before sending an entry', async () => {
    const { dom, calls } = await harness('');
    const document = dom.window.document;
    const form = document.getElementById('checkin-form') as unknown as FormLike;

    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick();

    assert.equal(calls.some((call) => call.url === '/api/public/entries'), false);
    const alert = byId(dom, 'checkin-alert');
    assert.match(alert.textContent ?? '', /Enter your name/);
    assert.equal(alert.classList.contains('d-none'), false);
  });
});
