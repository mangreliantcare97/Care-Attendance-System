/**
 * The public check-in API — everything an anonymous visitor can do, and the
 * abuse protections around it.
 *
 * Every call uses a fresh supertest request (never an agent), so a hidden
 * session requirement or a stray `Set-Cookie` fails the test.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  createAdmin,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  signIn,
  startTestApp,
  type TestContext,
} from './helpers.ts';
import { env } from '../src/config/env.ts';

let context: TestContext;
let app: TestContext['app'];
let activeLocation: { id: string; name: string };
let inactiveLocation: { id: string; name: string };

/** Each test uses its own name so the duplicate guard never crosses tests. */
function entryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userType: 'staff',
    name: 'Ada Lovelace',
    direction: 'in',
    time: anHourAgo(),
    locationId: activeLocation?.id,
    notes: 'Start of shift',
    ...overrides,
  };
}

function post(body: Record<string, unknown>) {
  return request(app).post('/api/public/entries').send(body);
}

/** The current clock in APP_TIMEZONE, as `HH:mm`. */
function londonNow(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: env.appTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/** One hour before now — always in the past, so always accepted. */
function anHourAgo(): string {
  return londonNow(new Date(Date.now() - 60 * 60 * 1000));
}

/** `HH:mm` plus a number of minutes, wrapped into the same day. */
function plusMinutes(clock: string, minutes: number): string {
  const [hour, minute] = clock.split(':').map(Number);
  const total = (hour * 60 + minute + minutes + 1440 * 2) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function entryCount(): Promise<number> {
  const { EntryModel, NOT_DELETED } = await import('../src/models/Entry.ts');
  return EntryModel.countDocuments(NOT_DELETED);
}

before(async () => {
  context = await startTestApp();
  app = context.app;

  const owner = await createAdmin({
    name: 'Owner',
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });

  const { LocationModel } = await import('../src/models/Location.ts');
  await LocationModel.init();

  const active = await LocationModel.create({
    name: 'Main Office, 226 Imperial Drive, Harrow, HA2 7HJ',
    postcode: 'HA2 7HJ',
    active: true,
    sortOrder: 1,
    createdBy: owner._id,
  });
  const inactive = await LocationModel.create({
    name: 'Closed Site, 111 Beaconsfield Road, Southall, UB1 1BZ',
    postcode: 'UB1 1BZ',
    active: false,
    sortOrder: 2,
    createdBy: owner._id,
  });

  activeLocation = { id: String(active._id), name: active.name };
  inactiveLocation = { id: String(inactive._id), name: inactive.name };
});

after(async () => {
  await context?.stop();
});

describe('GET /api/public/locations', () => {
  it('returns only active locations, only id and name, in sort order, without cookies', async () => {
    const response = await request(app).get('/api/public/locations');

    assert.equal(response.status, 200);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.body.success, true);
    assert.deepEqual(Object.keys(response.body.data), ['locations']);
    assert.equal(response.body.meta.timezone, env.appTimezone);

    const locations = response.body.data.locations as Array<Record<string, unknown>>;
    const ids = locations.map((location) => location.id);
    assert.ok(ids.includes(activeLocation.id));
    assert.equal(ids.includes(inactiveLocation.id), false);

    for (const location of locations) {
      assert.deepEqual(Object.keys(location).sort(), ['id', 'name']);
      assert.equal(typeof location.id, 'string');
      assert.equal(typeof location.name, 'string');
    }

    const body = JSON.stringify(response.body);
    assert.equal(body.includes('postcode'), false);
    assert.equal(body.includes('sortOrder'), false);
    assert.equal(body.includes('entryCount'), false);
    assert.equal(body.includes('Closed Site'), false);
  });

  it('sorts by sortOrder and then by name', async () => {
    const { LocationModel } = await import('../src/models/Location.ts');
    const { body } = await request(app).get('/api/public/locations');
    const expected = await LocationModel.find({ active: { $ne: false } })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    assert.deepEqual(
      (body.data.locations as Array<{ id: string }>).map((location) => location.id),
      expected.map((location) => String(location._id)),
    );
  });

  it('treats a document written before the `active` flag existed as active', async () => {
    const { LocationModel } = await import('../src/models/Location.ts');
    const { ensureActiveFlags } = await import('../src/services/locations.ts');
    const { Types } = await import('mongoose');

    // Raw insert: mongoose would fill in the default, so the flag stays absent.
    const legacy = await LocationModel.collection.insertOne({
      name: 'Legacy House, 71 Westway, London, W12 0PU',
      nameKey: 'legacy house, 71 westway, london, w12 0pu',
      postcode: 'W12 0PU',
      sortOrder: 3,
      createdBy: new Types.ObjectId(),
    });

    // Before the migration runs, a missing flag already counts as active …
    const beforeMigration = await request(app).get('/api/public/locations');
    assert.equal(
      (beforeMigration.body.data.locations as Array<{ id: string }>).some(
        (location) => location.id === String(legacy.insertedId),
      ),
      true,
    );

    // … and the migration backfills it exactly once.
    assert.equal(await ensureActiveFlags(), 1);
    const stored = await LocationModel.collection.findOne({ _id: legacy.insertedId });
    assert.equal(stored?.active, true);
    assert.equal(await ensureActiveFlags(), 0);

    const afterMigration = await request(app).get('/api/public/locations');
    assert.equal(
      (afterMigration.body.data.locations as Array<{ id: string }>).some(
        (location) => location.id === String(legacy.insertedId),
      ),
      true,
    );

    await LocationModel.collection.deleteOne({ _id: legacy.insertedId });
  });
});

describe('POST /api/public/entries', () => {
  it('records a check-in without a session, a cookie or a CSRF token', async () => {
    const before = await entryCount();

    const response = await post(entryPayload({ name: '  Ada Lovelace  ' }));

    assert.equal(response.status, 201);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.body.success, true);

    // Only the six documented fields come back — nothing else.
    const entry = response.body.data.entry;
    assert.deepEqual(Object.keys(entry).sort(), ['date', 'direction', 'id', 'name', 'time']);
    assert.equal(entry.name, 'Ada Lovelace');
    assert.equal(entry.direction, 'in');
    assert.match(entry.time, /^\d{2}:\d{2}$/);
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);

    assert.equal(await entryCount(), before + 1);
  });

  it('never reveals another entry, a location or a note in the response', async () => {
    await post(entryPayload({ name: 'Grace Hopper', notes: 'Handover completed', direction: 'out' }));

    const response = await post(entryPayload({ name: 'Katherine Johnson' }));
    assert.equal(response.status, 201);

    const body = JSON.stringify(response.body);
    assert.equal(body.includes('Grace Hopper'), false);
    assert.equal(body.includes('Handover completed'), false);
    assert.equal(body.includes('notes'), false);
    assert.equal(body.includes('postcode'), false);
    assert.equal(body.includes('receivedAt'), false);
  });

  it('answers every missing field with a 400 and a field-level error', async () => {
    const fields = ['userType', 'name', 'direction', 'time', 'locationId', 'notes'];

    for (const field of fields) {
      const payload = entryPayload();
      delete payload[field];

      const response = await post(payload);
      assert.equal(response.status, 400, field);
      assert.equal(response.body.success, false, field);
      assert.equal(response.body.error.code, 'validation_error', field);

      const details = response.body.error.details as Array<{ path: string; message: string }>;
      assert.ok(Array.isArray(details) && details.length > 0, field);
      assert.ok(
        details.some((issue) => issue.path === field),
        `${field}: ${JSON.stringify(details)}`,
      );
      assert.ok(details.every((issue) => typeof issue.message === 'string' && issue.message), field);
    }
  });

  it('rejects unknown keys, invalid enums and control characters', async () => {
    const extra = await post(entryPayload({ admin: true }));
    assert.equal(extra.status, 400);
    assert.equal(extra.body.error.code, 'validation_error');

    const userType = await post(entryPayload({ userType: 'robot' }));
    assert.equal(userType.status, 400);
    assert.equal(
      (userType.body.error.details as Array<{ path: string }>).some((issue) => issue.path === 'userType'),
      true,
    );

    const direction = await post(entryPayload({ direction: 'sideways' }));
    assert.equal(direction.status, 400);
    assert.equal(
      (direction.body.error.details as Array<{ path: string }>).some((issue) => issue.path === 'direction'),
      true,
    );

    const control = await post(entryPayload({ name: 'Ann\u0007a Bell' }));
    assert.equal(control.status, 400);
    assert.equal(
      (control.body.error.details as Array<{ path: string }>).some((issue) => issue.path === 'name'),
      true,
    );

    const short = await post(entryPayload({ name: 'A' }));
    assert.equal(short.status, 400);

    const long = await post(entryPayload({ name: 'x'.repeat(81) }));
    assert.equal(long.status, 400);
  });

  it('accepts notes from 1 to 500 characters and refuses the rest', async () => {
    const before = await entryCount();

    const maximum = await post(entryPayload({ name: 'Notes Maximum', notes: 'x'.repeat(500) }));
    assert.equal(maximum.status, 201);

    const tooLong = await post(entryPayload({ name: 'Notes Too Long', notes: 'x'.repeat(501) }));
    assert.equal(tooLong.status, 400);
    assert.equal(
      (tooLong.body.error.details as Array<{ path: string }>).some((issue) => issue.path === 'notes'),
      true,
    );

    const empty = await post(entryPayload({ name: 'Notes Empty', notes: '   ' }));
    assert.equal(empty.status, 400);

    assert.equal(await entryCount(), before + 1);
  });

  it('refuses an unknown, malformed or inactive location without storing anything', async () => {
    const before = await entryCount();

    const unknown = await post(entryPayload({ name: 'Unknown Location', locationId: '000000000000000000000000' }));
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'invalid_location');
    assert.deepEqual(
      unknown.body.error.details,
      [{ path: 'locationId', message: 'Choose an active location.' }],
    );

    const inactive = await post(entryPayload({ name: 'Inactive Location', locationId: inactiveLocation.id }));
    assert.equal(inactive.status, 400);
    assert.equal(inactive.body.error.code, 'invalid_location');

    const malformed = await post(entryPayload({ name: 'Malformed Location', locationId: 'not-an-id' }));
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, 'validation_error');

    assert.equal(await entryCount(), before);
  });

  it('refuses a time later than now with 400 time_in_future', async () => {
    const now = londonNow();
    const [hour, minute] = now.split(':').map(Number);

    // Nothing can be "in the future" in the last minutes before midnight —
    // those cases are covered by the unit tests of resolveEntryDate.
    if (hour * 60 + minute <= 1440 - 150) {
      const response = await post(entryPayload({ name: 'Future Person', time: plusMinutes(now, 120) }));

      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'time_in_future');
      assert.equal(response.body.error.message, 'That time is later than now. Please check AM/PM.');
      assert.deepEqual(
        response.body.error.details,
        [{ path: 'time', message: 'That time is later than now. Please check AM/PM.' }],
      );
    }

    // An earlier time today is always fine, even hours ago.
    const earlier = await post(entryPayload({ name: 'Early Person', time: anHourAgo() }));
    assert.equal(earlier.status, 201);
  });

  it('refuses an immediate repeat of the same person, direction and location', async () => {
    const payload = entryPayload({ name: 'Duplicate Tester' });

    const first = await post(payload);
    assert.equal(first.status, 201);

    const second = await post(payload);
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'duplicate_entry');
    assert.match(second.body.error.message, /already been recorded/i);

    // The other direction and another person are not duplicates.
    assert.equal((await post({ ...payload, direction: 'out' })).status, 201);
    assert.equal((await post({ ...payload, name: 'Duplicate Tester Two' })).status, 201);
  });

  it('accepts a honeypot submission and stores nothing', async () => {
    const before = await entryCount();

    const response = await post(entryPayload({ name: 'Bot Person', company: 'Acme Ltd' }));

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.match(response.body.data.entry.name, /Bot Person/);
    assert.equal(await entryCount(), before);
  });

  it('refuses a browser request that comes from another site', async () => {
    const before = await entryCount();

    const crossSite = await request(app)
      .post('/api/public/entries')
      .set('Origin', 'https://evil.example')
      .send(entryPayload({ name: 'Cross Site' }));

    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.body.error.code, 'cross_site_request');

    const ourOrigin = await request(app)
      .post('/api/public/entries')
      .set('Origin', 'http://localhost:3000')
      .send(entryPayload({ name: 'Same Origin' }));

    assert.equal(ourOrigin.status, 201);
    assert.equal(await entryCount(), before + 1);
  });
});

