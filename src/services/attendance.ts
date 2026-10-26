import { Types } from 'mongoose';
import { AttendanceModel, type AttendanceStatus } from '../models/Attendance.ts';
import { EmployeeModel, WITHOUT_PHOTO } from '../models/Employee.ts';
import { DepartmentModel } from '../models/Department.ts';
import { HttpError } from '../utils/response.ts';
import { parsePagination, pageMeta, type PaginationMeta } from '../utils/pagination.ts';
import { isAfterToday, today } from '../utils/dates.ts';

export interface SheetEntry {
  employeeId: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  note?: string | null;
}

export interface AttendanceFilters {
  from?: string;
  to?: string;
  departmentId?: string;
  employeeId?: string;
}

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'on_leave', 'vacation'];

/**
 * Attendance can only be marked for today or for a day in the past.
 *
 * "Today" is the calendar day in `APP_TIMEZONE`, never the server's UTC
 * offset. Leave sync is exempt: an approved leave for next month does create
 * attendance rows (it goes through `attendanceSync`, not through here).
 */
function assertNotFuture(date: string): void {
  if (isAfterToday(date)) {
    throw new HttpError(
      400,
      'date_in_future',
      'Attendance cannot be marked for a date in the future.',
    );
  }
}

function emptyCounts(): Record<string, number> {
  return { present: 0, late: 0, absent: 0, on_leave: 0, vacation: 0 };
}

/**
 * The daily sheet: every active employee with the record for that day.
 *
 * An employee without a record is *not marked yet* — it is never counted as
 * absent.
 */
export async function getSheet(date: string): Promise<{
  date: string;
  /** Today in `APP_TIMEZONE` — the client uses it to cap the date picker. */
  today: string;
  employees: Array<{ employee: unknown; record: unknown | null }>;
}> {
  const [employees, records] = await Promise.all([
    EmployeeModel.find({ status: 'active' })
      .select(WITHOUT_PHOTO)
      .populate('departmentId', 'name')
      .sort({ name: 1 }),
    AttendanceModel.find({ date }),
  ]);

  const recordByEmployee = new Map(records.map((record) => [String(record.employeeId), record]));

  return {
    date,
    today: today(),
    employees: employees.map((employee) => ({
      employee,
      record: recordByEmployee.get(String(employee._id)) ?? null,
    })),
  };
}

/** The values that make two attendance rows the same from the sheet's point of view. */
function sameSheetValues(
  record: { status: string; checkIn?: string | null; checkOut?: string | null; note?: string | null },
  entry: SheetEntry,
): boolean {
  return (
    record.status === entry.status &&
    (record.checkIn ?? null) === (entry.checkIn || null) &&
    (record.checkOut ?? null) === (entry.checkOut || null) &&
    (record.note ?? '') === (entry.note || '')
  );
}

/**
 * Save a whole sheet in one request.
 *
 * Only the employees that are part of the payload are written — everybody else
 * stays "not marked yet". A row whose values did not change is left exactly as
 * it is; that matters for records generated from a leave, because rewriting an
 * unchanged row would detach it (`source: 'manual'`, `leaveId: null`). Only a
 * real edit turns a `leave_sync` row into a manual one.
 */
export async function saveSheet(
  date: string,
  entries: SheetEntry[],
  adminId: string,
): Promise<{ saved: number; unchanged: number; records: unknown[] }> {
  assertNotFuture(date);

  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.employeeId)) {
      throw new HttpError(422, 'duplicate_entry', 'The sheet lists the same employee twice.');
    }
    seen.add(entry.employeeId);
  }

  const employeeIds = entries.map((entry) => entry.employeeId);
  const existingEmployees = await EmployeeModel.countDocuments({ _id: { $in: employeeIds } });
  if (existingEmployees !== employeeIds.length) {
    throw new HttpError(422, 'employee_not_found', 'One of the employees on the sheet does not exist.');
  }

  // Load the day in one query instead of one query per row. The records are
  // also what the "did anything change?" decision is based on.
  const existingRecords = await AttendanceModel.find({
    employeeId: { $in: employeeIds },
    date,
  });
  const existingByEmployee = new Map(
    existingRecords.map((record) => [String(record.employeeId), record]),
  );

  const records = [];
  let saved = 0;
  let unchanged = 0;

  for (const entry of entries) {
    const existing = existingByEmployee.get(entry.employeeId);

    if (existing && sameSheetValues(existing, entry)) {
      unchanged += 1;
      records.push(existing);
      continue;
    }

    const record = await AttendanceModel.findOneAndUpdate(
      { employeeId: entry.employeeId, date },
      {
        $set: {
          status: entry.status,
          checkIn: entry.checkIn || null,
          checkOut: entry.checkOut || null,
          note: entry.note || '',
          // Editing a row that came from a leave makes it a manual record.
          source: 'manual',
          leaveId: null,
          updatedBy: adminId,
        },
        $setOnInsert: { createdBy: adminId },
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    );

    saved += 1;
    records.push(record);
  }

  return { saved, unchanged, records };
}

