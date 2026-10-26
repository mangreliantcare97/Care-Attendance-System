import { EmployeeModel, WITHOUT_PHOTO } from '../models/Employee.ts';
import { Types } from 'mongoose';
import { AttendanceModel } from '../models/Attendance.ts';
import { OvertimeModel } from '../models/Overtime.ts';
import { LeaveModel } from '../models/Leave.ts';
import { DepartmentModel } from '../models/Department.ts';
import { HttpError } from '../utils/response.ts';
import { parsePagination, pageMeta, type PaginationMeta } from '../utils/pagination.ts';
import { resolveMonth } from '../utils/dates.ts';
import { env } from '../config/env.ts';

/** The image types an employee photo may have. */
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface StoredPhoto {
  data: string;
  mime: string;
  size: number;
}

export interface EmployeePayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  departmentId?: string | null;
  position?: string | null;
  hireDate?: string | null;
  status?: 'active' | 'inactive' | 'terminated';
  photo?: unknown;
}

/** Escape a user supplied string so it can be used inside a RegExp. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Detect the image type from the first bytes of the file. */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Validate an uploaded photo.
 *
 * The size is measured on the decoded bytes — not on what the client claims —
 * and the image type has to match the bytes that were actually uploaded.
 */
export function validatePhoto(input: unknown): StoredPhoto {
  if (input === null || input === undefined || input === '') {
    return { data: '', mime: '', size: 0 };
  }

  if (typeof input !== 'object') {
    throw new HttpError(422, 'photo_invalid', 'The photo could not be read.');
  }

  const photo = input as { data?: unknown; mime?: unknown; size?: unknown };
  const raw = typeof photo.data === 'string' ? photo.data.trim() : '';
  if (!raw) {
    throw new HttpError(422, 'photo_invalid', 'The photo could not be read.');
  }

  const commaIndex = raw.indexOf(',');
  const base64 = raw.startsWith('data:') && commaIndex > -1 ? raw.slice(commaIndex + 1) : raw;

  if (!/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(base64)) {
    throw new HttpError(422, 'photo_invalid', 'The photo is not valid base64 data.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new HttpError(422, 'photo_invalid', 'The photo is empty.');
  }

  if (buffer.length > env.employeePhotoMaxBytes) {
    throw new HttpError(
      422,
      'photo_too_large',
      `The photo is ${Math.round(buffer.length / 1024)} KB — the maximum is ${Math.round(env.employeePhotoMaxBytes / 1024)} KB.`,
    );
  }

  const declaredSize = typeof photo.size === 'number' ? photo.size : undefined;
  if (declaredSize !== undefined && declaredSize > env.employeePhotoMaxBytes) {
    throw new HttpError(
      422,
      'photo_too_large',
      `The photo is larger than the maximum of ${Math.round(env.employeePhotoMaxBytes / 1024)} KB.`,
    );
  }

  const detected = detectImageMime(buffer);
  if (!detected || !ALLOWED_PHOTO_MIME.includes(detected as (typeof ALLOWED_PHOTO_MIME)[number])) {
    throw new HttpError(422, 'photo_type_not_allowed', 'Only JPEG, PNG and WebP photos are allowed.');
  }

  const declared = typeof photo.mime === 'string' ? photo.mime.toLowerCase().trim() : '';
  if (declared && declared !== detected) {
    throw new HttpError(
      422,
      'photo_type_mismatch',
      `The photo claims to be ${declared} but the file is ${detected}.`,
    );
  }

  return { data: base64, mime: detected, size: buffer.length };
}

/** Remove the photo from a document (the photo is never part of a list). */
export function stripPhoto<T extends { photo?: unknown }>(employee: T): Omit<T, 'photo'> {
  const { photo, ...rest } = employee;
  void photo;
  return rest;
}

export interface EmployeeListQuery {
  page?: unknown;
  perPage?: unknown;
  search?: unknown;
  departmentId?: unknown;
  status?: unknown;
}

export async function listEmployees(query: EmployeeListQuery): Promise<{
  employees: unknown[];
  meta: PaginationMeta;
}> {
  const pagination = parsePagination(query);
  const filter: Record<string, unknown> = {};

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { position: pattern }];
  }

  const departmentId = typeof query.departmentId === 'string' ? query.departmentId.trim() : '';
  if (departmentId && departmentId !== 'all') {
    filter.departmentId = departmentId;
  }

  const status = typeof query.status === 'string' ? query.status.trim() : '';
  if (status && status !== 'all') {
    filter.status = status;
  }

  const [employees, total] = await Promise.all([
    // The photo is never part of a list answer.
    EmployeeModel.find(filter)
      .select(WITHOUT_PHOTO)
      .populate('departmentId', 'name')
      .sort({ name: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    EmployeeModel.countDocuments(filter),
  ]);

  const photoIds = new Set(
    (
      await EmployeeModel.find({
        _id: { $in: employees.map((employee) => employee._id) },
        'photo.data': { $nin: [null, ''] },
      }).distinct('_id')
    ).map(String),
  );

  return {
    employees: employees.map((employee) => ({
      ...(employee.toJSON() as Record<string, unknown>),
      hasPhoto: photoIds.has(String(employee._id)),
    })),
    meta: pageMeta(total, pagination),
  };
}

export async function getEmployee(id: string): Promise<Record<string, unknown>> {
  // The photo is served by its own endpoint, so it is left out here as well.
  // The boolean lets the profile avoid requesting a photo that does not exist.
  const [employee, hasPhoto] = await Promise.all([
    EmployeeModel.findById(id).select(WITHOUT_PHOTO).populate('departmentId', 'name'),
    EmployeeModel.exists({ _id: id, 'photo.data': { $nin: [null, ''] } }),
  ]);
  if (!employee) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }
  return {
    ...(employee.toJSON() as Record<string, unknown>),
    hasPhoto: Boolean(hasPhoto),
  };
}

