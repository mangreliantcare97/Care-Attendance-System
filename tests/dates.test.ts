/**
 * Calendar and timezone helpers.
 *
 * These are pure unit tests: every call passes an explicit instant and/or
 * timezone, so the result never depends on the machine's clock or locale.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  currentMonth,
  diffDays,
  formatDate,
  isAfterToday,
  isDateString,
  monthBounds,
  resolveMonth,
  today,
  workingDaysBetween,
} from '../src/utils/dates.ts';

const LONDON = 'Europe/London';
const MON_FRI = [1, 2, 3, 4, 5];

describe('dates', () => {
  it('shifts a late UTC instant to the next London day during BST', () => {
    // 23:30 UTC on 2026-06-15 is 00:30 on 2026-06-16 in London (UTC+1).
    const instant = new Date('2026-06-15T23:30:00.000Z');

    assert.equal(formatDate(instant, LONDON), '2026-06-16');
    assert.equal(today(LONDON, instant), '2026-06-16');
  });

  it('keeps the same day late in the evening during GMT', () => {
    // In January London is UTC+0 — 23:30 UTC is still the same day.
    const instant = new Date('2026-01-15T23:30:00.000Z');

    assert.equal(formatDate(instant, LONDON), '2026-01-15');
    assert.equal(today(LONDON, instant), '2026-01-15');
  });

  it('rolls the month over at the London boundary, not at UTC', () => {
    // 23:30 UTC on 31 May is 00:30 on 1 June in London.
    const mayInstant = new Date('2026-05-31T23:30:00.000Z');
    assert.equal(today(LONDON, mayInstant), '2026-06-01');

    const june = currentMonth(LONDON, mayInstant);
    assert.equal(june.year, 2026);
    assert.equal(june.month, 6);
    assert.equal(june.start, '2026-06-01');
    assert.equal(june.end, '2026-06-30');

    // In January (GMT) the same wall-clock instant is still 31 January.
    const january = currentMonth(LONDON, new Date('2026-01-31T23:30:00.000Z'));
    assert.equal(january.year, 2026);
    assert.equal(january.month, 1);
    assert.equal(january.start, '2026-01-01');
    assert.equal(january.end, '2026-01-31');
  });

  it('uses the application timezone when resolving a month', () => {
    const february = resolveMonth('2026-02');
    assert.deepEqual(february, {
      year: 2026,
      month: 2,
      start: '2026-02-01',
      end: '2026-02-28',
    });

    const leapFebruary = resolveMonth('2024-02');
    assert.equal(leapFebruary.end, '2024-02-29');

    assert.deepEqual(monthBounds(2026, 12), { start: '2026-12-01', end: '2026-12-31' });
  });

  it('compares a date with today in the application timezone', () => {
    // 23:30 UTC on 15 June is already the 16th in London.
    const instant = new Date('2026-06-15T23:30:00.000Z');

    assert.equal(isAfterToday('2026-06-16', LONDON, instant), false);
    assert.equal(isAfterToday('2026-06-17', LONDON, instant), true);
    assert.equal(isAfterToday('2026-06-15', LONDON, instant), false);
  });

  it('counts working days and never includes the weekend', () => {
    // 2026-06-01 is a Monday, 2026-06-07 a Sunday.
    const week = workingDaysBetween('2026-06-01', '2026-06-07', MON_FRI);

    assert.deepEqual(week, [
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ]);

    const weekend = workingDaysBetween('2026-06-06', '2026-06-07', MON_FRI);
    assert.deepEqual(weekend, []);
  });

  it('handles leap days and month boundaries in date arithmetic', () => {
    assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2024-02-29', 1), '2024-03-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });

  it('validates date strings', () => {
    assert.equal(isDateString('2026-02-28'), true);
    assert.equal(isDateString('2024-02-29'), true);
    assert.equal(isDateString('2026-02-29'), false);
    assert.equal(isDateString('2026-13-01'), false);
    assert.equal(isDateString('2026-1-01'), false);
    assert.equal(isDateString('not-a-date'), false);
    assert.equal(isDateString(20260101), false);
  });
});
