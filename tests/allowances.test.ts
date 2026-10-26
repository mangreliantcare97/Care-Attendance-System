/**
 * Holiday allowance: holiday-aware counting, the per-year allowance, the
 * month breakdown, the over-allowance guard, the calendar hot path and the
 * overview/CSV. The tests use the API like an administrator would; a few
 * assertions inspect the database because the stored `days` and the
 * `leave_sync` rows are part of the contract.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  createAdmin,
  createStudent,
  signIn,
  startTestApp,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  type TestContext,
} from './helpers.ts';

let context: TestContext;

before(async () => {
  context = await startTestApp();
  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  await context?.stop();
});

/** The attendance rows owned by one leave. */
async function rowsForLeave(leaveId: string) {
  const { AttendanceModel } = await import('../src/models/Attendance.ts');
  return AttendanceModel.find({ leaveId }).sort({ date: 1 });
}

async function createEvent(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  payload: Record<string, unknown>,
) {
  return agent.post('/api/events').set('X-CSRF-Token', csrf).send(payload);
}

function leaveDates(rows: Array<{ date: string }>): string[] {
  return rows.map((row) => row.date);
}

function assertNoCarryOver(value: unknown): void {
  assert.equal(
    JSON.stringify(value).includes('carryOver'),
    false,
    'a response, CSV row or UI object still exposes carryOver',
  );
}

describe('holiday-aware leave counting', () => {
  it('skips weekends and holiday dates and splits a range by actual year', async () => {
    const { countedDatesForLeave, countedDaysForLeave, datesByYear } = await import(
      '../src/services/leaveCounting.ts'
    );

    const holidayDates = new Set(['2030-06-05']);
    const counted = countedDatesForLeave(
      { startDate: '2030-06-03', endDate: '2030-06-09' },
      holidayDates,
    );

    assert.deepEqual(counted, ['2030-06-03', '2030-06-04', '2030-06-06', '2030-06-07']);

    // A weekend-only range counts nothing at all.
    assert.equal(
      countedDaysForLeave({ startDate: '2030-06-08', endDate: '2030-06-09' }, new Set()),
      0,
    );

    // Monday 30 Dec and Tuesday 31 Dec belong to 2030; the holiday on
    // Wednesday 1 Jan removes that day from 2031.
    const split = datesByYear(
      countedDatesForLeave(
        { startDate: '2030-12-30', endDate: '2031-01-02' },
        new Set(['2031-01-01']),
      ),
    );

    assert.deepEqual(split.get(2030), ['2030-12-30', '2030-12-31']);
    assert.deepEqual(split.get(2031), ['2031-01-02']);
  });

  it('stores the holiday-aware day count and writes no row on the holiday', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Holiday Counted Person' });

    await createEvent(agent, csrf, {
      type: 'holiday',
      title: 'Early June bank holiday',
      startDate: '2030-06-05',
    });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2030-06-03',
      endDate: '2030-06-09',
      status: 'approved',
    });

    assert.equal(created.status, 200);
    assert.equal(created.body.data.leave.days, 4);

    const rows = await rowsForLeave(created.body.data.leave.id);
    assert.deepEqual(leaveDates(rows), [
      '2030-06-03',
      '2030-06-04',
      '2030-06-06',
      '2030-06-07',
    ]);

    const allowance = await agent.get(`/api/students/${student._id}/allowance?year=2030`);
    assert.equal(allowance.status, 200);
    assert.equal(allowance.body.data.allowance.used, 4);

    const totals = await agent.get(`/api/students/${student._id}/leave-totals`);
    const year = totals.body.data.totalsByYear.find(
      (entry: { year: number }) => entry.year === 2030,
    );
    assert.equal(year.vacation, 4);
  });

  it('counts a cross-year leave in each actual year for the allowance and the totals', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Holiday Cross Year Person' });

    await createEvent(agent, csrf, {
      type: 'holiday',
      title: 'New Year bank holiday',
      startDate: '2031-01-01',
    });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2030-12-30',
      endDate: '2031-01-02',
      status: 'approved',
    });

    // 30 + 31 Dec = 2 days, 1 Jan is a holiday, 2 Jan = 1 day.
    assert.equal(created.body.data.leave.days, 3);

    const y2030 = await agent.get(`/api/students/${student._id}/allowance?year=2030`);
    const y2031 = await agent.get(`/api/students/${student._id}/allowance?year=2031`);

    assert.equal(y2030.body.data.allowance.used, 2);
    assert.equal(y2030.body.data.allowance.months[11].used, 2);
    assert.equal(y2031.body.data.allowance.used, 1);
    assert.equal(y2031.body.data.allowance.months[0].used, 1);

    const totals = await agent.get(`/api/students/${student._id}/leave-totals`);
    const byYear = new Map(
      totals.body.data.totalsByYear.map((entry: { year: number; vacation: number }) => [
        entry.year,
        entry.vacation,
      ]),
    );
    assert.equal(byYear.get(2030), 2);
    assert.equal(byYear.get(2031), 1);
  });
});

