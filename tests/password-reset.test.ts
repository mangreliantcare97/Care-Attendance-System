/**
 * Password reset: the answer is always the same, the token is single use and
 * every session of the administrator is revoked afterwards.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdmin,
  createStudent,
  signIn,
  startTestApp,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  type TestContext,
} from './helpers.ts';

let context: TestContext;
let sent: Array<{ to: string; subject: string; text: string; html: string }> = [];

// The mailer module reads the environment, so it is imported dynamically —
// after the environment has been prepared.
process.env.MAIL_PROVIDER = 'console';
const mailerModule = await import('../src/services/mailer.ts');

before(async () => {
  context = await startTestApp();

  sent = [];
  mailerModule.setMailer({
    async send(message) {
      sent.push(message);
    },
  });

  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  mailerModule.setMailer(null);
  await context?.stop();
});

/** Ask for a reset link and return the token that was mailed out. */
async function requestToken(email: string): Promise<string | null> {
  sent = [];
  const response = await (await import('supertest')).default(context.app)
    .post('/api/auth/forgot-password')
    .send({ email });

  assert.equal(response.status, 200);

  if (!sent.length) return null;

  const link = /https?:\/\/[^\s]*reset-password\.html\?token=([a-f0-9]+)/.exec(sent[0].text);
  return link ? link[1] : null;
}

describe('forgot password', () => {
  it('answers with the same message for an unknown address', async () => {
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    assert.equal(response.status, 200);
    assert.equal(
      response.body.data.message,
      'If an administrator account exists for that address, a password reset link has been sent.',
    );
  });

  it('answers with the same message for an inactive administrator', async () => {
    await createAdmin({
      name: 'Inactive',
      email: 'inactive@example.com',
      password: 'another-secret-1',
      isActive: false,
    });

    sent = [];
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'inactive@example.com' });

    assert.equal(response.status, 200);
    assert.equal(
      response.body.data.message,
      'If an administrator account exists for that address, a password reset link has been sent.',
    );
    assert.equal(sent.length, 0, 'an inactive administrator must not receive a mail');
  });

  it('answers with the same message for an active administrator and sends a mail', async () => {
    sent = [];
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: OWNER_EMAIL });

    assert.equal(response.status, 200);
    assert.equal(
      response.body.data.message,
      'If an administrator account exists for that address, a password reset link has been sent.',
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, OWNER_EMAIL);
    assert.match(sent[0].text, /reset-password\.html\?token=/);
  });

  it('never sends a mail for a student address', async () => {
    await createStudent({ name: 'Student With Mail', email: 'student@example.com' });

    sent = [];
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'student@example.com' });

    assert.equal(response.status, 200);
    assert.equal(sent.length, 0, 'students must never be able to trigger a reset');
  });

  it('validates the payload', async () => {
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'not-an-email' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');
  });

  it('stores only the hash of the token', async () => {
    const token = await requestToken(OWNER_EMAIL);
    assert.ok(token);

    const { PasswordResetModel } = await import('../src/models/PasswordReset.ts');
    const records = await PasswordResetModel.find({}).lean();

    assert.equal(records.length, 1);
    assert.notEqual(records[0].tokenHash, token);
    assert.equal(records[0].tokenHash.length, 64);
  });

  it('removes the older tokens when a new one is requested', async () => {
    const first = await requestToken(OWNER_EMAIL);
    const second = await requestToken(OWNER_EMAIL);

    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);

    const { PasswordResetModel } = await import('../src/models/PasswordReset.ts');
    assert.equal(await PasswordResetModel.countDocuments({}), 1);
  });
});

