/**
 * Authentication, CSRF, rate limiting and the admin safety rails.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestApp, type TestContext } from './helpers.ts';

let context: TestContext;
let app: TestContext['app'];

const ADMIN_EMAIL = 'owner@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery';

before(async () => {
  context = await startTestApp();
  app = context.app;

  const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');
  await AdminModel.create({
    name: 'Owner',
    email: ADMIN_EMAIL,
    password: await hashPassword(ADMIN_PASSWORD),
    role: 'admin',
    isActive: true,
  });
});

after(async () => {
  await context?.stop();
});

/** Sign in and return the agent plus the CSRF token. */
async function signIn(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  return {
    agent,
    response,
    csrf: response.body?.meta?.csrfToken as string,
  };
}

async function createAdmin(input: {
  name: string;
  email: string;
  password?: string;
}) {
  const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');
  const password = input.password ?? 'another-secret-1';
  return AdminModel.create({
    name: input.name,
    email: input.email,
    password: await hashPassword(password),
    role: 'admin',
    isActive: true,
  });
}

describe('POST /api/auth/login', () => {
  it('signs an admin in and issues a CSRF token', async () => {
    const { response, csrf } = await signIn();

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.admin.email, ADMIN_EMAIL);
    assert.equal(response.body.data.admin.role, 'admin');
    assert.equal(response.body.data.admin.isActive, true);
    assert.ok(typeof csrf === 'string' && csrf.length > 0);
    assert.equal(response.body.data.admin.password, undefined);
  });

  it('never returns the password hash', async () => {
    const { response } = await signIn();
    assert.equal(JSON.stringify(response.body).includes('$2b$'), false);
  });

  it('rejects a wrong password', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'nope' });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'invalid_credentials');
  });

  it('rejects an unknown email with the same message', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope' });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'invalid_credentials');
  });

  it('validates the payload', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/login').send({ email: 'not-an-email' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');
  });

  it('refuses a deactivated admin', async () => {
    const created = await createAdmin({ name: 'Disabled', email: 'disabled@example.com' });
    const { AdminModel } = await import('../src/models/Admin.ts');
    await AdminModel.updateOne({ _id: created._id }, { $set: { isActive: false } });

    const agent = request.agent(app);
    const response = await agent
      .post('/api/auth/login')
      .send({ email: 'disabled@example.com', password: 'another-secret-1' });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'account_disabled');
  });
});

describe('GET /api/auth/me', () => {
  it('is refused without a session', async () => {
    const response = await request(app).get('/api/auth/me');

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'unauthenticated');
  });

  it('returns the signed-in admin and a CSRF token', async () => {
    const { agent } = await signIn();
    const response = await agent.get('/api/auth/me');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.email, ADMIN_EMAIL);
    assert.ok(response.body.meta.csrfToken);
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session', async () => {
    const { agent, csrf } = await signIn();

    assert.equal((await agent.get('/api/auth/me')).status, 200);

    const logout = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
    assert.equal(logout.status, 200);
    assert.equal(logout.body.data.loggedOut, true);

    const after = await agent.get('/api/auth/me');
    assert.equal(after.status, 401);
  });

  it('is refused without the CSRF token while a session is alive', async () => {
    const { agent } = await signIn();

    const logout = await agent.post('/api/auth/logout');
    assert.equal(logout.status, 403);
    assert.equal(logout.body.error.code, 'csrf_token_mismatch');

    // The session is still usable.
    assert.equal((await agent.get('/api/auth/me')).status, 200);
  });

  it('succeeds without a token when there is no session left', async () => {
    const response = await request(app).post('/api/auth/logout');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.loggedOut, true);
  });
});