describe('holiday allowance summary', () => {
  it('defaults to 28 days and only approved vacation consumes it', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Allowance Math Person' });

    const initial = await agent.get(`/api/students/${student._id}/allowance?year=2032`);
    assert.equal(initial.status, 200);
    const allowance = initial.body.data.allowance;
    assert.equal(allowance.year, 2032);
    assert.equal(allowance.allowance, 28);
    assert.equal(allowance.total, 28);
    assert.equal(allowance.used, 0);
    assert.equal(allowance.pending, 0);
    assert.equal(allowance.remaining, 28);
    assert.equal(allowance.expired, false);
    assert.equal(allowance.remainingLabel, 'Holiday remaining');
    assert.equal(allowance.expiredNote, null);
    assertNoCarryOver(initial.body);
    assert.equal(allowance.months.length, 12);
    assert.equal(
      allowance.months.every((point: { used: number }) => point.used === 0),
      true,
    );

    const base = { studentId: String(student._id), status: 'approved' };
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...base,
      type: 'vacation',
      startDate: '2032-01-05',
      endDate: '2032-01-09',
    });
    // Approved leave and time off never consume the holiday allowance.
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...base,
      type: 'leave',
      startDate: '2032-02-02',
      endDate: '2032-02-06',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...base,
      type: 'time_off',
      startDate: '2032-03-01',
      endDate: '2032-03-05',
    });
    // Pending is shown separately; rejected is ignored.
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2032-04-01',
      endDate: '2032-04-03',
      status: 'pending',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2032-05-04',
      endDate: '2032-05-08',
      status: 'rejected',
    });

    const response = await agent.get(`/api/students/${student._id}/allowance?year=2032`);
    const summary = response.body.data.allowance;

    assert.equal(summary.used, 5);
    assert.equal(summary.pending, 2);
    assert.equal(summary.remaining, 23);
    assert.equal(summary.months[0].used, 5);
    assert.equal(summary.months[3].used, 0);
    assert.equal(summary.months[4].used, 0);
  });

  it('expires unused days on 31 December and starts the next year at 28', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'No Carry Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2025`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 28, note: 'Full allowance' });

    // Monday 3 February to Wednesday 5 March 2025 is 23 working days with no
    // bank holiday in the range.
    const leave = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2025-02-03',
      endDate: '2025-03-05',
      status: 'approved',
    });
    assert.equal(leave.status, 200);
    assert.equal(leave.body.data.leave.days, 23);

    const expired = await agent.get(`/api/students/${student._id}/allowance?year=2025`);
    const expiredSummary = expired.body.data.allowance;
    assert.equal(expiredSummary.allowance, 28);
    assert.equal(expiredSummary.total, 28);
    assert.equal(expiredSummary.used, 23);
    assert.equal(expiredSummary.remaining, 5);
    assert.equal(expiredSummary.expired, true);
    assert.equal(expiredSummary.remainingLabel, 'Holiday unused (expired)');
    assert.equal(expiredSummary.expiredNote, 'These days expired on 31 December 2025.');
    assertNoCarryOver(expired.body);

    // The 2025 unused days are gone. 2026 starts with the full allowance and
    // no vacation has been booked in it.
    const fresh = await agent.get(`/api/students/${student._id}/allowance?year=2026`);
    const freshSummary = fresh.body.data.allowance;
    assert.equal(freshSummary.allowance, 28);
    assert.equal(freshSummary.total, 28);
    assert.equal(freshSummary.used, 0);
    assert.equal(freshSummary.remaining, 28);
    assert.equal(freshSummary.expired, false);
    assert.equal(freshSummary.remainingLabel, 'Holiday remaining');
    assert.equal(freshSummary.expiredNote, null);
    assertNoCarryOver(fresh.body);

    const list = await agent.get('/api/leaves/allowances?year=2025&search=No%20Carry%20Person');
    assert.equal(list.status, 200);
    assert.equal(list.body.data.remainingHeading, 'Holiday unused (expired)');
    assert.equal(list.body.data.expiredNote, 'These days expired on 31 December 2025.');
    assert.equal(list.body.data.allowances[0].remainingLabel, 'Holiday unused (expired)');
    assertNoCarryOver(list.body);

    const csv = await agent.get(
      '/api/leaves/allowances/export.csv?year=2025&search=No%20Carry%20Person',
    );
    assert.equal(csv.status, 200);
    assert.match(csv.text, /Holiday allowance,Total,Holiday used,Pending,Holiday unused \(expired\)/);
    assert.equal(csv.text.includes('Carry-over'), false);
    assert.equal(csv.text.includes('carryOver'), false);
  });

  it('shows a past-year over-allowance as red "Over allowance" wording', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Past Over Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2025`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 1, note: '' });

    const leave = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2025-06-02',
      endDate: '2025-06-04',
      status: 'approved',
      confirmOverAllowance: true,
    });
    assert.equal(leave.status, 200);
    assert.equal(leave.body.data.leave.days, 3);

    const summary = await agent.get(`/api/students/${student._id}/allowance?year=2025`);
    const allowance = summary.body.data.allowance;
    assert.equal(allowance.remaining, -2);
    assert.equal(allowance.expired, true);
    assert.equal(allowance.remainingLabel, 'Over allowance');
    assert.equal(allowance.expiredNote, null);

    const list = await agent.get('/api/leaves/allowances?year=2025&search=Past%20Over%20Person');
    assert.equal(list.body.data.remainingHeading, 'Holiday unused (expired)');
    assert.equal(list.body.data.allowances[0].remainingLabel, 'Over allowance');
  });

  it('does not let unused days from one year rescue the next year', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'No Rescue Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2025`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 28, note: '' });
    await agent
      .put(`/api/students/${student._id}/allowance/2026`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 28, note: '' });

    // 29 working days in 2026: even with 28 unused 2025 days, this is one day
    // over the 2026 allowance.
    const refused = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2026-01-05',
      endDate: '2026-02-12',
      status: 'approved',
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'allowance_exceeded');
    const y2026 = refused.body.error.details.years.find(
      (entry: { year: number }) => entry.year === 2026,
    );
    assert.equal(y2026.added, 29);
    assert.equal(y2026.remaining, -1);
    assertNoCarryOver(refused.body);

    const y2025 = await agent.get(`/api/students/${student._id}/allowance?year=2025`);
    assert.equal(y2025.body.data.allowance.remaining, 28);
  });

  it('edits the allowance and note and keeps a per-student row', async () => {
    const { agent, csrf } = await signIn(context.app);
    const { AdminModel } = await import('../src/models/Admin.ts');
    const { LeaveAllowanceModel } = await import('../src/models/LeaveAllowance.ts');
    const student = await createStudent({ name: 'Allowance Edit Person' });
    const owner = await AdminModel.findOne({ email: OWNER_EMAIL });

    const response = await agent
      .put(`/api/students/${student._id}/allowance/2033`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 24, note: 'Part-time agreement' });

    assert.equal(response.status, 200);
    const summary = response.body.data.allowance;
    assert.equal(summary.year, 2033);
    assert.equal(summary.allowance, 24);
    assert.equal(summary.total, 24);
    assert.equal(summary.note, 'Part-time agreement');
    assert.equal(summary.remaining, 24);
    assertNoCarryOver(response.body);

    const row = await LeaveAllowanceModel.findOne({ studentId: student._id, year: 2033 });
    assert.ok(row);
    assert.equal(String(row?.createdBy), String(owner?._id));
    assert.equal(String(row?.updatedBy), String(owner?._id));

    // A second write updates the same row instead of adding another one.
    await agent
      .put(`/api/students/${student._id}/allowance/2033`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 20, note: '' });

    assert.equal(await LeaveAllowanceModel.countDocuments({ studentId: student._id, year: 2033 }), 1);

    // Another year of the same student still uses the environment default.
    const other = await agent.get(`/api/students/${student._id}/allowance?year=2034`);
    assert.equal(other.body.data.allowance.allowance, 28);
    assert.equal(other.body.data.allowance.total, 28);
    assertNoCarryOver(other.body);
  });
});

