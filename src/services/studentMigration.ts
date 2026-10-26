/**
 * Rename the legacy student data to the current terminology.
 *
 *   employees collection -> students
 *   employeeId field     -> studentId (every collection that stores it)
 *   employee indexes     -> the matching studentId indexes
 *
 * The migration is idempotent and never touches `admins` or `sessions`.
 * `--dry-run` prints the plan and the document counts without writing anything.
 */
import type { Db, IndexSpecification } from 'mongodb';
import { StudentModel } from '../models/Student.ts';
import { AttendanceModel } from '../models/Attendance.ts';
import { OvertimeModel } from '../models/Overtime.ts';
import { LeaveModel } from '../models/Leave.ts';
import { LeaveAllowanceModel } from '../models/LeaveAllowance.ts';

const PROTECTED_COLLECTIONS = new Set(['admins', 'sessions']);

const COLLECTIONS = {
  students: StudentModel.collection.collectionName,
  attendance: AttendanceModel.collection.collectionName,
  overtime: OvertimeModel.collection.collectionName,
  leaves: LeaveModel.collection.collectionName,
  leaveAllowances: LeaveAllowanceModel.collection.collectionName,
} as const;

export interface MigrationOptions {
  dryRun?: boolean;
  log?: (line: string) => void;
}

export interface IndexPlan {
  collection: string;
  name: string;
  keys: IndexSpecification;
  options?: Record<string, unknown>;
}

export interface StudentMigrationResult {
  dryRun: boolean;
  collectionAction: string;
  fieldRenames: Array<{ collection: string; matched: number; modified: number }>;
  droppedIndexes: Array<{ collection: string; name: string }>;
  createdIndexes: Array<{ collection: string; name: string }>;
  before: Record<string, number>;
  after: Record<string, number>;
  countsMatch: boolean;
  protectedCountsUnchanged: boolean;
  uniqueStudentDateIndex: boolean;
}

