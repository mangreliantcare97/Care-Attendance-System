import { AdminModel, findAdminWithPassword, hashPassword, verifyPassword } from '../models/Admin.ts';
import { destroySessionsForAdmin, destroySessionsForAdmins } from '../config/session.ts';
import { AttendanceModel } from '../models/Attendance.ts';
import { EventModel } from '../models/Event.ts';
import { LeaveModel } from '../models/Leave.ts';
import { LeaveAllowanceModel } from '../models/LeaveAllowance.ts';
import { OvertimeModel } from '../models/Overtime.ts';
import { getMailer, sendQuietly } from './mailer.ts';
import { HttpError } from '../utils/response.ts';
import { escapeHtml } from '../utils/escape.ts';

export type AdminStatus = 'enabled' | 'disabled';
export type AdminSortField = 'name' | 'email' | 'status' | 'lastLogin';
export type AdminSortOrder = 'asc' | 'desc';
export type AdminBulkAction = 'disable' | 'delete';

export interface AdminRecord {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AdminLike {
  _id: unknown;
  name: string;
  email: string;
  role: 'admin';
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ListAdminsOptions {
  name?: string;
  email?: string;
  status?: AdminStatus;
  sort?: AdminSortField;
  order?: AdminSortOrder;
  page?: number;
  perPage?: number;
}

export interface AdminListResult {
  admins: AdminRecord[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface AdminUpdateInput {
  name?: string;
  email?: string;
  status?: AdminStatus;
  password?: string;
  role?: 'admin';
}

export interface AdminUpdateResult {
  admin: AdminRecord;
  revokedSessions: number;
  passwordChanged: boolean;
}

export interface BulkAdminIssue {
  id: string;
  code: string;
  message: string;
}

export interface BulkAdminResult {
  action: AdminBulkAction;
  affected: number;
  revokedSessions: number;
}

const SORT_FIELDS: Record<AdminSortField, string> = {
  name: 'name',
  email: 'email',
  status: 'isActive',
  lastLogin: 'lastLoginAt',
};

const ADMIN_RECORD_MESSAGE =
  'This admin has history and cannot be deleted. Disable the account instead.';

function toRecord(admin: AdminLike): AdminRecord {
  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt ?? null,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/** A page of administrators, filtered and sorted on the server. */
export async function listAdmins(options: ListAdminsOptions = {}): Promise<AdminListResult> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Math.trunc(options.perPage ?? 20)));
  const filter: Record<string, unknown> = {};

  const name = options.name?.trim();
  if (name) filter.name = { $regex: escapeRegex(name), $options: 'i' };

  const email = options.email?.trim();
  if (email) filter.email = { $regex: escapeRegex(email), $options: 'i' };

  if (options.status === 'enabled') filter.isActive = true;
  if (options.status === 'disabled') filter.isActive = false;

  const sortField = SORT_FIELDS[options.sort ?? 'name'];
  const direction: 1 | -1 = options.order === 'desc' ? -1 : 1;
  const sort: Record<string, 1 | -1> = { [sortField]: direction };
  // Stable ordering for equal values (several admins can share a status or a
  // missing last-login date).
  if (sortField !== 'name') sort.name = 1;
  sort._id = 1;

  const [admins, total] = await Promise.all([
    AdminModel.find(filter)
      .sort(sort)
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
    AdminModel.countDocuments(filter),
  ]);

  return {
    admins: admins.map((admin) => toRecord(admin as unknown as AdminLike)),
    total,
    page,
    perPage,
    pages: Math.ceil(total / perPage),
  };
}

export async function getAdmin(id: string): Promise<AdminRecord> {
  const admin = await AdminModel.findById(id).lean();
  if (!admin) {
    throw new HttpError(404, 'admin_not_found', 'That admin no longer exists.');
  }
  return toRecord(admin as unknown as AdminLike);
}

export async function createAdmin(input: {
  name: string;
  email: string;
  password: string;
  status?: AdminStatus;
}): Promise<AdminRecord> {
  const email = input.email.trim().toLowerCase();

  try {
    const admin = await AdminModel.create({
      name: input.name.trim(),
      email,
      password: await hashPassword(input.password),
      role: 'admin',
      isActive: input.status !== 'disabled',
    });

    return toRecord(admin.toObject() as unknown as AdminLike);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new HttpError(409, 'email_taken', 'An admin with that email already exists.');
    }
    throw error;
  }
}

/**
 * Edit an administrator.
 *
 * Safety rails:
 *  - an administrator cannot disable their own account;
 *  - the last active administrator can never be disabled;
 *  - changing another administrator's password revokes all of their sessions
 *    and sends them a notice.
 */
export async function updateAdmin(
  id: string,
  patch: AdminUpdateInput,
  actingAdminId: string,
): Promise<AdminUpdateResult> {
  const admin = await AdminModel.findById(id);
  if (!admin) {
    throw new HttpError(404, 'admin_not_found', 'That admin no longer exists.');
  }

  const ownAccount = String(admin._id) === actingAdminId;

  if (patch.password !== undefined && ownAccount) {
    throw new HttpError(
      400,
      'cannot_change_own_password',
      'Use My Account to change your own password.',
    );
  }

  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    if (email !== admin.email) {
      const existing = await AdminModel.exists({ email, _id: { $ne: admin._id } });
      if (existing) {
        throw new HttpError(409, 'email_taken', 'An admin with that email already exists.');
      }
      admin.email = email;
    }
  }

