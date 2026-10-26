/**
 * The login rate limiter.
 *
 * This lives in its own file because the test runner gives every file its own
 * process — and therefore its own MongoDB connection.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestApp, type TestContext } from './helpers.ts';

let context: TestContext;

const ATTEMPTS = 3;

before(async () => {
  context = await startTestApp({ loginLimit: ATTEMPTS });
});

after(async () => {
  await context?.stop();
});

describe('login rate limiting', () => {
  it('blocks further attempts once the budget is used up', async () => {
    const agent = request.agent(context.app);

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const response = await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'wrong-password' });

      assert.equal(response.status, 401, `attempt ${attempt + 1} should still be answered`);
    }

    const blocked = await agent
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'wrong-password' });

    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'too_many_requests');
  });

  it('counts every request, including the ones with bad credentials', async () => {
    const response = await request(context.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

    assert.equal(response.status, 429);
  });
});
