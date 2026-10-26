/**
 * Demo data — local/demo environments only.
 *
 *   npm run seed:demo
 *
 * The script refuses to run in production and refuses to touch a database that
 * already contains students. It creates five departments, 25 fake students,
 * three months of attendance with roughly half of the team already marked
 * today, 14 approved leaves across different students, overtime for the
 * current and previous two months, and calendar events.
 *
 * The random generator is seeded with a constant, so the same data is produced
 * every time the script runs against an empty database.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { env } from '../src/config/env.ts';
import { DepartmentModel } from '../src/models/Department.ts';
import { StudentModel } from '../src/models/Student.ts';
import { AttendanceModel } from '../src/models/Attendance.ts';
import { LeaveModel, type LeaveType } from '../src/models/Leave.ts';
import { LeaveAllowanceModel } from '../src/models/LeaveAllowance.ts';
import { OvertimeModel } from '../src/models/Overtime.ts';
import { EventModel, type EventType } from '../src/models/Event.ts';
import { leaveWorkingDays } from '../src/services/leaves.ts';
import { reconcileLeave } from '../src/services/attendanceSync.ts';
import { addDays, eachDate, isWorkingDay, monthBounds, today } from '../src/utils/dates.ts';

const SEED = 0x5eed1e;
const STUDENT_COUNT = 25;

/** Small deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let state = seed;

  return function random(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

function pickName(): string {
  return pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function timeString(hour: number, minute: number): string {
  return pad(hour) + ':' + pad(minute);
}

function lastDayOfMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return monthBounds(year, month).end;
}

const FIRST_NAMES = [
  'Olivia',
  'Liam',
  'Amelia',
  'Noah',
  'Isla',
  'Ethan',
  'Ava',
  'Mason',
  'Sophie',
  'Lucas',
  'Grace',
  'Oliver',
  'Freya',
  'Harry',
  'Chloe',
  'Jack',
  'Ella',
  'Leo',
  'Mia',
  'Oscar',
  'Ruby',
  'Archie',
  'Evie',
  'Henry',
  'Lily',
  'Theo',
  'Ivy',
  'Arthur',
  'Sienna',
  'James',
] as const;

const LAST_NAMES = [
  'Bennett',
  'Carter',
  'Dawson',
  'Ellis',
  'Foster',
  'Graham',
  'Hughes',
  'Irwin',
  'Jackson',
  'Knight',
  'Lawson',
  'Morgan',
  'Nelson',
  'Owen',
  'Palmer',
  'Quinn',
  'Reed',
  'Shaw',
  'Turner',
  'Underwood',
  'Walker',
  'Young',
  'Barker',
  'Cooper',
  'Dixon',
] as const;

const DEPARTMENTS = [
  {
    name: 'Engineering',
    location: 'London',
    positions: ['Software Engineer', 'Senior Engineer', 'QA Analyst'],
  },
  {
    name: 'Finance',
    location: 'London',
    positions: ['Accountant', 'Payroll Specialist', 'Financial Analyst'],
  },
  {
    name: 'Human Resources',
    location: 'Manchester',
    positions: ['HR Coordinator', 'Recruiter', 'HR Manager'],
  },
  {
    name: 'Marketing',
    location: 'London',
    positions: ['Content Strategist', 'Marketing Manager', 'Designer'],
  },
  {
    name: 'Operations',
    location: 'Bristol',
    positions: ['Operations Assistant', 'Office Manager', 'Logistics Coordinator'],
  },
] as const;

const NOTES = ['', '', '', 'On site', 'Remote', 'Client visit', ''] as const;

function makeUniqueNames(): Array<{ first: string; last: string; name: string }> {
  const used = new Set<string>();
  const names: Array<{ first: string; last: string; name: string }> = [];

  while (names.length < STUDENT_COUNT) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const name = first + ' ' + last;

    if (used.has(name)) continue;
    used.add(name);
    names.push({ first, last, name });
  }

  return names;
}

async function main(): Promise<void> {
  if (env.isProduction) {
    console.error('[seed:demo] refused: NODE_ENV=production. Demo data is for local/demo only.');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    const existingStudents = await StudentModel.countDocuments();

    if (existingStudents > 0) {
      console.error(
        `[seed:demo] refused: the database already contains ${existingStudents} student(s). ` +
          'Use an empty database (for example MONGODB_URI=mongodb://127.0.0.1:27017/lean-hrm-demo).',
      );
      process.exitCode = 1;
      return;
    }

    const todayDate = today();
    const yesterday = addDays(todayDate, -1);
    const rangeStart = addDays(todayDate, -90);
    const rangeEnd = yesterday;

    // ---- departments -----------------------------------------------------
    const departments: Array<{
      id: string;
      name: string;
      positions: readonly string[];
    }> = [];

    for (const definition of DEPARTMENTS) {
      let department = await DepartmentModel.findOne({ name: definition.name });
      if (!department) {
        department = await DepartmentModel.create({
          name: definition.name,
          location: definition.location,
          description: 'Demo department',
        });
      }

      departments.push({
        id: String(department._id),
        name: definition.name,
        positions: definition.positions,
      });
    }

    // ---- students -------------------------------------------------------
    const names = makeUniqueNames();
    const students = await StudentModel.insertMany(
      names.map((entry, index) => {
        const department = departments[index % departments.length] as (typeof departments)[number];
        return {
          name: entry.name,
          email: `${entry.first}.${entry.last}@example.com`.toLowerCase(),
          phone: '+44 7700 9' + String(100000 + index).slice(-5),
          departmentId: department.id,
          position: pick(department.positions),
          hireDate: addDays(todayDate, -randomInt(120, 1500)),
          status: 'active' as const,
        };
      }),
    );

    // ---- holiday allowances ---------------------------------------------
    const allowanceYear = Number(todayDate.slice(0, 4));
    await LeaveAllowanceModel.insertMany(
      students.map((student) => ({
        studentId: student._id,
        year: allowanceYear,
        allowance: 28,
        note: '',
      })),
    );

    // ---- calendar events -------------------------------------------------
    // The holiday event is inserted before the leaves: the leave sync counts
    // working days from the holiday calendar.
    const monthEnd = lastDayOfMonth(todayDate);
    const eventRows: Array<{
      title: string;
      description: string;
      type: EventType;
      startDate: string;
      endDate: string;
    }> = [
      {
        title: 'Company holiday',
        description: 'Bank / company holiday. The office is closed and leave does not count this day.',
        type: 'holiday',
        startDate: todayDate.slice(0, 8) + '01',
        endDate: todayDate.slice(0, 8) + '01',
      },
      {
        title: 'Payroll cut-off',
        description: 'Submit all payroll changes before the end of the day.',
        type: 'deadline',
        startDate: monthEnd,
        endDate: monthEnd,
      },
      {
        title: 'All-hands meeting',
        description: 'Monthly company update.',
        type: 'meeting',
        startDate: addDays(todayDate, 7),
        endDate: addDays(todayDate, 7),
      },
      {
        title: 'Office maintenance',
        description: 'The meeting rooms are unavailable for two days.',
        type: 'event',
        startDate: addDays(todayDate, 14),
        endDate: addDays(todayDate, 15),
      },
    ];
    await EventModel.insertMany(eventRows);

    // ---- approved leaves (through the real reconcile) --------------------
    const leaveTypes: LeaveType[] = ['leave', 'vacation', 'time_off'];
    const APPROVED_LEAVE_COUNT = 14;
    let leaveRows = 0;

    for (let index = 0; index < APPROVED_LEAVE_COUNT; index += 1) {
      // A different student for every leave. The three age buckets place the
      // starts across the oldest, middle and newest month of the demo window.
      const student = students[index];
      if (!student) continue;

      const bucket = index % 3;
      let start = addDays(todayDate, -randomInt(8 + bucket * 30, 37 + bucket * 30));
      while (!isWorkingDay(start)) {
        start = addDays(start, 1);
      }

      // Keep the leave inside one working week and safely in the past.
      const workingDayOffset = randomInt(1, 4);
      let end = start;
      let workingDays = 1;
      while (workingDays < workingDayOffset) {
        end = addDays(end, 1);
        if (isWorkingDay(end)) workingDays += 1;
      }

      const type = pick(leaveTypes);
      const leave = await LeaveModel.create({
        studentId: student._id,
        type,
        category: type === 'vacation' ? 'annual' : 'casual',
        startDate: start,
        endDate: end,
        days: leaveWorkingDays(start, end),
        reason: 'Demo leave',
        status: 'approved',
        decidedAt: new Date(),
      });

      await reconcileLeave(String(leave._id));
    }

    leaveRows = await AttendanceModel.countDocuments({
      date: { $gte: rangeStart, $lte: rangeEnd },
      source: 'leave_sync',
    });

    // ---- attendance ------------------------------------------------------
    const leaveAttendance = await AttendanceModel.find({
      date: { $gte: rangeStart, $lte: rangeEnd },
      source: 'leave_sync',
    })
      .select('studentId date')
      .lean();
    const leaveKeys = new Set(
      leaveAttendance.map((row) => String(row.studentId) + '|' + row.date),
    );

    const attendanceRows: Array<Record<string, unknown>> = [];
    const dates = eachDate(rangeStart, rangeEnd).filter((date) => isWorkingDay(date));

    for (const student of students) {
      for (const date of dates) {
        if (leaveKeys.has(String(student._id) + '|' + date)) continue;

        const roll = random();
        if (roll >= 0.91) continue; // Some days stay unmarked on purpose.

        let status: 'present' | 'late' | 'absent' = 'present';
        if (roll >= 0.78 && roll < 0.86) status = 'late';
        if (roll >= 0.86 && roll < 0.91) status = 'absent';

        const late = status === 'late';
        const checkIn = late ? timeString(randomInt(9, 10), randomInt(16, 45)) : timeString(8, randomInt(45, 59));
        const checkOut = timeString(randomInt(17, 18), randomInt(0, 30));

        attendanceRows.push({
          studentId: student._id,
          date,
          status,
          checkIn: status === 'absent' ? null : checkIn,
          checkOut: status === 'absent' ? null : checkOut,
          note: status === 'absent' ? 'Demo absence' : pick(NOTES),
          source: 'manual',
        });
      }
    }

    for (let offset = 0; offset < attendanceRows.length; offset += 500) {
      await AttendanceModel.insertMany(attendanceRows.slice(offset, offset + 500));
    }

    // ---- today's sheet ---------------------------------------------------
    // Exactly half of the team is marked, so the dashboard "Not marked yet"
    // card and the sheet's mark-all flow have something to show immediately.
    const todayRows: Array<Record<string, unknown>> = students.slice(0, 13).map((student, index) => {
      let status: 'present' | 'late' | 'absent' = 'present';
      if (index >= 9 && index < 11) status = 'late';
      if (index >= 11) status = 'absent';

      const late = status === 'late';
      return {
        studentId: student._id,
        date: todayDate,
        status,
        checkIn:
          status === 'absent'
            ? null
            : late
              ? timeString(randomInt(9, 10), randomInt(16, 45))
              : timeString(8, randomInt(45, 59)),
        checkOut: status === 'absent' ? null : timeString(randomInt(17, 18), randomInt(0, 30)),
        note: status === 'absent' ? 'Demo absence' : pick(NOTES),
        source: 'manual',
      };
    });
    await AttendanceModel.insertMany(todayRows);

    // ---- overtime --------------------------------------------------------
    // Two entries for eight different students in each of the current and
    // previous two calendar months. The current month stops at today.
    const overtimeRows: Array<Record<string, unknown>> = [];
    const currentYear = Number(todayDate.slice(0, 4));
    const currentMonth = Number(todayDate.slice(5, 7));

    for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
      let year = currentYear;
      let month = currentMonth - monthOffset;
      while (month < 1) {
        month += 12;
        year -= 1;
      }

      const bounds = monthBounds(year, month);
      const lastDate = monthOffset === 0 ? todayDate : bounds.end;
      const dates = eachDate(bounds.start, lastDate);
      if (dates.length === 0) continue;

      const studentsThisMonth: typeof students = [];
      for (let index = 0; index < 8; index += 1) {
        const student = students[(monthOffset * 7 + index) % students.length];
        if (student) studentsThisMonth.push(student);
      }

      for (const student of studentsThisMonth) {
        for (let entry = 0; entry < 2; entry += 1) {
          overtimeRows.push({
            studentId: student._id,
            date: pick(dates),
            hours: pick([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4] as const),
            note: pick([
              'Month-end close',
              'Release evening',
              'Client deadline',
              'Stock take',
              '',
            ] as const),
          });
        }
      }
    }
    await OvertimeModel.insertMany(overtimeRows);

    console.log('[seed:demo] done — demo data is for local/demo use only.');
    console.log(`  departments: ${departments.length}`);
    console.log(`  students:   ${students.length}`);
    console.log(
      `  attendance:  ${attendanceRows.length} historical + ${todayRows.length} today (${rangeStart} … ${todayDate})`,
    );
    console.log(`  leaves:      ${APPROVED_LEAVE_COUNT} approved (${leaveRows} attendance rows synced)`);
    console.log(`  overtime:    ${overtimeRows.length} entries across 3 months`);
    console.log(`  events:      ${eventRows.length}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[seed:demo] failed:', error);
  process.exit(1);
});