  if (patch.name !== undefined) {
    admin.name = patch.name.trim();
  }

  if (patch.status !== undefined) {
    const nextActive = patch.status !== 'disabled';
    if (!nextActive && admin.isActive) {
      if (ownAccount) {
        throw new HttpError(400, 'cannot_deactivate_self', 'You cannot disable your own account.');
      }
      await assertNotLastActiveAdmin(admin._id);
    }
    admin.isActive = nextActive;
  }

  // There is only one role. It is forced on every update so no legacy payload
  // can ever create or promote another kind of login.
  admin.role = 'admin';

  let passwordChanged = false;
  if (patch.password !== undefined) {
    admin.password = await hashPassword(patch.password);
    passwordChanged = true;
  }

  try {
    await admin.save();
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new HttpError(409, 'email_taken', 'An admin with that email already exists.');
    }
    throw error;
  }

  let revokedSessions = 0;
  if (patch.status === 'disabled' || passwordChanged) {
    revokedSessions = await destroySessionsForAdmin(String(admin._id));
  }

  if (passwordChanged) {
    sendPasswordChangedNotice(admin.toObject() as unknown as AdminLike);
  }

  return {
    admin: toRecord(admin.toObject() as unknown as AdminLike),
    revokedSessions,
    passwordChanged,
  };
}

/** Activate or deactivate an admin. Kept for the existing endpoints. */
export async function setAdminActive(
  id: string,
  isActive: boolean,
  actingAdminId: string,
): Promise<{ admin: AdminRecord; revokedSessions: number }> {
  const result = await updateAdmin(
    id,
    { status: isActive ? 'enabled' : 'disabled' },
    actingAdminId,
  );
  return { admin: result.admin, revokedSessions: result.revokedSessions };
}

/** Delete one administrator, refusing anyone whose id is used as an author. */
export async function deleteAdmin(
  id: string,
  actingAdminId: string,
): Promise<{ deleted: true; revokedSessions: number }> {
  const admin = await AdminModel.findById(id);
  if (!admin) {
    throw new HttpError(404, 'admin_not_found', 'That admin no longer exists.');
  }

  if (String(admin._id) === actingAdminId) {
    throw new HttpError(409, 'cannot_delete_self', 'You cannot delete yourself.');
  }

  if (admin.isActive) {
    await assertNotLastActiveAdmin(admin._id, {
      status: 409,
      code: 'last_active_admin',
      message: 'This is the last active administrator — another administrator has to be created first.',
    });
  }

  const referenced = await findReferencedAdminIds([String(admin._id)]);
  if (referenced.size) {
    throw new HttpError(409, 'admin_has_records', ADMIN_RECORD_MESSAGE);
  }

  await admin.deleteOne();
  const revokedSessions = await destroySessionsForAdmin(String(admin._id));

  return { deleted: true, revokedSessions };
}

/**
 * Disable or delete several administrators as one all-or-nothing operation.
 *
 * Every target is checked before the first write. If any id breaks a rule, the
 * whole batch is refused with one reason per offending id, and nothing changes.
 */
export async function bulkAdmins(
  action: AdminBulkAction,
  ids: string[],
  actingAdminId: string,
): Promise<BulkAdminResult> {
  const uniqueIds = [...new Set(ids)];
  const issues: BulkAdminIssue[] = [];
  const idSet = new Set(uniqueIds);

  const addIssue = (id: string, code: string, message: string) => {
    if (issues.some((issue) => issue.id === id && issue.code === code)) return;
    issues.push({ id, code, message });
  };

  if (idSet.has(actingAdminId)) {
    addIssue(
      actingAdminId,
      action === 'delete' ? 'cannot_delete_self' : 'cannot_deactivate_self',
      action === 'delete'
        ? 'You cannot delete yourself.'
        : 'You cannot disable your own account.',
    );
  }

  const admins = await AdminModel.find({ _id: { $in: uniqueIds } }).lean();
  const byId = new Map(admins.map((admin) => [String(admin._id), admin]));

  for (const id of uniqueIds) {
    if (!byId.has(id)) {
      addIssue(id, 'admin_not_found', 'That admin no longer exists.');
    }
  }

  const existing = [...byId.values()];
  const activeAdmins = await AdminModel.countDocuments({ isActive: true, role: 'admin' });
  const activeTargets = existing.filter((admin) => admin.isActive);

  if (activeAdmins - activeTargets.length < 1) {
    for (const admin of activeTargets) {
      addIssue(
        String(admin._id),
        'last_active_admin',
        'This is the last active administrator — another administrator has to be created first.',
      );
    }
  }

  if (action === 'delete' && byId.size) {
    const referenced = await findReferencedAdminIds([...byId.keys()]);
    for (const id of referenced) {
      addIssue(id, 'admin_has_records', ADMIN_RECORD_MESSAGE);
    }
  }

  if (issues.length) {
    throw new HttpError(
      409,
      'bulk_rejected',
      'No changes were made because one or more selected admins cannot be changed.',
      issues,
    );
  }

  if (action === 'disable') {
    await AdminModel.updateMany({ _id: { $in: uniqueIds } }, { $set: { isActive: false } });
  } else {
    await AdminModel.deleteMany({ _id: { $in: uniqueIds } });
  }

  const revokedSessions = await destroySessionsForAdmins(uniqueIds);

  return { action, affected: uniqueIds.length, revokedSessions };
}

