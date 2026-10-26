/**
 * The locations seeder and the public locations feed.
 *
 * The seed file is the real one used in production, so these tests also
 * protect the exact address labels from accidental edits.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createAdmin, startTestApp, type TestContext } from './helpers.ts';

let context: TestContext;
let app: TestContext['app'];
let adminId = '';

before(async () => {
  context = await startTestApp();
  app = context.app;

  const admin = await createAdmin({
    name: 'Locations Owner',
    email: 'locations-owner@example.com',
    password: 'another-secret-1',
  });
  adminId = String(admin._id);

  const { LocationModel } = await import('../src/models/Location.ts');
  await LocationModel.init();
});

after(async () => {
  await context?.stop();
});

describe('seed:locations', () => {
  it('inserts all 18 the first time and nothing the second time', async () => {
    const { loadSeedLocations, upsertSeedLocations } = await import('../seed/seed-locations.ts');
    const entries = loadSeedLocations();

    assert.equal(entries.length, 18);
    assert.equal(entries[0]?.name, 'Reliant House, 226 Imperial Drive, Harrow, HA2 7HJ');

    const first = await upsertSeedLocations(entries, adminId);
    assert.equal(first.inserted, 18);
    assert.equal(first.existing, 0);
    assert.equal(first.total, 18);
    assert.deepEqual(first.invalidPostcodes, []);

    const second = await upsertSeedLocations(entries, adminId);
    assert.equal(second.inserted, 0);
    assert.equal(second.existing, 18);
    assert.equal(second.total, 18);
  });

  it('keeps both Chandos Road and both Church Road locations at one postcode', async () => {
    const { LocationModel } = await import('../src/models/Location.ts');

    const chandos = await LocationModel.find({ postcode: 'HA1 4QX' }).sort({ name: 1 }).lean();
    assert.deepEqual(
      chandos.map((location) => location.name),
      ['33 Chandos Road, Harrow, HA1 4QX', '35 Chandos Road, Harrow, HA1 4QX'],
    );

    const church = await LocationModel.find({ postcode: 'UB3 2LS' }).sort({ name: 1 }).lean();
    assert.deepEqual(
      church.map((location) => location.name),
      ['178 Church Road, Hayes, UB3 2LS', '180 Church Road, Hayes, UB3 2LS'],
    );
  });

  it('stores normalised postcodes, the seed order and the author', async () => {
    const { normalisePostcode, isValidUkPostcode } = await import('../src/utils/postcode.ts');
    const { LocationModel } = await import('../src/models/Location.ts');

    assert.equal(normalisePostcode('ha14qx'), 'HA1 4QX');
    assert.equal(normalisePostcode(' ha1  4qx '), 'HA1 4QX');
    assert.equal(normalisePostcode('tw59be'), 'TW5 9BE');
    assert.equal(isValidUkPostcode('HA1 4QX'), true);
    assert.equal(isValidUkPostcode('W12 0BL'), true);
    assert.equal(isValidUkPostcode('NOT A CODE'), false);

    const first = await LocationModel.findOne({ postcode: 'HA2 7HJ' }).lean();
    assert.ok(first);
    assert.equal(first.sortOrder, 0);
    assert.equal(first.isActive, true);
    assert.equal(String(first.createdBy), adminId);
    assert.equal(first.name, 'Reliant House, 226 Imperial Drive, Harrow, HA2 7HJ');
  });

  it('never overwrites a location an administrator changed', async () => {
    const { loadSeedLocations, upsertSeedLocations } = await import('../seed/seed-locations.ts');
    const { LocationModel } = await import('../src/models/Location.ts');

    await LocationModel.updateOne(
      { postcode: 'HA2 7HJ' },
      { $set: { isActive: false, sortOrder: 99 } },
    );

    const summary = await upsertSeedLocations(loadSeedLocations(), adminId);
    assert.equal(summary.inserted, 0);
    assert.equal(summary.existing, 18);

    const edited = await LocationModel.findOne({ postcode: 'HA2 7HJ' }).lean();
    assert.equal(edited?.isActive, false);
    assert.equal(edited?.sortOrder, 99);

    // Restore it for the endpoint test.
    await LocationModel.updateOne(
      { postcode: 'HA2 7HJ' },
      { $set: { isActive: true, sortOrder: 0 } },
    );
  });

  it('serves only active locations, only id and name, in sort order', async () => {
    const { LocationModel } = await import('../src/models/Location.ts');

    await LocationModel.create({
      name: 'Closed Annexe',
      postcode: 'ZZ9 9ZZ',
      isActive: false,
      sortOrder: 0,
      createdBy: adminId,
    });

    const response = await request(app).get('/api/public/locations');
    assert.equal(response.status, 200);
    assert.equal(response.headers['set-cookie'], undefined);

    const locations = response.body.data.locations as Array<Record<string, unknown>>;
    assert.equal(locations.length, 18);

    for (const location of locations) {
      assert.deepEqual(Object.keys(location).sort(), ['id', 'name']);
    }

    assert.equal(JSON.stringify(response.body).includes('postcode'), false);
    assert.equal(JSON.stringify(response.body).includes('sortOrder'), false);
    assert.equal(locations[0]?.name, 'Reliant House, 226 Imperial Drive, Harrow, HA2 7HJ');
    assert.equal(
      locations.some((location) => location.name === 'Closed Annexe'),
      false,
    );

    const expected = await LocationModel.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    assert.deepEqual(
      locations.map((location) => location.id),
      expected.map((location) => String(location._id)),
    );
  });
});