describe('CSRF protection', () => {
  it('rejects a state changing request without a token', async () => {
    const { agent } = await signIn();
    const response = await agent.post('/api/admins').send({
      name: 'No Token',
      email: 'notoken@example.com',
      password: 'another-secret-1',
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('rejects a state changing request with a wrong token', async () => {
    const { agent } = await signIn();
    const response = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', 'not-the-right-token')
      .send({ name: 'Wrong Token', email: 'wrongtoken@example.com', password: 'another-secret-1' });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('accepts a state changing request with the issued token', async () => {
    const { agent, csrf } = await signIn();
    const response = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'With Token',
        email: 'withtoken@example.com',
        password: 'another-secret-1',
        confirmPassword: 'another-secret-1',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.email, 'withtoken@example.com');
  });

  it('does not require a token for reads', async () => {
    const { agent } = await signIn();
    const response = await agent.get('/api/admins');

    assert.equal(response.status, 200);
  });
});

describe('login rate limiting', () => {
  it('is covered by tests/rate-limit.test.ts (separate process)', () => {
    assert.ok(true);
  });
});

describe('admin safety rails', () => {
  it('does not let an admin deactivate their own account', async () => {
    const { agent, csrf } = await signIn();
    const me = await agent.get('/api/auth/me');
    const ownId = me.body.data.admin.id;

    const response = await agent.post(`/api/admins/${ownId}/deactivate`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'cannot_deactivate_self');
  });

  it('does not let the last active admin be deactivated', async () => {
    const { AdminModel } = await import('../src/models/Admin.ts');
    const { setAdminActive } = await import('../src/services/admins.ts');

    // Leave exactly one active administrator ...
    const survivor = await createAdmin({ name: 'Survivor', email: 'survivor@example.com' });
    await AdminModel.updateMany({ _id: { $ne: survivor._id } }, { $set: { isActive: false } });

    const activeAdmins = await AdminModel.countDocuments({ isActive: true, role: 'admin' });
    assert.equal(activeAdmins, 1);

    // ... and try to deactivate them. The caller is not that admin, so the
    // "cannot deactivate yourself" rail cannot catch it.
    await assert.rejects(
      () => setAdminActive(String(survivor._id), false, '000000000000000000000000'),
      (error: { code?: string }) => error.code === 'cannot_deactivate_last_admin',
    );

    // Put the other administrators back so the following tests can sign in.
    await AdminModel.updateMany({}, { $set: { isActive: true } });
  });

  it('deactivates another admin and revokes their session straight away', async () => {
    const target = await createAdmin({ name: 'Target', email: 'target@example.com' });
    const { AdminModel } = await import('../src/models/Admin.ts');

    // Two active administrators are needed for the rail to allow it.
    await AdminModel.updateOne({ email: 'second@example.com' }, { $set: { isActive: true } }).catch(() => undefined);
    await createAdmin({ name: 'Second', email: 'second@example.com' });

    const targetAgent = request.agent(app);
    const targetLogin = await targetAgent
      .post('/api/auth/login')
      .send({ email: 'target@example.com', password: 'another-secret-1' });
    assert.equal(targetLogin.status, 200);

    const { agent, csrf } = await signIn();
    const response = await agent.post(`/api/admins/${target._id}/deactivate`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.isActive, false);

    // The session of the deactivated admin is removed from the store.
    const { mongoose } = await import('../src/config/db.ts');
    const sessions = await mongoose.connection
      .collection('sessions')
      .countDocuments({ 'session.adminId': String(target._id) });
    assert.equal(sessions, 0);

    // The deactivated admin loses access immediately.
    const after = await targetAgent.get('/api/auth/me');
    assert.equal(after.status, 401);

    // ... and cannot sign in again.
    const retry = await targetAgent
      .post('/api/auth/login')
      .send({ email: 'target@example.com', password: 'another-secret-1' });
    assert.equal(retry.status, 403);
  });

  it('reactivates a deactivated admin', async () => {
    const target = await createAdmin({ name: 'Back Again', email: 'backagain@example.com' });
    const { AdminModel } = await import('../src/models/Admin.ts');
    await AdminModel.updateOne({ _id: target._id }, { $set: { isActive: false } });

    const { agent, csrf } = await signIn();
    const response = await agent.post(`/api/admins/${target._id}/activate`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.isActive, true);
  });

  it('refuses a duplicate email', async () => {
    const { agent, csrf } = await signIn();
    const response = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Copy',
        email: ADMIN_EMAIL,
        password: 'another-secret-1',
        confirmPassword: 'another-secret-1',
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'email_taken');
  });

  it('has exactly one role and never creates a non-admin login', async () => {
    const { agent, csrf } = await signIn();
    const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');

    // The schema itself rejects any other role.
    await assert.rejects(
      AdminModel.create({
        name: 'Schema Viewer',
        email: 'schema-viewer@example.com',
        password: await hashPassword('another-secret-1'),
        // Deliberate cast: this is a runtime guard test for a legacy/invalid
        // role that the TypeScript type no longer permits.
        role: 'viewer' as unknown as 'admin',
        isActive: true,
      }),
      /`viewer` is not a valid enum value/,
    );

    // The create and update schemas reject it too, instead of silently
    // normalising the payload to `admin`.
    const created = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'API Viewer',
        email: 'api-viewer@example.com',
        password: 'another-secret-1',
        confirmPassword: 'another-secret-1',
        role: 'viewer',
      });
    assert.equal(created.status, 422);
    assert.equal(created.body.error.code, 'validation_error');

    const target = await createAdmin({ name: 'Role Target', email: 'role-target@example.com' });
    const updated = await agent
      .patch(`/api/admins/${target._id}`)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'viewer' });
    assert.equal(updated.status, 422);

    // Even a legacy row inserted outside the model cannot sign in.
    await AdminModel.collection.insertOne({
      name: 'Legacy Viewer',
      email: 'legacy-viewer@example.com',
      password: await hashPassword('another-secret-1'),
      role: 'viewer',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const legacyLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'legacy-viewer@example.com', password: 'another-secret-1' });
    assert.equal(legacyLogin.status, 403);
    assert.equal(legacyLogin.body.error.code, 'forbidden');
  });

  it('changes the password of the signed-in admin', async () => {
    const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');
    await AdminModel.create({
      name: 'Password',
      email: 'password@example.com',
      password: await hashPassword('old-password-1'),
      role: 'admin',
      isActive: true,
    });

    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'password@example.com', password: 'old-password-1' });
    const csrf = login.body.meta.csrfToken;

    const wrong = await agent
      .post('/api/admins/me/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'not-it', newPassword: 'brand-new-password' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, 'invalid_password');

    const changed = await agent
      .post('/api/admins/me/password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'old-password-1', newPassword: 'brand-new-password' });
    assert.equal(changed.status, 200);

    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'password@example.com', password: 'brand-new-password' });
    assert.equal(relogin.status, 200);
  });
});

