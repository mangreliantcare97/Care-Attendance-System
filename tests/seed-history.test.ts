/**
 * The two-year 2025-2026 history generator and the calendar/dashboard/
 * attendance-sheet endpoints that read it. The generator is run twice against
 * the same in-memory database to prove that reset + regenerate produces the
 * same canonical checksum while admins and sessions survive.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import {
  createAdmin,
  signIn,
  startTestApp,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  type TestContext,
} from './helpers.ts';
import type {
  SeedEmployeeRecord,
  SeedHistoryResult,
} from '../seed/seed-history-data.ts';

let context: TestContext;
let first: SeedHistoryResult;
let result: SeedHistoryResult;
let adminCountBefore = 0;

const SESSION_SENTINEL = 'seed-history-session-sentinel';
const MANUAL_AFTER_CUTOFF = '2026-10-20';

before(async () => {
  context = await startTestApp();
  const admin = await createAdmin({
    name: 'Seed Owner',
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });

  const { mongoose } = await import('../src/config/db.ts');
  const { AdminModel } = await import('../src/models/Admin.ts');
  const { seedHistoryData } = await import('../seed/seed-history-data.ts');

  adminCountBefore = await AdminModel.countDocuments();
  const sessions = mongoose.connection.db?.collection<{
    _id: string;
    session: string;
    expires: Date;
  }>('sessions');
  await sessions?.insertOne({
    _id: SESSION_SENTINEL,
    session: '{"kept":true}',
    expires: new Date('2030-01-01T00:00:00.000Z'),
  });

  const adminId = String(admin._id);
  first = await seedHistoryData({ adminId, reset: true });
  result = await seedHistoryData({ adminId, reset: true });

  assert.equal(await AdminModel.countDocuments(), adminCountBefore);
  const sentinel = await sessions?.findOne({ _id: SESSION_SENTINEL });
  assert.ok(sentinel, 'a session must survive --reset');
});

after(async () => {
  await context?.stop();
});

function attendanceKey(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

function isoWeekday(date: string): number {
  return ((new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7) + 1;
}

async function rawTopEmployees(month: string): Promise<Array<{
  employeeId: string;
  name: string;
  score: number;
  present: number;
  late: number;
  absent: number;
}>> {
  const { AttendanceModel } = await import('../src/models/Attendance.ts');
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  const rows = await AttendanceModel.find({
    date: { $gte: start, $lte: end },
    status: { $in: ['present', 'late', 'absent'] },
  })
    .select('employeeId status')
    .lean();

  const active = new Map(
    result.employees
      .filter((employee) => employee.status === 'active')
      .map((employee) => [employee.id, employee]),
  );
  const byEmployee = new Map<
    string,
    { employee: SeedEmployeeRecord; present: number; late: number; absent: number }
  >();

  for (const row of rows) {
    const employeeId = String(row.employeeId);
    const employee = active.get(employeeId);
    if (!employee) continue;
    const entry = byEmployee.get(employeeId) ?? {
      employee,
      present: 0,
      late: 0,
      absent: 0,
    };
    if (row.status === 'present') entry.present += 1;
    if (row.status === 'late') entry.late += 1;
    if (row.status === 'absent') entry.absent += 1;
    byEmployee.set(employeeId, entry);
  }

  return [...byEmployee.values()]
    .map((entry) => ({
      employeeId: entry.employee.id,
      name: entry.employee.name,
      score: entry.present * 3 - entry.late - entry.absent * 2,
      present: entry.present,
      late: entry.late,
      absent: entry.absent,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.absent !== b.absent) return a.absent - b.absent;
      if (b.present !== a.present) return b.present - a.present;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);
}

describe('seed:history generator', () => {
  it('is deterministic and leaves admins and sessions alone', () => {
    assert.match(first.checksum, /^[a-f0-9]{64}$/);
    assert.equal(first.checksum, result.checksum);
    assert.equal(result.counts.departments, 5);
    assert.equal(result.counts.employees, 26);
    assert.equal(result.counts.activeEmployees, 23);
    assert.equal(result.counts.inactiveEmployees, 1);
    assert.equal(result.counts.terminatedEmployees, 2);
    assert.equal(result.counts.newHires2025, 3);
    assert.equal(result.counts.newHires2026, 2);
    assert.equal(result.counts.attendance, 10_412);
    assert.equal(result.counts.manualAttendance, 10_124);
    assert.equal(result.counts.leaveAttendance, 288);
    assert.equal(result.counts.futureLeaveRows, 8);
    assert.equal(result.counts.approvedLeaves, 80);
    assert.equal(result.counts.pendingLeaves, 10);
    assert.equal(result.counts.rejectedLeaves, 6);
    assert.equal(result.counts.overtime, 260);
    assert.equal(result.counts.events, 148);
    assert.equal(result.counts.deliberatelyUnmarked, 31);
    assert.equal(result.counts.leaveAllowances, 29);
    assert.ok(result.verification.assertions.length >= 100);
  });

  it('creates the required departments and employees', async () => {
    const { EmployeeModel } = await import('../src/models/Employee.ts');
    const { DepartmentModel } = await import('../src/models/Department.ts');

    const departments = await DepartmentModel.find().lean();
    const employees = await EmployeeModel.find().lean();

    assert.equal(departments.length, 5);
    assert.deepEqual(
      departments.map((department) => department.name).sort(),
      ['Finance', 'Human Resources', 'IT', 'Operations', 'Sales'],
    );

    const sizes = departments
      .map(
        (department) =>
          employees.filter((employee) => String(employee.departmentId) === String(department._id))
            .length,
      )
      .sort((a, b) => a - b);
    assert.deepEqual(sizes, [4, 4, 5, 6, 7]);

    assert.equal(employees.length, 26);
    assert.equal(employees.filter((employee) => employee.status === 'active').length, 23);
    assert.equal(employees.filter((employee) => employee.status === 'inactive').length, 1);
    assert.equal(employees.filter((employee) => employee.status === 'terminated').length, 2);
    assert.equal(employees.filter((employee) => employee.hireDate?.startsWith('2025-')).length, 3);
    assert.equal(employees.filter((employee) => employee.hireDate?.startsWith('2026-')).length, 2);
    assert.equal(employees.some((employee) => Boolean(employee.photo?.data)), false);

    const emails = employees.map((employee) => employee.email).filter((email): email is string => Boolean(email));
    assert.equal(emails.length, 21);
    assert.equal(new Set(emails).size, emails.length);
    assert.equal(employees.filter((employee) => employee.email === null).length, 5);

    const byKey = new Map(result.employees.map((employee) => [employee.key, employee]));
    assert.equal(byKey.get('oscar-underwood')?.leftDate, '2025-06-30');
    assert.equal(byKey.get('jack-shaw')?.leftDate, '2026-08-14');
    assert.equal(byKey.get('leo-palmer')?.leftDate, '2026-03-31');
    assert.equal(byKey.get('maya-patel')?.hireDate, '2026-01-12');
    assert.equal(byKey.get('oliver-grant')?.hireDate, '2026-04-07');
  });

  it('writes complete attendance with the required status mix and no invalid rows', async () => {
    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    const rows = await AttendanceModel.find().lean();
    const employeeById = new Map(result.employees.map((employee) => [employee.id, employee]));
    const approvedIds = new Set(result.approvedLeaves.map((leave) => leave.id));
    const pendingIds = new Set(result.pendingLeaves.map((leave) => leave.id));
    const rejectedIds = new Set(result.rejectedLeaves.map((leave) => leave.id));

    assert.equal(rows.length, 10_412);

    const keys = rows.map((row) => attendanceKey(String(row.employeeId), row.date));
    assert.equal(new Set(keys).size, keys.length);

    for (const row of rows) {
      assert.ok(isoWeekday(row.date) <= 5, `weekend row ${row.date}`);

      const employee = employeeById.get(String(row.employeeId));
      assert.ok(employee, 'row must belong to a generated employee');
      assert.ok(row.date >= employee.hireDate, `${row.date} before hire`);
      if (employee.leftDate) assert.ok(row.date <= employee.leftDate, `${row.date} after leaving`);

      if (row.source === 'leave_sync') {
        assert.ok(row.leaveId);
        assert.ok(approvedIds.has(String(row.leaveId)));
        assert.equal(pendingIds.has(String(row.leaveId)), false);
        assert.equal(rejectedIds.has(String(row.leaveId)), false);
      } else {
        assert.equal(row.source, 'manual');
        assert.equal(row.leaveId, null);
        const bankHoliday = [
          '2025-01-01',
          '2025-04-18',
          '2025-04-21',
          '2025-05-05',
          '2025-05-26',
          '2025-08-25',
          '2025-12-25',
          '2025-12-26',
          '2026-01-01',
          '2026-04-03',
          '2026-04-06',
          '2026-05-04',
          '2026-05-25',
          '2026-08-31',
          '2026-12-25',
          '2026-12-28',
        ].includes(row.date);
        assert.equal(bankHoliday, false, `manual row on bank holiday ${row.date}`);
      }

      if (row.source === 'manual' && row.status === 'present') {
        assert.ok(row.checkIn && row.checkIn >= '08:30' && row.checkIn <= '09:00');
        assert.ok(row.checkOut && row.checkOut >= '17:00' && row.checkOut <= '18:15');
      }
      if (row.source === 'manual' && row.status === 'late') {
        assert.ok(row.checkIn && row.checkIn >= '09:10' && row.checkIn <= '10:30');
        assert.ok(row.checkOut && row.checkOut >= '17:00' && row.checkOut <= '18:15');
      }
      if (row.status === 'absent') {
        assert.equal(row.checkIn, null);
        assert.equal(row.checkOut, null);
      }
    }

    assert.equal(rows.filter((row) => row.date > MANUAL_AFTER_CUTOFF).length, 8);
    assert.equal(
      rows.filter((row) => row.date > MANUAL_AFTER_CUTOFF && row.source !== 'leave_sync').length,
      0,
    );
    assert.equal(
      rows.filter((row) => row.date === '2026-10-21' && row.source === 'manual').length,
      0,
    );
    assert.equal(rows.filter((row) => row.date === '2026-10-21').length, 2);
    assert.equal(rows.filter((row) => row.date === '2026-10-20').length, 23);

    const holidayDates = new Set<string>();
    for (const event of result.events) {
      if (event.type !== 'holiday') continue;
      let cursor = event.startDate;
      while (cursor <= event.endDate) {
        holidayDates.add(cursor);
        cursor = new Date(new Date(`${cursor}T00:00:00.000Z`).getTime() + 86_400_000)
          .toISOString()
          .slice(0, 10);
      }
    }

    const overrides = rows.filter(
      (row) =>
        row.source === 'manual' &&
        !holidayDates.has(row.date) &&
        result.approvedLeaves.some(
          (leave) =>
            leave.employeeId === String(row.employeeId) &&
            leave.startDate <= row.date &&
            leave.endDate >= row.date,
        ),
    );
    assert.equal(overrides.length, 2);
    assert.equal(overrides.every((row) => row.status === 'present'), true);
    assert.equal(
      rows.filter((row) => row.source === 'leave_sync').length,
      result.approvedLeaves.reduce((sum, leave) => sum + leave.days, 0) - overrides.length,
    );

    const notes = rows.filter(
      (row) => (row.status === 'absent' || row.status === 'late') && row.note,
    );
    assert.ok(notes.length > 0);

    const mix = result.verification.overallTotals;
    const counted = mix.present + mix.late + mix.absent;
    assert.ok((mix.present / counted) * 100 >= 85);
    assert.ok((mix.present / counted) * 100 <= 91);
    assert.ok((mix.late / counted) * 100 >= 5);
    assert.ok((mix.late / counted) * 100 <= 9);
    assert.ok((mix.absent / counted) * 100 >= 1.5);
    assert.ok((mix.absent / counted) * 100 <= 4.5);
    assert.ok(result.verification.notMarkedShare >= 0.2);
    assert.ok(result.verification.notMarkedShare <= 0.4);
  });

  it('creates approved, pending and rejected leave with one documented cross-year range', async () => {
    const { LeaveModel } = await import('../src/models/Leave.ts');
    const leaves = await LeaveModel.find().lean();
    const approved = leaves.filter((leave) => leave.status === 'approved');
    const pending = leaves.filter((leave) => leave.status === 'pending');
    const rejected = leaves.filter((leave) => leave.status === 'rejected');

    assert.equal(approved.length, 80);
    assert.equal(pending.length, 10);
    assert.equal(rejected.length, 6);
    assert.equal(approved.filter((leave) => leave.startDate.startsWith('2025-')).length, 40);
    assert.equal(approved.filter((leave) => leave.startDate.startsWith('2026-')).length, 40);

    for (const leave of leaves) {
      assert.ok(leave.startDate <= leave.endDate);
    }

    const crossYear = leaves.filter(
      (leave) => leave.startDate.slice(0, 4) !== leave.endDate.slice(0, 4),
    );
    assert.equal(crossYear.length, 1);
    assert.equal(crossYear[0]?.startDate, '2025-12-22');
    assert.equal(crossYear[0]?.endDate, '2026-01-02');
    // 22-24 Dec and 2 Jan count; the six working days covered by the bank
    // holidays and the Christmas closure do not.
    assert.equal(crossYear[0]?.days, 4);

    const byEmployee = new Map<string, typeof approved>();
    for (const leave of approved) {
      const key = String(leave.employeeId);
      const list = byEmployee.get(key) ?? [];
      list.push(leave);
      byEmployee.set(key, list);
    }
    for (const list of byEmployee.values()) {
      list.sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (let index = 1; index < list.length; index += 1) {
        assert.ok(list[index]!.startDate > list[index - 1]!.endDate, 'approved leaves overlap');
      }
    }

    const bankHolidays = [
      '2025-01-01',
      '2025-04-18',
      '2025-04-21',
      '2025-05-05',
      '2025-05-26',
      '2025-08-25',
      '2025-12-25',
      '2025-12-26',
      '2026-01-01',
      '2026-04-03',
      '2026-04-06',
      '2026-05-04',
      '2026-05-25',
      '2026-08-31',
      '2026-12-25',
      '2026-12-28',
    ];
    const bankHolidayLeaves = approved.filter((leave) => {
      const dates: string[] = [];
      let cursor = leave.startDate;
      while (cursor <= leave.endDate) {
        dates.push(cursor);
        cursor = new Date(new Date(`${cursor}T00:00:00.000Z`).getTime() + 86_400_000)
          .toISOString()
          .slice(0, 10);
      }
      return dates.some((date) => bankHolidays.includes(date));
    });
    assert.deepEqual(
      bankHolidayLeaves.map((leave) => [leave.startDate, leave.days]).sort(),
      [
        ['2025-05-05', 21],
        ['2025-12-22', 4],
        ['2026-04-02', 2],
        ['2026-05-04', 2],
      ],
    );
    assert.equal(
      bankHolidayLeaves.every((leave) =>
        leave.days <
        (new Date(`${leave.endDate}T00:00:00.000Z`).getTime() -
          new Date(`${leave.startDate}T00:00:00.000Z`).getTime()) /
          86_400_000 +
          1,
      ),
      true,
      'a bank-holiday leave counts fewer days than its calendar span',
    );

    const future = approved.filter((leave) => leave.startDate > MANUAL_AFTER_CUTOFF);
    assert.equal(future.length, 3);
    assert.equal(future.filter((leave) => leave.startDate === '2026-10-21').length, 2);
    assert.equal(new Set(future.map((leave) => String(leave.employeeId))).size, 3);
    assert.ok(future.some((leave) => leave.startDate.startsWith('2026-12-')));

    assert.ok(approved.some((leave) => leave.type === 'leave' && leave.category === 'sick'));
    assert.ok(approved.some((leave) => leave.type === 'leave' && leave.category === 'casual'));
    assert.ok(approved.some((leave) => leave.type === 'leave' && leave.category === 'personal'));
    assert.ok(approved.some((leave) => leave.type === 'vacation' && leave.category === 'annual'));
    assert.ok(approved.some((leave) => leave.type === 'time_off'));
  });

  it('stores holiday allowance rows for both years without duplicating an employee year', async () => {
    const { LeaveAllowanceModel } = await import('../src/models/LeaveAllowance.ts');
    const rows = await LeaveAllowanceModel.find().lean();
    const byKey = new Map(result.employees.map((employee) => [employee.key, employee.id]));

    assert.equal(rows.length, 29);
    assert.equal(rows.filter((row) => row.year === 2026).length, 26);
    assert.equal(rows.filter((row) => row.year === 2025).length, 3);
    assert.equal(new Set(rows.map((row) => `${String(row.employeeId)}|${row.year}`)).size, rows.length);

    assert.equal(rows.some((row) => Object.hasOwn(row, 'carryOver')), false);
    const byName = (key: string, year: number) =>
      rows.find((row) => String(row.employeeId) === byKey.get(key) && row.year === year);
    assert.equal(byName('amelia-bennett', 2026)?.allowance, 28);
    assert.equal(byName('noah-carter', 2026)?.allowance, 28);
    assert.equal(byName('olivia-irwin', 2026)?.allowance, 28);
    assert.equal(byName('oliver-grant', 2026)?.allowance, 21);
    assert.equal(byName('evie-barker', 2025)?.allowance, 25.5);
    assert.equal(byName('theo-cooper', 2025)?.allowance, 14);
    assert.equal(byName('ava-hughes', 2025)?.allowance, 9.5);
  });

  it('prints a holiday allowance balance for every employee in both years', () => {
    const checks = result.verification.allowanceChecks;
    assert.equal(checks.length, 52);

    const check = (name: string, year: number) =>
      checks.find((row) => row.name === name && row.year === year);

    assert.deepEqual(
      { total: check('Mia Knight', 2026)?.total, used: check('Mia Knight', 2026)?.used, remaining: check('Mia Knight', 2026)?.remaining },
      { total: 28, used: 28, remaining: 0 },
    );
    assert.deepEqual(
      {
        total: check('Amelia Bennett', 2026)?.total,
        used: check('Amelia Bennett', 2026)?.used,
        remaining: check('Amelia Bennett', 2026)?.remaining,
      },
      { total: 28, used: 33, remaining: -5 },
    );
    assert.deepEqual(
      {
        total: check('Harry Nelson', 2025)?.total,
        used: check('Harry Nelson', 2025)?.used,
        remaining: check('Harry Nelson', 2025)?.remaining,
      },
      { total: 28, used: 23, remaining: 5 },
    );
    assert.deepEqual(
      {
        total: check('Harry Nelson', 2026)?.total,
        used: check('Harry Nelson', 2026)?.used,
        remaining: check('Harry Nelson', 2026)?.remaining,
      },
      { total: 28, used: 0, remaining: 28 },
    );
    assert.equal(check('Amelia Bennett', 2025)?.remaining, 23);
    assert.equal(checks.some((row) => Object.hasOwn(row, 'carryOver')), false);
    assert.equal(check('Jack Shaw', 2025)?.pending, 2);
    assert.equal(check('Theo Cooper', 2026)?.pending, 1);
    assert.equal(check('Noah Carter', 2025)?.used, 8);
    assert.equal(check('Noah Carter', 2026)?.used, 6);
  });

  it('books overtime only on worked days, in quarter hours, across all 22 months', async () => {
    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    const { OvertimeModel } = await import('../src/models/Overtime.ts');
    const attendance = await AttendanceModel.find().select('employeeId date status').lean();
    const worked = new Set(
      attendance
        .filter((row) => row.status === 'present' || row.status === 'late')
        .map((row) => attendanceKey(String(row.employeeId), row.date)),
    );
    const overtime = await OvertimeModel.find().lean();

    assert.equal(overtime.length, 260);
    assert.equal(overtime.filter((row) => row.date.startsWith('2025-')).length, 150);
    assert.equal(overtime.filter((row) => row.date.startsWith('2026-')).length, 110);
    assert.equal(new Set(overtime.map((row) => row.date.slice(0, 7))).size, 22);

    const daily = new Map<string, number>();
    for (const row of overtime) {
      assert.ok(worked.has(attendanceKey(String(row.employeeId), row.date)));
      assert.ok(row.hours >= 0.5 && row.hours <= 4);
      assert.ok(Math.abs(row.hours * 4 - Math.round(row.hours * 4)) < 1e-9);
      const key = attendanceKey(String(row.employeeId), row.date);
      daily.set(key, (daily.get(key) ?? 0) + row.hours);
    }
    for (const total of daily.values()) assert.ok(total <= 24);
  });

  it('creates valid, unique HR events with both years of edge cases', async () => {
    const { EventModel } = await import('../src/models/Event.ts');
    const events = await EventModel.find().lean();
    const allowed = new Set(['holiday', 'deadline', 'meeting', 'event']);

    assert.equal(events.length, 148);
    assert.equal(events.filter((event) => event.startDate.startsWith('2025-')).length, 75);
    assert.equal(events.filter((event) => event.startDate.startsWith('2026-')).length, 73);
    assert.deepEqual(result.verification.eventCountsByYear['2025'], {
      holiday: 9,
      deadline: 21,
      meeting: 29,
      event: 16,
    });
    assert.deepEqual(result.verification.eventCountsByYear['2026'], {
      holiday: 9,
      deadline: 20,
      meeting: 29,
      event: 15,
    });

    const titleKeys = new Set<string>();
    for (const event of events) {
      assert.ok(allowed.has(event.type));
      assert.ok(event.startDate <= event.endDate);
      assert.equal(/payroll|salary|bonus/i.test(`${event.title} ${event.description}`), false);
      const key = `${event.title}|${event.startDate}`;
      assert.equal(titleKeys.has(key), false);
      titleKeys.add(key);
    }

    for (const year of ['2025', '2026']) {
      const yearEvents = events.filter((event) => event.startDate.startsWith(year));
      assert.ok(
        yearEvents.filter(
          (event) => event.startDate.slice(0, 7) !== event.endDate.slice(0, 7),
        ).length >= 3,
      );
      assert.ok(
        yearEvents.some(
          (event) =>
            event.title === 'Summer company day' && isoWeekday(event.startDate) === 6,
        ),
      );
      assert.ok(
        yearEvents.some(
          (event) =>
            event.title === 'Christmas office closure' && event.endDate === `${year}-12-31`,
        ),
      );
      const starts = new Map<string, number>();
      for (const event of yearEvents) {
        starts.set(event.startDate, (starts.get(event.startDate) ?? 0) + 1);
      }
      assert.ok([...starts.values()].some((count) => count >= 2));
    }

    for (const date of ['2025-03-30', '2025-10-26', '2026-03-29', '2026-10-25']) {
      assert.ok(events.some((event) => event.startDate === date), `missing clock-change event ${date}`);
    }
    assert.ok(
      result.verification.edgeCaseEvents.some((event) => event.edgeCases.includes('leave-day')),
    );
  });

  it('refuses to seed on top of existing employees without reset', async () => {
    const { seedHistoryData } = await import('../seed/seed-history-data.ts');
    const { EmployeeModel } = await import('../src/models/Employee.ts');
    await assert.rejects(
      seedHistoryData({ adminId: result.adminId, reset: false }),
      /already contains 26 employee/,
    );
    assert.equal(await EmployeeModel.countDocuments(), 26);
  });
});

describe('seed:history calendar feed', () => {
  it('keeps the clock-change events on their date-only days in both years', async () => {
    const { agent } = await signIn(context.app);

    for (const [start, end, date, title] of [
      ['2025-03-30', '2025-04-01', '2025-03-30', 'Spring clock change'],
      ['2025-10-25', '2025-10-27', '2025-10-26', 'Autumn clock change'],
      ['2026-03-29', '2026-03-30', '2026-03-29', 'Spring clock change'],
      ['2026-10-25', '2026-10-26', '2026-10-25', 'Autumn clock change'],
    ] as const) {
      const response = await agent.get(`/api/calendar?start=${start}&end=${end}`);
      assert.equal(response.status, 200);
      const event = response.body.data.events.find(
        (item: { title: string }) => item.title === title,
      );
      assert.ok(event, `missing ${title} on ${date}`);
      assert.equal(event.startDate, date);
      assert.equal(event.start, date);
    }
  });

  it('returns month-crossing events and both Christmas closures with inclusive ends', async () => {
    const { agent } = await signIn(context.app);

    for (const [monthA, monthB, date] of [
      ['2025-06-01', '2025-07-01', '2025-06-30'],
      ['2026-09-01', '2026-10-01', '2026-09-30'],
    ] as const) {
      const june = await agent.get(
        `/api/calendar?start=${monthA}&end=${monthA.slice(0, 7)}-30`,
      );
      const july = await agent.get(
        `/api/calendar?start=${monthB}&end=${monthB.slice(0, 7)}-31`,
      );
      assert.equal(june.status, 200);
      assert.equal(july.status, 200);
      const inFirst = june.body.data.events.find(
        (event: { title: string; startDate: string }) =>
          event.title === 'Leave plan submission' && event.startDate === date,
      );
      const inSecond = july.body.data.events.find(
        (event: { title: string; startDate: string }) =>
          event.title === 'Leave plan submission' && event.startDate === date,
      );
      assert.ok(inFirst);
      assert.ok(inSecond);
      assert.equal(inFirst.id, inSecond.id);
      assert.equal(inSecond.endDate, `${monthB.slice(0, 7)}-02`);
    }

    for (const year of ['2025', '2026']) {
      const december = await agent.get(
        `/api/calendar?start=${year}-12-28&end=${year}-12-31`,
      );
      const closure = december.body.data.events.find(
        (event: { title: string }) => event.title === 'Christmas office closure',
      );
      assert.ok(closure);
      assert.equal(closure.startDate, `${year}-12-29`);
      assert.equal(closure.endDate, `${year}-12-31`);
      assert.equal(closure.end, `${Number(year) + 1}-01-01`);
    }
  });

  it('shows approved leave beside events and excludes pending/rejected leave', async () => {
    const { agent } = await signIn(context.app);
    const day = await agent.get('/api/calendar?start=2025-12-19&end=2025-12-19');
    assert.equal(day.status, 200);

    const event = day.body.data.events.find(
      (item: { title: string; kind: string }) =>
        item.kind === 'hr' && item.title === 'Year-end review',
    );
    const leave = day.body.data.events.find(
      (item: { kind: string; employeeName?: string; type: string }) =>
        item.kind === 'leave' && item.employeeName === 'Harry Nelson' && item.type === 'vacation',
    );
    assert.ok(event);
    assert.ok(leave);

    const year = await agent.get('/api/calendar?start=2025-01-01&end=2025-12-31');
    assert.equal(year.status, 200);
    const items = year.body.data.events as Array<{ id: string; kind: string }>;
    const pendingIds = new Set(result.pendingLeaves.map((item) => item.id));
    const rejectedIds = new Set(result.rejectedLeaves.map((item) => item.id));
    const approvedIds = new Set(result.approvedLeaves.map((item) => item.id));

    assert.equal(items.some((item) => pendingIds.has(item.id)), false);
    assert.equal(items.some((item) => rejectedIds.has(item.id)), false);
    const leaveItems = items.filter((item) => item.kind === 'leave');
    assert.equal(leaveItems.length, 40);
    assert.equal(leaveItems.every((item) => approvedIds.has(item.id)), true);
  });

  it('shows the two future approved leaves on 2026-10-21', async () => {
    const { agent } = await signIn(context.app);
    const response = await agent.get('/api/calendar?start=2026-10-21&end=2026-10-21');
    assert.equal(response.status, 200);
    const leaves = response.body.data.events.filter(
      (item: { kind: string }) => item.kind === 'leave',
    );
    assert.equal(leaves.length, 2);
    assert.deepEqual(
      leaves.map((leave: { employeeName: string }) => leave.employeeName).sort(),
      ['Amelia Bennett', 'Noah Carter'],
    );
    assert.ok(
      response.body.data.events.some(
        (item: { kind: string; title: string }) =>
          item.kind === 'hr' && item.title === 'Autumn away day',
      ),
    );
  });
});

describe('seed:history dashboard and attendance sheets', () => {
  it('matches a hand calculation for Top Employees in both years', async () => {
    const { agent } = await signIn(context.app);
    for (const month of ['2025-03', '2026-09']) {
      const response = await agent.get(`/api/dashboard/month?month=${month}`);
      assert.equal(response.status, 200);
      const actual = response.body.data.topEmployees as Array<{
        employeeId: string;
        name: string;
        score: number;
        present: number;
        late: number;
        absent: number;
      }>;
      const expected = await rawTopEmployees(month);
      assert.deepEqual(
        actual.map((employee) => ({
          employeeId: employee.employeeId,
          name: employee.name,
          score: employee.score,
          present: employee.present,
          late: employee.late,
          absent: employee.absent,
        })),
        expected,
      );
    }
  });

  it('returns a 12-month dashboard series for both years and no marked 2026 data after October', async () => {
    const { agent } = await signIn(context.app);

    for (const year of [2025, 2026]) {
      const response = await agent.get(`/api/dashboard/year?year=${year}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.year, year);
      assert.equal(response.body.data.months.length, 12);
      assert.equal(response.body.data.months[0].month, `${year}-01`);
      assert.equal(response.body.data.months[11].month, `${year}-12`);
    }

    const year2025 = await agent.get('/api/dashboard/year?year=2025');
    assert.equal(
      year2025.body.data.months.every((month: { attendance: number }) => month.attendance > 0),
      true,
    );

    const year2026 = await agent.get('/api/dashboard/year?year=2026');
    assert.equal(
      year2026.body.data.months
        .slice(0, 10)
        .every((month: { attendance: number }) => month.attendance > 0),
      true,
    );
    assert.equal(
      year2026.body.data.months
        .slice(10)
        .every(
          (month: { attendance: number; absence: number }) =>
            month.attendance === 0 && month.absence === 0,
        ),
      true,
    );
    assert.equal(year2026.body.data.months[11].leave, 3);
  });

  it('has the fixed 2026-10-21 dashboard cards and the two sheet views', async () => {
    const { dashboardSummary } = await import('../src/services/dashboard.ts');
    const summary = await dashboardSummary('2026-10-21');
    assert.equal(summary.date, '2026-10-21');
    assert.equal(summary.isWorkingDay, true);
    assert.equal(summary.isHoliday, false);
    assert.equal(summary.totalEmployees, 23);
    assert.equal(summary.present, 0);
    assert.equal(summary.late, 0);
    assert.equal(summary.absent, 0);
    assert.equal(summary.onLeave, 2);
    assert.equal(summary.notMarked, 21);
    const departments = new Map(
      summary.departments.map((department) => [department.name, department.activeEmployees]),
    );
    assert.equal(departments.get('Operations'), 7);
    assert.equal(departments.get('Finance'), 5);
    assert.equal(departments.get('Human Resources'), 3);
    assert.equal(departments.get('Sales'), 4);
    assert.equal(departments.get('IT'), 4);

    const { agent } = await signIn(context.app);
    const lastMarked = await agent.get('/api/attendance/sheet?date=2026-10-20');
    assert.equal(lastMarked.status, 200);
    assert.equal(lastMarked.body.data.employees.length, 23);
    const lastMarkedRecords = lastMarked.body.data.employees.filter(
      (entry: { record: unknown }) => entry.record,
    );
    assert.equal(lastMarkedRecords.length, 23);
    assert.equal(
      lastMarkedRecords.every(
        (entry: { record: { source: string } }) => entry.record.source === 'manual',
      ),
      true,
    );

    const todaySheet = await agent.get('/api/attendance/sheet?date=2026-10-21');
    assert.equal(todaySheet.status, 200);
    assert.equal(todaySheet.body.data.employees.length, 23);
    const todayRecords = todaySheet.body.data.employees.filter(
      (entry: { record: unknown }) => entry.record,
    );
    assert.equal(todayRecords.length, 2);
    assert.equal(
      todayRecords.every(
        (entry: { record: { source: string } }) => entry.record.source === 'leave_sync',
      ),
      true,
    );
    assert.deepEqual(
      todayRecords
        .map((entry: { employee: { name: string }; record: { status: string } }) => [
          entry.employee.name,
          entry.record.status,
        ])
        .sort(),
      [
        ['Amelia Bennett', 'vacation'],
        ['Noah Carter', 'on_leave'],
      ],
    );
  });

  it('returns an attendance report spanning both years with matching counts', async () => {
    const { agent } = await signIn(context.app);
    const throughCutoff = await agent.get(
      '/api/attendance?from=2025-01-01&to=2026-10-20&page=1&perPage=100',
    );
    assert.equal(throughCutoff.status, 200);
    assert.equal(throughCutoff.body.meta.total, 10_404);
    assert.equal(
      Object.values(throughCutoff.body.data.counts as Record<string, number>).reduce(
        (sum, count) => sum + count,
        0,
      ),
      10_404,
    );

    const everything = await agent.get(
      '/api/attendance?from=2025-01-01&to=2026-12-31&page=1&perPage=100',
    );
    assert.equal(everything.status, 200);
    assert.equal(everything.body.meta.total, 10_412);
  });
});

describe('seed:history safety rails', () => {
  it('parses test/demo database names and rejects unsafe names', async () => {
    const { databaseNameFromUri, isSafeSeedDatabaseName } = await import(
      '../seed/seed-history-data.ts'
    );
    assert.equal(
      databaseNameFromUri('mongodb://user:pass@127.0.0.1:27017/lean-hrm-test?authSource=admin'),
      'lean-hrm-test',
    );
    assert.equal(databaseNameFromUri('mongodb+srv://example.invalid/lean-hrm-demo'), 'lean-hrm-demo');
    assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017'), '');
    assert.equal(isSafeSeedDatabaseName('lean-hrm-2025-test'), true);
    assert.equal(isSafeSeedDatabaseName('LEAN-HRM-DEMO'), true);
    assert.equal(isSafeSeedDatabaseName('lean-hrm'), false);
  });

  it('keeps seed:2025 as an alias for seed:history', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    assert.equal(packageJson.scripts['seed:history'], 'node seed/seed-history.ts');
    assert.equal(packageJson.scripts['seed:2025'], 'node seed/seed-history.ts');
  });

  it('refuses production and unsafe database names before connecting', () => {
    const cli = path.resolve('seed/seed-history.ts');

    const production = spawnSync(process.execPath, [cli], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/lean-hrm-test',
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(production.status, 1);
    assert.match(`${production.stdout}${production.stderr}`, /NODE_ENV=production/);

    const unsafe = spawnSync(process.execPath, [cli], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/lean-hrm',
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(unsafe.status, 1);
    assert.match(`${unsafe.stdout}${unsafe.stderr}`, /does not contain "test" or "demo"/);
  });
});