describe('holiday allowance carry-over migration', () => {
  it('removes only carryOver and is idempotent', async () => {
    const { removeCarryOverField } = await import('../src/services/allowanceMigration.ts');
    const { LeaveAllowanceModel } = await import('../src/models/LeaveAllowance.ts');
    const student = await createStudent({ name: 'Migration Person' });

    const inserted = await LeaveAllowanceModel.collection.insertOne({
      studentId: student._id,
      year: 2044,
      allowance: 21,
      carryOver: 2,
      note: 'Keep this note',
      createdBy: null,
      updatedBy: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    });

    const first = await removeCarryOverField();
    assert.equal(first.matched, 1);
    assert.equal(first.modified, 1);

    const afterFirst = await LeaveAllowanceModel.collection.findOne({ _id: inserted.insertedId });
    assert.ok(afterFirst);
    assert.equal(Object.hasOwn(afterFirst, 'carryOver'), false);
    assert.equal(afterFirst.allowance, 21);
    assert.equal(afterFirst.year, 2044);
    assert.equal(afterFirst.note, 'Keep this note');
    assert.equal(afterFirst.createdAt.toISOString(), '2025-01-01T00:00:00.000Z');
    assert.equal(afterFirst.updatedAt.toISOString(), '2025-01-02T00:00:00.000Z');

    const second = await removeCarryOverField();
    assert.equal(second.matched, 0);
    assert.equal(second.modified, 0);
    assert.deepEqual(
      await LeaveAllowanceModel.collection.findOne({ _id: inserted.insertedId }),
      afterFirst,
    );
  });
});

