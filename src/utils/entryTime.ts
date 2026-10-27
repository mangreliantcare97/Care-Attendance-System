import { HttpError } from './response.ts';
import { addDays, nowTime, today } from './dates.ts';

/** `HH:mm` (24h) -> minutes since midnight, or null when unparseable. */
export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight -> `HH:mm`. */
export function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Minutes since midnight -> `hh:mm AM/PM` (UK convention, 12-hour clock). */
export function format12Hour(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** A `Date` as `hh:mm AM/PM` in the application timezone. */
export function format12HourNow(now: Date, timezone: string): string {
  const [hour, minute] = nowTime(timezone, now).split(':').map(Number);
  return format12Hour(hour * 60 + minute);
}

/**
 * Decide which calendar day an entered time belongs to.
 *
 * The server's day is "today" in `APP_TIMEZONE`. A time that is *earlier*
 * today is fine — people fill the form in after the event. A time more than
 * five minutes ahead is only accepted as **yesterday** when the server clock
 * is before 03:00 and that moment is no more than six hours in the past, which
 * is what makes "11:50 PM" submitted at 00:10 belong to yesterday. Everything
 * else is refused with `400 time_in_future`.
 */
export function resolveEntryDate(enteredTime: string, now: Date, timezone: string): string {
  const entered = parseClock(enteredTime);
  if (entered === null) {
    throw new HttpError(400, 'validation_error', 'That time is not valid.');
  }

  const serverTime = nowTime(timezone, now);
  const [hour, minute] = serverTime.split(':').map(Number);
  const nowMinutes = hour * 60 + minute;
  const serverDate = today(timezone, now);

  const skew = entered - nowMinutes;
  if (skew <= 5) return serverDate;

  // More than five minutes ahead: try yesterday's date.
  const beforeThreeInMorning = nowMinutes < 3 * 60;
  const minutesSinceYesterday = nowMinutes + 24 * 60 - entered;
  if (beforeThreeInMorning && minutesSinceYesterday <= 6 * 60) {
    return addDays(serverDate, -1);
  }

  throw new HttpError(
    400,
    'time_in_future',
    'That time is later than now. Please check AM/PM.',
    [{ path: 'time', message: 'That time is later than now. Please check AM/PM.' }],
  );
}
