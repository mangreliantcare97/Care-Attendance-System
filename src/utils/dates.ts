import { env } from '../config/env.ts';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MS_PER_DAY = 86_400_000;

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Number of days in a (1-based) month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The current calendar day in the application timezone, as `YYYY-MM-DD`.
 *
 * "Today" is a calendar concept: it must follow the configured timezone
 * (Europe/London by default) and never the server's UTC offset.
 */
export function today(timezone: string = env.appTimezone, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The current time in the application timezone, as `HH:mm`. */
export function nowTime(timezone: string = env.appTimezone, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/** Parse a `YYYY-MM-DD` string into a UTC-midnight Date (used for arithmetic only). */
export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Format a Date as `YYYY-MM-DD` in the given timezone. */
export function formatDate(date: Date, timezone: string = env.appTimezone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Shift a `YYYY-MM-DD` string by a number of days. */
export function addDays(date: string, days: number): string {
  const shifted = parseDate(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Whole days between two `YYYY-MM-DD` strings (`to - from`). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY);
}

/** Inclusive list of calendar days between two `YYYY-MM-DD` strings. */
export function eachDate(start: string, end: string): string[] {
  const total = diffDays(start, end);
  if (total < 0) return [];
  const dates: string[] = [];
  for (let offset = 0; offset <= total; offset += 1) {
    dates.push(addDays(start, offset));
  }
  return dates;
}

/**
 * Is `date` after "today" in the application timezone?
 *
 * Dates are plain strings, so this is a plain lexicographic comparison — a
 * `YYYY-MM-DD` string sorts correctly by design.
 */
export function isAfterToday(date: string, timezone: string = env.appTimezone, now: Date = new Date()): boolean {
  return date > today(timezone, now);
}

/** First and last day of a month, both as `YYYY-MM-DD`. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`,
  };
}

/** The month that "now" belongs to, in the application timezone. */
export function currentMonth(
  timezone: string = env.appTimezone,
  now: Date = new Date(),
): {
  year: number;
  month: number;
  start: string;
  end: string;
} {
  const [year, month] = today(timezone, now).split('-').map(Number);
  return { year, month, ...monthBounds(year, month) };
}

/** Resolve a `YYYY-MM` string into the bounds of that month. */
export function resolveMonth(value: string): { year: number; month: number; start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    const now = currentMonth();
    return { year: now.year, month: now.month, start: now.start, end: now.end };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  return { year, month, ...monthBounds(year, month) };
}
