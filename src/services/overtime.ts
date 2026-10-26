import { Types } from 'mongoose';
import { OvertimeModel } from '../models/Overtime.ts';
import { StudentModel } from '../models/Student.ts';
import { HttpError } from '../utils/response.ts';
import { parsePagination, pageMeta, type PaginationMeta } from '../utils/pagination.ts';
import { resolveMonth } from '../utils/dates.ts';

/** The most hours one student can book on one calendar day. */
export const MAX_DAY_HOURS = 24;

export interface OvertimePayload {
  studentId: string;
  date: string;
  hours: number;
  note?: string | null;
}

export interface OvertimeQuery {
  from?: unknown;
  to?: unknown;
  studentId?: unknown;
  departmentId?: unknown;
  page?: unknown;
  perPage?: unknown;
}

export interface OvertimeSummaryQuery {
  month?: string;
  departmentId?: unknown;
}

async function assertStudentExists(studentId: string): Promise<void> {
  if (!(await StudentModel.exists({ _id: studentId }))) {
    throw new HttpError(422, 'student_not_found', 'That student does not exist.');
  }
}

/**
 * The hours already booked for a student on a day, optionally excluding the
 * record that is being edited.
 */
async function bookedHours(
  studentId: string,
  date: string,
  excludeId?: string,
): Promise<number> {
  const match: Record<string, unknown> = {
    studentId: new Types.ObjectId(studentId),
    date,
  };

  if (excludeId) {
    match._id = { $ne: new Types.ObjectId(excludeId) };
  }

  const [result] = await OvertimeModel.aggregate<{ _id: null; hours: number }>([
    { $match: match },
    { $group: { _id: null, hours: { $sum: '$hours' } } },
  ]);

  return result?.hours ?? 0;
}

/**
 * Several entries per student and day are allowed, but their sum may never
 * exceed 24 hours. A tiny epsilon keeps floating point sums exact
 * (`0.25` is representable, but four quarters can still add up to
 * `0.9999999999999999` in an aggregation).
 */
async function assertDayLimit(
  studentId: string,
  date: string,
  hours: number,
  excludeId?: string,
): Promise<void> {
  const total = (await bookedHours(studentId, date, excludeId)) + hours;

  if (total > MAX_DAY_HOURS + 1e-9) {
    throw new HttpError(
      422,
      'overtime_day_limit',
      `That would make ${Math.round(total * 100) / 100} hours on ${date} — a day can have at most ${MAX_DAY_HOURS} hours of overtime.`,
    );
  }
}

/** Build the mongo filter of the overtime list and its CSV export. */
async function buildFilter(query: OvertimeQuery): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';
  if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    filter.date = range;
  }

  if (typeof query.studentId === 'string' && query.studentId) {
    filter.studentId = new Types.ObjectId(query.studentId);
  }

  if (typeof query.departmentId === 'string' && query.departmentId) {
    const ids = await StudentModel.find({ departmentId: query.departmentId }).distinct('_id');
    filter.studentId = { $in: ids };
  }

  return filter;
}