describe('admin locations and entries', () => {
  it('provides the APP_BASE_URL link to the admin pages', async () => {
    const { agent } = await signIn(app);
    const response = await agent.get('/api/auth/me');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.checkInBaseUrl, 'http://localhost:3000');
    assert.equal(response.body.data.checkInUrl, 'http://localhost:3000/');
  });

  it('lists locations for the Locations page and creates one with CSRF', async () => {
    const { agent, csrf } = await signIn(app);

    const list = await agent.get('/api/locations');
    assert.equal(list.status, 200);
    const names = list.body.data.locations.map((location: { name: string }) => location.name);
    assert.ok(names.some((name: string) => name.includes('Main Office')));
    assert.ok(names.some((name: string) => name.includes('Closed Site')));

    const created = await agent
      .post('/api/locations')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'North Clinic, 14 Browning Way, Hounslow', postcode: 'tw5 9be', active: true, sortOrder: 3 });

    assert.equal(created.status, 200);
    assert.equal(created.body.data.location.name, 'North Clinic, 14 Browning Way, Hounslow');
    assert.equal(created.body.data.location.postcode, 'TW5 9BE');
    assert.equal(created.body.data.location.active, true);
    assert.equal(created.body.data.location.entryCount, 0);
    assert.equal(created.body.data.location.sortOrder, 3);

    const publicList = await request(app).get('/api/public/locations');
    const publicIds = publicList.body.data.locations.map((location: { id: string }) => location.id);
    assert.ok(publicIds.includes(created.body.data.location.id));

    // The inactive location never reaches the public form.
    assert.equal(publicIds.includes(inactiveLocation.id), false);
  });

  it('lists public entries for the Entries page with the location name', async () => {
    const created = await post(entryPayload({ name: 'Dorothy Vaughan' }));
    assert.equal(created.status, 201);

    const { agent } = await signIn(app);
    const list = await agent.get('/api/entries?page=1&perPage=20');

    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);
    const entry = list.body.data.entries.find(
      (item: { id: string }) => item.id === created.body.data.entry.id,
    );
    assert.ok(entry);
    assert.equal(entry.name, 'Dorothy Vaughan');
    assert.equal(entry.direction, 'in');
    assert.equal(entry.location.name, activeLocation.name);
    assert.ok(list.body.meta.pagination.total >= 1);
  });

  it('hides entries from anonymous callers', async () => {
    for (const path of ['/api/entries', '/api/locations', '/api/admins']) {
      const response = await request(app).get(path);
      assert.equal(response.status, 401, path);
      assert.equal(response.body.error.code, 'unauthenticated', path);
      assert.equal(response.body.data, undefined, path);
    }
  });
});
