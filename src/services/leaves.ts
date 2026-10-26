import { Types } from 'mongoose';
import { LeaveModel, type LeaveStatus, type LeaveType } from '../models/Leave.ts';
import { StudentModel } from '../models/Student.ts';
import { HttpError } from '../utils/response.ts';
import { parsePagination, pageMeta, type PaginationMeta } from '../utils/pagination.ts';
import { diffDays, workingDaysBetween } from '../utils/dates.ts';
import { reconcileLeave, removeLeaveSyncRows } from './attendanceSync.ts';
import { assertVacationAllowance } from './allowances.ts';
import {
  countedDatesForLeave,
  holidayDatesForRange,
} from './leaveCounting.ts';

/** The longest range one leave may cover, in calendar days. */
export const MAX_LEAVE_SPAN_DAYS = 366;

export interface LeavePayload {
  studentId: string;
  type: LeaveType;
  category?: string | null;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status?: LeaveStatus;
  /** A deliberate admin decision to book past the holiday allowance. */
  confirmOverAllowance?: boolean;
}

export interface LeaveListQuery {
  page?: unknown;
  perPage?: unknown;
  studentId?: unknown;
  departmentId?: unknown;
  type?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
}

/**
 * The number of working days in an inclusive range, according to
 * `WORKING_WEEK` (Monday–Friday by default) — **without** the holiday calendar.
 *
 * Stored leave days use `countedDatesForLeave`, which also skips bank/company
 * holiday events. This helper remains for callers that only need the working
 * week (for example seed fixtures that build plain attendance rows).
 */
export function leaveWorkingDays(startDate: string, endDate: string): number {
  if (endDate < startDate) return 0;
  return workingDaysBetween(startDate, endDate).length;
}

/** Validate the range and its maximum span. */
export function assertLeaveRange(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new HttpError(422, 'leave_range_invalid', 'The end date cannot be before the start date.');
  }

  if (diffDays(startDate, endDate) + 1 > MAX_LEAVE_SPAN_DAYS) {
    throw new HttpError(
      422,
      'leave_span_too_long',
      `A leave cannot cover more than ${MAX_LEAVE_SPAN_DAYS} days.`,
    );
  }
}

/**
 * Reject a leave whose range overlaps another **approved** leave of the same
 * student.
 *
 * A pending request is allowed to overlap provisionally; the rule is enforced
 * again when it is approved. Two approved leaves for the same days would
 * otherwise fight over the same attendance rows.
 */
async function assertNoOverlap(
  studentId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<void> {
  const filter: Record<string, unknown> = {
    studentId: new Types.ObjectId(studentId),
    status: 'approved',
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeId) {
    filter._id = { $ne: new Types.ObjectId(excludeId) };
  }

  const clash = await LeaveModel.findOne(filter).select('startDate endDate type');
  if (clash) {
    throw new HttpError(
      409,
      'leave_overlap',
      `That range overlaps an approved ${clash.type.replace('_', ' ')} from ${clash.startDate} to ${clash.endDate}.`,
      { leaveId: String(clash._id) },
    );
  }
}

async function assertStudentExists(studentId: string): Promise<void> {
  if (!(await StudentModel.exists({ _id: studentId }))) {
    throw new HttpError(422, 'student_not_found', 'That student does not exist.');
  }
}

/** Build the mongo filter of the leave list and its CSV export. */
async function buildFilter(query: LeaveListQuery): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  if (typeof query.studentId === 'string' && query.studentId) {
    filter.studentId = new Types.ObjectId(query.studentId);
  }

  if (typeof query.departmentId === 'string' && query.departmentId) {
    const ids = await StudentModel.find({ departmentId: query.departmentId }).distinct('_id');
    filter.studentId = { $in: ids };
  }

  if (typeof query.type === 'string' && query.type) {
    filter.type = query.type;
  }

  if (typeof query.status === 'string' && query.status) {
    filter.status = query.status;
  }

  // A date filter selects the leaves that **overlap** the range, which is what
  // an HR user expects ("show me the leaves in June").
  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';
  if (to) filter.startDate = { $lte: to };
  if (from) filter.endDate = { $gte: from };

  return filter;
}