describe('reset password', () => {
  it('changes the password and signs every session out', async () => {
    const token = await requestToken(OWNER_EMAIL);
    assert.ok(token);

    // An open session before the reset.
    const { agent } = await signIn(context.app);
    assert.equal((await agent.get('/api/auth/me')).status, 200);

    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' });

    assert.equal(response.status, 200);
    assert.ok(response.body.data.revokedSessions >= 1);

    // The old session is gone.
    assert.equal((await agent.get('/api/auth/me')).status, 401);

    // The new password works, the old one does not.
    const login = await (await import('supertest')).default(context.app)
      .post('/api/auth/login')
      .send({ email: OWNER_EMAIL, password: 'a-brand-new-password' });
    assert.equal(login.status, 200);

    const oldLogin = await (await import('supertest')).default(context.app)
      .post('/api/auth/login')
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
    assert.equal(oldLogin.status, 401);

    // Put the password back for the other tests.
    await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD }).catch(async () => {
      const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');
      await AdminModel.updateOne(
        { email: OWNER_EMAIL },
        { $set: { password: await hashPassword(OWNER_PASSWORD) } },
      );
    });
  });

  it('does not sign the administrator in', async () => {
    const admin = await createAdmin({
      name: 'Fresh Admin',
      email: 'fresh@example.com',
      password: 'another-secret-1',
    });

    const token = await requestToken('fresh@example.com');
    assert.ok(token);

    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'yet-another-password' });

    assert.equal(response.status, 200);

    // No session cookie was handed out.
    assert.equal(response.headers['set-cookie'], undefined);
    void admin;
  });

  it('refuses a token that was already used', async () => {
    const admin = await createAdmin({
      name: 'Single Use',
      email: 'singleuse@example.com',
      password: 'another-secret-1',
    });

    const token = await requestToken('singleuse@example.com');
    assert.ok(token);

    const first = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'first-new-password' });
    assert.equal(first.status, 200);

    const second = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'second-new-password' });
    assert.equal(second.status, 400);
    assert.equal(second.body.error.code, 'invalid_token');

    void admin;
  });

  it('refuses a forged token', async () => {
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'a-brand-new-password' });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'invalid_token');
  });

  it('refuses an expired token', async () => {
    const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');
    const { PasswordResetModel } = await import('../src/models/PasswordReset.ts');
    const { hashToken } = await import('../src/services/passwordReset.ts');

    const admin = await AdminModel.create({
      name: 'Expired',
      email: 'expired@example.com',
      password: await hashPassword('another-secret-1'),
      role: 'admin',
      isActive: true,
    });

    await PasswordResetModel.create({
      adminId: admin._id,
      tokenHash: hashToken('b'.repeat(64)),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token: 'b'.repeat(64), password: 'a-brand-new-password' });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'invalid_token');
  });

  it('applies the same password policy as when an administrator is created', async () => {
    const response = await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token: 'c'.repeat(64), password: 'short' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');
  });

  it('sends a notice after the password was changed', async () => {
    const admin = await createAdmin({
      name: 'Notified',
      email: 'notified@example.com',
      password: 'another-secret-1',
    });

    const token = await requestToken('notified@example.com');
    assert.ok(token);

    sent = [];
    await (await import('supertest')).default(context.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' });

    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /password was changed/i);
    void admin;
  });
});

describe('the mailer', () => {
  it('does nothing with the "none" provider', async () => {
    const original = console.info;
    let logged = 0;
    console.info = () => {
      logged += 1;
    };

    try {
      await mailerModule.noneMailer.send({ to: 'a@example.com', subject: 'x', text: 'y', html: '<p>y</p>' });
    } finally {
      console.info = original;
    }

    assert.equal(logged, 0);
  });

  it('prints the message with the "console" provider', async () => {
    const original = console.info;
    let logged = '';
    console.info = (...args: unknown[]) => {
      logged += args.join(' ');
    };

    try {
      await mailerModule.consoleMailer.send({
        to: 'a@example.com',
        subject: 'Reset your password',
        text: 'the link',
        html: '<p>the link</p>',
      });
    } finally {
      console.info = original;
    }

    assert.match(logged, /Reset your password/);
    assert.match(logged, /the link/);
  });

  it('builds the mailer from MAIL_PROVIDER', async () => {
    assert.equal(mailerModule.createMailer(), mailerModule.consoleMailer);
  });

  it('calls the Cloudflare REST API with the documented field names', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ success: true, result: { message_id: 'abc' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const mailer = mailerModule.createCloudflareMailer({
      accountId: 'account-123',
      apiToken: 'secret-token',
      from: 'Human Resource <noreply@example.com>',
      fetchImpl: fakeFetch,
    });

    await mailer.send({
      to: 'admin@example.com',
      subject: 'Reset your password\r\nBcc: evil@example.com',
      text: 'the link',
      html: '<p>the link</p>',
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'https://api.cloudflare.com/client/v4/accounts/account-123/email/sending/send',
    );
    assert.equal(calls[0].init.method, 'POST');

    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer secret-token');
    assert.equal(headers['Content-Type'], 'application/json');

    const body = JSON.parse(String(calls[0].init.body));
    // The REST API uses "address" (the Workers binding uses "email") …
    assert.deepEqual(body.from, { address: 'noreply@example.com', name: 'Human Resource' });
    assert.deepEqual(body.to, ['admin@example.com']);
    // … and "reply_to" in snake_case.
    assert.equal(body.reply_to, 'noreply@example.com');
    // A header must never carry a line break.
    assert.equal(body.subject.includes('\n'), false);
    assert.equal(body.subject.includes('\r'), false);
  });

  it('fails when the Cloudflare provider is not configured', async () => {
    const mailer = mailerModule.createCloudflareMailer({
      accountId: '',
      apiToken: '',
      from: '',
      fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => mailer.send({ to: 'admin@example.com', subject: 'x', text: 'y', html: '<p>y</p>' }),
      /not configured/i,
    );
  });
});
