/**
 * Recompute leave working days and reconcile every leave.
 *
 * `days` and the generated attendance rows depend on `WORKING_WEEK` **and** on
 * bank/company holiday events. When either changes, the stored values are
 * stale. This script:
 *
 *   1. recomputes `days` for **every** leave from its inclusive range, skipping
 *      weekends and dates covered by a `holiday` calendar event, and
 *   2. runs the real reconcile for every leave, so approved leaves refresh
 *      their `leave_sync` rows and pending/rejected/deleted leaves lose any
 *      stale rows they still own.
 *
 * It is idempotent and safe to run more than once. Manual attendance rows are
 * never touched.
 *
 *   npm run resync-leaves
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { LeaveModel } from '../src/models/Leave.ts';
import { reconcileLeave } from '../src/services/attendanceSync.ts';
import { countLeaveRange } from '../src/services/leaveCounting.ts';

async function main(): Promise<void> {
  console.log('[resync-leaves] connecting …');
  await connectDatabase();

  try {
    const leaves = await LeaveModel.find()
      .select('_id startDate endDate days status')
      .sort({ _id: 1 });

    let updatedDays = 0;
    let approved = 0;

    for (const leave of leaves) {
      const { days } = await countLeaveRange(leave.startDate, leave.endDate);

      if (leave.days !== days) {
        leave.days = days;
        await leave.save();
        updatedDays += 1;
      }

      if (leave.status === 'approved') {
        approved += 1;
      }
    }

    for (const leave of leaves) {
      await reconcileLeave(String(leave._id));
    }

    console.log(
      `[resync-leaves] ${leaves.length} leave(s) processed, ${updatedDays} day count(s) updated, ` +
        `${approved} approved leave(s) reconciled.`,
    );
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[resync-leaves] failed:', error);
  process.exit(1);
});