describe('holiday allowance month breakdown', () => {
  it('groups the counted days of a month by leave and clips both ends', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Allowance Month Person' });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      category: 'annual',
      reason: 'Winter break',
      startDate: '2032-01-29',
      endDate: '2032-02-05',
      status: 'approved',
    });
    // Thu 29 + Fri 30 Jan, then Mon 2 to Thu 5 Feb (1 Feb is a Sunday).
    assert.equal(created.body.data.leave.days, 6);

    const january = await agent.get(
      `/api/students/${student._id}/allowance/month?year=2032&month=1`,
    );
    assert.equal(january.status, 200);
    assert.equal(january.body.data.month.total, 2);
    assert.equal(january.body.data.month.leaves.length, 1);
    const jan = january.body.data.month.leaves[0];
    assert.equal(jan.leaveId, created.body.data.leave.id);
    assert.equal(jan.category, 'annual');
    assert.equal(jan.reason, 'Winter break');
    assert.equal(jan.startDate, '2032-01-29');
    assert.equal(jan.endDate, '2032-01-31');
    assert.equal(jan.days, 2);
    assert.deepEqual(jan.dates, ['2032-01-29', '2032-01-30']);

    const february = await agent.get(
      `/api/students/${student._id}/allowance/month?year=2032&month=2`,
    );
    const feb = february.body.data.month.leaves[0];
    assert.equal(february.body.data.month.total, 4);
    assert.equal(feb.startDate, '2032-02-01');
    assert.equal(feb.endDate, '2032-02-05');
    assert.equal(feb.days, 4);
    assert.deepEqual(feb.dates, ['2032-02-02', '2032-02-03', '2032-02-04', '2032-02-05']);

    const march = await agent.get(
      `/api/students/${student._id}/allowance/month?year=2032&month=3`,
    );
    assert.equal(march.body.data.month.total, 0);
    assert.deepEqual(march.body.data.month.leaves, []);

    // The month totals and the year summary are the same arithmetic.
    const summary = await agent.get(`/api/students/${student._id}/allowance?year=2032`);
    const months = summary.body.data.allowance.months;
    assert.equal(summary.body.data.allowance.used, 6);
    assert.equal(months[0].used, january.body.data.month.total);
    assert.equal(months[1].used, february.body.data.month.total);
    assert.equal(
      months.reduce((sum: number, point: { used: number }) => sum + point.used, 0),
      summary.body.data.allowance.used,
    );
  });
});

