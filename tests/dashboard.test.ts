/**
 * Dashboard: cards vs. the daily sheet, non-working days, Top Employees
 * (including a tie and leave exclusion), the year/month series and departments.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  createAdmin,
  signIn,
  startTestApp,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  type TestContext,
} from './helpers.ts';
import { today } from '../src/utils/dates.ts';

let context: TestContext;

before(async () => {
  context = await startTestApp();
  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  await context?.stop();
});

async function createDepartment(name: string) {
  const { DepartmentModel } = await import('../src/models/Department.ts');
  return DepartmentModel.create({ name });
}

async function createEmployee(input: {
  name: string;
  status?: 'active' | 'inactive';
  departmentId?: string;
  position?: string;
  photo?: { data: string; mime: string; size: number };
}) {
  const { EmployeeModel } = await import('../src/models/Employee.ts');
  return EmployeeModel.create({
    name: input.name,
    status: input.status ?? 'active',
    departmentId: input.departmentId ?? null,
    position: input.position ?? null,
    photo: input.photo,
  });
}

async function createAttendance(
  employeeId: string,
  entries: Array<{ date: string; status: string }>,
) {
  const { AttendanceModel } = await import('../src/models/Attendance.ts');
  return AttendanceModel.insertMany(
    entries.map((entry) => ({ employeeId, date: entry.date, status: entry.status })),
  );
}

describe('dashboard', () => {
  it('needs a session', async () => {
    const response = await request(context.app).get('/api/dashboard/summary');
    assert.equal(response.status, 401);
  });

  it('shows the same counts as the daily sheet and counts only active employees', async () => {
    const { agent } = await signIn(context.app);

    const departmentA = await createDepartment('Summary Department A');
    const departmentB = await createDepartment('Summary Department B');

    const present = await createEmployee({
      name: 'Summary Present',
      departmentId: String(departmentA._id),
    });
    const late = await createEmployee({
      name: 'Summary Late',
      departmentId: String(departmentA._id),
    });
    const absent = await createEmployee({
      name: 'Summary Absent',
      departmentId: String(departmentA._id),
    });
    const onLeave = await createEmployee({
      name: 'Summary On Leave',
      departmentId: String(departmentB._id),
    });
    const vacation = await createEmployee({
      name: 'Summary Vacation',
      departmentId: String(departmentB._id),
    });
    await createEmployee({ name: 'Summary Unmarked', departmentId: String(departmentB._id) });
    await createEmployee({
      name: 'Summary Inactive',
      departmentId: String(departmentB._id),
      status: 'inactive',
    });

    const date = today();
    await createAttendance(String(present._id), [{ date, status: 'present' }]);
    await createAttendance(String(late._id), [{ date, status: 'late' }]);
    await createAttendance(String(absent._id), [{ date, status: 'absent' }]);
    await createAttendance(String(onLeave._id), [{ date, status: 'on_leave' }]);
    await createAttendance(String(vacation._id), [{ date, status: 'vacation' }]);

    const sheetResponse = await agent.get(`/api/attendance/sheet?date=${date}`);
    assert.equal(sheetResponse.status, 200);

    const sheet = sheetResponse.body.data.employees as Array<{
      record: { status: string } | null;
    }>;
    const sheetCounts = {
      present: 0,
      late: 0,
      absent: 0,
      on_leave: 0,
      vacation: 0,
    };
    let marked = 0;
    for (const entry of sheet) {
      if (!entry.record) continue;
      marked += 1;
      sheetCounts[entry.record.status as keyof typeof sheetCounts] += 1;
    }

    const response = await agent.get('/api/dashboard/summary');
    assert.equal(response.status, 200);
    const summary = response.body.data;

    assert.equal(summary.date, date);
    assert.equal(summary.totalEmployees, sheet.length);
    assert.equal(summary.present, sheetCounts.present);
    assert.equal(summary.late, sheetCounts.late);
    assert.equal(summary.absent, sheetCounts.absent);
    assert.equal(summary.onLeave, sheetCounts.on_leave + sheetCounts.vacation);

    if (summary.isWorkingDay) {
      assert.equal(summary.notMarked, sheet.length - marked);
    } else {
      assert.equal(summary.notMarked, null);
    }

    const byName = new Map(
      summary.departments.map((department: { name: string; activeEmployees: number }) => [
        department.name,
        department.activeEmployees,
      ]),
    );
    assert.equal(byName.get('Summary Department A'), 3);
    assert.equal(byName.get('Summary Department B'), 3);
  });

  it('returns no "not marked" value on a non-working day', async () => {
    const { dashboardSummary } = await import('../src/services/dashboard.ts');

    // Saturday 24 October 2026 - the service takes a date so this is testable
    // even when the suite runs on a weekday.
    const summary = await dashboardSummary('2026-10-24');

    assert.equal(summary.isWorkingDay, false);
    assert.equal(summary.notMarked, null);
  });

  it('reports a holiday without changing attendance or leave counts', async () => {
    const { agent } = await signIn(context.app);
    const { EventModel } = await import('../src/models/Event.ts');

    const before = await agent.get('/api/dashboard/summary');
    assert.equal(before.status, 200);
    assert.equal(before.body.data.isHoliday, false);
    assert.equal(before.body.data.holidayTitle, null);

    await EventModel.create({
      title: 'Founders Day',
      type: 'holiday',
      startDate: today(),
      endDate: today(),
    });

    try {
      const response = await agent.get('/api/dashboard/summary');
      assert.equal(response.status, 200);
      const summary = response.body.data;

      assert.equal(summary.isHoliday, true);
      assert.equal(summary.holidayTitle, 'Founders Day');
      assert.equal(summary.notMarked, null);
      // A holiday is a notice, never a mutation: the recorded attendance and
      // leave totals are exactly what they were before the event existed.
      assert.equal(summary.present, before.body.data.present);
      assert.equal(summary.late, before.body.data.late);
      assert.equal(summary.absent, before.body.data.absent);
      assert.equal(summary.onLeave, before.body.data.onLeave);
    } finally {
      await EventModel.deleteMany({ title: 'Founders Day', type: 'holiday' });
    }
  });

  it('orders Top Employees by the hand-calculated score, tie-breaks and excludes leave days', async () => {
    const { agent } = await signIn(context.app);
    const department = await createDepartment('Top Department');

    const bob = await createEmployee({
      name: 'Top Bob',
      departmentId: String(department._id),
      position: 'Engineer',
      photo: { data: 'secret-photo-data', mime: 'image/png', size: 17 },
    });
    const alice = await createEmployee({
      name: 'Top Alice',
      departmentId: String(department._id),
      position: 'Analyst',
    });
    const carol = await createEmployee({
      name: 'Top Carol',
      departmentId: String(department._id),
      position: 'Coordinator',
    });
    const dave = await createEmployee({
      name: 'Top Dave',
      departmentId: String(department._id),
      position: 'Assistant',
    });
    const eve = await createEmployee({
      name: 'Top Eve',
      departmentId: String(department._id),
      position: 'Assistant',
    });
    const inactive = await createEmployee({
      name: 'Top Inactive',
      departmentId: String(department._id),
      status: 'inactive',
    });
    const leaveOnly = await createEmployee({
      name: 'Top Leave Only',
      departmentId: String(department._id),
    });

    // Bob: 4 present = 12, 0 absent.
    await createAttendance(String(bob._id), [
      { date: '2026-04-01', status: 'present' },
      { date: '2026-04-02', status: 'present' },
      { date: '2026-04-03', status: 'present' },
      { date: '2026-04-04', status: 'present' },
    ]);
    // Alice: 5 present + 1 late + 1 absent = 15 - 1 - 2 = 12; Bob wins the tie
    // because he has fewer absences.
    await createAttendance(String(alice._id), [
      { date: '2026-04-01', status: 'present' },
      { date: '2026-04-02', status: 'present' },
      { date: '2026-04-03', status: 'present' },
      { date: '2026-04-04', status: 'present' },
      { date: '2026-04-05', status: 'present' },
      { date: '2026-04-06', status: 'late' },
      { date: '2026-04-07', status: 'absent' },
    ]);
    // Carol: 3 present + 2 late + 2 absent = 9 - 2 - 4 = 3. Her leave and
    // vacation days must not change the score.
    await createAttendance(String(carol._id), [
      { date: '2026-04-01', status: 'present' },
      { date: '2026-04-02', status: 'present' },
      { date: '2026-04-03', status: 'present' },
      { date: '2026-04-04', status: 'late' },
      { date: '2026-04-05', status: 'late' },
      { date: '2026-04-06', status: 'absent' },
      { date: '2026-04-07', status: 'absent' },
      { date: '2026-04-08', status: 'on_leave' },
      { date: '2026-04-09', status: 'on_leave' },
      { date: '2026-04-10', status: 'on_leave' },
      { date: '2026-04-11', status: 'on_leave' },
      { date: '2026-04-12', status: 'on_leave' },
      { date: '2026-04-13', status: 'vacation' },
      { date: '2026-04-14', status: 'vacation' },
    ]);
    await createAttendance(String(dave._id), [{ date: '2026-04-01', status: 'present' }]);
    await createAttendance(String(eve._id), [{ date: '2026-04-01', status: 'absent' }]);
    await createAttendance(String(inactive._id), [
      { date: '2026-04-01', status: 'present' },
      { date: '2026-04-02', status: 'present' },
      { date: '2026-04-03', status: 'present' },
      { date: '2026-04-04', status: 'present' },
      { date: '2026-04-05', status: 'present' },
      { date: '2026-04-06', status: 'present' },
    ]);
    await createAttendance(String(leaveOnly._id), [
      { date: '2026-04-01', status: 'on_leave' },
      { date: '2026-04-02', status: 'vacation' },
    ]);

    const response = await agent.get('/api/dashboard/month?month=2026-04');
    assert.equal(response.status, 200);

    const top = response.body.data.topEmployees;
    assert.deepEqual(
      top.map((row: { name: string }) => row.name),
      ['Top Bob', 'Top Alice', 'Top Dave', 'Top Carol', 'Top Eve'],
    );

    assert.deepEqual(
      top.map((row: { score: number; present: number; late: number; absent: number }) => [
        row.score,
        row.present,
        row.late,
        row.absent,
      ]),
      [
        [12, 4, 0, 0],
        [12, 5, 1, 1],
        [3, 1, 0, 0],
        [3, 3, 2, 2],
        [-2, 0, 0, 1],
      ],
    );

    assert.equal(top[0].position, 'Engineer');
    assert.equal(top[0].department, 'Top Department');
    assert.equal(JSON.stringify(top).includes('secret-photo-data'), false);

    const days = response.body.data.days as Array<{
      date: string;
      attendance: number;
      absence: number;
      leave: number;
    }>;
    assert.equal(days.length, 30);

    const aprilFirst = days.find((day) => day.date === '2026-04-01');
    // Present: Bob, Alice, Carol, Dave and the inactive employee (the charts
    // include historical records); Gina on leave; Eve absent.
    assert.equal(aprilFirst?.attendance, 5);
    assert.equal(aprilFirst?.absence, 1);
    assert.equal(aprilFirst?.leave, 1);

    const aprilEighth = days.find((day) => day.date === '2026-04-08');
    assert.equal(aprilEighth?.leave, 1);
    assert.equal(aprilEighth?.attendance, 0);
  });

  it('builds twelve month buckets with the three series', async () => {
    const { agent } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Year Person' });

    await createAttendance(String(employee._id), [
      { date: '2025-01-06', status: 'present' },
      { date: '2025-01-07', status: 'late' },
      { date: '2025-01-08', status: 'absent' },
      { date: '2025-02-03', status: 'on_leave' },
      { date: '2025-02-04', status: 'vacation' },
    ]);

    const response = await agent.get('/api/dashboard/year?year=2025');
    assert.equal(response.status, 200);

    const months = response.body.data.months;
    assert.equal(months.length, 12);

    const january = months.find((month: { month: string }) => month.month === '2025-01');
    assert.equal(january.attendance, 2);
    assert.equal(january.absence, 1);
    assert.equal(january.leave, 0);

    const february = months.find((month: { month: string }) => month.month === '2025-02');
    assert.equal(february.attendance, 0);
    assert.equal(february.absence, 0);
    assert.equal(february.leave, 2);

    const march = months.find((month: { month: string }) => month.month === '2025-03');
    assert.deepEqual([march.attendance, march.absence, march.leave], [0, 0, 0]);
  });

  it('validates the year and month parameters', async () => {
    const { agent } = await signIn(context.app);

    const badYear = await agent.get('/api/dashboard/year?year=1999');
    assert.equal(badYear.status, 422);
    assert.equal(badYear.body.error.code, 'validation_error');

    const missingYear = await agent.get('/api/dashboard/year');
    assert.equal(missingYear.status, 422);

    const badMonth = await agent.get('/api/dashboard/month?month=2026-13');
    assert.equal(badMonth.status, 422);

    const missingMonth = await agent.get('/api/dashboard/month');
    assert.equal(missingMonth.status, 422);
  });
});
