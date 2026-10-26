import { EventModel } from '../models/Event.ts';
import { eachDate, isWorkingDay } from '../utils/dates.ts';

/**
 * Holiday-aware leave counting.
 *
 * This module is the single source of truth for *which dates* a leave counts
 * and therefore for the stored `days`, the attendance sync, the allowance and
 * the leave preview. The rules are:
 *
 *  - only working days count (`WORKING_WEEK`, Monday-Friday by default);
 *  - a date covered by a `holiday` calendar event never counts, even when it
 *    is a working day;
 *  - dependants (statistics, totals, allowance) use the counted dates by
 *    their actual calendar year and month, not by the leave's start date.
 */
export type HolidayDateSet = ReadonlySet<string>;

export interface LeaveRange {
  startDate: string;
  endDate: string;
}

/** The dates in a range that are not working days. */
export function weekendDatesInRange(start: string, end: string): string[] {
  return eachDate(start, end).filter((date) => !isWorkingDay(date));
}

/**
 * The dates in a range that are working days but covered by a holiday event.
 * Weekend dates hit by a holiday are already excluded as weekends; they are
 * not repeated here.
 */
export function holidayDatesInRange(start: string, end: string, holidayDates: HolidayDateSet): string[] {
  return eachDate(start, end).filter((date) => isWorkingDay(date) && holidayDates.has(date));
}

/** Every date of a range that counts as leave. */
export function countedDatesInRange(
  start: string,
  end: string,
  holidayDates: HolidayDateSet,
): string[] {
  return eachDate(start, end).filter(
    (date) => isWorkingDay(date) && !holidayDates.has(date),
  );
}

/** Every date a leave counts, independent of its status. */
export function countedDatesForLeave(
  leave: LeaveRange,
  holidayDates: HolidayDateSet,
): string[] {
  return countedDatesInRange(leave.startDate, leave.endDate, holidayDates);
}

/** The number of dates a leave counts. */
export function countedDaysForLeave(
  leave: LeaveRange,
  holidayDates: HolidayDateSet,
): number {
  return countedDatesForLeave(leave, holidayDates).length;
}

/** Load every holiday date overlapping an inclusive range. */
export async function holidayDatesForRange(start: string, end: string): Promise<Set<string>> {
  if (end < start) return new Set();

  const events = await EventModel.find({
    type: 'holiday',
    startDate: { $lte: end },
    $or: [{ endDate: { $gte: start } }, { endDate: null }],
  })
    .select('startDate endDate')
    .lean();

  const dates = new Set<string>();

  for (const event of events) {
    const eventStart = event.startDate > start ? event.startDate : start;
    const eventEnd = (event.endDate || event.startDate) < end ? (event.endDate || event.startDate) : end;
    for (const date of eachDate(eventStart, eventEnd)) dates.add(date);
  }

  return dates;
}

/** Load the holiday set and count a range in one call. */
export async function countLeaveRange(start: string, end: string): Promise<{
  holidayDates: Set<string>;
  countedDates: string[];
  days: number;
  weekendDates: string[];
  skippedHolidayDates: string[];
}> {
  const holidayDates = await holidayDatesForRange(start, end);
  return {
    holidayDates,
    countedDates: countedDatesInRange(start, end, holidayDates),
    days: countedDatesInRange(start, end, holidayDates).length,
    weekendDates: weekendDatesInRange(start, end),
    skippedHolidayDates: holidayDatesInRange(start, end, holidayDates),
  };
}

/** Group counted dates by their actual calendar year. */
export function datesByYear(dates: Iterable<string>): Map<number, string[]> {
  const byYear = new Map<number, string[]>();

  for (const date of dates) {
    const year = Number(date.slice(0, 4));
    const list = byYear.get(year) ?? [];
    list.push(date);
    byYear.set(year, list);
  }

  return byYear;
}

/** The counted dates of a set that belong to a year. */
export function datesInYear(dates: Iterable<string>, year: number): string[] {
  const prefix = `${year}-`;
  return [...dates].filter((date) => date.startsWith(prefix));
}

/** The counted dates of a set that belong to a month (1-12). */
export function datesInMonth(dates: Iterable<string>, year: number, month: number): string[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return [...dates].filter((date) => date.startsWith(prefix));
}
