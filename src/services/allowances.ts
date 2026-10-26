import { Types } from 'mongoose';
import { env } from '../config/env.ts';
import { EmployeeModel } from '../models/Employee.ts';
import { LeaveAllowanceModel } from '../models/LeaveAllowance.ts';
import { LeaveModel, type LeaveType } from '../models/Leave.ts';
import { HttpError } from '../utils/response.ts';
import { parsePagination, pageMeta, type PaginationMeta } from '../utils/pagination.ts';
import { monthBounds, today } from '../utils/dates.ts';
import {
  countedDatesForLeave,
  datesByYear,
  datesInMonth,
  holidayDatesForRange,
  type HolidayDateSet,
} from './leaveCounting.ts';

/** A day count in a half-day step. There is no carry-over. */
export interface AllowanceValue {
  allowance: number;
  total: number;
  note: string;
}

export interface AllowanceMonthPoint {
  month: number;
  used: number;
}

/** Labels shared by the API, the profile, the Allowances tab and the CSV. */
export interface AllowanceBalanceCopy {
  expired: boolean;
  remainingLabel: string;
  expiredNote: string | null;
}

export interface AllowanceSummary extends AllowanceValue, AllowanceBalanceCopy {
  employeeId: string;
  year: number;
  used: number;
  pending: number;
  remaining: number;
  months: AllowanceMonthPoint[];
}

export interface AllowanceOverviewRow extends AllowanceSummary {
  name: string;
  departmentId: string | null;
  department: string | null;
  position: string | null;
  usedInMonth: number | null;
}

export interface AllowanceOverviewQuery {
  year?: unknown;
  departmentId?: unknown;
  search?: unknown;
  month?: unknown;
  page?: unknown;
  perPage?: unknown;
}

export interface AllowanceYearCheck extends AllowanceBalanceCopy {
  year: number;
  allowance: number;
  total: number;
  usedBefore: number;
  added: number;
  usedAfter: number;
  remaining: number;
}

export interface AllowanceCheck {
  consumesAllowance: boolean;
  countedDays: number;
  years: AllowanceYearCheck[];
  wouldExceed: boolean;
}

function roundDays(value: number): number {
  return Math.round(value * 2) / 2;
}

export const HOLIDAY_REMAINING_LABEL = 'Holiday remaining';
export const HOLIDAY_EXPIRED_LABEL = 'Holiday unused (expired)';
export const OVER_ALLOWANCE_LABEL = 'Over allowance';

/**
 * The wording for a balance. Unused days in a past year have expired; a
 * negative balance is an over-allowance in every year.
 */
export function allowanceBalanceCopy(year: number, remaining: number): AllowanceBalanceCopy {
  const expired = year < Number(today().slice(0, 4));
  const remainingLabel = expired
    ? remaining < 0
      ? OVER_ALLOWANCE_LABEL
      : HOLIDAY_EXPIRED_LABEL
    : HOLIDAY_REMAINING_LABEL;

  return {
    expired,
    remainingLabel,
    expiredNote:
      expired && remaining >= 0
        ? `These days expired on 31 December ${year}.`
        : null,
  };
}

/** The column/header wording for a whole year, independent of one row's value. */
export function allowanceRemainingHeading(year: number): string {
  return year < Number(today().slice(0, 4))
    ? HOLIDAY_EXPIRED_LABEL
    : HOLIDAY_REMAINING_LABEL;
}

/** The expiry note for a whole past year, independent of one row's value. */
export function allowanceExpiredNote(year: number): string | null {
  return year < Number(today().slice(0, 4))
    ? `These days expired on 31 December ${year}.`
    : null;
}

function configFromRow(
  row: { allowance: number; note?: string | null } | null,
): AllowanceValue {
  const allowance = row?.allowance ?? env.annualAllowanceDefault;
  return {
    allowance,
    total: roundDays(allowance),
    note: row?.note ?? '',
  };
}

export async function getAllowanceValue(employeeId: string, year: number): Promise<AllowanceValue> {
  const row = await LeaveAllowanceModel.findOne({ employeeId, year }).lean();
  return configFromRow(row);
}

interface VacationBuckets {
  approved: Map<number, string[]>;
  pending: Map<number, string[]>;
}

/**
 * Counted vacation dates of an employee, grouped by status and calendar year.
 *
 * A single holiday lookup covers every leave in the range. The leave's stored
 * `days` is deliberately not used: the allowance depends on the counted dates,
 * which may have changed after a holiday event was edited.
 */
