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
  context = await startTestApp({ loginLimit: ATTEMPTS, publicLimit: ATTEMPTS });
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

describe('public rate limiting', () => {
  it('shares one generous budget between both public endpoints', async () => {
    // The locations feed and the entry submission use the same limiter, so
    // both answer normally until the budget is gone.
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const response = await request(context.app).get('/api/public/locations');
      assert.equal(response.status, 200, `locations attempt ${attempt + 1}`);
    }

    const blockedLocations = await request(context.app).get('/api/public/locations');
    assert.equal(blockedLocations.status, 429);
    assert.equal(blockedLocations.body.error.code, 'too_many_requests');
    assert.match(blockedLocations.body.error.message, /wait a few minutes/i);

    const blockedEntry = await request(context.app)
      .post('/api/public/entries')
      .send({
        userType: 'visitor',
        name: 'Rate Limited',
        direction: 'in',
        time: '09:00',
        locationId: '000000000000000000000000',
        notes: 'Blocked by the limiter before validation.',
      });
    assert.equal(blockedEntry.status, 429);
    assert.equal(blockedEntry.body.error.code, 'too_many_requests');
  });
});
