/**
 * Attendance: the daily sheet, the duplicate guard, the report and the CSV.
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
import { addDays, today } from '../src/utils/dates.ts';

let context: TestContext;

before(async () => {
  context = await startTestApp();
  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  await context?.stop();
});

describe('attendance', () => {
  it('needs a session', async () => {
    const { app } = context;
    const response = await (await import('supertest')).default(app).get('/api/attendance');

    assert.equal(response.status, 401);
  });

  it('refuses a state changing request without a CSRF token', async () => {
    const { agent } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Sheet Person' });

    const response = await agent.post('/api/attendance/sheet').send({
      date: '2026-06-01',
      entries: [{ employeeId: String(employee._id), status: 'present' }],
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('lists the active employees and leaves the others unmarked', async () => {
    const { agent } = await signIn(context.app);
    await createEmployee({ name: 'Active One', status: 'active' });
    await createEmployee({ name: 'Inactive One', status: 'inactive' });

    const response = await agent.get('/api/attendance/sheet?date=2026-06-01');

    assert.equal(response.status, 200);
    const names = response.body.data.employees.map((item: { employee: { name: string } }) => item.employee.name);

    assert.equal(names.includes('Active One'), true);
    assert.equal(names.includes('Inactive One'), false);
    assert.equal(response.body.data.employees[0].record, null);
  });

  it('saves the whole sheet in one request', async () => {
    const { agent, csrf } = await signIn(context.app);
    const first = await createEmployee({ name: 'Sheet A', status: 'active' });
    const second = await createEmployee({ name: 'Sheet B', status: 'active' });

    const response = await agent
      .post('/api/attendance/sheet')
      .set('X-CSRF-Token', csrf)
      .send({
        date: '2026-06-02',
        entries: [
          { employeeId: String(first._id), status: 'present', checkIn: '09:00', checkOut: '17:30' },
          { employeeId: String(second._id), status: 'late', checkIn: '09:40' },
        ],
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.saved, 2);

    const sheet = await agent.get('/api/attendance/sheet?date=2026-06-02');
    const marked = sheet.body.data.employees.filter((item: { record: unknown }) => item.record);

    assert.equal(marked.length, 2);
  });

  it('does not turn unmarked employees into absent ones', async () => {
    const { agent, csrf } = await signIn(context.app);
    const marked = await createEmployee({ name: 'Marked Person', status: 'active' });
    await createEmployee({ name: 'Unmarked Person', status: 'active' });

    await agent
      .post('/api/attendance/sheet')
      .set('X-CSRF-Token', csrf)
      .send({
        date: '2026-06-03',
        entries: [{ employeeId: String(marked._id), status: 'present' }],
      });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    const records = await AttendanceModel.find({ date: '2026-06-03' });

    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'present');
  });

  it('refuses a second record for the same employee and day', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Twice Person', status: 'active' });

    const payload = { employeeId: String(employee._id), date: '2026-06-04', status: 'present' };

    const first = await agent.post('/api/attendance').set('X-CSRF-Token', csrf).send(payload);
    assert.equal(first.status, 200);

    const second = await agent.post('/api/attendance').set('X-CSRF-Token', csrf).send(payload);
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'duplicate_attendance');
  });

  it('turns a leave_sync record into a manual one when it is edited', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Sync Person', status: 'active' });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    const record = await AttendanceModel.create({
      employeeId: employee._id,
      date: '2026-06-05',
      status: 'on_leave',
      source: 'leave_sync',
    });

    const response = await agent
      .patch(`/api/attendance/${record._id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'present' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.record.source, 'manual');
    assert.equal(response.body.data.record.status, 'present');
  });

  it('keeps an untouched leave_sync row attached when the sheet is saved', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Sheet Leave Person', status: 'active' });
    const { AttendanceModel } = await import('../src/models/Attendance.ts');

    const leave = await agent.post('/api/leaves').set('X-CSRF-Token', csrf).send({
      employeeId: String(employee._id),
      type: 'vacation',
      startDate: '2026-06-08',
      endDate: '2026-06-09',
      status: 'approved',
    });
    assert.equal(leave.status, 200);
    const leaveId = leave.body.data.leave.id as string;

    const sheet = await agent.get('/api/attendance/sheet?date=2026-06-08');
    const entry = sheet.body.data.employees.find(
      (item: { employee: { id: string } }) => item.employee.id === String(employee._id),
    );
    assert.equal(entry.record.status, 'vacation');
    assert.equal(entry.record.source, 'leave_sync');

    // Saving the sheet with exactly the values that were loaded must not touch
    // the row: it stays owned by the leave.
    const untouched = await agent
      .post('/api/attendance/sheet')
      .set('X-CSRF-Token', csrf)
      .send({
        date: '2026-06-08',
        entries: [
          {
            employeeId: String(employee._id),
            status: entry.record.status,
            checkIn: entry.record.checkIn,
            checkOut: entry.record.checkOut,
            note: entry.record.note,
          },
        ],
      });

    assert.equal(untouched.status, 200);
    assert.equal(untouched.body.data.saved, 0);
    assert.equal(untouched.body.data.unchanged, 1);

    const stillAttached = await AttendanceModel.findById(entry.record.id);
    assert.equal(stillAttached?.source, 'leave_sync');
    assert.equal(String(stillAttached?.leaveId), leaveId);

    // A real change turns it into a manual row and clears the leave link.
    const changed = await agent
      .post('/api/attendance/sheet')
      .set('X-CSRF-Token', csrf)
      .send({
        date: '2026-06-08',
        entries: [{ employeeId: String(employee._id), status: 'present' }],
      });

    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.saved, 1);

    const detached = await AttendanceModel.findById(entry.record.id);
    assert.equal(detached?.status, 'present');
    assert.equal(detached?.source, 'manual');
    assert.equal(detached?.leaveId, null);
  });

  it('counts the statuses of the report', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Counter', status: 'active' });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-07-01', status: 'present' });
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-07-02', status: 'late' });
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-07-03', status: 'absent' });
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-07-04', status: 'on_leave' });
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-07-05', status: 'vacation' });

    const response = await agent.get('/api/attendance?from=2026-07-01&to=2026-07-31');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.counts.present, 1);
    assert.equal(response.body.data.counts.late, 1);
    assert.equal(response.body.data.counts.absent, 1);
    assert.equal(response.body.data.counts.on_leave, 1);
    assert.equal(response.body.data.counts.vacation, 1);
    assert.ok(response.body.meta.total >= 5);
  });

  it('includes the department in report rows and the CSV', async () => {
    const { agent } = await signIn(context.app);
    const { DepartmentModel } = await import('../src/models/Department.ts');
    const department = await DepartmentModel.create({ name: 'Report Department' });
    const employee = await createEmployee({
      name: 'Report Person',
      departmentId: String(department._id),
      status: 'active',
    });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    await AttendanceModel.create({
      employeeId: employee._id,
      date: '2026-10-01',
      status: 'present',
    });

    const response = await agent.get(
      `/api/attendance?from=2026-10-01&to=2026-10-01&employeeId=${employee._id}`,
    );
    const record = response.body.data.records.find(
      (row: { employeeId: { id: string } }) => row.employeeId.id === String(employee._id),
    );

    assert.ok(record, 'the report should include the created record');
    assert.equal(record.employeeId.departmentId.name, 'Report Department');

    const csv = await agent.get(
      `/api/attendance/export.csv?from=2026-10-01&to=2026-10-01&employeeId=${employee._id}`,
    );
    assert.match(csv.text, /Report Department/);
  });

  it('filters the report by date range', async () => {
    const { agent } = await signIn(context.app);
    const response = await agent.get('/api/attendance?from=2026-07-01&to=2026-07-01');

    assert.equal(response.status, 200);
    for (const record of response.body.data.records) {
      assert.equal(record.date, '2026-07-01');
    }
  });

  it('deletes a record', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Deletable', status: 'active' });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    const record = await AttendanceModel.create({
      employeeId: employee._id,
      date: '2026-08-01',
      status: 'present',
    });

    const response = await agent
      .delete(`/api/attendance/${record._id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(await AttendanceModel.countDocuments({ _id: record._id }), 0);
  });

  it('exports a CSV that neutralises formulas', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Csv Person', status: 'active' });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    await AttendanceModel.create({
      employeeId: employee._id,
      date: '2026-09-01',
      status: 'present',
      note: '=cmd|calc',
    });

    const response = await agent.get('/api/attendance/export.csv?from=2026-09-01&to=2026-09-30');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(response.headers['content-disposition'], /attachment/);
    assert.match(response.text, /Date,Employee/);
    assert.match(response.text, /'=cmd\|calc/);
  });

  it('refuses an invalid date', async () => {
    const { agent } = await signIn(context.app);
    const response = await agent.get('/api/attendance/sheet?date=2026-13-45');

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');
  });

  it('refuses to mark attendance for a future date in the application timezone', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Future Person', status: 'active' });
    const tomorrow = addDays(today(), 1);

    const sheet = await agent
      .post('/api/attendance/sheet')
      .set('X-CSRF-Token', csrf)
      .send({
        date: tomorrow,
        entries: [{ employeeId: String(employee._id), status: 'present' }],
      });

    assert.equal(sheet.status, 400);
    assert.equal(sheet.body.error.code, 'date_in_future');

    const single = await agent
      .post('/api/attendance')
      .set('X-CSRF-Token', csrf)
      .send({ employeeId: String(employee._id), date: tomorrow, status: 'present' });

    assert.equal(single.status, 400);
    assert.equal(single.body.error.code, 'date_in_future');
  });

  it('tells the sheet client which day is today', async () => {
    const { agent } = await signIn(context.app);
    const response = await agent.get('/api/attendance/sheet?date=2026-06-01');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.today, today());
  });
});
