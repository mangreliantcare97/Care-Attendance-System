/**
 * Migrate the legacy HR terminology to students.
 *
 *   npm run migrate:students
 *   npm run migrate:students -- --dry-run
 *
 * The dry run prints the plan and the document counts and writes nothing.
 * Running the migration a second time changes nothing. `admins` and `sessions`
 * are never touched.
 */
import { env } from '../src/config/env.ts';
import { connectDatabase, disconnectDatabase, mongoose } from '../src/config/db.ts';
import { migrateStudents, type StudentMigrationResult } from '../src/services/studentMigration.ts';

function printCounts(label: string, counts: Record<string, number>): void {
  console.log(`[migrate:students] ${label}:`);
  for (const name of Object.keys(counts).sort()) {
    console.log(`  ${name.padEnd(20)} ${counts[name]}`);
  }
  console.log(`  ${'total'.padEnd(20)} ${Object.values(counts).reduce((sum, value) => sum + value, 0)}`);
}

function printResult(result: StudentMigrationResult): void {
  console.log('');
  console.log(`[migrate:students] collection: ${result.collectionAction}`);
  for (const entry of result.fieldRenames) {
    console.log(
      `[migrate:students] field: ${entry.collection}.employeeId -> studentId ` +
        `(${entry.modified}/${entry.matched} modified)`,
    );
  }
  if (!result.fieldRenames.length) console.log('[migrate:students] field: no employeeId field needed renaming');
  for (const entry of result.droppedIndexes) {
    console.log(`[migrate:students] dropped index: ${entry.collection}.${entry.name}`);
  }
  for (const entry of result.createdIndexes) {
    console.log(`[migrate:students] ensured index: ${entry.collection}.${entry.name}`);
  }
  console.log(
    `[migrate:students] unique {studentId, date} index: ` +
      `${result.uniqueStudentDateIndex ? 'present' : 'MISSING'}`,
  );
  console.log(`[migrate:students] document counts unchanged: ${result.countsMatch ? 'yes' : 'NO'}`);
  console.log(
    `[migrate:students] admins and sessions unchanged: ` +
      `${result.protectedCountsUnchanged ? 'yes' : 'NO'}`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[migrate:students] connecting${dryRun ? ' (dry run)' : ''}...`);
  // Never let mongoose build the new indexes while connecting: a dry run must
  // not write anything, and a real run builds its indexes only after renaming
  // the collection and the fields.
  await connectDatabase(env.mongodbUri, { autoIndex: false, autoCreate: false });

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('The MongoDB connection has no database handle.');

    const result = await migrateStudents(db, {
      dryRun,
      log: (line) => console.log(line),
    });

    printCounts('before', result.before);
    printCounts('after', result.after);
    printResult(result);

    if (!dryRun && (!result.countsMatch || !result.protectedCountsUnchanged || !result.uniqueStudentDateIndex)) {
      process.exitCode = 1;
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[migrate:students] failed:', error);
  process.exit(1);
});
