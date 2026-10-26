/**
 * Overtime: quarter-hour entries, the 24 hour daily limit, filters, the
 * monthly summary, the CSV export and the student delete guard.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

describe('overtime', () => {
  it('needs a session', async () => {
    const response = await (await import('supertest')).default(context.app).get('/api/overtime');

    assert.equal(response.status, 401);
  });

  it('refuses a state changing request without a CSRF token', async () => {
    const { agent } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime CSRF Person' });

    const response = await agent.post('/api/overtime').send({
      studentId: String(student._id),
      date: '2026-06-01',
      hours: 2,
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('creates entries and lists them with their student', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime List Person' });

    const response = await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      date: '2026-06-02',
      hours: 2.25,
      note: 'Month end',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.record.hours, 2.25);

    const list = await agent.get('/api/overtime?from=2026-06-01&to=2026-06-30');
    assert.equal(list.status, 200);

    const record = list.body.data.records.find(
      (item: { studentId: { name?: string } }) => item.studentId?.name === 'Overtime List Person',
    );

    assert.ok(record);
    assert.equal(record.hours, 2.25);
    assert.equal(list.body.data.totalHours, 2.25);
  });

  it('allows several entries per day but keeps the day total at or below 24', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime Limit Person' });
    const payload = { studentId: String(student._id), date: '2026-06-03' };

    const first = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 20 });
    assert.equal(first.status, 200);

    // 20 + 5 would be 25 — refused.
    const tooMuch = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 5 });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.error.code, 'overtime_day_limit');

    // 20 + 4 is exactly 24 — allowed.
    const exact = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 4 });
    assert.equal(exact.status, 200);

    const { OvertimeModel } = await import('../src/models/Overtime.ts');
    const entries = await OvertimeModel.find({ studentId: student._id, date: '2026-06-03' });

    assert.equal(entries.length, 2);
    assert.equal(entries.reduce((sum, entry) => sum + entry.hours, 0), 24);
  });

  it('rejects a day total above 24 when an entry is edited', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime Edit Limit' });
    const payload = { studentId: String(student._id), date: '2026-06-04' };

    const first = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 20 });
    await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({ ...payload, hours: 4 });

    const tooMuch = await agent
      .patch(`/api/overtime/${first.body.data.record.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ hours: 21 });

    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.error.code, 'overtime_day_limit');

    // Saving the same 20 hours is fine — the record does not count itself.
    const unchanged = await agent
      .patch(`/api/overtime/${first.body.data.record.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ hours: 20, note: 'Still 20' });

    assert.equal(unchanged.status, 200);
    assert.equal(unchanged.body.data.record.note, 'Still 20');
  });

  it('accepts only quarter-hour steps within 0.25 and 24', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime Steps' });
    const payload = { studentId: String(student._id), date: '2026-06-05' };

    const odd = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 1.1 });
    assert.equal(odd.status, 422);
    assert.equal(odd.body.error.code, 'validation_error');

    const zero = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 0 });
    assert.equal(zero.status, 422);

    const quarter = await agent
      .post('/api/overtime')
      .set('X-CSRF-Token', csrf)
      .send({ ...payload, hours: 0.25 });
    assert.equal(quarter.status, 200);
  });

  it('summarises one month per student', async () => {
    const { agent, csrf } = await signIn(context.app);
    const first = await createStudent({ name: 'Summary Alpha' });
    const second = await createStudent({ name: 'Summary Beta' });

    await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(first._id),
      date: '2026-07-01',
      hours: 2,
    });
    await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(first._id),
      date: '2026-07-02',
      hours: 3.5,
    });
    await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(second._id),
      date: '2026-07-03',
      hours: 1,
    });

    const response = await agent.get('/api/overtime/summary?month=2026-07');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.month, '2026-07');
    assert.equal(response.body.data.totals.hours, 6.5);
    assert.equal(response.body.data.totals.entries, 3);

    const alpha = response.body.data.rows.find(
      (row: { name: string }) => row.name === 'Summary Alpha',
    );
    assert.equal(alpha.totalHours, 5.5);
    assert.equal(alpha.entries, 2);

    const badMonth = await agent.get('/api/overtime/summary?month=2026-13');
    assert.equal(badMonth.status, 422);
  });

  it('deletes an entry', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime Deletable' });

    const created = await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      date: '2026-06-08',
      hours: 2,
    });

    const response = await agent
      .delete(`/api/overtime/${created.body.data.record.id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.deleted, true);
  });

  it('exports a CSV that neutralises formulas', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime Csv Person' });

    await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      date: '2026-08-01',
      hours: 2,
      note: '=cmd|calc',
    });

    const response = await agent.get('/api/overtime/export.csv?from=2026-08-01&to=2026-08-31');

    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/csv/);
    assert.match(response.text, /Student,Department,Date,Hours,Note/);
    assert.match(response.text, /'=cmd\|calc/);

    const summary = await agent.get('/api/overtime/summary.csv?month=2026-08');
    assert.equal(summary.status, 200);
    assert.match(summary.text, /Student,Department,Entries,Total hours/);
  });

  it('blocks deleting a student that has overtime', async () => {
    const { agent, csrf } = await signIn(context.app);
    const student = await createStudent({ name: 'Overtime Guard Person' });

    await agent.post('/api/overtime').set('X-CSRF-Token', csrf).send({
      studentId: String(student._id),
      date: '2026-09-01',
      hours: 1,
    });

    const response = await agent
      .delete(`/api/students/${student._id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'student_has_records');
  });
});
