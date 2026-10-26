/**
 * Remove the retired `carryOver` field from `leaveAllowances`.
 *
 * Holiday allowance no longer carries over: unused days expire on 31 December.
 * This migration is idempotent and touches no other field or collection.
 *
 *   npm run migrate:allowances
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { removeCarryOverField } from '../src/services/allowanceMigration.ts';

async function main(): Promise<void> {
  console.log('[migrate:allowances] connecting...');
  await connectDatabase();

  try {
    const first = await removeCarryOverField();
    const second = await removeCarryOverField();

    console.log(
      `[migrate:allowances] removed carryOver from ${first.modified} ` +
        `${first.modified === 1 ? 'document' : 'documents'} (${first.matched} matched).`,
    );
    console.log(
      `[migrate:allowances] idempotency check: ${second.matched} document(s) still had the field.`,
    );
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[migrate:allowances] failed:', error);
  process.exit(1);
});