export async function listLeaves(query: LeaveListQuery): Promise<{
  leaves: unknown[];
  meta: PaginationMeta;
}> {
  const pagination = parsePagination(query);
  const filter = await buildFilter(query);

  const [leaves, total] = await Promise.all([
    LeaveModel.find(filter)
      .populate({
        path: 'studentId',
        select: 'name position departmentId',
        populate: { path: 'departmentId', select: 'name' },
      })
      .sort({ startDate: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    LeaveModel.countDocuments(filter),
  ]);

  return { leaves, meta: pageMeta(total, pagination) };
}

/** Every leave that matches the filters — used by the CSV export. */
export async function leaveRows(query: LeaveListQuery): Promise<unknown[]> {
  const filter = await buildFilter(query);
  return LeaveModel.find(filter)
    .populate({
      path: 'studentId',
      select: 'name position departmentId',
      populate: { path: 'departmentId', select: 'name' },
    })
    .sort({ startDate: 1, createdAt: 1 });
}

export async function getLeave(id: string): Promise<unknown> {
  const leave = await LeaveModel.findById(id).populate({
    path: 'studentId',
    select: 'name position departmentId',
    populate: { path: 'departmentId', select: 'name' },
  });

  if (!leave) {
    throw new HttpError(404, 'leave_not_found', 'That leave no longer exists.');
  }

  return leave;
}

export async function createLeave(
  payload: LeavePayload,
  adminId: string,
): Promise<unknown> {
  await assertStudentExists(payload.studentId);
  assertLeaveRange(payload.startDate, payload.endDate);

  const status: LeaveStatus = payload.status ?? 'pending';

  if (status === 'approved') {
    await assertNoOverlap(payload.studentId, payload.startDate, payload.endDate);
    await assertVacationAllowance(
      {
        studentId: payload.studentId,
        type: payload.type,
        startDate: payload.startDate,
        endDate: payload.endDate,
      },
      payload.confirmOverAllowance === true,
    );
  }

  const holidayDates = await holidayDatesForRange(payload.startDate, payload.endDate);

  const leave = await LeaveModel.create({
    studentId: new Types.ObjectId(payload.studentId),
    type: payload.type,
    category: payload.category?.trim() || null,
    startDate: payload.startDate,
    endDate: payload.endDate,
    days: countedDatesForLeave(payload, holidayDates).length,
    reason: payload.reason?.trim() || '',
    status,
    // A leave created as approved/rejected is already decided by this admin.
    decidedBy: status === 'pending' ? null : new Types.ObjectId(adminId),
    decidedAt: status === 'pending' ? null : new Date(),
    createdBy: new Types.ObjectId(adminId),
    updatedBy: new Types.ObjectId(adminId),
  });

  // An approved leave writes its attendance rows; a pending one removes
  // nothing (there is nothing to remove yet). Either way this is idempotent.
  await reconcileLeave(String(leave._id));

  return leave;
}

export async function updateLeave(
  id: string,
  payload: Partial<LeavePayload>,
  adminId: string,
): Promise<unknown> {
  const leave = await LeaveModel.findById(id);
  if (!leave) {
    throw new HttpError(404, 'leave_not_found', 'That leave no longer exists.');
  }

  if (payload.studentId !== undefined) {
    await assertStudentExists(payload.studentId);
    leave.studentId = new Types.ObjectId(payload.studentId);
  }

  const previousStatus = leave.status as LeaveStatus;

  if (payload.type !== undefined) leave.type = payload.type;
  if (payload.category !== undefined) leave.category = payload.category?.trim() || null;
  if (payload.startDate !== undefined) leave.startDate = payload.startDate;
  if (payload.endDate !== undefined) leave.endDate = payload.endDate;
  if (payload.reason !== undefined) leave.reason = payload.reason?.trim() || '';

  assertLeaveRange(leave.startDate, leave.endDate);

  const holidayDates = await holidayDatesForRange(leave.startDate, leave.endDate);
  leave.days = countedDatesForLeave(leave, holidayDates).length;

  if (payload.status !== undefined) {
    leave.status = payload.status;
  }

  // The overlap rule looks at the **resulting** leave: editing the dates of an
  // approved leave is just as much an approval decision as pressing "approve".
  if (leave.status === 'approved') {
    await assertNoOverlap(String(leave.studentId), leave.startDate, leave.endDate, id);
    await assertVacationAllowance(
      {
        studentId: String(leave.studentId),
        type: leave.type as LeaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        excludeLeaveId: id,
      },
      payload.confirmOverAllowance === true,
    );
  }

  if (leave.status !== previousStatus) {
    if (leave.status === 'pending') {
      leave.decidedBy = null;
      leave.decidedAt = null;
    } else {
      leave.decidedBy = new Types.ObjectId(adminId);
      leave.decidedAt = new Date();
    }
  }

  leave.updatedBy = new Types.ObjectId(adminId);
  await leave.save();

  // Reconcile after every edit: dates, status, type and even the student can
  // change. The reconcile deletes the rows this leave owns for another
  // student, so moving a leave does not leave rows behind.
  await reconcileLeave(String(leave._id));

  return leave;
}

export async function deleteLeave(id: string): Promise<{ deleted: boolean }> {
  const leave = await LeaveModel.findById(id);
  if (!leave) {
    // A retry after a partial failure: the leave is already gone, but there
    // might still be rows pointing at it. Clean them up before answering 404.
    await removeLeaveSyncRows(id);
    throw new HttpError(404, 'leave_not_found', 'That leave no longer exists.');
  }

  await leave.deleteOne();

  // The leave is gone, so the reconcile can no longer resolve it by id — the
  // rows are removed directly. Only rows owned by this exact leave are touched.
  await removeLeaveSyncRows(id);

  return { deleted: true };
}

export interface LeaveYearTotals {
  year: number;
  leave: number;
  vacation: number;
  time_off: number;
  total: number;
}

/**
 * Approved leave days of one student, per calendar year and per type.
 *
 * Days are counted by their **actual** calendar year and month, so a leave
 * from December to January contributes to both years. Only working days that
 * are not covered by a holiday event count (the same rule as `days`, the
 * attendance sync and the allowance), and only `approved` leaves count.
 */
export async function studentLeaveTotals(id: string): Promise<LeaveYearTotals[]> {
  const student = await StudentModel.findById(id).select('name').lean();
  if (!student) {
    throw new HttpError(404, 'student_not_found', 'That student no longer exists.');
  }

  const leaves = await LeaveModel.find({
    studentId: new Types.ObjectId(id),
    status: 'approved',
  })
    .select('type startDate endDate')
    .sort({ startDate: 1, createdAt: 1 })
    .lean();

  if (!leaves.length) return [];

  const holidayDates = await holidayDatesForRange(
    leaves.reduce((min, leave) => (leave.startDate < min ? leave.startDate : min), leaves[0]!.startDate),
    leaves.reduce((max, leave) => (leave.endDate > max ? leave.endDate : max), leaves[0]!.endDate),
  );

  const byYear = new Map<number, LeaveYearTotals>();

  for (const leave of leaves) {
    const type = leave.type as LeaveType;
    const countedDates = countedDatesForLeave(leave, holidayDates);

    for (const date of countedDates) {
      const year = Number(date.slice(0, 4));
      const entry = byYear.get(year) ?? {
        year,
        leave: 0,
        vacation: 0,
        time_off: 0,
        total: 0,
      };

      if (type === 'leave' || type === 'vacation' || type === 'time_off') {
        entry[type] += 1;
      }
      entry.total += 1;
      byYear.set(year, entry);
    }
  }

  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

