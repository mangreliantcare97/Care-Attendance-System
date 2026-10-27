import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  createAdmin,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  signIn,
  startTestApp,
  type TestContext,
} from './helpers.ts';
import { addDays, today } from '../src/utils/dates.ts';
import { env } from '../src/config/env.ts';

let context: TestContext;
let app: TestContext['app'];
let agent: Awaited<ReturnType<typeof signIn>>['agent'];
let csrf = '';
let adminId = '';
let activeLocationId = '';
let inactiveLocationId = '';

async function createEntry(input: {
  name: string;
  userType?: 'staff' | 'service_user' | 'visitor';
  direction?: 'in' | 'out';
  date?: string;
  enteredTime?: string;
  locationId?: string;
  notes?: string;
}) {
  const { EntryModel } = await import('../src/models/Entry.ts');
  const entry = await EntryModel.create({
    userType: input.userType ?? 'staff',
    name: input.name,
    direction: input.direction ?? 'in',
    enteredTime: input.enteredTime ?? '09:15',
    date: input.date ?? addDays(today(env.appTimezone), -1),
    receivedAt: new Date(),
    locationId: new Types.ObjectId(input.locationId ?? activeLocationId),
    notes: input.notes ?? 'Admin test record',
  });
  return entry;
}

before(async () => {
  context = await startTestApp();
  app = context.app;
  const owner = await createAdmin({
    name: 'Entries Test Owner',
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  adminId = String(owner._id);
  const { LocationModel } = await import('../src/models/Location.ts');
  const active = await LocationModel.create({
    name: 'Admin Test Active Site',
    postcode: 'HA1 1AA',
    active: true,
    sortOrder: 1,
    createdBy: owner._id,
  });
  const inactive = await LocationModel.create({
    name: 'Admin Test Inactive Site',
    postcode: 'HA1 1AB',
    active: false,
    sortOrder: 2,
    createdBy: owner._id,
  });
  activeLocationId = String(active._id);
  inactiveLocationId = String(inactive._id);
  const session = await signIn(app);
  assert.equal(session.response.status, 200);
  agent = session.agent;
  csrf = session.csrf;
});

after(async () => {
  await context?.stop();
});

describe('GET /api/entries', () => {
  it('filters by name, type, direction, location and date range; sorts and paginates', async () => {
    const todayDate = today(env.appTimezone);
    await createEntry({
      name: 'Filtered Ada Alpha',
      userType: 'staff',
      direction: 'in',
      date: todayDate,
      enteredTime: '08:10',
    });
    await createEntry({
      name: 'Filtered Ada Bravo',
      userType: 'visitor',
      direction: 'out',
      date: todayDate,
      enteredTime: '12:30',
    });
    await createEntry({
      name: 'Filtered Grace Hopper',
      userType: 'staff',
      direction: 'in',
      date: addDays(todayDate, -1),
    });

    const filtered = await agent.get('/api/entries').query({
      search: 'Filtered Ada',
      userType: 'staff',
      direction: 'in',
      locationId: activeLocationId,
      dateFrom: todayDate,
      dateTo: todayDate,
      sort: 'time',
      order: 'asc',
      page: 1,
      perPage: 1,
    });
    assert.equal(filtered.status, 200);
    assert.deepEqual(filtered.body.data.entries.map((entry: { name: string }) => entry.name), [
      'Filtered Ada Alpha',
    ]);
    assert.deepEqual(filtered.body.meta.pagination, {
      total: 1,
      page: 1,
      perPage: 1,
      pages: 1,
    });

    const sorted = await agent.get('/api/entries').query({
      search: 'Filtered Ada',
      sort: 'time',
      order: 'asc',
      perPage: 10,
    });
    assert.deepEqual(sorted.body.data.entries.map((entry: { name: string }) => entry.name), [
      'Filtered Ada Alpha',
      'Filtered Ada Bravo',
    ]);
  });

  it('rejects invalid date ranges and sort fields', async () => {
    const reversed = await agent.get('/api/entries').query({
      dateFrom: '2026-10-28',
      dateTo: '2026-10-27',
    });
    assert.equal(reversed.status, 422);
    assert.equal(reversed.body.error.code, 'validation_error');

    const invalidSort = await agent.get('/api/entries').query({ sort: 'password' });
    assert.equal(invalidSort.status, 422);
  });

  it('keeps the list and single-entry reads protected', async () => {
    const anonymousList = await request(app).get('/api/entries');
    const anonymousSingle = await request(app).get('/api/entries/000000000000000000000000');
    assert.equal(anonymousList.status, 401);
    assert.equal(anonymousSingle.status, 401);

    const entry = await createEntry({ name: 'Entry Detail Read' });
    const visible = await agent.get(`/api/entries/${String(entry._id)}`);
    assert.equal(visible.status, 200);
    assert.equal(visible.body.data.entry.name, 'Entry Detail Read');

    const missing = await agent.get('/api/entries/000000000000000000000000');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'entry_not_found');
  });
});

describe('PATCH and DELETE /api/entries/:id', () => {
  it('edits fields, permits an inactive historical location and records the acting admin', async () => {
    const entry = await createEntry({ name: 'Entry To Correct' });
    const response = await agent
      .patch(`/api/entries/${String(entry._id)}`)
      .set('X-CSRF-Token', csrf)
      .send({
        userType: 'visitor',
        name: 'Corrected Entry Name',
        direction: 'out',
        enteredTime: '17:45',
        date: '2026-10-26',
        locationId: inactiveLocationId,
        notes: 'Corrected note',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.entry.name, 'Corrected Entry Name');
    assert.equal(response.body.data.entry.userType, 'visitor');
    assert.equal(response.body.data.entry.direction, 'out');
    assert.equal(response.body.data.entry.enteredTime, '17:45');
    assert.equal(response.body.data.entry.date, '2026-10-26');
    assert.equal(response.body.data.entry.location.id, inactiveLocationId);
    assert.equal(response.body.data.entry.notes, 'Corrected note');

    const { EntryModel } = await import('../src/models/Entry.ts');
    const saved = await EntryModel.findById(entry._id).lean();
    assert.equal(saved?.updatedBy?.toString(), adminId);
  });

  it('validates edits and soft-deletes records with an administrator audit', async () => {
    const entry = await createEntry({ name: 'Entry To Archive' });
    const invalidUpdate = await agent
      .patch(`/api/entries/${String(entry._id)}`)
      .set('X-CSRF-Token', csrf)
      .send({ date: '2026-99-99' });
    assert.equal(invalidUpdate.status, 422);

    const deletion = await agent
      .delete(`/api/entries/${String(entry._id)}`)
      .set('X-CSRF-Token', csrf);
    assert.equal(deletion.status, 200);
    assert.deepEqual(deletion.body.data, { deleted: true });

    const { EntryModel } = await import('../src/models/Entry.ts');
    const saved = await EntryModel.findById(entry._id).lean();
    assert.ok(saved?.deletedAt);
    assert.ok(saved?.deletedBy);

    const listed = await agent.get('/api/entries').query({ search: 'Entry To Archive' });
    assert.equal(listed.body.meta.pagination.total, 0);

    const repeated = await agent
      .delete(`/api/entries/${String(entry._id)}`)
      .set('X-CSRF-Token', csrf);
    assert.equal(repeated.status, 404);
  });
});

describe('GET /api/entries/export.csv', () => {
  it('exports all matching rows with formula-safe CSV escaping', async () => {
    const entry = await createEntry({ name: '=2+2', notes: 'safe, "quoted" note' });
    const response = await agent.get('/api/entries/export.csv').query({
      search: '=2+2',
      locationId: activeLocationId,
    });

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(response.headers['content-disposition'], /attachment; filename="care-attendance-entries-/);
    assert.ok(response.text.startsWith('\uFEFF'));
    assert.ok(response.text.includes(`,'=2+2`));
    assert.ok(response.text.includes('"safe, ""quoted"" note"'));
  });
});

describe('GET /api/dashboard', () => {
  it('returns timezone-aware metrics, seven-day trend, user-type chart data and recent entries', async () => {
    const date = today(env.appTimezone);
    await createEntry({
      name: 'Dashboard Check In',
      userType: 'staff',
      direction: 'in',
      date,
    });
    await createEntry({
      name: 'Dashboard Check Out',
      userType: 'visitor',
      direction: 'out',
      date,
    });

    const response = await agent.get('/api/dashboard');
    assert.equal(response.status, 200);
    const summary = response.body.data;
    assert.equal(summary.date, date);
    assert.ok(summary.metrics.entriesToday >= 2);
    assert.ok(summary.metrics.checkInsToday >= 1);
    assert.ok(summary.metrics.checkOutsToday >= 1);
    assert.equal(summary.metrics.activeLocations, 1);
    assert.equal(summary.trend.length, 7);
    assert.equal(summary.trend[6].date, date);
    assert.ok(summary.trend[6].count >= 2);
    assert.deepEqual(summary.todayByUserType.map((item: { userType: string }) => item.userType), [
      'staff',
      'service_user',
      'visitor',
    ]);
    assert.ok(summary.recentEntries.some((item: { name: string }) => item.name === 'Dashboard Check In'));
  });

  it('does not expose dashboard data to anonymous callers', async () => {
    const response = await request(app).get('/api/dashboard');
    assert.equal(response.status, 401);
  });
});
