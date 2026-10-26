/**
 * Calendar: HR event CRUD, the merged leave feed, inclusive end dates, BST
 * boundaries, range validation and the usual auth/CSRF rules.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  createAdmin,
  createEmployee,
  signIn,
  startTestApp,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  type TestContext,
} from './helpers.ts';

let context: TestContext;

before(async () => {
  context = await startTestApp();
  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  await context?.stop();
});

async function createEvent(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  payload: Record<string, unknown>,
) {
  return agent.post('/api/events').set('X-CSRF-Token', csrf).send(payload);
}

describe('calendar', () => {
  it('needs a session', async () => {
    const response = await request(context.app).get(
      '/api/calendar?start=2026-01-01&end=2026-01-31',
    );

    assert.equal(response.status, 401);
  });

  it('refuses event writes without a CSRF token', async () => {
    const { agent } = await signIn(context.app);

    const response = await agent.post('/api/events').send({
      type: 'meeting',
      title: 'No token',
      startDate: '2026-01-05',
      endDate: '2026-01-05',
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('creates, updates and deletes an HR event', async () => {
    const { agent, csrf } = await signIn(context.app);

    const created = await createEvent(agent, csrf, {
      type: 'meeting',
      title: 'Planning day',
      description: 'Quarterly planning',
      startDate: '2026-05-04',
      endDate: '2026-05-05',
    });
    assert.equal(created.status, 200);
    const id = created.body.data.event.id as string;
    assert.equal(created.body.data.event.endDate, '2026-05-05');

    let feed = await agent.get('/api/calendar?start=2026-05-01&end=2026-05-31');
    assert.equal(feed.status, 200);
    let item = feed.body.data.events.find((event: { id: string; kind: string }) => event.id === id);
    assert.equal(item.kind, 'hr');
    assert.equal(item.title, 'Planning day');
    assert.equal(item.start, '2026-05-04');
    // Inclusive 5 May becomes FullCalendar's exclusive 6 May.
    assert.equal(item.end, '2026-05-06');

    const updated = await agent
      .patch(`/api/events/${id}`)
      .set('X-CSRF-Token', csrf)
      .send({ title: 'Planning day (updated)', endDate: '2026-05-06' });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.event.endDate, '2026-05-06');

    feed = await agent.get('/api/calendar?start=2026-05-01&end=2026-05-31');
    item = feed.body.data.events.find((event: { id: string; kind: string }) => event.id === id);
    assert.equal(item.title, 'Planning day (updated)');
    assert.equal(item.end, '2026-05-07');

    const deleted = await agent.delete(`/api/events/${id}`).set('X-CSRF-Token', csrf);
    assert.equal(deleted.status, 200);

    feed = await agent.get('/api/calendar?start=2026-05-01&end=2026-05-31');
    item = feed.body.data.events.find((event: { id: string; kind: string }) => event.id === id);
    assert.equal(item, undefined);

    const secondDelete = await agent.delete(`/api/events/${id}`).set('X-CSRF-Token', csrf);
    assert.equal(secondDelete.status, 404);
    assert.equal(secondDelete.body.error.code, 'event_not_found');
  });

  it('defaults a single-day event to an inclusive one-day end', async () => {
    const { agent, csrf } = await signIn(context.app);

    const created = await createEvent(agent, csrf, {
      type: 'holiday',
      title: 'Single day holiday',
      startDate: '2026-03-28',
    });

    assert.equal(created.status, 200);
    assert.equal(created.body.data.event.endDate, '2026-03-28');

    const feed = await agent.get('/api/calendar?start=2026-03-01&end=2026-03-31');
    const item = feed.body.data.events.find(
      (event: { id: string }) => event.id === created.body.data.event.id,
    );

    assert.equal(item.start, '2026-03-28');
    assert.equal(item.end, '2026-03-29');
  });

  it('keeps date-only events stable across both BST boundaries', async () => {
    const { agent, csrf } = await signIn(context.app);

    const spring = await createEvent(agent, csrf, {
      type: 'deadline',
      title: 'Spring boundary',
      startDate: '2026-03-29', // UK clocks go forward.
      endDate: '2026-03-29',
    });
    const autumn = await createEvent(agent, csrf, {
      type: 'event',
      title: 'Autumn boundary',
      startDate: '2026-10-24',
      endDate: '2026-10-26', // UK clocks go back on 25 October.
    });

    assert.equal(spring.status, 200);
    assert.equal(autumn.status, 200);

    const springFeed = await agent.get('/api/calendar?start=2026-03-01&end=2026-03-31');
    const springItem = springFeed.body.data.events.find(
      (event: { id: string }) => event.id === spring.body.data.event.id,
    );
    assert.equal(springItem.start, '2026-03-29');
    assert.equal(springItem.end, '2026-03-30');

    const autumnFeed = await agent.get('/api/calendar?start=2026-10-01&end=2026-10-31');
    const autumnItem = autumnFeed.body.data.events.find(
      (event: { id: string }) => event.id === autumn.body.data.event.id,
    );
    assert.equal(autumnItem.start, '2026-10-24');
    assert.equal(autumnItem.end, '2026-10-27');
  });

  it('merges approved leaves and leaves pending/rejected requests out', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Calendar Leave Person' });
    const base = { employeeId: String(employee._id), type: 'vacation' };

    const approved = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...base, startDate: '2026-04-06', endDate: '2026-04-08', status: 'approved' });
    assert.equal(approved.status, 200);

    await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...base, startDate: '2026-04-13', endDate: '2026-04-14', status: 'pending' });
    await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...base, startDate: '2026-04-20', endDate: '2026-04-21', status: 'rejected' });

    const feed = await agent.get('/api/calendar?start=2026-04-01&end=2026-04-30');
    const leaveItems = feed.body.data.events.filter(
      (event: { kind: string; employeeId?: string }) =>
        event.kind === 'leave' && event.employeeId === String(employee._id),
    );

    assert.equal(leaveItems.length, 1);
    assert.equal(leaveItems[0].id, approved.body.data.leave.id);
    assert.match(leaveItems[0].title, /Calendar Leave Person/);
    assert.match(leaveItems[0].title, /Vacation/);
    assert.equal(leaveItems[0].start, '2026-04-06');
    assert.equal(leaveItems[0].end, '2026-04-09');
    assert.equal(leaveItems[0].url, '/leaves.html');
  });

  it('filters HR events by overlap and validates the feed range', async () => {
    const { agent, csrf } = await signIn(context.app);

    const outside = await createEvent(agent, csrf, {
      type: 'event',
      title: 'Outside range',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const spanning = await createEvent(agent, csrf, {
      type: 'event',
      title: 'Spans the range',
      startDate: '2026-07-30',
      endDate: '2026-08-02',
    });
    assert.equal(outside.status, 200);
    assert.equal(spanning.status, 200);

    const feed = await agent.get('/api/calendar?start=2026-08-01&end=2026-08-01');
    const ids = feed.body.data.events.map((event: { id: string }) => event.id);
    assert.equal(ids.includes(outside.body.data.event.id), true);
    assert.equal(ids.includes(spanning.body.data.event.id), true);

    const reversed = await agent.get('/api/calendar?start=2026-02-10&end=2026-02-09');
    assert.equal(reversed.status, 422);
    assert.equal(reversed.body.error.code, 'calendar_range_invalid');

    const tooLong = await agent.get('/api/calendar?start=2026-01-01&end=2027-02-05');
    assert.equal(tooLong.status, 422);
    assert.equal(tooLong.body.error.code, 'calendar_range_too_long');

    const exactly400 = await agent.get('/api/calendar?start=2026-01-01&end=2027-02-04');
    assert.equal(exactly400.status, 200);

    const missing = await agent.get('/api/calendar?start=2026-01-01');
    assert.equal(missing.status, 422);
    assert.equal(missing.body.error.code, 'validation_error');

    const invalid = await agent.get('/api/calendar?start=2026-13-01&end=2026-13-02');
    assert.equal(invalid.status, 422);
  });

  it('refuses a reversed event range and an unknown type', async () => {
    const { agent, csrf } = await signIn(context.app);

    const reversed = await createEvent(agent, csrf, {
      type: 'event',
      title: 'Reversed',
      startDate: '2026-09-10',
      endDate: '2026-09-09',
    });
    assert.equal(reversed.status, 422);
    assert.equal(reversed.body.error.code, 'event_range_invalid');

    const unknownType = await createEvent(agent, csrf, {
      type: 'party',
      title: 'Unknown type',
      startDate: '2026-09-10',
      endDate: '2026-09-10',
    });
    assert.equal(unknownType.status, 422);
    assert.equal(unknownType.body.error.code, 'validation_error');
  });

});