describe('page guard', () => {
  it('redirects an anonymous visitor to the login page', async () => {
    const response = await request(app).get('/dashboard.html');

    assert.equal(response.status, 302);
    assert.match(response.headers.location, /^\/login\.html\?next=/);
  });

  it('serves a page to a signed-in admin', async () => {
    const { agent } = await signIn();
    const response = await agent.get('/dashboard.html');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.match(response.text, /Care Attendance/);
  });

  it('serves the login page to anyone', async () => {
    const response = await request(app).get('/login.html');

    assert.equal(response.status, 200);
    assert.match(response.text, /Sign in to start your session/);
  });

  it('serves the reset page without a referrer, so the token cannot leak', async () => {
    const response = await request(app).get('/reset-password.html?token=abc');

    assert.equal(response.status, 200);
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
  });

  it('serves the forgot password page to anyone', async () => {
    const response = await request(app).get('/forgot-password.html');

    assert.equal(response.status, 200);
    assert.match(response.text, /Reset your administrator password/);
  });
});

describe('security headers', () => {
  it('sets a strict content security policy', async () => {
    const response = await request(app).get('/login.html');

    const csp = response.headers['content-security-policy'];
    assert.ok(csp, 'a CSP header is expected');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  });

  it('trusts a single reverse proxy', () => {
    assert.equal(app.get('trust proxy'), 1);
  });
});
