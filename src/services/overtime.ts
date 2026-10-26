import { Types } from 'mongoose';
import { OvertimeModel } from '../models/Overtime.ts';
import { EmployeeModel } from '../models/Employee.ts';
import { HttpError } from '../utils/response.ts';
import { parsePagination, pageMeta, type PaginationMeta } from '../utils/pagination.ts';
import { resolveMonth } from '../utils/dates.ts';

/** The most hours one employee can book on one calendar day. */
export const MAX_DAY_HOURS = 24;

export interface OvertimePayload {
  employeeId: string;
  date: string;
  hours: number;
  note?: string | null;
}

export interface OvertimeQuery {
  from?: unknown;
  to?: unknown;
  employeeId?: unknown;
  departmentId?: unknown;
  page?: unknown;
  perPage?: unknown;
}

export interface OvertimeSummaryQuery {
  month?: string;
  departmentId?: unknown;
}

async function assertEmployeeExists(employeeId: string): Promise<void> {
  if (!(await EmployeeModel.exists({ _id: employeeId }))) {
    throw new HttpError(422, 'employee_not_found', 'That employee does not exist.');
  }
}

/**
 * The hours already booked for an employee on a day, optionally excluding the
 * record that is being edited.
 */
async function bookedHours(
  employeeId: string,
  date: string,
  excludeId?: string,
): Promise<number> {
  const match: Record<string, unknown> = {
    employeeId: new Types.ObjectId(employeeId),
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
 * Several entries per employee and day are allowed, but their sum may never
 * exceed 24 hours. A tiny epsilon keeps floating point sums exact
 * (`0.25` is representable, but four quarters can still add up to
 * `0.9999999999999999` in an aggregation).
 */
async function assertDayLimit(
  employeeId: string,
  date: string,
  hours: number,
  excludeId?: string,
): Promise<void> {
  const total = (await bookedHours(employeeId, date, excludeId)) + hours;

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

  if (typeof query.employeeId === 'string' && query.employeeId) {
    filter.employeeId = new Types.ObjectId(query.employeeId);
  }

  if (typeof query.departmentId === 'string' && query.departmentId) {
    const ids = await EmployeeModel.find({ departmentId: query.departmentId }).distinct('_id');
    filter.employeeId = { $in: ids };
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
      .populate('employeeId', 'name position departmentId')
      .populate('employeeId.departmentId', 'name')
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
    .populate('employeeId', 'name position departmentId')
    .populate('employeeId.departmentId', 'name')
    .sort({ date: 1, createdAt: 1 });
}

export interface OvertimeSummaryRow {
  employeeId: string;
  name: string;
  department: string;
  totalHours: number;
  entries: number;
}

/** Per-employee overtime totals for one month. */
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
    const ids = await EmployeeModel.find({ departmentId: query.departmentId }).distinct('_id');
    filter.employeeId = { $in: ids };
  }

  const grouped = await OvertimeModel.aggregate<{
    _id: Types.ObjectId;
    hours: number;
    entries: number;
  }>([
    { $match: filter },
    {
      $group: {
        _id: '$employeeId',
        hours: { $sum: '$hours' },
        entries: { $sum: 1 },
      },
    },
  ]);

  const employees = await EmployeeModel.find({ _id: { $in: grouped.map((row) => row._id) } })
    .select('name departmentId')
    .populate('departmentId', 'name');

  const byId = new Map(employees.map((employee) => [String(employee._id), employee]));

  const rows: OvertimeSummaryRow[] = grouped
    .map((row) => {
      const employee = byId.get(String(row._id));
      const department = employee?.departmentId as { name?: string } | null | undefined;

      return {
        employeeId: String(row._id),
        name: employee?.name ?? '—',
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
  await assertEmployeeExists(payload.employeeId);
  await assertDayLimit(payload.employeeId, payload.date, payload.hours);

  return OvertimeModel.create({
    employeeId: new Types.ObjectId(payload.employeeId),
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

  if (payload.employeeId !== undefined) {
    await assertEmployeeExists(payload.employeeId);
    record.employeeId = new Types.ObjectId(payload.employeeId);
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
    await assertDayLimit(String(record.employeeId), record.date, record.hours, id);
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
