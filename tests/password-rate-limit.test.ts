/**
 * The rate limit of the password endpoints.
 *
 * Its own file, because the test runner gives every file its own process —
 * and therefore its own database connection.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createAdmin, startTestApp, type TestContext } from './helpers.ts';

let context: TestContext;

const ATTEMPTS = 3;

before(async () => {
  context = await startTestApp({ passwordLimit: ATTEMPTS, perEmailLimit: ATTEMPTS });
  await createAdmin({ name: 'Owner', email: 'owner@example.com', password: 'correct-horse-battery' });
});

after(async () => {
  await context?.stop();
});

describe('the password endpoint rate limit', () => {
  it('blocks further requests once the budget is used up', async () => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const response = await request(context.app)
        .post('/api/auth/forgot-password')
        .send({ email: 'owner@example.com' });

      assert.equal(response.status, 200, `attempt ${attempt + 1} should still be answered`);
    }

    const blocked = await request(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'owner@example.com' });

    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'too_many_requests');
  });

  it('counts every request, including the ones for an unknown address', async () => {
    const response = await request(context.app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    assert.equal(response.status, 429);
  });

  it('limits the reset endpoint as well', async () => {
    const agent = request.agent(context.app);

    // The ip budget is already used up, so the reset endpoint is blocked too.
    const response = await agent
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'a-brand-new-password' });

    assert.equal(response.status, 429);
  });
});
