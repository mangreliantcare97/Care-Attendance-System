/**
 * Departments: CRUD, the unique name, the student count and the delete guard.
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

describe('departments', () => {
  it('needs a session', async () => {
    const { app } = context;
    const response = await (await import('supertest')).default(app).get('/api/departments');

    assert.equal(response.status, 401);
  });

  it('refuses a state changing request without a CSRF token', async () => {
    const { agent } = await signIn(context.app);
    const response = await agent.post('/api/departments').send({ name: 'Sales' });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'csrf_token_mismatch');
  });

  it('creates a department', async () => {
    const { agent, csrf } = await signIn(context.app);
    const response = await agent
      .post('/api/departments')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Sales', location: 'London', description: 'Sells things' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.department.name, 'Sales');
    assert.equal(response.body.data.department.studentCount, 0);
  });

  it('refuses a duplicate name', async () => {
    const { agent, csrf } = await signIn(context.app);
    const response = await agent
      .post('/api/departments')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Sales' });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'department_name_taken');
  });

  it('counts the students of a department', async () => {
    const { agent, csrf } = await signIn(context.app);
    const created = await agent
      .post('/api/departments')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Support' });

    const departmentId = created.body.data.department.id;

    await createStudent({ name: 'Ada', departmentId });
    await createStudent({ name: 'Grace', departmentId });

    const list = await agent.get('/api/departments');
    const support = list.body.data.departments.filter((item: { id: string }) => item.id === departmentId)[0];

    assert.equal(support.studentCount, 2);
  });

  it('updates a department', async () => {
    const { agent, csrf } = await signIn(context.app);
    const list = await agent.get('/api/departments');
    const department = list.body.data.departments[0];

    const response = await agent
      .patch(`/api/departments/${department.id}`)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Renamed' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.department.name, 'Renamed');
  });

  it('does not delete a department that still has students', async () => {
    const { agent, csrf } = await signIn(context.app);
    const list = await agent.get('/api/departments');
    const support = list.body.data.departments.filter((item: { name: string }) => item.name === 'Support')[0];

    const response = await agent.delete(`/api/departments/${support.id}`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'department_has_students');
  });

  it('deletes an empty department', async () => {
    const { agent, csrf } = await signIn(context.app);
    const created = await agent
      .post('/api/departments')
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Temporary' });

    const response = await agent
      .delete(`/api/departments/${created.body.data.department.id}`)
      .set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.deleted, true);
  });

  it('validates the payload', async () => {
    const { agent, csrf } = await signIn(context.app);
    const response = await agent
      .post('/api/departments')
      .set('X-CSRF-Token', csrf)
      .send({ name: '' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'validation_error');
  });
});