async function vacationDates(
  employeeId: string,
  years: number[],
  excludeLeaveId?: string,
): Promise<VacationBuckets> {
  const buckets: VacationBuckets = { approved: new Map(), pending: new Map() };
  if (!years.length) return buckets;

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const rangeStart = `${minYear}-01-01`;
  const rangeEnd = `${maxYear}-12-31`;

  const filter: Record<string, unknown> = {
    employeeId: new Types.ObjectId(employeeId),
    type: 'vacation',
    status: { $in: ['approved', 'pending'] },
    startDate: { $lte: rangeEnd },
    endDate: { $gte: rangeStart },
  };

  if (excludeLeaveId) {
    filter._id = { $ne: new Types.ObjectId(excludeLeaveId) };
  }

  const leaves = await LeaveModel.find(filter)
    .select('startDate endDate status')
    .lean();

  if (!leaves.length) return buckets;

  const holidayDates = await holidayDatesForRange(rangeStart, rangeEnd);
  const wanted = new Set(years);

  for (const leave of leaves) {
    const status = leave.status as 'approved' | 'pending';
    const byYear = datesByYear(countedDatesForLeave(leave, holidayDates));
    for (const [year, dates] of byYear) {
      if (!wanted.has(year)) continue;
      const list = buckets[status].get(year) ?? [];
      list.push(...dates);
      buckets[status].set(year, list);
    }
  }

  return buckets;
}

function monthsFromDates(dates: string[]): AllowanceMonthPoint[] {
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, used: 0 }));
  for (const date of dates) {
    const month = Number(date.slice(5, 7));
    const point = months[month - 1];
    if (point) point.used += 1;
  }
  return months;
}

async function summaryForEmployee(
  employeeId: string,
  year: number,
): Promise<AllowanceSummary> {
  const [config, buckets] = await Promise.all([
    getAllowanceValue(employeeId, year),
    vacationDates(employeeId, [year]),
  ]);

  const usedDates = buckets.approved.get(year) ?? [];
  const pendingDates = buckets.pending.get(year) ?? [];
  const remaining = roundDays(config.total - usedDates.length);

  return {
    employeeId,
    year,
    ...config,
    ...allowanceBalanceCopy(year, remaining),
    used: usedDates.length,
    pending: pendingDates.length,
    remaining,
    months: monthsFromDates(usedDates),
  };
}

export async function employeeAllowance(employeeId: string, year: number): Promise<AllowanceSummary> {
  if (!(await EmployeeModel.exists({ _id: employeeId }))) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }
  return summaryForEmployee(employeeId, year);
}

export interface AllowanceMonthLeave {
  leaveId: string;
  category: string | null;
  startDate: string;
  endDate: string;
  days: number;
  dates: string[];
  reason: string;
}

export interface AllowanceMonthResult {
  employeeId: string;
  year: number;
  month: number;
  total: number;
  leaves: AllowanceMonthLeave[];
}

/** The approved vacation days of one employee in one month, grouped by leave. */
export async function employeeAllowanceMonth(
  employeeId: string,
  year: number,
  month: number,
): Promise<AllowanceMonthResult> {
  if (!(await EmployeeModel.exists({ _id: employeeId }))) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  const bounds = monthBounds(year, month);
  const holidayDates = await holidayDatesForRange(bounds.start, bounds.end);

  const leaves = await LeaveModel.find({
    employeeId: new Types.ObjectId(employeeId),
    type: 'vacation',
    status: 'approved',
    startDate: { $lte: bounds.end },
    endDate: { $gte: bounds.start },
  })
    .select('startDate endDate category reason')
    .sort({ startDate: 1, createdAt: 1 })
    .lean();

  const result: AllowanceMonthLeave[] = [];

  for (const leave of leaves) {
    const clippedStart = leave.startDate > bounds.start ? leave.startDate : bounds.start;
    const clippedEnd = leave.endDate < bounds.end ? leave.endDate : bounds.end;
    const dates = countedDatesForLeave(
      { startDate: clippedStart, endDate: clippedEnd },
      holidayDates as HolidayDateSet,
    );
    if (!dates.length) continue;

    result.push({
      leaveId: String(leave._id),
      category: leave.category ?? null,
      startDate: clippedStart,
      endDate: clippedEnd,
      days: dates.length,
      dates,
      reason: leave.reason ?? '',
    });
  }

  return {
    employeeId,
    year,
    month,
    total: result.reduce((sum, leave) => sum + leave.days, 0),
    leaves: result,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readYear(value: unknown, fallback: number): number {
  const year = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : fallback;
}

function readMonth(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const month = Number.parseInt(String(value), 10);
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : null;
}

function overviewEmployeeFilter(query: AllowanceOverviewQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = { status: 'active' };

  if (typeof query.departmentId === 'string' && query.departmentId) {
    filter.departmentId = new Types.ObjectId(query.departmentId);
  }

  if (typeof query.search === 'string' && query.search.trim()) {
    const pattern = new RegExp(escapeRegExp(query.search.trim()), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { position: pattern }];
  }

  return filter;
}

async function overviewRows(
  query: AllowanceOverviewQuery,
): Promise<{
  rows: AllowanceOverviewRow[];
  year: number;
  month: number | null;
  monthTotals: AllowanceMonthPoint[];
  total: number;
}> {
  const year = readYear(query.year, Number(today().slice(0, 4)));
  const month = readMonth(query.month);

  const employees = await EmployeeModel.find(overviewEmployeeFilter(query))
    .select('name position departmentId')
    .populate('departmentId', 'name')
    .sort({ name: 1 })
    .lean();

  const rows: AllowanceOverviewRow[] = [];

  for (const employee of employees) {
    const summary = await summaryForEmployee(String(employee._id), year);
    const department = employee.departmentId as unknown as
      | { _id?: unknown; name?: string }
      | null;
    const monthPoint = month ? summary.months.find((point) => point.month === month) : null;

    rows.push({
      ...summary,
      name: employee.name,
      departmentId: department?._id ? String(department._id) : null,
      department: department?.name ?? null,
      position: employee.position ?? null,
      usedInMonth: monthPoint ? monthPoint.used : null,
    });
  }

  const monthTotals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, used: 0 }));
  for (const row of rows) {
    for (const point of row.months) {
      const total = monthTotals[point.month - 1];
      if (total) total.used += point.used;
    }
  }

  return { rows, year, month, monthTotals, total: rows.length };
}