describe('holiday allowance over-check', () => {
  it('refuses an over-allowance vacation with 409 and books it after confirmation', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Over Allowance Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2033`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 2, note: '' });

    const payload = {
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2033-03-07',
      endDate: '2033-03-11',
      status: 'approved',
    };

    const refused = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send(payload);
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'allowance_exceeded');
    assert.equal(refused.body.error.details.years[0].year, 2033);
    assert.equal(refused.body.error.details.years[0].remaining, -3);

    const { LeaveModel } = await import('../src/models/Leave.ts');
    assert.equal(await LeaveModel.countDocuments({ studentId: student._id }), 0);

    const confirmed = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, confirmOverAllowance: true });

    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.leave.days, 5);

    const summary = await agent.get(`/api/students/${student._id}/allowance?year=2033`);
    assert.equal(summary.body.data.allowance.used, 5);
    assert.equal(summary.body.data.allowance.remaining, -3);
    assert.equal(summary.body.data.allowance.remainingLabel, 'Holiday remaining');
    assert.equal(summary.body.data.allowance.expiredNote, null);
    assertNoCarryOver(summary.body);
  });

  it('refuses approving a pending vacation and accepts it when confirmed', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Over Approve Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2039`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 1, note: '' });

    const pending = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2039-07-04',
      endDate: '2039-07-08',
      status: 'pending',
    });
    assert.equal(pending.status, 200);

    const refused = await agent
      .patch(`/api/leaves/${pending.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'approved' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error.code, 'allowance_exceeded');

    const confirmed = await agent
      .patch(`/api/leaves/${pending.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'approved', confirmOverAllowance: true });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.leave.status, 'approved');

    const summary = await agent.get(`/api/students/${student._id}/allowance?year=2039`);
    assert.equal(summary.body.data.allowance.used, 5);
    assert.equal(summary.body.data.allowance.remaining, -4);
  });

  it('checks a cross-year vacation against each actual year', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Over Cross Year Person' });

    // 2034 has one counted day (Fri 29 Dec) and is deliberately empty.
    await agent
      .put(`/api/students/${student._id}/allowance/2034`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 0, note: '' });

    const payload = {
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2034-12-29',
      endDate: '2035-01-03',
      status: 'approved',
    };

    const preview = await agent.get(
      `/api/leaves/preview?studentId=${student._id}&type=vacation&startDate=2034-12-29&endDate=2035-01-03`,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.preview.years.length, 2);
    const preview2034 = preview.body.data.preview.years.find(
      (entry: { year: number }) => entry.year === 2034,
    );
    const preview2035 = preview.body.data.preview.years.find(
      (entry: { year: number }) => entry.year === 2035,
    );
    assert.equal(preview2034.remaining, -1);
    assert.equal(preview2035.remaining, 25);
    assertNoCarryOver(preview.body);

    const refused = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send(payload);
    assert.equal(refused.status, 409);
    const years = refused.body.error.details.years as Array<{
      year: number;
      added: number;
      remaining: number;
    }>;
    const y2034 = years.find((entry) => entry.year === 2034);
    const y2035 = years.find((entry) => entry.year === 2035);
    assert.equal(y2034?.added, 1);
    assert.equal(y2034?.remaining, -1);
    assert.equal(y2035?.added, 3);
    assert.equal(y2035?.remaining, 25);

    const confirmed = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, confirmOverAllowance: true });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.leave.days, 4);

    const y2034Summary = await agent.get(`/api/students/${student._id}/allowance?year=2034`);
    const y2035Summary = await agent.get(`/api/students/${student._id}/allowance?year=2035`);
    assert.equal(y2034Summary.body.data.allowance.used, 1);
    assert.equal(y2034Summary.body.data.allowance.remaining, -1);
    assert.equal(y2035Summary.body.data.allowance.used, 3);
    assert.equal(y2035Summary.body.data.allowance.remaining, 25);
  });

  it('excludes the edited leave from its own check', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Over Edit Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2033`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 5, note: '' });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2033-03-07',
      endDate: '2033-03-11',
      status: 'approved',
    });
    assert.equal(created.status, 200);

    // Editing without changing the counted days must not count the leave twice.
    const note = await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ reason: 'Team offsite' });
    assert.equal(note.status, 200);

    const extended = await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ endDate: '2033-03-14' });
    assert.equal(extended.status, 409);
    assert.equal(extended.body.error.code, 'allowance_exceeded');

    const confirmed = await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ endDate: '2033-03-14', confirmOverAllowance: true });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data.leave.days, 6);

    const summary = await agent.get(`/api/students/${student._id}/allowance?year=2033`);
    assert.equal(summary.body.data.allowance.remaining, -1);
  });

  it('never blocks leave or time off, even with no allowance left', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Over Non Vacation Person' });

    await agent
      .put(`/api/students/${student._id}/allowance/2038`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 0, note: '' });

    const leave = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'leave',
      startDate: '2038-04-05',
      endDate: '2038-04-09',
      status: 'approved',
    });
    assert.equal(leave.status, 200);

    const timeOff = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'time_off',
      startDate: '2038-04-12',
      endDate: '2038-04-13',
      status: 'approved',
    });
    assert.equal(timeOff.status, 200);

    const preview = await agent.get(
      `/api/leaves/preview?studentId=${student._id}&type=leave&startDate=2038-04-19&endDate=2038-04-20`,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.preview.consumesAllowance, false);
    assert.equal(preview.body.data.preview.days, 2);
    assert.equal(preview.body.data.preview.wouldExceed, false);
  });
});

describe('holiday calendar changes', () => {
  it('recomputes days and attendance rows on create, edit and delete', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Holiday Recompute Person' });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2037-05-04',
      endDate: '2037-05-08',
      status: 'approved',
    });
    assert.equal(created.body.data.leave.days, 5);
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 5);

    const event = await createEvent(agent, csrf, {
      type: 'holiday',
      title: 'May bank holiday',
      startDate: '2037-05-06',
    });
    const eventId = event.body.data.event.id as string;

    let leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 4);
    assert.deepEqual(
      leaveDates(await rowsForLeave(created.body.data.leave.id)),
      ['2037-05-04', '2037-05-05', '2037-05-07', '2037-05-08'],
    );

    // Extending the holiday removes another day.
    await agent
      .patch(`/api/events/${eventId}`)
      .set('X-CSRF-Token', csrf)
      .send({ endDate: '2037-05-07' });
    leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 3);

    // Moving it out of the leave restores the old days.
    await agent
      .patch(`/api/events/${eventId}`)
      .set('X-CSRF-Token', csrf)
      .send({ startDate: '2037-05-10', endDate: '2037-05-11' });
    leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 5);
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 5);

    // Moving it back over the leave removes the day again.
    await agent
      .patch(`/api/events/${eventId}`)
      .set('X-CSRF-Token', csrf)
      .send({ startDate: '2037-05-06', endDate: '2037-05-06' });
    leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 4);

    // Deleting the holiday restores it, and the reconcile is idempotent.
    await agent.delete(`/api/events/${eventId}`).set('X-CSRF-Token', csrf);
    leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 5);

    const { reconcileLeave } = await import('../src/services/attendanceSync.ts');
    await reconcileLeave(created.body.data.leave.id);
    await reconcileLeave(created.body.data.leave.id);
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 5);

    const allowance = await agent.get(`/api/students/${student._id}/allowance?year=2037`);
    assert.equal(allowance.body.data.allowance.used, 5);
  });

  it('never overwrites or deletes a manual attendance row on a holiday', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Holiday Manual Person' });
    const { AttendanceModel } = await import('../src/models/Attendance.ts');

    const manual = await AttendanceModel.create({
      studentId: student._id,
      date: '2037-06-03',
      status: 'present',
      checkIn: '09:00',
      note: 'Worked the bank holiday',
      source: 'manual',
    });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2037-06-01',
      endDate: '2037-06-05',
      status: 'approved',
    });
    assert.equal(created.body.data.leave.days, 5);
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 4);

    const event = await createEvent(agent, csrf, {
      type: 'holiday',
      title: 'Summer bank holiday',
      startDate: '2037-06-03',
    });

    let leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 4);

    const untouched = await AttendanceModel.findById(manual._id);
    assert.equal(untouched?.status, 'present');
    assert.equal(untouched?.source, 'manual');
    assert.equal(untouched?.note, 'Worked the bank holiday');

    await agent
      .delete(`/api/events/${event.body.data.event.id}`)
      .set('X-CSRF-Token', csrf);
    leave = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(leave.body.data.leave.days, 5);
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 4);

    const kept = await AttendanceModel.findById(manual._id);
    assert.equal(kept?.status, 'present');
    assert.equal(kept?.source, 'manual');
  });
});

describe('holiday allowance overview', () => {
  it('lists every active student with month totals, pagination and filters', async () => {
    const { agent, csrf } = await signIn(context.app);
    const { DepartmentModel } = await import('../src/models/Department.ts');

    const department = await DepartmentModel.create({ name: 'Allowance Overview Dept' });
    const other = await DepartmentModel.create({ name: 'Allowance Other Dept' });
    const departmentId = String(department._id);

    const alpha = await createStudent({
      name: 'Overview Alpha',
      departmentId,
    });
    const beta = await createStudent({
      name: 'Overview Beta',
      departmentId,
    });
    await createStudent({ name: 'Overview Gamma', departmentId });
    await createStudent({ name: 'Overview Inactive', departmentId, status: 'inactive' });
    await createStudent({ name: 'Overview Other', departmentId: String(other._id) });

    await agent
      .put(`/api/students/${alpha._id}/allowance/2040`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 25, note: 'Part-time agreement' });

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(alpha._id),
      type: 'vacation',
      startDate: '2040-06-04',
      endDate: '2040-06-08',
      status: 'approved',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(alpha._id),
      type: 'vacation',
      startDate: '2040-06-11',
      endDate: '2040-06-12',
      status: 'pending',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(beta._id),
      type: 'vacation',
      startDate: '2040-06-04',
      endDate: '2040-06-05',
      status: 'approved',
    });

    const list = await agent.get(
      `/api/leaves/allowances?year=2040&departmentId=${departmentId}`,
    );

    assert.equal(list.status, 200);
    assert.equal(list.body.data.year, 2040);
    assert.equal(list.body.data.month, null);
    assert.equal(list.body.meta.total, 3);
    assert.deepEqual(
      list.body.data.allowances.map((row: { name: string }) => row.name),
      ['Overview Alpha', 'Overview Beta', 'Overview Gamma'],
    );

    const alphaRow = list.body.data.allowances.find(
      (row: { name: string }) => row.name === 'Overview Alpha',
    );
    const betaRow = list.body.data.allowances.find(
      (row: { name: string }) => row.name === 'Overview Beta',
    );
    assert.equal(alphaRow.allowance, 25);
    assert.equal(alphaRow.total, 25);
    assert.equal(alphaRow.used, 5);
    assert.equal(alphaRow.pending, 2);
    assert.equal(alphaRow.remaining, 20);
    assert.equal(alphaRow.expired, false);
    assert.equal(alphaRow.remainingLabel, 'Holiday remaining');
    assertNoCarryOver(list.body);
    assert.equal(alphaRow.usedInMonth, null);
    assert.equal(alphaRow.department, 'Allowance Overview Dept');
    assert.equal(betaRow.used, 2);

    // The month totals cover the returned students, not one page.
    assert.equal(list.body.data.monthTotals[5].used, 7);
    assert.equal(
      list.body.data.monthTotals.reduce(
        (sum: number, point: { used: number }) => sum + point.used,
        0,
      ),
      7,
    );

    const monthly = await agent.get(
      `/api/leaves/allowances?year=2040&departmentId=${departmentId}&month=6`,
    );
    assert.equal(monthly.body.data.month, 6);
    const monthlyAlpha = monthly.body.data.allowances.find(
      (row: { name: string }) => row.name === 'Overview Alpha',
    );
    const monthlyGamma = monthly.body.data.allowances.find(
      (row: { name: string }) => row.name === 'Overview Gamma',
    );
    assert.equal(monthlyAlpha.usedInMonth, 5);
    assert.equal(monthlyGamma.usedInMonth, 0);

    const page = await agent.get(
      `/api/leaves/allowances?year=2040&departmentId=${departmentId}&perPage=1&page=2`,
    );
    assert.equal(page.body.data.allowances.length, 1);
    assert.equal(page.body.data.allowances[0].name, 'Overview Beta');
    assert.deepEqual(page.body.meta, { total: 3, page: 2, perPage: 1, pages: 3 });

    const search = await agent.get(
      `/api/leaves/allowances?year=2040&departmentId=${departmentId}&search=Gamma`,
    );
    assert.equal(search.body.data.allowances.length, 1);
    assert.equal(search.body.data.allowances[0].name, 'Overview Gamma');
  });

  it('exports the whole filtered set as CSV with the month column', async () => {
    const { agent, csrf } = await signIn(context.app);
    const { DepartmentModel } = await import('../src/models/Department.ts');

    const department = await DepartmentModel.create({ name: 'Allowance Csv Dept' });
    const departmentId = String(department._id);

    await createStudent({ name: 'Csv Alpha', departmentId });
    await createStudent({ name: 'Csv Beta', departmentId });
    await createStudent({ name: 'Csv Gamma', departmentId });
    const formula = await createStudent({ name: '=cmd|calc', departmentId });

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(formula._id),
      type: 'vacation',
      startDate: '2041-09-02',
      endDate: '2041-09-06',
      status: 'approved',
    });

    const response = await agent.get(
      `/api/leaves/allowances/export.csv?year=2041&departmentId=${departmentId}&month=9&perPage=1`,
    );

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(
      response.headers['content-disposition'],
      /holiday-allowances-2041-09\.csv/,
    );
    assert.match(
      response.text,
      /Student,Department,Position,Year,Holiday allowance,Total,Holiday used,Pending,Holiday remaining,Used in September/,
    );
    assert.equal(response.text.includes('Carry-over'), false);
    assert.equal(response.text.includes('carryOver'), false);
    // The export ignores pagination: all four rows are present.
    for (const name of ['Csv Alpha', 'Csv Beta', 'Csv Gamma', "'=cmd|calc"]) {
      assert.match(response.text, new RegExp(name.replace(/[|]/g, '\\|')));
    }
    // Five days are counted in September for the formula-named student.
    assert.match(response.text, /'=cmd\|calc,Allowance Csv Dept,,2041,28,28,5,0,23,5/);
  });
});

describe('holiday allowance access control and validation', () => {
  it('needs a session on every new route', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Allowance Auth Person' });

    const anonymous = request(context.app);
    const calls = [
      anonymous.get(`/api/students/${student._id}/allowance?year=2032`),
      anonymous.get(`/api/students/${student._id}/allowance/month?year=2032&month=1`),
      anonymous.get('/api/leaves/allowances?year=2032'),
      anonymous.get('/api/leaves/allowances/export.csv?year=2032'),
      anonymous.get(
        `/api/leaves/preview?studentId=${student._id}&type=vacation&startDate=2032-01-05&endDate=2032-01-09`,
      ),
    ];

    for (const response of await Promise.all(calls)) {
      assert.equal(response.status, 401);
    }

    const noCsrf = await agent
      .put(`/api/students/${student._id}/allowance/2032`)
      .send({ allowance: 20, note: '' });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error.code, 'csrf_token_mismatch');

    // A valid token proves the route itself is reachable.
    const allowed = await agent
      .put(`/api/students/${student._id}/allowance/2032`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 20, note: '' });
    assert.equal(allowed.status, 200);
  });

  it('rejects invalid years, months, day counts and ids', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Allowance Zod Person' });
    const missing = '64b000000000000000000000';

    const badYear = await agent.get(`/api/students/${student._id}/allowance?year=abc`);
    assert.equal(badYear.status, 422);

    const missingMonth = await agent.get(
      `/api/students/${student._id}/allowance/month?year=2032`,
    );
    assert.equal(missingMonth.status, 422);

    const badMonth = await agent.get(
      `/api/students/${student._id}/allowance/month?year=2032&month=13`,
    );
    assert.equal(badMonth.status, 422);

    const badParamYear = await agent
      .put(`/api/students/${student._id}/allowance/1999`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 20, note: '' });
    assert.equal(badParamYear.status, 422);

    const badIds = [
      await agent.get(`/api/students/not-an-id/allowance?year=2032`),
      await agent.get(`/api/leaves/allowances?year=2032&departmentId=not-an-id`),
      await agent.get(`/api/leaves/allowances?year=2032&page=0`),
      await agent.get(`/api/leaves/allowances?year=2032&perPage=101`),
      await agent.get(`/api/leaves/allowances?year=2032&month=13`),
      await agent.get(`/api/leaves/allowances/export.csv?year=2032&month=13`),
      await agent.get(
        `/api/leaves/preview?studentId=${student._id}&type=vacation&startDate=2032-01-09&endDate=2032-01-05`,
      ),
      await agent.get(
        `/api/leaves/preview?studentId=${student._id}&type=holiday&startDate=2032-01-05&endDate=2032-01-09`,
      ),
    ];

    for (const response of badIds) {
      assert.equal(response.status, 422);
    }

    const dayCases = [
      { allowance: 2.3, note: '' },
      { allowance: 101, note: '' },
      { allowance: -1, note: '' },
      { note: '' },
      { allowance: 20, note: 'x'.repeat(501) },
    ];

    for (const body of dayCases) {
      const response = await agent
        .put(`/api/students/${student._id}/allowance/2032`)
        .set('X-CSRF-Token', csrf)
        .send(body);
      assert.equal(response.status, 422);
    }

    const unknownAllowance = await agent.get(`/api/students/${missing}/allowance?year=2032`);
    assert.equal(unknownAllowance.status, 404);

    const unknownMonth = await agent.get(
      `/api/students/${missing}/allowance/month?year=2032&month=1`,
    );
    assert.equal(unknownMonth.status, 404);

    const unknownPut = await agent
      .put(`/api/students/${missing}/allowance/2032`)
      .set('X-CSRF-Token', csrf)
      .send({ allowance: 20, note: '' });
    assert.equal(unknownPut.status, 404);

    const unknownPreview = await agent.get(
      `/api/leaves/preview?studentId=${missing}&type=vacation&startDate=2032-01-05&endDate=2032-01-09`,
    );
    assert.equal(unknownPreview.status, 422);
  });

  it('previews the counted days, skipped dates and remaining allowance', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Allowance Preview Person' });

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      type: 'vacation',
      startDate: '2042-11-03',
      endDate: '2042-11-04',
      status: 'approved',
    });

    const response = await agent.get(
      `/api/leaves/preview?studentId=${student._id}&type=vacation&startDate=2042-11-02&endDate=2042-11-08`,
    );

    assert.equal(response.status, 200);
    const preview = response.body.data.preview;
    assert.equal(preview.days, 5);
    assert.deepEqual(preview.countedDates, [
      '2042-11-03',
      '2042-11-04',
      '2042-11-05',
      '2042-11-06',
      '2042-11-07',
    ]);
    assert.deepEqual(preview.skippedWeekendDates, ['2042-11-02', '2042-11-08']);
    assert.equal(preview.consumesAllowance, true);
    assert.equal(preview.allowanceYear, 2042);
    assert.equal(preview.allowanceTotal, 28);
    assert.equal(preview.usedBefore, 2);
    assert.equal(preview.remainingBefore, 26);
    assert.equal(preview.usedAfter, 7);
    assert.equal(preview.remainingAfter, 21);
    assert.equal(preview.wouldExceed, false);
  });
});
