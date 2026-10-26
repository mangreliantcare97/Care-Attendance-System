/**
 * The public check-in API and the minimum admin surface behind it.
 *
 * These tests deliberately use a different supertest request for every call
 * (no agent), so any hidden session requirement or Set-Cookie would show up.
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

let context: TestContext;
let app: TestContext['app'];
let activeLocation: { id: string; name: string };
let inactiveLocation: { id: string; name: string };

function publicEntry(name: string, locationId: string, direction = 'in') {
  return request(app).post('/api/public/entries').send({ name, locationId, direction });
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
  const active = await LocationModel.create({
    name: 'Main Office',
    postcode: 'AB1 2CD',
    isActive: true,
    sortOrder: 1,
    createdBy: owner._id,
  });
  const inactive = await LocationModel.create({
    name: 'Closed Site',
    postcode: 'AB1 2CE',
    isActive: false,
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
  it('returns only active locations, only id and name, and no cookies', async () => {
    const response = await request(app).get('/api/public/locations');

    assert.equal(response.status, 200);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.body.success, true);

    const locations = response.body.data.locations as Array<Record<string, unknown>>;
    const ids = locations.map((location) => location.id);
    assert.ok(ids.includes(activeLocation.id));
    assert.equal(ids.includes(inactiveLocation.id), false);

    for (const location of locations) {
      assert.deepEqual(Object.keys(location).sort(), ['id', 'name']);
      assert.equal(typeof location.id, 'string');
      assert.equal(typeof location.name, 'string');
    }

    assert.equal(locations[0]?.name, 'Main Office');
    assert.equal(JSON.stringify(response.body).includes('postcode'), false);
  });
});

describe('POST /api/public/entries', () => {
  it('records an active-location check-in without a session or cookie', async () => {
    const { EntryModel } = await import('../src/models/Entry.ts');
    const before = await EntryModel.countDocuments();

    const response = await publicEntry('  Ada Lovelace  ', activeLocation.id, 'in');

    assert.equal(response.status, 201);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.entry.name, 'Ada Lovelace');
    assert.equal(response.body.data.entry.direction, 'in');
    assert.deepEqual(response.body.data.entry.location, activeLocation);
    assert.equal(Object.prototype.hasOwnProperty.call(response.body.data.entry.location, 'note'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(response.body.data.entry.location, 'isActive'), false);
    assert.ok(response.body.data.entry.occurredAt);

    assert.equal(await EntryModel.countDocuments(), before + 1);
  });

  it('records a check-out as well', async () => {
    const response = await publicEntry('Grace Hopper', activeLocation.id, 'out');

    assert.equal(response.status, 201);
    assert.equal(response.body.data.entry.direction, 'out');
  });

  it('rejects an inactive location without creating an entry', async () => {
    const { EntryModel } = await import('../src/models/Entry.ts');
    const before = await EntryModel.countDocuments();

    const response = await publicEntry('Inactive Person', inactiveLocation.id);

    assert.equal(response.status, 422);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'invalid_location');
    assert.equal(await EntryModel.countDocuments(), before);
  });

  it('rejects an unknown location, a malformed id and invalid fields', async () => {
    const unknown = await publicEntry('Person', '000000000000000000000000');
    assert.equal(unknown.status, 422);
    assert.equal(unknown.body.error.code, 'invalid_location');

    const malformed = await publicEntry('Person', 'not-an-object-id');
    assert.equal(malformed.status, 422);
    assert.equal(malformed.body.error.code, 'validation_error');

    for (const payload of [
      { name: '', locationId: activeLocation.id, direction: 'in' },
      { name: '   ', locationId: activeLocation.id, direction: 'in' },
      { name: 'Person', locationId: activeLocation.id, direction: 'sideways' },
    ]) {
      const response = await request(app).post('/api/public/entries').send(payload);
      assert.equal(response.status, 422, JSON.stringify(payload));
      assert.equal(response.body.error.code, 'validation_error');
    }
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
    assert.ok(names.includes('Main Office'));
    assert.ok(names.includes('Closed Site'));

    const created = await agent
      .post('/api/locations')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'North Clinic', postcode: 'zz11zz', isActive: true, sortOrder: 3 });

    assert.equal(created.status, 200);
    assert.equal(created.body.data.location.name, 'North Clinic');
    assert.equal(created.body.data.location.postcode, 'ZZ1 1ZZ');
    assert.equal(created.body.data.location.isActive, true);
    assert.equal(created.body.data.location.entryCount, 0);
    assert.equal(created.body.data.location.sortOrder, 3);

    const publicList = await request(app).get('/api/public/locations');
    const publicIds = publicList.body.data.locations.map((location: { id: string }) => location.id);
    assert.ok(publicIds.includes(created.body.data.location.id));
  });

  it('lists public entries for the Entries page with the location name', async () => {
    const created = await publicEntry('Katherine Johnson', activeLocation.id, 'in');
    assert.equal(created.status, 201);

    const { agent } = await signIn(app);
    const list = await agent.get('/api/entries?page=1&perPage=20');

    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);
    const entry = list.body.data.entries.find(
      (item: { id: string }) => item.id === created.body.data.entry.id,
    );
    assert.ok(entry);
    assert.equal(entry.name, 'Katherine Johnson');
    assert.equal(entry.direction, 'in');
    assert.deepEqual(entry.location, activeLocation);
    assert.ok(list.body.meta.pagination.total >= 1);
  });
});
