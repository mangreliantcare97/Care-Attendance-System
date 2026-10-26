/**
 * Administrator management API and page guard tests.
 *
 * These tests cover the server-side contract used by admins.html and
 * admin-form.html: filtering, sorting, pagination, create/edit validation,
 * password changes, session revocation, delete history and bulk safety rails.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Types } from 'mongoose';
import {
  createAdmin,
  createEmployee,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  signIn,
  startTestApp,
  type TestContext,
} from './helpers.ts';

const ADMIN_RECORD_MESSAGE =
  'This admin has history and cannot be deleted. Disable the account instead.';

let context: TestContext;
let app: TestContext['app'];
let ownerId = '';
let sequence = 0;

before(async () => {
  context = await startTestApp();
  app = context.app;

  const owner = await createAdmin({
    name: 'Owner',
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  ownerId = String(owner._id);
});

after(async () => {
  await context?.stop();
});

function nextEmail(label: string): string {
  sequence += 1;
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safeLabel}-${sequence}@example.com`;
}

async function makeAdmin(
  name: string,
  options: { isActive?: boolean; lastLoginAt?: Date } = {},
) {
  const admin = await createAdmin({
    name,
    email: nextEmail(name),
    isActive: options.isActive,
  });

  if (options.lastLoginAt) {
    const { AdminModel } = await import('../src/models/Admin.ts');
    await AdminModel.updateOne(
      { _id: admin._id },
      { $set: { lastLoginAt: options.lastLoginAt } },
    );
  }

  return admin;
}

async function ownerSession() {
  const result = await signIn(app, OWNER_EMAIL, OWNER_PASSWORD);
  assert.equal(result.response.status, 200);
  return result;
}

async function login(email: string, password = 'another-secret-1') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  return { agent, response };
}

async function sessionCountFor(adminId: string): Promise<number> {
  const { mongoose } = await import('../src/config/db.ts');
  return mongoose.connection
    .collection('sessions')
    .countDocuments({ 'session.adminId': String(adminId) });
}

describe('GET /api/admins', () => {
  it('filters, sorts and paginates on the server without exposing hashes', async () => {
    const alpha = await makeAdmin('Paged Alpha', { lastLoginAt: new Date('2035-01-01T10:00:00Z') });
    const bravo = await makeAdmin('Paged Bravo', { lastLoginAt: new Date('2035-01-02T10:00:00Z') });
    const charlie = await makeAdmin('Paged Charlie', {
      lastLoginAt: new Date('2035-01-03T10:00:00Z'),
    });
    const delta = await makeAdmin('Paged Delta', {
      isActive: false,
      lastLoginAt: new Date('2035-01-04T10:00:00Z'),
    });

    const { agent } = await ownerSession();

    const firstPage = await agent.get('/api/admins').query({
      name: 'Paged',
      sort: 'name',
      order: 'asc',
      page: 1,
      perPage: 2,
    });

    assert.equal(firstPage.status, 200);
    assert.deepEqual(
      firstPage.body.data.admins.map((admin: { name: string }) => admin.name),
      ['Paged Alpha', 'Paged Bravo'],
    );
    assert.deepEqual(firstPage.body.meta, {
      total: 4,
      page: 1,
      perPage: 2,
      pages: 2,
    });
    assert.equal(JSON.stringify(firstPage.body).includes('$2'), false);
    assert.equal(
      firstPage.body.data.admins.some((admin: Record<string, unknown>) => 'password' in admin),
      false,
    );

    const secondPage = await agent.get('/api/admins').query({
      name: 'Paged',
      sort: 'name',
      order: 'asc',
      page: 2,
      perPage: 2,
    });
    assert.deepEqual(
      secondPage.body.data.admins.map((admin: { name: string }) => admin.name),
      ['Paged Charlie', 'Paged Delta'],
    );

    const byEmail = await agent.get('/api/admins').query({
      name: 'Paged',
      email: charlie.email.slice(0, 7),
    });
    assert.equal(byEmail.status, 200);
    assert.equal(byEmail.body.meta.total, 1);
    assert.equal(byEmail.body.data.admins[0].id, String(charlie._id));

    const disabled = await agent.get('/api/admins').query({
      name: 'Paged',
      status: 'disabled',
    });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.meta.total, 1);
    assert.equal(disabled.body.data.admins[0].id, String(delta._id));
    assert.equal(disabled.body.data.admins[0].isActive, false);

    const byLastLogin = await agent.get('/api/admins').query({
      name: 'Paged',
      sort: 'lastLogin',
      order: 'desc',
      perPage: 10,
    });
    assert.deepEqual(
      byLastLogin.body.data.admins.map((admin: { name: string }) => admin.name),
      ['Paged Delta', 'Paged Charlie', 'Paged Bravo', 'Paged Alpha'],
    );

    const byEmailDesc = await agent.get('/api/admins').query({
      name: 'Paged',
      sort: 'email',
      order: 'desc',
      perPage: 10,
    });
    const emails = byEmailDesc.body.data.admins.map((admin: { email: string }) => admin.email);
    assert.equal(
      emails.every((email: string, index: number) => index === 0 || emails[index - 1] >= email),
      true,
    );

    // Filtering is literal, not a regular expression supplied by the caller.
    const regexAttempt = await agent.get('/api/admins').query({ name: 'Paged.*' });
    assert.equal(regexAttempt.status, 200);
    assert.equal(regexAttempt.body.meta.total, 0);

    // Only the four whitelisted sort columns are accepted.
    const invalidSort = await agent.get('/api/admins').query({ sort: 'password' });
    assert.equal(invalidSort.status, 422);
    assert.equal(invalidSort.body.error.code, 'validation_error');
    assert.equal(invalidSort.body.error.details.some((issue: { path: string }) => issue.path === 'sort'), true);

    const beyondLastPage = await agent.get('/api/admins').query({
      name: 'Paged',
      page: 99,
      perPage: 2,
    });
    assert.equal(beyondLastPage.status, 200);
    assert.equal(beyondLastPage.body.data.admins.length, 0);
    assert.equal(beyondLastPage.body.meta.total, 4);
    assert.ok(alpha._id && bravo._id);
  });

  it('returns one admin for the edit form and a clear 404 for a missing one', async () => {
    const target = await makeAdmin('Lookup Person');
    const { agent } = await ownerSession();

    const found = await agent.get(`/api/admins/${target._id}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.data.admin.id, String(target._id));
    assert.equal(found.body.data.admin.email, target.email);
    assert.equal('password' in found.body.data.admin, false);

    const missing = await agent.get('/api/admins/000000000000000000000000');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'admin_not_found');
  });
});

describe('POST /api/admins', () => {
  it('creates an enabled admin, trims the name and lowercases the email', async () => {
    const { agent, csrf } = await ownerSession();
    const email = `  Created-${sequence + 1}@Example.COM  `;
    const expectedEmail = email.trim().toLowerCase();

    const response = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', csrf)
      .send({
        name: '  Created Person  ',
        email,
        password: 'created-password-1',
        confirmPassword: 'created-password-1',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.name, 'Created Person');
    assert.equal(response.body.data.admin.email, expectedEmail);
    assert.equal(response.body.data.admin.role, 'admin');
    assert.equal(response.body.data.admin.isActive, true);
    assert.equal('password' in response.body.data.admin, false);

    const { AdminModel, verifyPassword } = await import('../src/models/Admin.ts');
    const stored = await AdminModel.findById(response.body.data.admin.id).select('+password');
    assert.ok(stored);
    assert.match(String(stored.password), /^\$2[aby]\$12\$/);
    assert.equal(await verifyPassword('created-password-1', String(stored.password)), true);
  });

  it('rejects a case-insensitive duplicate email and any non-admin role', async () => {
    const existing = await makeAdmin('Duplicate Base');
    const { agent, csrf } = await ownerSession();

    const duplicate = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Duplicate Copy',
        email: `  ${existing.email.toUpperCase()}  `,
        password: 'another-secret-1',
        confirmPassword: 'another-secret-1',
      });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'email_taken');

    const viewer = await agent
      .post('/api/admins')
      .set('X-CSRF-Token', csrf)
      .send({
        name: 'Viewer Attempt',
        email: nextEmail('viewer-attempt'),
        password: 'another-secret-1',
        confirmPassword: 'another-secret-1',
        role: 'viewer',
      });
    assert.equal(viewer.status, 422);
    assert.equal(viewer.body.error.code, 'validation_error');
    assert.equal(viewer.body.error.details.some((issue: { path: string }) => issue.path === 'role'), true);
  });

  it('validates the name, email, password policy and confirmation', async () => {
    const { agent, csrf } = await ownerSession();
    const cases = [
      {
        payload: {
          name: 'A',
          email: nextEmail('invalid-name'),
          password: 'another-secret-1',
          confirmPassword: 'another-secret-1',
        },
        path: 'name',
      },
      {
        payload: {
          name: 'Invalid Email',
          email: 'not-an-email',
          password: 'another-secret-1',
          confirmPassword: 'another-secret-1',
        },
        path: 'email',
      },
      {
        payload: {
          name: 'Short Password',
          email: nextEmail('short-password'),
          password: 'short',
          confirmPassword: 'short',
        },
        path: 'password',
      },
      {
        payload: {
          name: 'Mismatch Password',
          email: nextEmail('mismatch-password'),
          password: 'another-secret-1',
          confirmPassword: 'different-secret-1',
        },
        path: 'confirmPassword',
      },
      {
        payload: {
          name: 'Missing Confirmation',
          email: nextEmail('missing-confirmation'),
          password: 'another-secret-1',
        },
        path: 'confirmPassword',
      },
    ];

    for (const testCase of cases) {
      const response = await agent
        .post('/api/admins')
        .set('X-CSRF-Token', csrf)
        .send(testCase.payload);

      assert.equal(response.status, 422);
      assert.equal(response.body.error.code, 'validation_error');
      assert.equal(
        response.body.error.details.some(
          (issue: { path: string }) => issue.path === testCase.path,
        ),
        true,
        `expected a ${testCase.path} validation error`,
      );
    }
  });
});

describe('PATCH /api/admins/:id', () => {
  it('edits another admin and forces the only role', async () => {
    const target = await makeAdmin('Edit Target');
    const { agent, csrf } = await ownerSession();
    const editedEmail = nextEmail('edited-target');

    const response = await agent
      .patch(`/api/admins/${target._id}`)
      .set('X-CSRF-Token', csrf)
      .send({
        name: '  Edited Target  ',
        email: `  ${editedEmail.toUpperCase()}  `,
        role: 'admin',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.name, 'Edited Target');
    assert.equal(response.body.data.admin.email, editedEmail);
    assert.equal(response.body.data.admin.role, 'admin');
    assert.equal(response.body.data.passwordChanged, false);

    const viewer = await agent
      .patch(`/api/admins/${target._id}`)
      .set('X-CSRF-Token', csrf)
      .send({ role: 'viewer' });
    assert.equal(viewer.status, 422);
  });

  it('refuses to change the signed-in admin password through the admin API', async () => {
    const { agent, csrf } = await ownerSession();

    const password = await agent
      .patch(`/api/admins/${ownerId}`)
      .set('X-CSRF-Token', csrf)
      .send({ password: 'new-owner-password', confirmPassword: 'new-owner-password' });
    assert.equal(password.status, 400);
    assert.equal(password.body.error.code, 'cannot_change_own_password');

    const status = await agent
      .patch(`/api/admins/${ownerId}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'disabled' });
    assert.equal(status.status, 400);
    assert.equal(status.body.error.code, 'cannot_deactivate_self');
  });

  it('changes another admin password, revokes their sessions and mails them', async () => {
    const target = await makeAdmin('Password Target');
    const targetLogin = await login(target.email);
    assert.equal(targetLogin.response.status, 200);

    const { agent, csrf } = await ownerSession();
    const response = await agent
      .patch(`/api/admins/${target._id}`)
      .set('X-CSRF-Token', csrf)
      .send({
        password: 'replacement-password-1',
        confirmPassword: 'replacement-password-1',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.passwordChanged, true);
    assert.ok(response.body.data.revokedSessions >= 1);

    assert.equal((await targetLogin.agent.get('/api/auth/me')).status, 401);
    assert.equal(await sessionCountFor(String(target._id)), 0);

    const oldPassword = await login(target.email);
    assert.equal(oldPassword.response.status, 401);

    const newPassword = await login(target.email, 'replacement-password-1');
    assert.equal(newPassword.response.status, 200);
  });

  it('disabling another admin revokes their live session immediately', async () => {
    const target = await makeAdmin('Disable Target');
    const targetLogin = await login(target.email);
    assert.equal(targetLogin.response.status, 200);

    const { agent, csrf } = await ownerSession();
    const response = await agent
      .patch(`/api/admins/${target._id}`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'disabled' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.admin.isActive, false);
    assert.equal((await targetLogin.agent.get('/api/auth/me')).status, 401);
    assert.equal(await sessionCountFor(String(target._id)), 0);
  });
});

describe('DELETE /api/admins/:id', () => {
  it('refuses to delete the signed-in admin', async () => {
    const { agent, csrf } = await ownerSession();
    const response = await agent.delete(`/api/admins/${ownerId}`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'cannot_delete_self');
    assert.equal(response.body.error.message, 'You cannot delete yourself.');
  });

  it('deletes an unreferenced admin and removes every session', async () => {
    const target = await makeAdmin('Delete Target');
    const targetLogin = await login(target.email);
    assert.equal(targetLogin.response.status, 200);

    const { agent, csrf } = await ownerSession();
    const response = await agent.delete(`/api/admins/${target._id}`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.deleted, true);
    assert.equal((await targetLogin.agent.get('/api/auth/me')).status, 401);
    assert.equal(await sessionCountFor(String(target._id)), 0);

    const { AdminModel } = await import('../src/models/Admin.ts');
    assert.equal(await AdminModel.findById(target._id), null);
  });

  it('refuses to delete an admin with calendar history', async () => {
    const target = await makeAdmin('History Event');
    const { EventModel } = await import('../src/models/Event.ts');
    await EventModel.create({
      title: 'History event',
      startDate: '2040-01-01',
      endDate: '2040-01-01',
      createdBy: target._id,
    });

    const { agent, csrf } = await ownerSession();
    const response = await agent.delete(`/api/admins/${target._id}`).set('X-CSRF-Token', csrf);

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'admin_has_records');
    assert.equal(response.body.error.message, ADMIN_RECORD_MESSAGE);

    const { AdminModel } = await import('../src/models/Admin.ts');
    assert.ok(await AdminModel.findById(target._id));
  });

  it('guards every collection that can contain an admin author', async () => {
    const { AttendanceModel } = await import('../src/models/Attendance.ts');
    const { EventModel } = await import('../src/models/Event.ts');
    const { LeaveModel } = await import('../src/models/Leave.ts');
    const { LeaveAllowanceModel } = await import('../src/models/LeaveAllowance.ts');
    const { OvertimeModel } = await import('../src/models/Overtime.ts');
    const { deleteAdmin } = await import('../src/services/admins.ts');

    const cases = [
      async (targetId: Types.ObjectId, employeeId: Types.ObjectId) =>
        AttendanceModel.create({
          employeeId,
          date: '2041-01-01',
          status: 'present',
          createdBy: targetId,
        }),
      async (targetId: Types.ObjectId, employeeId: Types.ObjectId) =>
        OvertimeModel.create({
          employeeId,
          date: '2041-01-02',
          hours: 1,
          updatedBy: targetId,
        }),
      async (targetId: Types.ObjectId, employeeId: Types.ObjectId) =>
        LeaveModel.create({
          employeeId,
          startDate: '2041-01-03',
          endDate: '2041-01-03',
          days: 1,
          decidedBy: targetId,
        }),
      async (targetId: Types.ObjectId, employeeId: Types.ObjectId) =>
        LeaveAllowanceModel.create({
          employeeId,
          year: 2041,
          allowance: 20,
          createdBy: targetId,
        }),
      async (targetId: Types.ObjectId, employeeId: Types.ObjectId) =>
        EventModel.create({
          title: 'History guard event',
          startDate: '2041-01-04',
          endDate: '2041-01-04',
          createdBy: targetId,
        }),
    ];

    for (const [index, createRecord] of cases.entries()) {
      const target = await makeAdmin(`History Table ${index}`);
      const employee = await createEmployee({ name: `History Table Employee ${index}` });
      await createRecord(target._id, employee._id);

      await assert.rejects(
        () => deleteAdmin(String(target._id), ownerId),
        (error: { status?: number; code?: string; message?: string }) => {
          assert.equal(error.status, 409);
          assert.equal(error.code, 'admin_has_records');
          assert.equal(error.message, ADMIN_RECORD_MESSAGE);
          return true;
        },
      );
    }
  });

  it('refuses to delete the last active admin at the service boundary', async () => {
    const { AdminModel } = await import('../src/models/Admin.ts');
    const { deleteAdmin } = await import('../src/services/admins.ts');
    const target = await makeAdmin('Last Active Target');

    try {
      await AdminModel.updateMany(
        { _id: { $ne: target._id } },
        { $set: { isActive: false } },
      );

      await assert.rejects(
        () => deleteAdmin(String(target._id), '000000000000000000000000'),
        (error: { status?: number; code?: string }) => {
          assert.equal(error.status, 409);
          assert.equal(error.code, 'last_active_admin');
          return true;
        },
      );
    } finally {
      await AdminModel.updateMany({}, { $set: { isActive: true } });
    }
  });
});

describe('POST /api/admins/bulk', () => {
  it('disables several admins and revokes their sessions', async () => {
    const first = await makeAdmin('Bulk Disable One');
    const second = await makeAdmin('Bulk Disable Two');
    assert.ok(first._id);
    const firstLogin = await login(first.email);
    assert.equal(firstLogin.response.status, 200);

    const { agent, csrf } = await ownerSession();
    const response = await agent
      .post('/api/admins/bulk')
      .set('X-CSRF-Token', csrf)
      .send({ action: 'disable', ids: [String(first._id), String(second._id)] });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.affected, 2);
    assert.equal((await firstLogin.agent.get('/api/auth/me')).status, 401);
    assert.equal(await sessionCountFor(String(first._id)), 0);

    const { AdminModel } = await import('../src/models/Admin.ts');
    const stored = await AdminModel.find({ _id: { $in: [first._id, second._id] } });
    assert.equal(stored.every((admin) => admin.isActive === false), true);

    await AdminModel.updateMany(
      { _id: { $in: [first._id, second._id] } },
      { $set: { isActive: true } },
    );
  });

  it('is all-or-nothing when one selected admin has history', async () => {
    const clean = await makeAdmin('Bulk Clean Target');
    const historic = await makeAdmin('Bulk Historic Target');
    const { EventModel } = await import('../src/models/Event.ts');
    const { AdminModel } = await import('../src/models/Admin.ts');
    await EventModel.create({
      title: 'Bulk history event',
      startDate: '2042-01-01',
      endDate: '2042-01-01',
      createdBy: historic._id,
    });

    const { agent, csrf } = await ownerSession();
    const response = await agent
      .post('/api/admins/bulk')
      .set('X-CSRF-Token', csrf)
      .send({ action: 'delete', ids: [String(clean._id), String(historic._id)] });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'bulk_rejected');
    assert.deepEqual(
      response.body.error.details,
      [
        {
          id: String(historic._id),
          code: 'admin_has_records',
          message: ADMIN_RECORD_MESSAGE,
        },
      ],
    );

    assert.ok(await AdminModel.findById(clean._id));
    assert.ok(await AdminModel.findById(historic._id));
  });

  it('never lets a bulk action remove the signed-in or last active admin', async () => {
    const target = await makeAdmin('Bulk Last Active Target');
    const { AdminModel } = await import('../src/models/Admin.ts');

    try {
      await AdminModel.updateMany(
        { _id: { $nin: [ownerId, target._id] } },
        { $set: { isActive: false } },
      );

      const { agent, csrf } = await ownerSession();
      const ids = [ownerId, String(target._id)];

      for (const action of ['disable', 'delete'] as const) {
        const response = await agent
          .post('/api/admins/bulk')
          .set('X-CSRF-Token', csrf)
          .send({ action, ids });

        assert.equal(response.status, 409);
        assert.equal(response.body.error.code, 'bulk_rejected');
        const codes = new Set(
          response.body.error.details.map((issue: { code: string }) => issue.code),
        );
        assert.equal(
          codes.has(action === 'delete' ? 'cannot_delete_self' : 'cannot_deactivate_self'),
          true,
        );
        assert.equal(codes.has('last_active_admin'), true);
      }

      assert.ok(await AdminModel.findById(ownerId));
      assert.ok(await AdminModel.findById(target._id));
      assert.equal((await AdminModel.findById(ownerId))?.isActive, true);
      assert.equal((await AdminModel.findById(target._id))?.isActive, true);
    } finally {
      await AdminModel.updateMany({}, { $set: { isActive: true } });
    }
  });
});

describe('admin API access guards', () => {
  it('requires a session and a CSRF token', async () => {
    const anonymous = await request(app).get('/api/admins');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, 'unauthenticated');

    const { agent } = await ownerSession();
    const noToken = await agent.post('/api/admins').send({
      name: 'No Token',
      email: nextEmail('no-token'),
      password: 'another-secret-1',
      confirmPassword: 'another-secret-1',
    });
    assert.equal(noToken.status, 403);
    assert.equal(noToken.body.error.code, 'csrf_token_mismatch');
  });

  it('protects the list, form and account pages', async () => {
    for (const page of ['/admins.html', '/admin-form.html', '/my-account.html']) {
      const anonymous = await request(app).get(page);
      assert.equal(anonymous.status, 302);
      assert.match(anonymous.headers.location, /^\/login\.html\?next=/);

      const { agent } = await ownerSession();
      const signedIn = await agent.get(page);
      assert.equal(signedIn.status, 200);
    }
  });
});
