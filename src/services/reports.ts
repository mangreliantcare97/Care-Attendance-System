import { Types } from 'mongoose';
import { AttendanceModel } from '../models/Attendance.ts';
import { EmployeeModel } from '../models/Employee.ts';
import { HttpError } from '../utils/response.ts';
import { pageMeta, parsePagination, type PaginationMeta } from '../utils/pagination.ts';

export interface AttendanceSummaryQuery {
  from?: unknown;
  to?: unknown;
  departmentId?: unknown;
  employeeId?: unknown;
  page?: unknown;
  perPage?: unknown;
}

export interface AttendanceSummaryRow {
  employeeId: string;
  name: string;
  position: string | null;
  department: string | null;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  vacation: number;
  /** (present + late) / (present + late + absent), in percent; `null` without counted days. */
  rate: number | null;
}

export interface AttendanceSummaryTotals {
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  vacation: number;
  rate: number | null;
}

/** Round to one decimal; a whole number stays a number. */
function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function withRate(row: Omit<AttendanceSummaryRow, 'rate'>): AttendanceSummaryRow {
  const counted = row.present + row.late + row.absent;
  return {
    ...row,
    rate: percentage(row.present + row.late, counted),
  };
}

/**
 * Build the attendance filter.
 *
 * A date range is inclusive. A department filter resolves the employees of
 * that department first — the report groups by employee, so the grouping can
 * never fan out into a query per employee.
 */
async function buildMatch(query: AttendanceSummaryQuery): Promise<Record<string, unknown>> {
  const from = typeof query.from === 'string' ? query.from : '';
  const to = typeof query.to === 'string' ? query.to : '';

  if (from && to && to < from) {
    throw new HttpError(422, 'report_range_invalid', 'The end date cannot be before the start date.');
  }

  const match: Record<string, unknown> = {};

  if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    match.date = range;
  }

  if (typeof query.employeeId === 'string' && query.employeeId) {
    match.employeeId = new Types.ObjectId(query.employeeId);
  } else if (typeof query.departmentId === 'string' && query.departmentId) {
    const ids = await EmployeeModel.find({ departmentId: query.departmentId }).distinct('_id');
    match.employeeId = { $in: ids };
  }

  return match;
}

/**
 * The shared aggregation: one row per employee with the five status counts.
 *
 * The employee lookup projects only name and position (never the photo), and
 * the department name comes from a second lookup — no N+1 queries.
 */
function summaryPipeline(match: Record<string, unknown>) {
  return [
    { $match: match },
    {
      $group: {
        _id: '$employeeId',
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
        vacation: { $sum: { $cond: [{ $eq: ['$status', 'vacation'] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'employees',
        localField: '_id',
        foreignField: '_id',
        as: 'employee',
      },
    },
    { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'departments',
        localField: 'employee.departmentId',
        foreignField: '_id',
        as: 'department',
      },
    },
    {
      $project: {
        _id: 0,
        employeeId: { $toString: '$_id' },
        name: { $ifNull: ['$employee.name', '—'] },
        position: { $ifNull: ['$employee.position', null] },
        department: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, null] },
        present: 1,
        late: 1,
        absent: 1,
        onLeave: 1,
        vacation: 1,
      },
    },
  ];
}

/** Per-employee attendance summary for a range, paginated, with a totals row. */
export async function attendanceSummary(query: AttendanceSummaryQuery): Promise<{
  rows: AttendanceSummaryRow[];
  totals: AttendanceSummaryTotals;
  meta: PaginationMeta;
}> {
  const pagination = parsePagination(query);
  const match = await buildMatch(query);

  const [facet] = await AttendanceModel.aggregate<{
    rows: Array<Omit<AttendanceSummaryRow, 'rate'>>;
    totals: Array<Omit<AttendanceSummaryTotals, 'rate'>>;
    count: Array<{ total: number }>;
  }>([
    ...summaryPipeline(match),
    {
      $facet: {
        rows: [
          { $sort: { name: 1, employeeId: 1 } },
          { $skip: pagination.skip },
          { $limit: pagination.limit },
        ],
        totals: [
          {
            $group: {
              _id: null,
              present: { $sum: '$present' },
              late: { $sum: '$late' },
              absent: { $sum: '$absent' },
              onLeave: { $sum: '$onLeave' },
              vacation: { $sum: '$vacation' },
            },
          },
        ],
        count: [{ $count: 'total' }],
      },
    },
  ]);

  const rawTotals = facet?.totals[0] ?? {
    present: 0,
    late: 0,
    absent: 0,
    onLeave: 0,
    vacation: 0,
  };
  const total = facet?.count[0]?.total ?? 0;

  return {
    rows: (facet?.rows ?? []).map(withRate),
    totals: {
      ...rawTotals,
      rate: percentage(rawTotals.present + rawTotals.late, rawTotals.present + rawTotals.late + rawTotals.absent),
    },
    meta: pageMeta(total, pagination),
  };
}

/** Every row of the report — used by the CSV export (no pagination). */
export async function attendanceSummaryRows(
  query: AttendanceSummaryQuery,
): Promise<AttendanceSummaryRow[]> {
  const match = await buildMatch(query);
  const rows = await AttendanceModel.aggregate<Omit<AttendanceSummaryRow, 'rate'>>([
    ...summaryPipeline(match),
    { $sort: { name: 1, employeeId: 1 } },
  ]);

  return rows.map(withRate);
}
