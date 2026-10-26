/**
 * Reports: the per-student attendance summary, rates that exclude leave,
 * totals, pagination, filters and CSV formula escaping.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdmin,
  signIn,
  startTestApp,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  type TestContext,
} from './helpers.ts';

let context: TestContext;
let departmentOneId = '';
let departmentTwoId = '';
let aliceId = '';
let bobId = '';
let daveId = '';

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

async function createStudent(input: {
  name: string;
  departmentId: string;
  position: string;
}) {
  const { StudentModel } = await import('../src/models/Student.ts');
  return StudentModel.create({
    name: input.name,
    departmentId: input.departmentId,
    position: input.position,
    status: 'active',
  });
}

async function createAttendance(
  studentId: string,
  entries: Array<{ date: string; status: string }>,
) {
  const { AttendanceModel } = await import('../src/models/Attendance.ts');
  return AttendanceModel.insertMany(
    entries.map((entry) => ({ studentId, date: entry.date, status: entry.status })),
  );
}

describe('reports', () => {
  it('needs a session', async () => {
    const response = await (await import('supertest')).default(context.app).get(
      '/api/reports/attendance-summary',
    );

    assert.equal(response.status, 401);
  });

  it('summarises each student and computes the rate without leave days', async () => {
    const { agent } = await signIn(context.app);
    const departmentOne = await createDepartment('Report Department One');
    const departmentTwo = await createDepartment('Report Department Two');
    departmentOneId = String(departmentOne._id);
    departmentTwoId = String(departmentTwo._id);

    const alice = await createStudent({
      name: 'Report Alice',
      departmentId: departmentOneId,
      position: 'Analyst',
    });
    const bob = await createStudent({
      name: 'Report Bob',
      departmentId: departmentOneId,
      position: 'Assistant',
    });
    const carol = await createStudent({
      name: '=Formula Person',
      departmentId: departmentTwoId,
      position: 'Coordinator',
    });
    const dave = await createStudent({
      name: 'Report Dave',
      departmentId: departmentTwoId,
      position: 'Engineer',
    });
    aliceId = String(alice._id);
    bobId = String(bob._id);
    daveId = String(dave._id);

    // Alice: 3 present, 1 late, 1 absent, 2 on leave, 1 vacation.
    // Rate = (3 + 1) / (3 + 1 + 1) = 80% — leave days are excluded.
    await createAttendance(aliceId, [
      { date: '2026-02-02', status: 'present' },
      { date: '2026-02-03', status: 'present' },
      { date: '2026-02-04', status: 'present' },
      { date: '2026-02-05', status: 'late' },
      { date: '2026-02-06', status: 'absent' },
      { date: '2026-02-09', status: 'on_leave' },
      { date: '2026-02-10', status: 'on_leave' },
      { date: '2026-02-11', status: 'vacation' },
    ]);

    // Bob: 1 present, 1 absent, 1 on leave → 50%.
    await createAttendance(bobId, [
      { date: '2026-02-02', status: 'present' },
      { date: '2026-02-03', status: 'absent' },
      { date: '2026-02-04', status: 'on_leave' },
    ]);

    // Carol has only vacation days → no counted days, rate is null.
    await createAttendance(String(carol._id), [
      { date: '2026-02-02', status: 'vacation' },
      { date: '2026-02-03', status: 'vacation' },
    ]);

    // Dave: 2 present → 100%.
    await createAttendance(daveId, [
      { date: '2026-02-02', status: 'present' },
      { date: '2026-02-03', status: 'present' },
    ]);

    const response = await agent.get(
      '/api/reports/attendance-summary?from=2026-02-01&to=2026-02-28&perPage=100',
    );

    assert.equal(response.status, 200);
    const rows = response.body.data.rows as Array<Record<string, unknown>>;
    assert.equal(rows.length, 4);
    assert.equal(response.body.meta.total, 4);

    const byName = new Map(rows.map((row) => [row.name, row]));

    assert.deepEqual(
      ['present', 'late', 'absent', 'onLeave', 'vacation', 'rate'].map(
        (key) => byName.get('Report Alice')?.[key],
      ),
      [3, 1, 1, 2, 1, 80],
    );
    assert.equal(byName.get('Report Alice')?.department, 'Report Department One');
    assert.equal(byName.get('Report Alice')?.position, 'Analyst');

    assert.equal(byName.get('Report Bob')?.rate, 50);
    assert.equal(byName.get('=Formula Person')?.rate, null);
    assert.equal(byName.get('=Formula Person')?.present, 0);
    assert.equal(byName.get('Report Dave')?.rate, 100);

    const totals = response.body.data.totals;
    assert.equal(totals.present, 6);
    assert.equal(totals.late, 1);
    assert.equal(totals.absent, 2);
    assert.equal(totals.onLeave, 3);
    assert.equal(totals.vacation, 3);
    // (6 + 1) / (6 + 1 + 2) = 77.777… → 77.8
    assert.equal(totals.rate, 77.8);
  });

  it('paginates without changing the totals row', async () => {
    const { agent } = await signIn(context.app);

    const first = await agent.get(
      '/api/reports/attendance-summary?from=2026-02-01&to=2026-02-28&page=1&perPage=2',
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.data.rows.length, 2);
    assert.equal(first.body.meta.total, 4);
    assert.equal(first.body.meta.page, 1);
    assert.equal(first.body.meta.pages, 2);
    assert.equal(first.body.data.totals.present, 6);
    assert.equal(first.body.data.totals.rate, 77.8);

    const second = await agent.get(
      '/api/reports/attendance-summary?from=2026-02-01&to=2026-02-28&page=2&perPage=2',
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.data.rows.length, 2);
    assert.equal(second.body.meta.page, 2);
    assert.equal(second.body.data.totals.present, 6);
  });

  it('filters by department and by student', async () => {
    const { agent } = await signIn(context.app);

    const department = await agent.get(
      `/api/reports/attendance-summary?from=2026-02-01&to=2026-02-28&departmentId=${departmentOneId}&perPage=100`,
    );
    assert.equal(department.status, 200);
    assert.equal(department.body.data.rows.length, 2);
    assert.equal(department.body.data.totals.present, 4);
    assert.equal(department.body.data.totals.late, 1);
    assert.equal(department.body.data.totals.absent, 2);
    assert.equal(department.body.data.totals.onLeave, 3);
    assert.equal(department.body.data.totals.vacation, 1);
    assert.equal(department.body.data.totals.rate, 71.4);

    const student = await agent.get(
      `/api/reports/attendance-summary?from=2026-02-01&to=2026-02-28&studentId=${aliceId}`,
    );
    assert.equal(student.status, 200);
    assert.equal(student.body.data.rows.length, 1);
    assert.equal(student.body.data.rows[0].name, 'Report Alice');
    assert.equal(student.body.data.rows[0].rate, 80);
    assert.equal(student.body.data.totals.present, 3);
  });

  it('exports every filtered row as CSV and neutralises formulas', async () => {
    const { agent } = await signIn(context.app);

    const response = await agent.get(
      '/api/reports/attendance-summary.csv?from=2026-02-01&to=2026-02-28&perPage=1',
    );

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(response.headers['content-disposition'], /attachment; filename="attendance-summary-/);

    const csv = response.text;
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /Student,Department,Position,Present,Late,Absent,On leave,Vacation,Attendance rate \(%\)/);

    // The export ignores pagination.
    assert.match(csv, /Report Alice/);
    assert.match(csv, /Report Bob/);
    assert.match(csv, /Report Dave/);
    // A cell starting with `=` is prefixed with an apostrophe.
    assert.match(csv, /'=Formula Person/);
    assert.doesNotMatch(csv, /^=Formula Person/m);
  });

  it('rejects a reversed range and invalid filters', async () => {
    const { agent } = await signIn(context.app);

    const reversed = await agent.get(
      '/api/reports/attendance-summary?from=2026-02-28&to=2026-02-01',
    );
    assert.equal(reversed.status, 422);
    assert.equal(reversed.body.error.code, 'report_range_invalid');

    const invalidDate = await agent.get('/api/reports/attendance-summary?from=2026-02-30');
    assert.equal(invalidDate.status, 422);
    assert.equal(invalidDate.body.error.code, 'validation_error');

    const invalidId = await agent.get('/api/reports/attendance-summary?departmentId=nope');
    assert.equal(invalidId.status, 422);
    assert.equal(invalidId.body.error.code, 'validation_error');

    const empty = await agent.get(
      '/api/reports/attendance-summary?from=2024-01-01&to=2024-01-31',
    );
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.data.rows, []);
    assert.equal(empty.body.data.totals.present, 0);
    assert.equal(empty.body.data.totals.rate, null);
  });

});
