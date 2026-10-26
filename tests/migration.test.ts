/**
 * The student terminology migration: dry run, real run and a second run.
 *
 * The migration works on raw collection names, so the test seeds the legacy
 * `employees` collection and old indexes directly.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { connectDatabase, disconnectDatabase, mongoose } from '../src/config/db.ts';
import { migrateStudents } from '../src/services/studentMigration.ts';

const execFileAsync = promisify(execFile);

let mongod: MongoMemoryServer;

function db() {
  const handle = mongoose.connection.db;
  assert.ok(handle, 'the migration test needs a database handle');
  return handle;
}

async function collectionNames(): Promise<string[]> {
  return (await db().listCollections({}, { nameOnly: true }).toArray())
    .map((info) => info.name)
    .sort();
}

async function indexSnapshot(): Promise<Record<string, string[]>> {
  const snapshot: Record<string, string[]> = {};
  for (const name of await collectionNames()) {
    snapshot[name] = (await db().collection(name).listIndexes().toArray())
      .map((index) => `${index.name}:${JSON.stringify(index.key)}${index.unique ? ':unique' : ''}`)
      .sort();
  }
  return snapshot;
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await connectDatabase(mongod.getUri());
  // Wait for mongoose's automatic index builds, then start from an empty
  // database so the seeded collections are exactly the legacy ones.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await db().dropDatabase();
});

after(async () => {
  await disconnectDatabase();
  await mongod.stop();
});

describe('migrate:students', () => {
  const firstId = new ObjectId();
  const secondId = new ObjectId();
  const thirdId = new ObjectId();

  it('seeds the legacy collections and indexes', async () => {
    await db().collection('employees').insertMany([
      { _id: firstId, name: 'Legacy One', email: 'one@example.com', status: 'active' },
      { _id: secondId, name: 'Legacy Two', email: null, status: 'inactive' },
      { _id: thirdId, name: 'Legacy Three', email: null, status: 'active' },
    ]);

    await db().collection('attendances').insertMany([
      { employeeId: firstId, date: '2026-01-05', status: 'present' },
      { employeeId: secondId, date: '2026-01-05', status: 'late' },
    ]);
    await db().collection('overtimes').insertOne({ employeeId: firstId, date: '2026-01-06', hours: 2 });
    await db().collection('leaves').insertOne({
      employeeId: firstId,
      type: 'leave',
      startDate: '2026-02-02',
      endDate: '2026-02-03',
      days: 2,
      status: 'approved',
    });
    await db().collection('leaveallowances').insertOne({ employeeId: firstId, year: 2026, allowance: 28 });
    await db().collection('auditlogs').insertOne({ employeeId: secondId, action: 'viewed' });

    await db().collection('attendances').createIndex(
      { employeeId: 1, date: 1 },
      { unique: true, name: 'employeeId_1_date_1' },
    );
    await db().collection('attendances').createIndex({ employeeId: 1, status: 1 }, { name: 'employeeId_1_status_1' });
    await db().collection('overtimes').createIndex({ employeeId: 1, date: 1 }, { name: 'employeeId_1_date_1' });
    await db().collection('leaves').createIndex(
      { employeeId: 1, status: 1, startDate: 1, endDate: 1 },
      { name: 'employeeId_1_status_1_startDate_1_endDate_1' },
    );
    await db().collection('leaveallowances').createIndex(
      { employeeId: 1, year: 1 },
      { unique: true, name: 'employeeId_1_year_1' },
    );
    await db().collection('auditlogs').createIndex({ employeeId: 1 }, { name: 'employeeId_1' });

    await db().collection('admins').insertOne({ name: 'Owner', email: 'owner@example.com' });
    await db().collection('sessions').insertOne({ _id: new ObjectId(), session: '{}' });

    assert.deepEqual((await collectionNames()).filter((name) => name === 'employees'), ['employees']);
    assert.equal(await db().collection('employees').countDocuments(), 3);
  });

  it('prints the plan without writing on --dry-run', async () => {
    const logs: string[] = [];
    const result = await migrateStudents(db(), { dryRun: true, log: (line) => logs.push(line) });

    assert.equal(result.dryRun, true);
    assert.equal(result.collectionAction, 'rename');
    assert.equal(result.before.employees, 3);
    assert.equal(result.after.employees, 3);
    assert.equal(result.countsMatch, true);
    assert.ok(result.fieldRenames.some((entry) => entry.collection === 'attendances' && entry.modified === 0));
    assert.ok(result.droppedIndexes.some((entry) => entry.name === 'employeeId_1_date_1'));
    assert.ok(logs.some((line) => line.includes('dry run')));
    assert.ok(logs.some((line) => line.includes('employees') && line.includes('students')));

    assert.ok((await collectionNames()).includes('employees'));
    assert.equal(await db().collection('students').countDocuments(), 0);
    assert.equal(await db().collection('attendances').countDocuments({ employeeId: { $exists: true } }), 2);
    const indexes = await db().collection('attendances').listIndexes().toArray();
    assert.ok(indexes.some((index) => index.name === 'employeeId_1_date_1'));
  });

  it('does not write anything when the CLI runs with --dry-run', async () => {
    const before = await indexSnapshot();

    const { stdout } = await execFileAsync(process.execPath, ['seed/migrate-students.ts', '--dry-run'], {
      cwd: process.cwd(),
      env: { ...process.env, MONGODB_URI: mongod.getUri(), NODE_ENV: 'test', MAIL_PROVIDER: 'none' },
      timeout: 120_000,
    });

    assert.match(stdout, /dry run: no collection, document or index was changed/);
    assert.deepEqual(await collectionNames(), Object.keys(before).sort());
    assert.deepEqual(await indexSnapshot(), before);
    assert.ok(!(await collectionNames()).includes('students'));
  });

  it('renames the collection, the field and the indexes', async () => {
    const result = await migrateStudents(db());

    assert.equal(result.dryRun, false);
    assert.equal(result.collectionAction, 'rename');
    assert.equal(result.countsMatch, true);
    assert.equal(result.protectedCountsUnchanged, true);
    assert.equal(result.uniqueStudentDateIndex, true);

    assert.ok(!(await collectionNames()).includes('employees'));
    assert.equal(await db().collection('students').countDocuments(), 3);
    assert.equal(result.before.employees, 3);
    assert.equal(result.after.students, 3);
    assert.equal(result.before.attendances, result.after.attendances);
    assert.equal(result.before.admins, result.after.admins);
    assert.equal(result.before.sessions, result.after.sessions);

    for (const collection of ['attendances', 'overtimes', 'leaves', 'leaveallowances', 'auditlogs']) {
      assert.equal(
        await db().collection(collection).countDocuments({ employeeId: { $exists: true } }),
        0,
        `${collection} must not keep employeeId`,
      );
      assert.ok(
        (await db().collection(collection).countDocuments({ studentId: { $exists: true } })) > 0,
        `${collection} must have studentId`,
      );
    }

    const attendance = await db().collection('attendances').findOne({ studentId: firstId });
    assert.ok(attendance);
    assert.equal(attendance.employeeId, undefined);

    const indexNames = (await db().collection('attendances').listIndexes().toArray()).map((index) => index.name);
    assert.ok(!indexNames.includes('employeeId_1_date_1'));
    assert.ok(!indexNames.includes('employeeId_1_status_1'));
    assert.ok(indexNames.includes('studentId_1_date_1'));

    const unique = (await db().collection('attendances').listIndexes().toArray()).find(
      (index) => index.name === 'studentId_1_date_1',
    );
    assert.equal(unique?.unique, true);
    assert.deepEqual(unique?.key, { studentId: 1, date: 1 });
  });

  it('changes nothing when it runs a second time', async () => {
    const before = await db().collection('students').find().sort({ _id: 1 }).toArray();
    const beforeCounts = Object.fromEntries(
      await Promise.all(
        (await collectionNames()).map(async (name) => [name, await db().collection(name).countDocuments()]),
      ),
    );

    const result = await migrateStudents(db());

    assert.equal(result.collectionAction, 'already-done');
    assert.equal(result.fieldRenames.length, 0);
    assert.equal(result.countsMatch, true);
    assert.equal(result.protectedCountsUnchanged, true);
    assert.equal(result.uniqueStudentDateIndex, true);

    const after = await db().collection('students').find().sort({ _id: 1 }).toArray();
    assert.deepEqual(after, before);

    const afterCounts = Object.fromEntries(
      await Promise.all(
        (await collectionNames()).map(async (name) => [name, await db().collection(name).countDocuments()]),
      ),
    );
    assert.deepEqual(afterCounts, beforeCounts);
    assert.equal(await db().collection('students').countDocuments(), 3);
  });

  it('merges legacy employees into an existing students collection', async () => {
    await db().collection('students').insertOne({
      _id: new ObjectId(),
      name: 'Existing Student',
      email: 'existing@example.com',
      status: 'active',
    });
    const mergedId = new ObjectId();
    await db().collection('employees').insertOne({
      _id: mergedId,
      name: 'Merged Employee',
      email: 'merged@example.com',
      status: 'active',
    });

    const before = await db().collection('students').countDocuments();
    const result = await migrateStudents(db());

    assert.equal(result.collectionAction, 'merge');
    assert.equal(await db().collection('students').countDocuments(), before + 1);
    assert.ok(!(await collectionNames()).includes('employees'));
    const merged = await db().collection('students').findOne({ _id: mergedId });
    assert.ok(merged, 'the merged document must survive');
    assert.equal(merged.name, 'Merged Employee');
  });

  it('refuses to merge an employee whose _id already exists as a student', async () => {
    const student = await db().collection('students').findOne({});
    assert.ok(student);
    await db().collection('employees').insertOne({
      _id: student._id,
      name: 'Conflicting Employee',
      email: 'conflict@example.com',
    });

    await assert.rejects(() => migrateStudents(db()), /Refusing to merge: `employees` and `students` contain the same _id/);
    assert.ok((await collectionNames()).includes('employees'), 'the conflicting source must be left alone');
    assert.equal(await db().collection('employees').countDocuments(), 1);
  });
});
