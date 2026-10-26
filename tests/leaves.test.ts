/**
 * Leave & vacation: working-day calculation, the overlap rule, the
 * leave → attendance sync and the employee delete guard.
 *
 * The sync tests inspect the attendance collection directly: the API is the
 * only writer of `leave_sync` rows, so the database is the source of truth.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdmin,
  createEmployee,
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

describe('leaves', () => {
  it('needs a session', async () => {
    const response = await (await import('supertest')).default(context.app).get('/api/leaves');

    assert.equal(response.status, 401);
  });

  it('refuses a state changing request without a CSRF token', async () => {
    const { agent } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave CSRF Person' });

    const response = await agent.post('/api/leaves').send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('computes days as working days in the inclusive range', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Days Person' });

    const response = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-06-01',
      endDate: '2026-06-07',
      status: 'approved',
    });

    assert.equal(response.status, 200);
    // Monday 1 June to Sunday 7 June has five working days.
    assert.equal(response.body.data.leave.days, 5);

    const weekend = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'time_off',
      startDate: '2026-06-13',
      endDate: '2026-06-14',
      status: 'rejected',
    });

    assert.equal(weekend.status, 200);
    assert.equal(weekend.body.data.leave.days, 0);
  });

  it('rejects a reversed range and a range longer than 366 days', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Range Person' });
    const payload = { employeeId: String(employee._id), type: 'leave' };

    const reversed = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, startDate: '2026-06-10', endDate: '2026-06-09' });

    assert.equal(reversed.status, 422);
    assert.equal(reversed.body.error.code, 'leave_range_invalid');

    const tooLong = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, startDate: '2026-01-01', endDate: '2027-03-01' });

    assert.equal(tooLong.status, 422);
    assert.equal(tooLong.body.error.code, 'leave_span_too_long');
  });

  it('rejects an overlap with an approved leave of the same employee', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Overlap Person' });
    const payload = { employeeId: String(employee._id), type: 'leave' };

    const approved = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-07-06',
      endDate: '2026-07-10',
      status: 'approved',
    });
    assert.equal(approved.status, 200);

    const overlap = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-07-08',
      endDate: '2026-07-09',
      status: 'approved',
    });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error.code, 'leave_overlap');

    // A pending request may overlap provisionally …
    const pending = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-07-08',
      endDate: '2026-07-09',
      status: 'pending',
    });
    assert.equal(pending.status, 200);

    // … but approving it is refused.
    const approve = await agent
      .patch(`/api/leaves/${pending.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'approved' });
    assert.equal(approve.status, 409);
    assert.equal(approve.body.error.code, 'leave_overlap');

    // Moving it out of the way and approving it succeeds.
    const move = await agent
      .patch(`/api/leaves/${pending.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ startDate: '2026-07-13', endDate: '2026-07-14', status: 'approved' });
    assert.equal(move.status, 200);
    assert.equal((await rowsForLeave(pending.body.data.leave.id)).length, 2);
  });

  it('creates attendance rows only on working days of an approved leave', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Sync Person' });

    const response = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-08-03',
      endDate: '2026-08-09',
      status: 'approved',
    });

    assert.equal(response.status, 200);

    const rows = await rowsForLeave(response.body.data.leave.id);
    assert.deepEqual(
      rows.map((row) => row.date),
      ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'],
    );

    for (const row of rows) {
      assert.equal(row.status, 'on_leave');
      assert.equal(row.source, 'leave_sync');
      assert.equal(String(row.leaveId), response.body.data.leave.id);
    }
  });

  it('maps vacation to the vacation status and writes nothing for pending or rejected leaves', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Status Person' });
    const payload = { employeeId: String(employee._id), type: 'vacation' };

    const approved = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-09-07',
      endDate: '2026-09-11',
      status: 'approved',
    });
    assert.equal(approved.status, 200);

    const vacationRows = await rowsForLeave(approved.body.data.leave.id);
    assert.equal(vacationRows.length, 5);
    assert.equal(vacationRows[0].status, 'vacation');

    const pending = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-09-14',
      endDate: '2026-09-18',
      status: 'pending',
    });
    assert.equal((await rowsForLeave(pending.body.data.leave.id)).length, 0);

    const rejected = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-09-21',
      endDate: '2026-09-25',
      status: 'rejected',
    });
    assert.equal((await rowsForLeave(rejected.body.data.leave.id)).length, 0);
  });

  it('removes only the rows of the leave that is rejected', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Reject Person' });
    const payload = { employeeId: String(employee._id), type: 'leave', status: 'approved' };

    const first = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-10-05',
      endDate: '2026-10-09',
    });
    const second = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...payload,
      startDate: '2026-10-12',
      endDate: '2026-10-16',
    });

    const response = await agent
      .patch(`/api/leaves/${first.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'rejected' });

    assert.equal(response.status, 200);
    assert.equal((await rowsForLeave(first.body.data.leave.id)).length, 0);
    assert.equal((await rowsForLeave(second.body.data.leave.id)).length, 5);
  });

  it('never overwrites or deletes a manual attendance row', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Manual Person' });
    const { AttendanceModel } = await import('../src/models/Attendance.ts');

    const manual = await AttendanceModel.create({
      employeeId: employee._id,
      date: '2026-11-04',
      status: 'present',
      checkIn: '09:00',
      note: 'Worked from the office',
      source: 'manual',
    });

    const response = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      status: 'approved',
    });

    assert.equal(response.status, 200);

    // Tuesday, Thursday and Friday were created; Wednesday was left alone.
    const rows = await rowsForLeave(response.body.data.leave.id);
    assert.deepEqual(
      rows.map((row) => row.date),
      ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'],
    );

    const untouched = await AttendanceModel.findById(manual._id);
    assert.equal(untouched?.status, 'present');
    assert.equal(untouched?.source, 'manual');
    assert.equal(untouched?.note, 'Worked from the office');
    assert.equal(untouched?.leaveId, null);

    // Walking the leave back must not remove the manual row either.
    await agent
      .delete(`/api/leaves/${response.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(await AttendanceModel.countDocuments({ employeeId: employee._id }), 1);
    assert.equal(await AttendanceModel.countDocuments({ _id: manual._id }), 1);
  });

  it('detaches a sync row when it is edited manually and keeps it afterwards', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Detach Person' });
    const { AttendanceModel } = await import('../src/models/Attendance.ts');

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'vacation',
      startDate: '2027-01-04',
      endDate: '2027-01-08',
      status: 'approved',
    });

    const leaveRows = await rowsForLeave(created.body.data.leave.id);
    assert.equal(leaveRows.length, 5);

    const edited = await agent
      .patch(`/api/attendance/${leaveRows[0]._id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'present', note: 'Worked anyway' });

    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.record.source, 'manual');
    assert.equal(edited.body.data.record.leaveId, null);

    await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'rejected' });

    assert.equal(await rowsForLeave(created.body.data.leave.id).then((rows) => rows.length), 0);
    assert.equal(await AttendanceModel.countDocuments({ employeeId: employee._id }), 1);
    assert.equal(await AttendanceModel.countDocuments({ _id: leaveRows[0]._id }), 1);
  });

  it('adds and removes the right days when the dates change', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Edit Dates Person' });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2027-02-01',
      endDate: '2027-02-03',
      status: 'approved',
    });
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 3);

    await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ endDate: '2027-02-05' });

    let rows = await rowsForLeave(created.body.data.leave.id);
    assert.equal(rows.length, 5);

    await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ startDate: '2027-02-04' });

    rows = await rowsForLeave(created.body.data.leave.id);
    assert.deepEqual(
      rows.map((row) => row.date),
      ['2027-02-04', '2027-02-05'],
    );
  });

  it('cleans the old employee when a leave is moved to another employee', async () => {
    const { agent, csrf } = await signIn(context.app);
    const first = await createEmployee({ name: 'Leave Move From' });
    const second = await createEmployee({ name: 'Leave Move To' });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(first._id),
      type: 'leave',
      startDate: '2027-03-01',
      endDate: '2027-03-05',
      status: 'approved',
    });

    assert.equal(await rowsForLeave(created.body.data.leave.id).then((rows) => rows.length), 5);

    const response = await agent
      .patch(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ employeeId: String(second._id) });

    assert.equal(response.status, 200);

    const rows = await rowsForLeave(created.body.data.leave.id);
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.equal(String(row.employeeId), String(second._id));
    }
  });

  it('removes all of its rows when a leave is deleted', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Delete Person' });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2027-04-05',
      endDate: '2027-04-09',
      status: 'approved',
    });
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 5);

    const response = await agent
      .delete(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal((await rowsForLeave(created.body.data.leave.id)).length, 0);

    const second = await agent
      .delete(`/api/leaves/${created.body.data.leave.id}`)
      .set('X-CSRF-Token', csrf);
    assert.equal(second.status, 404);
  });

  it('is idempotent when reconciled twice', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Idempotent Person' });
    const { reconcileLeave } = await import('../src/services/attendanceSync.ts');

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2027-05-03',
      endDate: '2027-05-07',
      status: 'approved',
    });

    const before = await rowsForLeave(created.body.data.leave.id);
    await reconcileLeave(created.body.data.leave.id);
    await reconcileLeave(created.body.data.leave.id);
    const after = await rowsForLeave(created.body.data.leave.id);

    assert.equal(after.length, before.length);
    assert.deepEqual(
      after.map((row) => [row.date, row.status]),
      before.map((row) => [row.date, row.status]),
    );
  });

  it('keeps two employees independent', async () => {
    const { agent, csrf } = await signIn(context.app);
    const first = await createEmployee({ name: 'Leave Indep Alpha' });
    const second = await createEmployee({ name: 'Leave Indep Beta' });

    const payload = { type: 'leave', startDate: '2027-06-07', endDate: '2027-06-11', status: 'approved' };

    const a = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, employeeId: String(first._id) });
    const b = await agent
      .post('/api/leaves')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, employeeId: String(second._id) });

    const rowsA = await rowsForLeave(a.body.data.leave.id);
    const rowsB = await rowsForLeave(b.body.data.leave.id);

    assert.equal(rowsA.length, 5);
    assert.equal(rowsB.length, 5);
    assert.equal(String(rowsA[0].employeeId), String(first._id));
    assert.equal(String(rowsB[0].employeeId), String(second._id));

    await agent.delete(`/api/leaves/${a.body.data.leave.id}`).set('X-CSRF-Token', csrf);
    assert.equal((await rowsForLeave(a.body.data.leave.id)).length, 0);
    assert.equal((await rowsForLeave(b.body.data.leave.id)).length, 5);
  });

  it('totals approved working days per year and type', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Totals Person' });
    const base = { employeeId: String(employee._id), status: 'approved' };

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...base,
      type: 'leave',
      startDate: '2025-12-29',
      endDate: '2025-12-31',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...base,
      type: 'vacation',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      ...base,
      type: 'time_off',
      startDate: '2026-06-08',
      endDate: '2026-06-09',
    });
    // A pending leave is not part of the totals.
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      status: 'pending',
    });

    const response = await agent.get(`/api/employees/${employee._id}/leave-totals`);
    assert.equal(response.status, 200);

    const years = response.body.data.totalsByYear;
    const y2026 = years.find((year: { year: number }) => year.year === 2026);
    const y2025 = years.find((year: { year: number }) => year.year === 2025);

    assert.equal(y2026.vacation, 5);
    assert.equal(y2026.time_off, 2);
    assert.equal(y2026.leave, 0);
    assert.equal(y2026.total, 7);
    assert.equal(y2025.leave, 3);
    assert.equal(y2025.total, 3);

    const history = await agent.get(`/api/employees/${employee._id}/leaves`);
    assert.equal(history.body.data.leaves.length, 4);
  });

  it('filters by employee, type and status', async () => {
    const { agent, csrf } = await signIn(context.app);
    const first = await createEmployee({ name: 'Leave Filter Alpha' });
    const second = await createEmployee({ name: 'Leave Filter Beta' });

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(first._id),
      type: 'leave',
      startDate: '2027-07-05',
      endDate: '2027-07-06',
      status: 'approved',
    });
    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(second._id),
      type: 'vacation',
      startDate: '2027-07-05',
      endDate: '2027-07-06',
      status: 'approved',
    });

    const byEmployee = await agent.get(`/api/leaves?employeeId=${first._id}`);
    assert.equal(byEmployee.status, 200);
    assert.equal(byEmployee.body.data.leaves.length, 1);
    assert.equal(byEmployee.body.data.leaves[0].employeeId.name, 'Leave Filter Alpha');

    const byType = await agent.get('/api/leaves?type=vacation&status=approved');
    const names = byType.body.data.leaves.map(
      (leave: { employeeId: { name: string } }) => leave.employeeId.name,
    );
    assert.equal(names.includes('Leave Filter Beta'), true);
    assert.equal(names.includes('Leave Filter Alpha'), false);
  });

  it('includes the department in list, detail and CSV output', async () => {
    const { agent, csrf } = await signIn(context.app);
    const { DepartmentModel } = await import('../src/models/Department.ts');
    const department = await DepartmentModel.create({ name: 'Leave Department' });
    const employee = await createEmployee({
      name: 'Leave Department Person',
      departmentId: String(department._id),
    });

    const created = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-08-10',
      endDate: '2026-08-11',
      status: 'approved',
    });

    const list = await agent.get(`/api/leaves?employeeId=${employee._id}`);
    assert.equal(list.body.data.leaves[0].employeeId.departmentId.name, 'Leave Department');

    const detail = await agent.get(`/api/leaves/${created.body.data.leave.id}`);
    assert.equal(detail.body.data.leave.employeeId.departmentId.name, 'Leave Department');

    const csv = await agent.get(`/api/leaves/export.csv?employeeId=${employee._id}`);
    assert.match(csv.text, /Leave Department/);
  });

  it('exports a CSV that neutralises formulas', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Csv Person' });

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      category: 'casual',
      startDate: '2026-08-04',
      endDate: '2026-08-06',
      reason: '=cmd|calc',
      status: 'approved',
    });

    const response = await agent.get(`/api/leaves/export.csv?employeeId=${employee._id}`);

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(response.text, /Employee,Department,Type,Category,From,To,Working days,Status,Reason/);
    assert.match(response.text, /'=cmd\|calc/);
  });

  it('blocks deleting an employee that has leave records', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Guard Person' });

    await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'leave',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      status: 'pending',
    });

    const response = await agent
      .delete(`/api/employees/${employee._id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'employee_has_records');
  });
});