/** The photo of an employee — served on its own, never inside a list. */
export async function getEmployeePhoto(id: string): Promise<StoredPhoto | null> {
  const employee = await EmployeeModel.findById(id).select('photo').lean();
  if (!employee) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  const photo = employee.photo as { data?: string; mime?: string; size?: number } | undefined;
  if (!photo?.data) return null;

  return { data: photo.data, mime: photo.mime ?? 'image/jpeg', size: photo.size ?? 0 };
}

async function assertDepartmentExists(departmentId: string | null | undefined): Promise<void> {
  if (!departmentId) return;
  if (!(await DepartmentModel.exists({ _id: departmentId }))) {
    throw new HttpError(422, 'department_not_found', 'That department does not exist.');
  }
}

export async function createEmployee(payload: EmployeePayload): Promise<Record<string, unknown>> {
  await assertDepartmentExists(payload.departmentId);

  const email = payload.email?.trim().toLowerCase() || null;
  if (email && (await EmployeeModel.exists({ email }))) {
    throw new HttpError(409, 'email_taken', 'Another employee already uses that email address.');
  }

  const photo = validatePhoto(payload.photo);

  const employee = await EmployeeModel.create({
    name: payload.name.trim(),
    email,
    phone: payload.phone?.trim() || null,
    departmentId: payload.departmentId || null,
    position: payload.position?.trim() || null,
    hireDate: payload.hireDate || null,
    // New employees are deactivated until somebody activates them.
    status: payload.status ?? 'inactive',
    photo: photo.data ? photo : { data: null, mime: null, size: null },
  });

  return (await getEmployee(String(employee._id))) as Record<string, unknown>;
}

export async function updateEmployee(
  id: string,
  payload: Partial<EmployeePayload>,
): Promise<Record<string, unknown>> {
  const employee = await EmployeeModel.findById(id);
  if (!employee) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  if (payload.departmentId !== undefined) {
    await assertDepartmentExists(payload.departmentId);
    employee.departmentId = payload.departmentId
      ? new Types.ObjectId(payload.departmentId)
      : null;
  }

  if (payload.email !== undefined) {
    const email = payload.email?.trim().toLowerCase() || null;
    if (email && email !== employee.email && (await EmployeeModel.exists({ email, _id: { $ne: employee._id } }))) {
      throw new HttpError(409, 'email_taken', 'Another employee already uses that email address.');
    }
    employee.email = email;
  }

  if (payload.name !== undefined) employee.name = payload.name.trim();
  if (payload.phone !== undefined) employee.phone = payload.phone?.trim() || null;
  if (payload.position !== undefined) employee.position = payload.position?.trim() || null;
  if (payload.hireDate !== undefined) employee.hireDate = payload.hireDate || null;
  if (payload.status !== undefined) employee.status = payload.status;
  if (payload.photo !== undefined) {
    const photo = validatePhoto(payload.photo);
    employee.photo = photo.data ? photo : { data: null, mime: null, size: null };
  }

  await employee.save();
  return (await getEmployee(String(employee._id))) as Record<string, unknown>;
}

/**
 * Delete an employee for good.
 *
 * An employee that has attendance, overtime or leave records is never
 * deleted — that history has to stay readable. Deactivate the employee
 * instead.
 */
export async function deleteEmployee(id: string): Promise<{ deleted: boolean }> {
  const employee = await EmployeeModel.findById(id);
  if (!employee) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  const [attendance, overtime, leaves] = await Promise.all([
    AttendanceModel.countDocuments({ employeeId: employee._id }),
    OvertimeModel.countDocuments({ employeeId: employee._id }),
    LeaveModel.countDocuments({ employeeId: employee._id }),
  ]);

  if (attendance + overtime + leaves > 0) {
    throw new HttpError(
      409,
      'employee_has_records',
      'This employee has attendance, overtime or leave records and cannot be deleted. Deactivate the employee instead.',
    );
  }

  await employee.deleteOne();
  return { deleted: true };
}

/** The attendance of one employee for one month, with the counts. */
export async function employeeAttendance(
  id: string,
  month: string | undefined,
): Promise<{ records: unknown[]; counts: Record<string, number> }> {
  const employee = await EmployeeModel.findById(id).select('name').lean();
  if (!employee) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  const bounds = resolveMonth(month ?? '');

  const records = await AttendanceModel.find({
    employeeId: id,
    date: { $gte: bounds.start, $lte: bounds.end },
  }).sort({ date: 1 });

  const counts = { present: 0, late: 0, absent: 0, on_leave: 0, vacation: 0 };
  for (const record of records) {
    const status = record.status as keyof typeof counts;
    if (status in counts) counts[status] += 1;
  }

  return { records, counts };
}

/** The leave history of one employee. */
export async function employeeLeaves(id: string): Promise<unknown[]> {
  const employee = await EmployeeModel.findById(id).select('name').lean();
  if (!employee) {
    throw new HttpError(404, 'employee_not_found', 'That employee no longer exists.');
  }

  return LeaveModel.find({ employeeId: id }).sort({ startDate: -1 });
}