export async function listOvertime(query: OvertimeQuery): Promise<{
  records: unknown[];
  totalHours: number;
  meta: PaginationMeta;
}> {
  const pagination = parsePagination(query);
  const filter = await buildFilter(query);

  const [records, total, totals] = await Promise.all([
    OvertimeModel.find(filter)
      .populate('studentId', 'name position departmentId')
      .populate('studentId.departmentId', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    OvertimeModel.countDocuments(filter),
    OvertimeModel.aggregate<{ _id: null; hours: number }>([
      { $match: filter },
      { $group: { _id: null, hours: { $sum: '$hours' } } },
    ]),
  ]);

  return {
    records,
    totalHours: Math.round((totals[0]?.hours ?? 0) * 100) / 100,
    meta: pageMeta(total, pagination),
  };
}

/** Every entry that matches the filters — used by the CSV export. */
export async function overtimeRows(query: OvertimeQuery): Promise<unknown[]> {
  const filter = await buildFilter(query);
  return OvertimeModel.find(filter)
    .populate('studentId', 'name position departmentId')
    .populate('studentId.departmentId', 'name')
    .sort({ date: 1, createdAt: 1 });
}

export interface OvertimeSummaryRow {
  studentId: string;
  name: string;
  department: string;
  totalHours: number;
  entries: number;
}

/** Per-student overtime totals for one month. */
export async function overtimeSummary(query: OvertimeSummaryQuery): Promise<{
  month: string;
  start: string;
  end: string;
  rows: OvertimeSummaryRow[];
  totals: { hours: number; entries: number };
}> {
  const bounds = resolveMonth(query.month ?? '');
  const filter: Record<string, unknown> = { date: { $gte: bounds.start, $lte: bounds.end } };

  if (typeof query.departmentId === 'string' && query.departmentId) {
    const ids = await StudentModel.find({ departmentId: query.departmentId }).distinct('_id');
    filter.studentId = { $in: ids };
  }

  const grouped = await OvertimeModel.aggregate<{
    _id: Types.ObjectId;
    hours: number;
    entries: number;
  }>([
    { $match: filter },
    {
      $group: {
        _id: '$studentId',
        hours: { $sum: '$hours' },
        entries: { $sum: 1 },
      },
    },
  ]);

  const students = await StudentModel.find({ _id: { $in: grouped.map((row) => row._id) } })
    .select('name departmentId')
    .populate('departmentId', 'name');

  const byId = new Map(students.map((student) => [String(student._id), student]));

  const rows: OvertimeSummaryRow[] = grouped
    .map((row) => {
      const student = byId.get(String(row._id));
      const department = student?.departmentId as { name?: string } | null | undefined;

      return {
        studentId: String(row._id),
        name: student?.name ?? '—',
        department: department?.name ?? '—',
        totalHours: Math.round(row.hours * 100) / 100,
        entries: row.entries,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    month: `${bounds.year}-${String(bounds.month).padStart(2, '0')}`,
    start: bounds.start,
    end: bounds.end,
    rows,
    totals: {
      hours: Math.round(rows.reduce((sum, row) => sum + row.totalHours, 0) * 100) / 100,
      entries: rows.reduce((sum, row) => sum + row.entries, 0),
    },
  };
}

export async function createOvertime(
  payload: OvertimePayload,
  adminId: string,
): Promise<unknown> {
  await assertStudentExists(payload.studentId);
  await assertDayLimit(payload.studentId, payload.date, payload.hours);

  return OvertimeModel.create({
    studentId: new Types.ObjectId(payload.studentId),
    date: payload.date,
    hours: payload.hours,
    note: payload.note?.trim() || '',
    createdBy: new Types.ObjectId(adminId),
    updatedBy: new Types.ObjectId(adminId),
  });
}

export async function updateOvertime(
  id: string,
  payload: Partial<OvertimePayload>,
  adminId: string,
): Promise<unknown> {
  const record = await OvertimeModel.findById(id);
  if (!record) {
    throw new HttpError(404, 'overtime_not_found', 'That overtime entry no longer exists.');
  }

  let checkLimit = false;

  if (payload.studentId !== undefined) {
    await assertStudentExists(payload.studentId);
    record.studentId = new Types.ObjectId(payload.studentId);
    checkLimit = true;
  }

  if (payload.date !== undefined) {
    record.date = payload.date;
    checkLimit = true;
  }

  if (payload.hours !== undefined) {
    record.hours = payload.hours;
    checkLimit = true;
  }

  if (payload.note !== undefined) record.note = payload.note?.trim() || '';

  if (checkLimit) {
    await assertDayLimit(String(record.studentId), record.date, record.hours, id);
  }

  record.updatedBy = new Types.ObjectId(adminId);
  await record.save();
  return record;
}

export async function deleteOvertime(id: string): Promise<{ deleted: boolean }> {
  const record = await OvertimeModel.findById(id);
  if (!record) {
    throw new HttpError(404, 'overtime_not_found', 'That overtime entry no longer exists.');
  }

  await record.deleteOne();
  return { deleted: true };
}
