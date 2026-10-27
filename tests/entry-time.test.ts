/**
 * The rule that decides which calendar day an entered time belongs to.
 *
 * Pure unit tests with fixed instants, so they never depend on the machine's
 * clock: every case names the server time and the time the person picked.
 * The London timezone is passed explicitly (Europe/London is GMT in the
 * winter dates used here, which keeps the arithmetic easy to follow).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format12Hour, parseClock, resolveEntryDate } from '../src/utils/entryTime.ts';
import { HttpError } from '../src/utils/response.ts';

const LONDON = 'Europe/London';

/** Assert that the rule refuses, with the documented status and code. */
function assertRefused(enteredTime: string, now: string): void {
  try {
    resolveEntryDate(enteredTime, new Date(now), LONDON);
    assert.fail(`Expected ${enteredTime} at ${now} to be refused`);
  } catch (error) {
    assert.ok(error instanceof HttpError, `expected an HttpError, got ${String(error)}`);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'time_in_future');
    assert.equal(error.message, 'That time is later than now. Please check AM/PM.');
    assert.deepEqual(error.details, [
      { path: 'time', message: 'That time is later than now. Please check AM/PM.' },
    ]);
  }
}

describe('resolveEntryDate', () => {
  it('keeps an earlier time on today, however early it was', () => {
    assert.equal(resolveEntryDate('09:05', new Date('2026-01-15T14:00:00.000Z'), LONDON), '2026-01-15');
    assert.equal(resolveEntryDate('00:00', new Date('2026-01-15T23:59:00.000Z'), LONDON), '2026-01-15');
    assert.equal(resolveEntryDate('23:58', new Date('2026-01-15T23:59:00.000Z'), LONDON), '2026-01-15');
  });

  it('accepts a time up to five minutes ahead (clock skew)', () => {
    assert.equal(resolveEntryDate('00:12', new Date('2026-01-15T00:10:00.000Z'), LONDON), '2026-01-15');
    assert.equal(resolveEntryDate('14:05', new Date('2026-01-15T14:00:00.000Z'), LONDON), '2026-01-15');
  });

  it('assigns 11:50 PM submitted at 00:10 to yesterday', () => {
    assert.equal(resolveEntryDate('23:50', new Date('2026-01-15T00:10:00.000Z'), LONDON), '2026-01-14');
    assert.equal(resolveEntryDate('23:59', new Date('2026-01-15T00:02:00.000Z'), LONDON), '2026-01-14');
  });

  it('refuses 10:00 AM submitted at 00:10 — that is hours in the future', () => {
    assertRefused('10:00', '2026-01-15T00:10:00.000Z');
  });

  it('refuses 11:50 PM submitted at 03:30 — yesterday is over six hours back', () => {
    assertRefused('23:50', '2026-01-15T03:30:00.000Z');
    // Just before 3:00 AM the same time is still accepted, and at 02:00 a
    // much earlier evening time is already more than six hours back.
    assert.equal(resolveEntryDate('23:50', new Date('2026-01-15T02:59:00.000Z'), LONDON), '2026-01-14');
    assertRefused('19:00', '2026-01-15T02:00:00.000Z');
  });

  it('refuses a normal time later today', () => {
    assertRefused('16:30', '2026-01-15T14:00:00.000Z');
    assertRefused('23:59', '2026-01-15T12:00:00.000Z');
  });

  it('follows the London clock across the BST boundary', () => {
    // 23:30 UTC on 14 July is 00:30 BST on 15 July.
    assert.equal(resolveEntryDate('23:50', new Date('2026-07-14T23:30:00.000Z'), LONDON), '2026-07-14');
    assertRefused('10:00', '2026-07-14T23:30:00.000Z');
  });

  it('refuses a value that is not a clock time at all', () => {
    assert.throws(() => resolveEntryDate('25:99', new Date('2026-01-15T10:00:00.000Z'), LONDON), HttpError);
    assert.throws(() => resolveEntryDate('nine', new Date('2026-01-15T10:00:00.000Z'), LONDON), HttpError);
  });
});

describe('12-hour formatting', () => {
  it('renders the UK 12-hour clock the way the form shows it', () => {
    assert.equal(format12Hour(0), '12:00 AM');
    assert.equal(format12Hour(5), '12:05 AM');
    assert.equal(format12Hour(9 * 60 + 5), '09:05 AM');
    assert.equal(format12Hour(12 * 60), '12:00 PM');
    assert.equal(format12Hour(13 * 60 + 5), '01:05 PM');
    assert.equal(format12Hour(23 * 60 + 50), '11:50 PM');
  });

  it('parses the 24h value the picker sends', () => {
    assert.equal(parseClock('00:00'), 0);
    assert.equal(parseClock('09:05'), 545);
    assert.equal(parseClock('23:59'), 1439);
    assert.equal(parseClock('24:00'), null);
    assert.equal(parseClock('9:05'), null);
  });
});