/** Change the password of the signed-in admin. */
export async function changeOwnPassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await findAdminWithPasswordById(adminId);
  if (!admin) {
    throw new HttpError(404, 'admin_not_found', 'That admin no longer exists.');
  }

  const matches = await verifyPassword(currentPassword, admin.password);
  if (!matches) {
    throw new HttpError(400, 'invalid_password', 'Your current password is not correct.');
  }

  admin.password = await hashPassword(newPassword);
  await admin.save();
}

function findAdminWithPasswordById(id: string) {
  return AdminModel.findById(id).select('+password');
}

/** Throw when the given admin is the only active administrator left. */
async function assertNotLastActiveAdmin(
  adminId: unknown,
  options: { status: number; code: string; message: string } = {
    status: 400,
    code: 'cannot_deactivate_last_admin',
    message: 'This is the last active administrator — another administrator has to be created first.',
  },
): Promise<void> {
  const activeAdmins = await AdminModel.countDocuments({ isActive: true, role: 'admin' });
  if (activeAdmins <= 1) {
    throw new HttpError(options.status, options.code, options.message);
  }

  // Guard against a race where two admins are deactivated at the same time.
  const stillActive = await AdminModel.countDocuments({
    isActive: true,
    role: 'admin',
    _id: { $ne: adminId },
  });
  if (stillActive === 0) {
    throw new HttpError(options.status, options.code, options.message);
  }
}

/** All administrator ids referenced as an author or decision maker. */
async function findReferencedAdminIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const idSet = new Set(ids);
  const referenced = new Set<string>();

  const [attendance, overtime, leaves, allowances, events] = await Promise.all([
    AttendanceModel.find({
      $or: [{ createdBy: { $in: ids } }, { updatedBy: { $in: ids } }],
    })
      .select('createdBy updatedBy')
      .lean(),
    OvertimeModel.find({
      $or: [{ createdBy: { $in: ids } }, { updatedBy: { $in: ids } }],
    })
      .select('createdBy updatedBy')
      .lean(),
    LeaveModel.find({
      $or: [
        { decidedBy: { $in: ids } },
        { createdBy: { $in: ids } },
        { updatedBy: { $in: ids } },
      ],
    })
      .select('decidedBy createdBy updatedBy')
      .lean(),
    LeaveAllowanceModel.find({
      $or: [{ createdBy: { $in: ids } }, { updatedBy: { $in: ids } }],
    })
      .select('createdBy updatedBy')
      .lean(),
    EventModel.find({
      $or: [{ createdBy: { $in: ids } }, { updatedBy: { $in: ids } }],
    })
      .select('createdBy updatedBy')
      .lean(),
  ]);

  const collect = (documents: Array<Record<string, unknown>>, fields: string[]) => {
    for (const document of documents) {
      for (const field of fields) {
        const value = document[field];
        if (value && idSet.has(String(value))) referenced.add(String(value));
      }
    }
  };

  collect(attendance as unknown as Array<Record<string, unknown>>, ['createdBy', 'updatedBy']);
  collect(overtime as unknown as Array<Record<string, unknown>>, ['createdBy', 'updatedBy']);
  collect(leaves as unknown as Array<Record<string, unknown>>, [
    'decidedBy',
    'createdBy',
    'updatedBy',
  ]);
  collect(allowances as unknown as Array<Record<string, unknown>>, ['createdBy', 'updatedBy']);
  collect(events as unknown as Array<Record<string, unknown>>, ['createdBy', 'updatedBy']);

  return referenced;
}

function sendPasswordChangedNotice(admin: AdminLike): void {
  sendQuietly(getMailer(), {
    to: admin.email,
    subject: 'Your password was changed',
    text: [
      `Hello ${admin.name},`,
      '',
      'An administrator changed the password of your administrator account.',
      'All of your sessions have been signed out. Sign in again with the new password.',
      'If you did not expect this, contact your system administrator immediately.',
    ].join('\n'),
    html: [
      `<p>Hello ${escapeHtml(admin.name)},</p>`,
      '<p>An administrator changed the password of your administrator account and all of your sessions have been signed out.</p>',
      '<p>Sign in again with the new password. If you did not expect this, contact your system administrator immediately.</p>',
    ].join(''),
  });
}