export async function listAllowances(query: AllowanceOverviewQuery): Promise<{
  allowances: AllowanceOverviewRow[];
  year: number;
  month: number | null;
  monthTotals: AllowanceMonthPoint[];
  meta: PaginationMeta;
}> {
  const pagination = parsePagination(query);
  const result = await overviewRows(query);
  const start = pagination.skip;
  const end = start + pagination.limit;

  return {
    allowances: result.rows.slice(start, end),
    year: result.year,
    month: result.month,
    monthTotals: result.monthTotals,
    meta: pageMeta(result.total, pagination),
  };
}

/** Every filtered row for the CSV export (the whole set, never one page). */
export async function allowanceRows(query: AllowanceOverviewQuery): Promise<{
  rows: AllowanceOverviewRow[];
  year: number;
  month: number | null;
}> {
  const result = await overviewRows(query);
  return { rows: result.rows, year: result.year, month: result.month };
}

export async function setAllowance(
  employeeId: string,
  year: number,
  input: { allowance: number; note?: string | null },
  adminId: string,
): Promise<AllowanceSummary> {
  if (!(await EmployeeModel.exists({ _id: employeeId }))) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  await LeaveAllowanceModel.findOneAndUpdate(
    { employeeId: new Types.ObjectId(employeeId), year },
    {
      $set: {
        allowance: input.allowance,
        note: input.note?.trim() ?? '',
        updatedBy: new Types.ObjectId(adminId),
      },
      $setOnInsert: { createdBy: new Types.ObjectId(adminId) },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return summaryForEmployee(employeeId, year);
}

async function usageForRange(
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeLeaveId?: string,
): Promise<{ countedDates: string[]; check: AllowanceCheck }> {
  const holidayDates = await holidayDatesForRange(startDate, endDate);
  const countedDates = countedDatesForLeave({ startDate, endDate }, holidayDates);
  const byYear = datesByYear(countedDates);
  const years = [...byYear.keys()].sort((a, b) => a - b);

  if (!years.length) {
    return {
      countedDates,
      check: { consumesAllowance: true, countedDays: 0, years: [], wouldExceed: false },
    };
  }

  const buckets = await vacationDates(employeeId, years, excludeLeaveId);
  const yearChecks: AllowanceYearCheck[] = [];

  for (const year of years) {
    const config = await getAllowanceValue(employeeId, year);
    const added = byYear.get(year)?.length ?? 0;
    const usedBefore = (buckets.approved.get(year) ?? []).length;
    const usedAfter = usedBefore + added;

    const remaining = roundDays(config.total - usedAfter);
    yearChecks.push({
      year,
      allowance: config.allowance,
      total: config.total,
      usedBefore,
      added,
      usedAfter,
      remaining,
      ...allowanceBalanceCopy(year, remaining),
    });
  }

  return {
    countedDates,
    check: {
      consumesAllowance: true,
      countedDays: countedDates.length,
      years: yearChecks,
      wouldExceed: yearChecks.some((entry) => entry.remaining < 0),
    },
  };
}

/**
 * Check whether a vacation would take an employee below zero in any calendar
 * year it touches. `planning` is the UI hint (weekends/holidays skipped); the
 * over-allowance guard is the server's decision.
 */
export async function checkVacationAllowance(input: {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  excludeLeaveId?: string;
}): Promise<{
  countedDates: string[];
  consumesAllowance: boolean;
  years: AllowanceYearCheck[];
  wouldExceed: boolean;
}> {
  if (input.type !== 'vacation') {
    return { countedDates: [], consumesAllowance: false, years: [], wouldExceed: false };
  }

  const { countedDates, check } = await usageForRange(
    input.employeeId,
    input.startDate,
    input.endDate,
    input.excludeLeaveId,
  );

  return {
    countedDates,
    consumesAllowance: true,
    years: check.years,
    wouldExceed: check.wouldExceed,
  };
}

/** Throw the 409 unless the caller confirmed the over-allowance. */
export async function assertVacationAllowance(
  input: {
    employeeId: string;
    type: LeaveType;
    startDate: string;
    endDate: string;
    excludeLeaveId?: string;
  },
  confirmOverAllowance = false,
): Promise<void> {
  if (confirmOverAllowance) return;

  const result = await checkVacationAllowance(input);
  if (!result.consumesAllowance || !result.wouldExceed) return;

  const over = result.years.filter((entry) => entry.remaining < 0);
  const detail = over
    .map(
      (entry) =>
        `${entry.year}: ${entry.added} day${entry.added === 1 ? '' : 's'} requested, ` +
        `${entry.total} available, ${entry.usedBefore} already used, ` +
        `${Math.abs(entry.remaining)} over`,
    )
    .join('; ');

  throw new HttpError(
    409,
    'allowance_exceeded',
    `This vacation exceeds the holiday allowance (${detail}). Confirm to book it anyway.`,
    { years: result.years, countedDays: result.countedDates.length },
  );
}

export interface LeavePreview {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  countedDates: string[];
  skippedWeekendDates: string[];
  skippedHolidayDates: string[];
  consumesAllowance: boolean;
  years: AllowanceYearCheck[];
  allowanceYear: number | null;
  allowanceTotal: number | null;
  usedBefore: number | null;
  remainingBefore: number | null;
  usedAfter: number | null;
  remainingAfter: number | null;
  wouldExceed: boolean;
}

export async function previewLeave(input: {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  excludeLeaveId?: string;
}): Promise<LeavePreview> {
  if (input.endDate < input.startDate) {
    throw new HttpError(422, 'leave_range_invalid', 'The end date cannot be before the start date.');
  }

  if (!(await EmployeeModel.exists({ _id: input.employeeId }))) {
    throw new HttpError(422, 'employee_not_found', 'That employee does not exist.');
  }

  const holidayDates = await holidayDatesForRange(input.startDate, input.endDate);
  const countedDates = countedDatesForLeave(input, holidayDates);
  const skippedWeekendDates = (() => {
    const dates: string[] = [];
    for (let cursor = input.startDate; cursor <= input.endDate; ) {
      dates.push(cursor);
      const [year, month, day] = cursor.split('-').map(Number);
      const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
      cursor = next.toISOString().slice(0, 10);
    }
    return dates.filter((date) => !countedDates.includes(date) && !holidayDates.has(date));
  })();
  const skippedHolidayDates = [...holidayDates]
    .filter((date) => date >= input.startDate && date <= input.endDate && !skippedWeekendDates.includes(date))
    .sort();

  const base: LeavePreview = {
    employeeId: input.employeeId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days: countedDates.length,
    countedDates,
    skippedWeekendDates,
    skippedHolidayDates,
    consumesAllowance: input.type === 'vacation',
    years: [],
    allowanceYear: null,
    allowanceTotal: null,
    usedBefore: null,
    remainingBefore: null,
    usedAfter: null,
    remainingAfter: null,
    wouldExceed: false,
  };

  if (input.type !== 'vacation') return base;

  const { check } = await usageForRange(
    input.employeeId,
    input.startDate,
    input.endDate,
    input.excludeLeaveId,
  );
  const primary = check.years[0];

  return {
    ...base,
    years: check.years,
    allowanceYear: primary?.year ?? null,
    allowanceTotal: primary?.total ?? null,
    usedBefore: primary?.usedBefore ?? null,
    remainingBefore: primary ? roundDays(primary.total - primary.usedBefore) : null,
    usedAfter: primary?.usedAfter ?? null,
    remainingAfter: primary?.remaining ?? null,
    wouldExceed: check.wouldExceed,
  };
}
