/**
 * Entry points, page guards, no-index rules, API authentication and the
 * post-login redirect allowlist.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createAdmin, OWNER_EMAIL, OWNER_PASSWORD, signIn, startTestApp, type TestContext } from './helpers.ts';

let context: TestContext;
let app: TestContext['app'];

before(async () => {
  context = await startTestApp();
  app = context.app;
  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  await context?.stop();
});

function loginAgent(next?: string) {
  const agent = request.agent(app);
  const payload: Record<string, string> = { email: OWNER_EMAIL, password: OWNER_PASSWORD };
  if (next !== undefined) payload.next = next;
  return { agent, response: agent.post('/api/auth/login').send(payload) };
}

describe('public entry points', () => {
  it('serves the same cookie-free check-in page from /, /checkin and /checkin.html', async () => {
    for (const path of ['/', '/checkin', '/checkin.html']) {
      const response = await request(app).get(path);

      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/html/);
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
      assert.match(response.headers['cache-control'], /no-store/);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.match(response.text, /id="checkin-form"/);
      assert.match(response.text, /Care Attendance/);
      assert.doesNotMatch(response.text, /This device is shared\. Never sign in to the admin panel on it\./);

      // The public page is not a disguised admin screen: no navigation or
      // links back to the protected application.
      assert.doesNotMatch(response.text, /href="\/(?:login|dashboard|admin|entries|locations)\.html"/);
      assert.doesNotMatch(response.text, /id="sidebar-placeholder"/);
      assert.doesNotMatch(response.text, /id="navbar-placeholder"/);
    }
  });

  it('keeps serving the public page when a session already exists', async () => {
    const { agent, response } = loginAgent();
    assert.equal((await response).status, 200);

    const publicPage = await agent.get('/');
    assert.equal(publicPage.status, 200);
    assert.equal(publicPage.headers.location, undefined);
  });

  it('serves the check-in page regardless of the query string', async () => {
    const response = await request(app).get('/?location=not-a-real-id');
    assert.equal(response.status, 200);
    assert.match(response.text, /id="checkin-form"/);
  });
});

describe('PWA resources', () => {
  it('serves the manifest with the app identity and all referenced icons', async () => {
    const response = await request(app).get('/manifest.webmanifest');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /application\/manifest\+json/);
    assert.match(response.headers['cache-control'], /no-cache/);

    const manifest = JSON.parse(response.text) as {
      id: string;
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };
    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');

    for (const icon of manifest.icons) {
      const image = await request(app).get(icon.src);
      assert.equal(image.status, 200, icon.src);
      assert.match(image.headers['content-type'], /image\/png/, icon.src);
      assert.equal(Buffer.isBuffer(image.body), true, icon.src);
      assert.equal(`${image.body.readUInt32BE(16)}x${image.body.readUInt32BE(20)}`, icon.sizes, icon.src);
    }

    for (const [iconPath, size] of [
      ['/assets/img/pwa/apple-touch-icon.png', '180x180'],
      ['/assets/img/pwa/favicon-48.png', '48x48'],
    ]) {
      const image = await request(app).get(iconPath);
      assert.equal(image.status, 200, iconPath);
      assert.equal(`${image.body.readUInt32BE(16)}x${image.body.readUInt32BE(20)}`, size, iconPath);
    }
  });

  it('serves a revalidatable root-scoped worker and a generic offline page', async () => {
    const worker = await request(app).get('/service-worker.js');
    assert.equal(worker.status, 200);
    assert.match(worker.headers['content-type'], /javascript/);
    assert.match(worker.headers['cache-control'], /no-cache/);
    assert.equal(worker.headers['service-worker-allowed'], '/');
    assert.match(worker.text, /request\.method !== 'GET'/);
    assert.match(worker.text, /url\.pathname\.startsWith\('\/api\/'\)/);

    const offline = await request(app).get('/offline.html');
    assert.equal(offline.status, 200);
    assert.match(offline.headers['content-type'], /text\/html/);
    assert.match(offline.text, /You're offline/);
    assert.match(offline.text, /action="\/"/);
  });
});

describe('admin entry point', () => {
  it('sends an anonymous visitor to the login page for the dashboard', async () => {
    const response = await request(app).get('/admin');

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login.html?next=/dashboard.html');
  });

  it('sends a signed-in administrator to the dashboard', async () => {
    const { agent, response } = loginAgent();
    assert.equal((await response).status, 200);

    const admin = await agent.get('/admin');
    assert.equal(admin.status, 302);
    assert.equal(admin.headers.location, '/dashboard.html');
  });
});

describe('protected HTML pages', () => {
  it('redirects every protected page, preserving the requested path and query', async () => {
    const { PAGES } = await import('../src/config/pages.ts');
    const protectedPages = PAGES.filter((page) => !page.public);

    for (const page of protectedPages) {
      const path = `/${page.file}?from=test`;
      const response = await request(app).get(path);

      assert.equal(response.status, 302, page.file);
      assert.match(response.headers.location, /^\/login\.html\?next=/, page.file);
      const target = new URL(response.headers.location, 'http://localhost').searchParams.get('next');
      assert.equal(target, path, page.file);
    }
  });

  it('does not redirect the password reset pages when signed out', async () => {
    for (const path of ['/forgot-password.html', '/reset-password.html']) {
      const response = await request(app).get(path);
      assert.equal(response.status, 200);
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow');
    }
  });

  it('redirects an already signed-in visitor away from login.html', async () => {
    const { agent, response } = loginAgent();
    assert.equal((await response).status, 200);

    const login = await agent.get('/login.html?next=/entries.html');
    assert.equal(login.status, 302);
    assert.equal(login.headers.location, '/dashboard.html');
  });
});

describe('no-index rules', () => {
  it('marks the public and sign-in pages noindex', async () => {
    for (const path of [
      '/',
      '/checkin',
      '/checkin.html',
      '/login.html',
      '/forgot-password.html',
      '/reset-password.html',
    ]) {
      const response = await request(app).get(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow', path);
    }
  });

  it('lists the public and sign-in pages in robots.txt', async () => {
    const response = await request(app).get('/robots.txt');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/plain/);
    for (const path of [
      '/',
      '/checkin',
      '/checkin.html',
      '/login.html',
      '/forgot-password.html',
      '/reset-password.html',
      '/admin',
    ]) {
      assert.match(response.text, new RegExp(`Disallow: ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\r?\\n|$)`));
    }
  });
});

describe('protected API authentication', () => {
  it('returns a JSON 401 for every admin API before checking CSRF', async () => {
    const endpoints: Array<[string, string]> = [
      ['get', '/api/admins'],
      ['post', '/api/admins'],
      ['get', '/api/entries'],
      ['post', '/api/entries'],
      ['get', '/api/locations'],
      ['post', '/api/locations'],
      ['get', '/api/departments'],
      ['post', '/api/departments'],
      ['get', '/api/employees'],
      ['post', '/api/employees'],
      ['get', '/api/attendance'],
      ['post', '/api/attendance'],
      ['get', '/api/overtime'],
      ['post', '/api/overtime'],
      ['get', '/api/leaves'],
      ['post', '/api/leaves'],
      ['get', '/api/calendar'],
      ['post', '/api/calendar/events'],
      ['get', '/api/events'],
      ['get', '/api/dashboard/summary'],
      ['get', '/api/reports/attendance-summary'],
    ];

    for (const [method, path] of endpoints) {
      const response = await request(app)[method as 'get' | 'post'](path).send({});

      assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`);
      assert.match(response.headers['content-type'], /application\/json/, path);
      assert.equal(response.body.success, false, path);
      assert.equal(response.body.error.code, 'unauthenticated', path);
      assert.equal(response.body.data, undefined, path);
      assert.equal(JSON.stringify(response.body).includes('<html'), false, path);
    }
  });

  it('does not protect the public API', async () => {
    const locations = await request(app).get('/api/public/locations');
    assert.equal(locations.status, 200);
    assert.equal(locations.body.success, true);

    const entry = await request(app).post('/api/public/entries').send({});
    assert.equal(entry.status, 400);
    assert.equal(entry.body.error.code, 'validation_error');
    const details = entry.body.error.details as Array<{ path: string }>;
    assert.ok(Array.isArray(details) && details.length > 0);
    assert.equal(
      details.some((issue) => issue.path === 'name'),
      true,
    );
  });
});

function cookieExpiryInHours(setCookie: string): number {
  const match = /Expires=([^;]+)/.exec(setCookie);
  assert.ok(match, `Expected an Expires attribute in ${setCookie}`);
  return (Date.parse(match[1]) - Date.now()) / 3_600_000;
}

describe('session lifetime and cookie flags', () => {
  it('issues a twelve-hour rolling httpOnly SameSite=Lax cookie', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    });

    assert.equal(login.status, 200);
    const setCookie = String(login.headers['set-cookie']);
    const expiresIn = cookieExpiryInHours(setCookie);
    assert.ok(expiresIn > 11.9 && expiresIn <= 12, `Expected a 12 hour cookie, got ${expiresIn}`);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.doesNotMatch(setCookie, /Secure/);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    const refreshed = String(me.headers['set-cookie']);
    const refreshedExpiry = cookieExpiryInHours(refreshed);
    assert.ok(
      refreshedExpiry > 11.9 && refreshedExpiry <= 12,
      `Expected a refreshed 12 hour cookie, got ${refreshedExpiry}`,
    );
  });

  it('clears the cookie on logout', async () => {
    const { agent, response } = loginAgent();
    const login = await response;
    const csrf = login.body.meta.csrfToken as string;

    const logout = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
    assert.equal(logout.status, 200);
    assert.match(String(logout.headers['set-cookie']), /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/);
  });
});

describe('post-login next allowlist', () => {
  const unsafeValues = [
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'http://evil.com/dashboard.html',
    '/https://evil.com',
    '/%2F%2Fevil.com',
    '/%5Cevil.com',
    '/%0d%0aLocation:%20https://evil.com',
    '/dashboard.html#fragment',
    '/login.html',
    '/forgot-password.html',
    '/reset-password.html',
    '/admin',
    '/',
    '/not-a-page.html',
    '/dashboard',
    'dashboard.html',
    '\\evil.com',
    '///evil.com',
  ];

  it('falls back to the dashboard for hostile or unknown values', async () => {
    for (const next of unsafeValues) {
      const { response } = loginAgent(next);
      const login = await response;

      assert.equal(login.status, 200, next);
      assert.equal(login.body.data.redirectTo, '/dashboard.html', next);
    }
  });

  it('decodes one URL-encoded layer and still rejects open redirects', async () => {
    const encodedValues = [
      '%2F%2Fevil.com',
      '%2F%5Cevil.com',
      'https%3A%2F%2Fevil.com',
      '%2F%2Fevil.com%2Fdashboard.html',
      '%2F%0d%0aLocation%3A%20https%3A%2F%2Fevil.com',
    ];

    for (const encoded of encodedValues) {
      const decoded = decodeURIComponent(encoded);
      const { response } = loginAgent(decoded);
      const login = await response;

      assert.equal(login.status, 200, encoded);
      assert.equal(login.body.data.redirectTo, '/dashboard.html', encoded);
    }
  });

  it('keeps a valid local protected page and its query string', async () => {
    for (const next of [
      '/dashboard.html',
      '/entries.html?page=2&locationId=abc',
      '/locations.html',
      '/admins.html?status=enabled',
      '/my-account.html',
    ]) {
      const { response, agent } = loginAgent(next);
      const login = await response;

      assert.equal(login.status, 200, next);
      assert.equal(login.body.data.redirectTo, next);
      assert.equal((await agent.get('/api/auth/me')).status, 200, next);
    }
  });

  it('uses the dashboard when no next value is supplied', async () => {
    const { response } = loginAgent();
    const login = await response;
    assert.equal(login.body.data.redirectTo, '/dashboard.html');
  });
});