/** Index definitions that must exist after the rename. */
function newIndexes(): IndexPlan[] {
  return [
    {
      collection: COLLECTIONS.students,
      name: 'email_1',
      keys: { email: 1 },
      options: { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    },
    { collection: COLLECTIONS.students, name: 'name_1', keys: { name: 1 } },
    {
      collection: COLLECTIONS.attendance,
      name: 'studentId_1_date_1',
      keys: { studentId: 1, date: 1 },
      options: { unique: true },
    },
    { collection: COLLECTIONS.attendance, name: 'date_1', keys: { date: 1 } },
    { collection: COLLECTIONS.attendance, name: 'date_1_status_1', keys: { date: 1, status: 1 } },
    { collection: COLLECTIONS.attendance, name: 'source_1', keys: { source: 1 } },
    {
      collection: COLLECTIONS.attendance,
      name: 'source_1_leaveId_1',
      keys: { source: 1, leaveId: 1 },
    },
    {
      collection: COLLECTIONS.overtime,
      name: 'studentId_1_date_1',
      keys: { studentId: 1, date: 1 },
    },
    { collection: COLLECTIONS.overtime, name: 'date_1', keys: { date: 1 } },
    {
      collection: COLLECTIONS.leaves,
      name: 'studentId_1_startDate_1',
      keys: { studentId: 1, startDate: 1 },
    },
    { collection: COLLECTIONS.leaves, name: 'startDate_1_endDate_1', keys: { startDate: 1, endDate: 1 } },
    {
      collection: COLLECTIONS.leaves,
      name: 'studentId_1_status_1_startDate_1_endDate_1',
      keys: { studentId: 1, status: 1, startDate: 1, endDate: 1 },
    },
    {
      collection: COLLECTIONS.leaveAllowances,
      name: 'studentId_1_year_1',
      keys: { studentId: 1, year: 1 },
      options: { unique: true },
    },
  ];
}

async function collectionNames(db: Db): Promise<string[]> {
  return (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((info) => info.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
}

async function snapshotCounts(db: Db): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of await collectionNames(db)) {
    counts[name] = await db.collection(name).countDocuments();
  }
  return counts;
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

/** True when the document counts survived the migration unchanged. */
function countsMatch(before: Record<string, number>, after: Record<string, number>): boolean {
  if (total(before) !== total(after)) return false;
  for (const [name, value] of Object.entries(before)) {
    if (name === 'employees' || name === 'students') continue;
    if ((after[name] ?? 0) !== value) return false;
  }
  return (after.students ?? 0) === (before.students ?? 0) + (before.employees ?? 0);
}

function protectedCountsUnchanged(before: Record<string, number>, after: Record<string, number>): boolean {
  for (const name of PROTECTED_COLLECTIONS) {
    if ((before[name] ?? 0) !== (after[name] ?? 0)) return false;
  }
  return true;
}

async function planCollectionRename(
  db: Db,
  before: Record<string, number>,
): Promise<{ action: string; description: string }> {
  const hasEmployees = Object.hasOwn(before, 'employees');
  const hasStudents = Object.hasOwn(before, 'students');

  if (!hasEmployees) {
    return {
      action: 'already-done',
      description: hasStudents
        ? 'collection `employees` is already gone; `students` exists'
        : 'no `employees` or `students` collection exists; nothing to rename',
    };
  }

  const sourceCount = before.employees ?? 0;
  if (!hasStudents) {
    return {
      action: 'rename',
      description: `rename collection \`employees\` -> \`students\` (${sourceCount} document(s))`,
    };
  }

  const targetCount = before.students ?? 0;
  if (sourceCount === 0) {
    return {
      action: 'drop-empty-source',
      description: '`employees` is empty and `students` exists; drop the empty `employees` collection',
    };
  }
  if (targetCount === 0) {
    return {
      action: 'replace-empty-target',
      description: '`employees` has data and `students` is empty; replace the empty `students` collection',
    };
  }

  return {
    action: 'merge',
    description:
      `both \`employees\` (${sourceCount}) and \`students\` (${targetCount}) contain data; ` +
      'merge `employees` into `students` after checking for conflicts',
  };
}

async function mergeEmployeesIntoStudents(db: Db): Promise<void> {
  const source = db.collection('employees');
  const target = db.collection('students');

  const sourceIds = await source.distinct('_id');
  const idConflict = await target.findOne({ _id: { $in: sourceIds } });
  if (idConflict) {
    throw new Error(
      'Refusing to merge: `employees` and `students` contain the same _id. Resolve the duplicate first.',
    );
  }

  const sourceEmails = await source.distinct('email', { email: { $type: 'string' } });
  const targetEmails = new Set(await target.distinct('email', { email: { $type: 'string' } }));
  const emailConflicts = sourceEmails.filter((email) => targetEmails.has(email));
  if (emailConflicts.length) {
    throw new Error(
      `Refusing to merge: the same email exists in both collections (${emailConflicts.join(', ')}).`,
    );
  }

  const documents = await source.find({}).toArray();
  if (documents.length) await target.insertMany(documents);
  await source.drop();
}

async function planFieldRenames(
  db: Db,
  names: string[],
): Promise<Array<{ collection: string; count: number }>> {
  const plan: Array<{ collection: string; count: number }> = [];
  for (const name of names) {
    if (PROTECTED_COLLECTIONS.has(name)) continue;
    const count = await db.collection(name).countDocuments({ employeeId: { $exists: true } });
    if (count > 0) plan.push({ collection: name, count });
  }
  return plan;
}

async function planOldIndexes(
  db: Db,
  names: string[],
): Promise<Array<{ collection: string; name: string }>> {
  const plan: Array<{ collection: string; name: string }> = [];
  for (const name of names) {
    if (PROTECTED_COLLECTIONS.has(name)) continue;
    const indexes = await db.collection(name).listIndexes().toArray();
    for (const index of indexes) {
      if (Object.hasOwn(index.key, 'employeeId') && index.name) {
        plan.push({ collection: name, name: index.name });
      }
    }
  }
  return plan;
}

async function assertNoDuplicates(
  db: Db,
  collection: string,
  keys: IndexSpecification,
  filter?: Record<string, unknown>,
): Promise<void> {
  const group: Record<string, string> = {};
  for (const key of Object.keys(keys)) group[key] = `$${key}`;

  const pipeline = filter ? [{ $match: filter }] : [];
  const duplicates = await db
    .collection(collection)
    .aggregate([
      ...pipeline,
      { $group: { _id: group, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();

  if (duplicates.length) {
    throw new Error(
      `Refusing to create the unique index on ${collection} ${JSON.stringify(keys)}: ` +
        `${duplicates.length} duplicate value(s) exist, e.g. ${JSON.stringify(duplicates[0])}.`,
    );
  }
}

async function hasUniqueStudentDateIndex(db: Db): Promise<boolean> {
  const collection = db.collection(COLLECTIONS.attendance);
  if (!(await collectionNames(db)).includes(COLLECTIONS.attendance)) return false;
  const indexes = await collection.listIndexes().toArray();
  return indexes.some(
    (index) =>
      index.unique === true &&
      index.key.studentId === 1 &&
      index.key.date === 1 &&
      Object.keys(index.key).length === 2,
  );
}

/** Run the migration (or only plan it when `dryRun` is set). */
export async function migrateStudents(db: Db, options: MigrationOptions = {}): Promise<StudentMigrationResult> {
  const log = options.log ?? (() => undefined);
  const dryRun = options.dryRun ?? false;
  const before = await snapshotCounts(db);

  const collectionPlan = await planCollectionRename(db, before);
  log(`[migrate:students] plan: ${collectionPlan.description}`);

  let names = await collectionNames(db);
  const fieldPlan = await planFieldRenames(db, names);
  for (const entry of fieldPlan) {
    log(`[migrate:students] plan: rename employeeId -> studentId in ${entry.collection} (${entry.count} document(s))`);
  }
  if (!fieldPlan.length) log('[migrate:students] plan: no employeeId field found');

  const oldIndexPlan = await planOldIndexes(db, names);
  for (const entry of oldIndexPlan) {
    log(`[migrate:students] plan: drop old index ${entry.collection}.${entry.name}`);
  }
  for (const index of newIndexes()) {
    log(
      `[migrate:students] plan: ensure index ${index.collection}.${index.name} ` +
        `${JSON.stringify(index.keys)}${index.options?.unique ? ' (unique)' : ''}`,
    );
  }

  if (dryRun) {
    log('[migrate:students] dry run: no collection, document or index was changed');
    return {
      dryRun,
      collectionAction: collectionPlan.action,
      fieldRenames: fieldPlan.map((entry) => ({ collection: entry.collection, matched: entry.count, modified: 0 })),
      droppedIndexes: oldIndexPlan,
      createdIndexes: [],
      before,
      after: before,
      countsMatch: true,
      protectedCountsUnchanged: true,
      uniqueStudentDateIndex: await hasUniqueStudentDateIndex(db),
    };
  }

  // 1. Rename, replace or merge the collection.
  if (collectionPlan.action === 'rename') {
    await db.renameCollection('employees', 'students');
  } else if (collectionPlan.action === 'drop-empty-source') {
    await db.collection('employees').drop();
  } else if (collectionPlan.action === 'replace-empty-target') {
    await db.collection('students').drop();
    await db.renameCollection('employees', 'students');
  } else if (collectionPlan.action === 'merge') {
    await mergeEmployeesIntoStudents(db);
  }

  // 2. Drop indexes that still point at the old field. This happens before
  //    the field rename because a unique employeeId index would otherwise see
  //    every document lose the field at once and reject the update.
  names = await collectionNames(db);
  const droppedIndexes: StudentMigrationResult['droppedIndexes'] = [];
  for (const name of names) {
    if (PROTECTED_COLLECTIONS.has(name)) continue;
    const indexes = await db.collection(name).listIndexes().toArray();
    for (const index of indexes) {
      if (Object.hasOwn(index.key, 'employeeId') && index.name) {
        await db.collection(name).dropIndex(index.name);
        droppedIndexes.push({ collection: name, name: index.name });
      }
    }
  }

  // 3. Rename the field in every collection that still has it.
  const fieldRenames: StudentMigrationResult['fieldRenames'] = [];
  for (const name of names) {
    if (PROTECTED_COLLECTIONS.has(name)) continue;
    const collection = db.collection(name);
    const conflicts = await collection.countDocuments({
      employeeId: { $exists: true },
      studentId: { $exists: true },
    });
    if (conflicts > 0) {
      throw new Error(
        `Refusing to rename employeeId in ${name}: ${conflicts} document(s) already have a studentId.`,
      );
    }
    const result = await collection.updateMany(
      { employeeId: { $exists: true } },
      { $rename: { employeeId: 'studentId' } },
    );
    if (result.matchedCount > 0) {
      fieldRenames.push({ collection: name, matched: result.matchedCount, modified: result.modifiedCount });
    }
  }

  // 4. Create the indexes for the new names. Check unique keys first.
  const createdIndexes: StudentMigrationResult['createdIndexes'] = [];
  for (const index of newIndexes()) {
    if (!(await collectionNames(db)).includes(index.collection)) continue;
    if (index.options?.unique) {
      await assertNoDuplicates(
        db,
        index.collection,
        index.keys,
        index.options.partialFilterExpression as Record<string, unknown> | undefined,
      );
    }
    const name = await db.collection(index.collection).createIndex(index.keys, index.options);
    createdIndexes.push({ collection: index.collection, name });
  }

  const after = await snapshotCounts(db);
  const result: StudentMigrationResult = {
    dryRun,
    collectionAction: collectionPlan.action,
    fieldRenames,
    droppedIndexes,
    createdIndexes,
    before,
    after,
    countsMatch: countsMatch(before, after),
    protectedCountsUnchanged: protectedCountsUnchanged(before, after),
    uniqueStudentDateIndex: await hasUniqueStudentDateIndex(db),
  };

  return result;
}
