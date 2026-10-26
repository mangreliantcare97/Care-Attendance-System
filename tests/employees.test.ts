/**
 * Employees: the list, the photo limits and the delete guard.
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

/** A 1×1 PNG — the smallest possible valid image. */
const PNG_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

before(async () => {
  context = await startTestApp();
  await createAdmin({ name: 'Owner', email: OWNER_EMAIL, password: OWNER_PASSWORD });
});

after(async () => {
  await context?.stop();
});

describe('employees', () => {
  it('needs a session', async () => {
    const { app } = context;
    const response = await (await import('supertest')).default(app).get('/api/employees');

    assert.equal(response.status, 401);
  });

  it('refuses a state changing request without a CSRF token', async () => {
    const { agent } = await signIn(context.app);
    const response = await agent.post('/api/employees').send({ name: 'Ada Lovelace' });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('creates an employee and defaults to inactive', async () => {
    const { agent, csrf } = await signIn(context.app);
    const response = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', position: 'Analyst' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.employee.name, 'Ada Lovelace');
    assert.equal(response.body.data.employee.status, 'inactive');
    assert.equal(response.body.data.employee.position, 'Analyst');
    assert.equal(response.body.data.employee.hasPhoto, false);
  });

  it('stores an empty email as null and allows several employees without one', async () => {
    const { agent, csrf } = await signIn(context.app);

    const first = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'No Email One', email: '' });
    const second = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'No Email Two' });

    assert.equal(first.status, 200);
    assert.equal(first.body.data.employee.email, null);
    assert.equal(second.status, 200);
    assert.equal(second.body.data.employee.email, null);
  });

  it('refuses a duplicate email', async () => {
    const { agent, csrf } = await signIn(context.app);
    const response = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Copy Cat', email: 'ada@example.com' });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'email_taken');
  });

  it('never includes the photo in a list', async () => {
    const { agent, csrf } = await signIn(context.app);
    const created = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'With Photo', photo: { data: PNG_PIXEL, mime: 'image/png', size: 68 } });

    assert.equal(created.status, 200);

    const list = await agent.get('/api/employees?perPage=50');
    const employee = list.body.data.employees.filter(
      (item: { name: string }) => item.name === 'With Photo',
    )[0];

    assert.ok(employee, 'the employee should be in the list');
    assert.equal('photo' in employee, false);
    assert.equal(employee.hasPhoto, true);
    assert.equal(JSON.stringify(list.body).includes('iVBORw0KGgo'), false);
  });

  it('serves the photo on its own with cache headers', async () => {
    const { agent, csrf } = await signIn(context.app);
    const created = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Photo Person', photo: { data: PNG_PIXEL, mime: 'image/png', size: 68 } });

    const id = created.body.data.employee.id;
    assert.equal(created.body.data.employee.hasPhoto, true);
    const photo = await agent.get(`/api/employees/${id}/photo`);

    assert.equal(photo.status, 200);
    assert.match(photo.headers['content-type'], /image\/png/);
    assert.match(photo.headers['cache-control'], /private/);
    assert.ok(photo.headers['etag']);
  });

  it('answers with 404 when an employee has no photo', async () => {
    const { agent, csrf } = await signIn(context.app);
    const created = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'No Photo Person' });

    const photo = await agent.get(`/api/employees/${created.body.data.employee.id}/photo`);

    assert.equal(created.body.data.employee.hasPhoto, false);
    assert.equal(photo.status, 404);
    assert.equal(photo.body.error.code, 'photo_not_found');
  });

  it('refuses a photo that is too large', async () => {
    const { agent, csrf } = await signIn(context.app);
    const big = 'A'.repeat(300 * 1024);

    const response = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Big Photo', photo: { data: big, mime: 'image/png', size: 300 * 1024 } });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'photo_too_large');
  });

  it('refuses a photo with the wrong type', async () => {
    const { agent, csrf } = await signIn(context.app);

    const response = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Wrong Type', photo: { data: PNG_PIXEL, mime: 'image/gif', size: 68 } });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'photo_type_mismatch');
  });

  it('refuses data that is not an image at all', async () => {
    const { agent, csrf } = await signIn(context.app);

    const response = await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Not An Image',
        photo: { data: Buffer.from('this is a text file, not a picture').toString('base64'), mime: 'image/png' },
      });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'photo_type_not_allowed');
  });

  it('paginates and searches', async () => {
    const { agent, csrf } = await signIn(context.app);

    for (let index = 0; index < 5; index += 1) {
      await agent
        .post('/api/employees')
        .set('X-CSRF-Token', csrf)
        .send({ name: `Paged ${index}`, status: 'active' });
    }

    const page = await agent.get('/api/employees?page=1&perPage=2');
    assert.equal(page.body.data.employees.length, 2);
    assert.equal(page.body.meta.perPage, 2);
    assert.ok(page.body.meta.total >= 5);

    const search = await agent.get('/api/employees?search=Paged 3');
    assert.equal(search.body.data.employees.length, 1);
    assert.equal(search.body.data.employees[0].name, 'Paged 3');
  });

  it('filters by status', async () => {
    const { agent, csrf } = await signIn(context.app);
    await agent
      .post('/api/employees')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Terminated Person', status: 'terminated' });

    const response = await agent.get('/api/employees?status=terminated');
    const names = response.body.data.employees.map((item: { name: string }) => item.name);

    assert.equal(names.includes('Terminated Person'), true);
  });

  it('does not delete an employee that has attendance records', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Busy Person' });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    await AttendanceModel.create({
      employeeId: employee._id,
      date: '2026-01-05',
      status: 'present',
    });

    const response = await agent
      .delete(`/api/employees/${employee._id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'employee_has_records');
  });

  it('does not delete an employee that has leave records', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'On Leave Person' });

    const { LeaveModel } = await import('../src/models/Leave.ts');
    await LeaveModel.create({
      employeeId: employee._id,
      type: 'leave',
      startDate: '2026-02-01',
      endDate: '2026-02-03',
      days: 3,
      status: 'approved',
    });

    const response = await agent
      .delete(`/api/employees/${employee._id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'employee_has_records');
  });

  it('deletes an employee without any records', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Nobody Knows' });

    const response = await agent
      .delete(`/api/employees/${employee._id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.deleted, true);
  });

  it('answers with the attendance of one employee', async () => {
    const { agent, csrf } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Timekeeper' });

    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-03-02', status: 'present' });
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-03-03', status: 'late' });
    await AttendanceModel.create({ employeeId: employee._id, date: '2026-04-01', status: 'absent' });

    const response = await agent.get(`/api/employees/${employee._id}/attendance?month=2026-03`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.records.length, 2);
    assert.equal(response.body.data.counts.present, 1);
    assert.equal(response.body.data.counts.late, 1);
    assert.equal(response.body.data.counts.absent, 0);
  });

  it('answers with the leave history of one employee', async () => {
    const { agent } = await signIn(context.app);
    const employee = await createEmployee({ name: 'Leave Taker' });

    const { LeaveModel } = await import('../src/models/Leave.ts');
    await LeaveModel.create({
      employeeId: employee._id,
      type: 'vacation',
      startDate: '2026-05-01',
      endDate: '2026-05-05',
      days: 5,
      status: 'approved',
    });

    const response = await agent.get(`/api/employees/${employee._id}/leaves`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.leaves.length, 1);
    assert.equal(response.body.data.leaves[0].type, 'vacation');
  });
});