/** Build the mongo filter for the report. */
async function buildFilter(filters: AttendanceFilters): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  if (filters.from || filters.to) {
    const range: Record<string, string> = {};
    if (filters.from) range.$gte = filters.from;
    if (filters.to) range.$lte = filters.to;
    filter.date = range;
  }

  let employeeIds: string[] | null = null;

  if (filters.departmentId) {
    const ids = await EmployeeModel.find({ departmentId: filters.departmentId }).distinct('_id');
    employeeIds = ids.map(String);
  }

  if (filters.employeeId) {
    employeeIds = employeeIds ? employeeIds.filter((id) => id === String(filters.employeeId)) : [String(filters.employeeId)];
  }

  if (employeeIds) {
    filter.employeeId = { $in: employeeIds };
  }

  return filter;
}

export interface AttendanceReport extends AttendanceFilters {
  page?: unknown;
  perPage?: unknown;
}

export async function attendanceReport(query: AttendanceReport): Promise<{
  records: unknown[];
  counts: Record<string, number>;
  meta: PaginationMeta;
}> {
  const pagination = parsePagination(query);
  const filter = await buildFilter(query);

  const [records, total, grouped] = await Promise.all([
    AttendanceModel.find(filter)
      .populate({
        path: 'employeeId',
        select: 'name position departmentId',
        populate: { path: 'departmentId', select: 'name' },
      })
      .sort({ date: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    AttendanceModel.countDocuments(filter),
    AttendanceModel.aggregate<{ _id: string; count: number }>([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = emptyCounts();
  for (const entry of grouped) {
    if (STATUSES.includes(entry._id as AttendanceStatus)) {
      counts[entry._id] = entry.count;
    }
  }

  return { records, counts, meta: pageMeta(total, pagination) };
}

/** Every record of a report — used for the CSV export. */
export async function attendanceRows(query: AttendanceReport): Promise<unknown[]> {
  const filter = await buildFilter(query);
  return AttendanceModel.find(filter)
    .populate({
      path: 'employeeId',
      select: 'name position departmentId',
      populate: { path: 'departmentId', select: 'name' },
    })
    .sort({ date: 1, name: 1 });
}

/** Add a single record — a duplicate for the same day is refused. */
export async function addAttendance(payload: SheetEntry & { date: string }, adminId: string) {
  assertNotFuture(payload.date);

  if (!(await EmployeeModel.exists({ _id: payload.employeeId }))) {
    throw new HttpError(422, 'employee_not_found', 'That employee does not exist.');
  }

  try {
    const record = await AttendanceModel.create({
      employeeId: new Types.ObjectId(payload.employeeId),
      date: payload.date,
      status: payload.status,
      checkIn: payload.checkIn || null,
      checkOut: payload.checkOut || null,
      note: payload.note || '',
      source: 'manual',
      createdBy: adminId,
      updatedBy: adminId,
    });
    return record;
  } catch (error) {
    const mongoError = error as { code?: number };
    if (mongoError?.code === 11000) {
      throw new HttpError(
        409,
        'duplicate_attendance',
        'There is already a record for that employee on that day.',
      );
    }
    throw error;
  }
}

/** Change a record — a record that came from a leave becomes a manual one. */
export async function updateAttendance(
  id: string,
  payload: Partial<SheetEntry>,
  adminId: string,
) {
  const record = await AttendanceModel.findById(id);
  if (!record) {
    throw new HttpError(404, 'attendance_not_found', 'That attendance record no longer exists.');
  }

  if (payload.status !== undefined) record.status = payload.status;
  if (payload.checkIn !== undefined) record.checkIn = payload.checkIn || null;
  if (payload.checkOut !== undefined) record.checkOut = payload.checkOut || null;
  if (payload.note !== undefined) record.note = payload.note || '';

  // A record that was generated from a leave becomes a manual record as soon
  // as somebody edits it. Clearing `leaveId` is what detaches it from the
  // leave, so the sync can never delete it afterwards.
  record.source = 'manual';
  record.leaveId = null;
  record.updatedBy = new Types.ObjectId(adminId);

  await record.save();
  return record;
}

export async function deleteAttendance(id: string): Promise<{ deleted: boolean }> {
  const record = await AttendanceModel.findById(id);
  if (!record) {
    throw new HttpError(404, 'attendance_not_found', 'That attendance record no longer exists.');
  }

  await record.deleteOne();
  return { deleted: true };
}

/** The department name of a record — used by the CSV export. */
export async function departmentNames(): Promise<Map<string, string>> {
  const departments = await DepartmentModel.find().lean();
  return new Map(departments.map((department) => [String(department._id), department.name]));
}
