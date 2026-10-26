import { Types } from 'mongoose';
import { AttendanceModel } from '../models/Attendance.ts';
import { LeaveModel, type LeaveStatus, type LeaveType } from '../models/Leave.ts';
import {
  countedDatesForLeave,
  countedDaysForLeave,
  holidayDatesForRange,
  type HolidayDateSet,
} from './leaveCounting.ts';

/**
 * The attendance rows an approved leave should produce.
 *
 * This is the pure heart of the sync: given a leave, it returns exactly the
 * working days in its range with the attendance status the leave maps to.
 * Everything else in this module is about making the database match this set.
 *
 * Rules:
 *  - only an **approved** leave produces rows
 *  - only **working days** (`WORKING_WEEK`, Monday–Friday by default) count
 *  - dates covered by a `holiday` calendar event are skipped
 *  - `vacation` becomes the attendance status `vacation`, `leave` and
 *    `time_off` become `on_leave`
 */
export interface DesiredAttendanceRow {
  employeeId: string;
  date: string;
  status: 'on_leave' | 'vacation';
}

export interface LeaveLike {
  employeeId: unknown;
  type: LeaveType;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
}

export function desiredRowsForLeave(
  leave: LeaveLike,
  holidayDates: HolidayDateSet = new Set(),
): DesiredAttendanceRow[] {
  if (leave.status !== 'approved') {
    return [];
  }

  const status = leave.type === 'vacation' ? 'vacation' : 'on_leave';

  return countedDatesForLeave(leave, holidayDates).map((date) => ({
    employeeId: String(leave.employeeId),
    date,
    status,
  }));
}

/**
 * Did Mongo refuse a write because a row for that employee and day already
 * exists (the unique index)? That is expected, not an error — it means a
 * manual row owns the day.
 */
function isDuplicateKeyError(error: unknown): boolean {
  const candidate = error as {
    code?: number;
    writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
  };

  if (candidate?.code === 11000) {
    return true;
  }

  const writeErrors = candidate?.writeErrors ?? [];
  return (
    writeErrors.length > 0 &&
    writeErrors.every((entry) => (entry.code ?? entry.err?.code) === 11000)
  );
}

/**
 * Make the attendance collection match what the leave says it should be.
 *
 * This is **idempotent**: running it twice has the same effect as running it
 * once, and a partial failure can always be repaired by running it again
 * (every mutation calls it again). It uses `bulkWrite` and never a
 * multi-document transaction, so it works against a standalone MongoDB.
 *
 * It only ever touches rows with `source: 'leave_sync'` and this exact
 * `leaveId`:
 *  - rows for another employee or a day no longer in the range are deleted
 *  - rows for a day that is still in the range get the current status
 *  - missing days are inserted
 *
 * A row that already exists for a day — most importantly a `source: 'manual'`
 * row — is never overwritten or deleted. The unique `(employeeId, date)`
 * index turns that case into a duplicate-key conflict, which is ignored.
 */
export async function reconcileLeave(leaveId: string): Promise<{ inserted: number; deleted: number }> {
  const leave = await LeaveModel.findById(leaveId);

  // The leave is gone: remove whatever still points at it.
  if (!leave) {
    const removed = await AttendanceModel.deleteMany({ source: 'leave_sync', leaveId });
    return { inserted: 0, deleted: removed.deletedCount ?? 0 };
  }

  const holidayDates = await holidayDatesForRange(leave.startDate, leave.endDate);
  const countedDays = countedDaysForLeave(leave, holidayDates);

  // The stored day count is part of the same source of truth as the rows.
  // Recomputing it here keeps old documents correct after a holiday event
  // changes (the resync and every calendar mutation call this path).
  if (leave.days !== countedDays) {
    leave.days = countedDays;
    await leave.save();
  }

  const desired = desiredRowsForLeave(
    {
      employeeId: leave.employeeId,
      type: leave.type as LeaveType,
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status as LeaveStatus,
    },
    holidayDates,
  );

  const targetLeaveId = new Types.ObjectId(leaveId);
  const employeeId = new Types.ObjectId(String(leave.employeeId));
  const keepDates = desired.map((row) => row.date);

  // 1. Delete the rows this leave owns that are no longer wanted — either the
  //    day left the range or the leave moved to another employee.
  const removed = await AttendanceModel.deleteMany({
    source: 'leave_sync',
    leaveId: targetLeaveId,
    $or: [{ employeeId: { $ne: employeeId } }, { date: { $nin: keepDates } }],
  });

  // 2. Refresh the status of the rows that stay (the type may have changed).
  if (keepDates.length > 0) {
    await AttendanceModel.updateMany(
      { source: 'leave_sync', leaveId: targetLeaveId, date: { $in: keepDates } },
      { $set: { status: desired[0].status } },
    );
  }

  // 3. Insert the missing days. Days that already have any row are skipped
  //    before the write; a race is caught by the unique index below.
  let inserted = 0;

  if (desired.length > 0) {
    const existing = await AttendanceModel.find({ employeeId, date: { $in: keepDates } })
      .select('date')
      .lean();
    const existingDates = new Set(existing.map((row) => row.date));
    const missing = desired.filter((row) => !existingDates.has(row.date));

    if (missing.length > 0) {
      try {
        await AttendanceModel.bulkWrite(
          missing.map((row) => ({
            updateOne: {
              filter: { employeeId, date: row.date, source: 'leave_sync', leaveId: targetLeaveId },
              update: {
                $setOnInsert: { status: row.status, note: '', createdBy: null, updatedBy: null },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
        inserted = missing.length;
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
        // Somebody created a row for that day while we were working — the
        // next run of the reconcile will find it and leave it alone.
      }
    }
  }

  return { inserted, deleted: removed.deletedCount ?? 0 };
}

/** Reconcile every leave of a set of ids (used after a bulk change). */
export async function reconcileLeaves(leaveIds: string[]): Promise<void> {
  for (const leaveId of leaveIds) {
    await reconcileLeave(leaveId);
  }
}

/**
 * Remove every attendance row a leave owns.
 *
 * Called when a leave is deleted — after that its id no longer resolves, so
 * `reconcileLeave` could not find it.
 */
export async function removeLeaveSyncRows(leaveId: string): Promise<number> {
  const removed = await AttendanceModel.deleteMany({ source: 'leave_sync', leaveId });
  return removed.deletedCount ?? 0;
}
