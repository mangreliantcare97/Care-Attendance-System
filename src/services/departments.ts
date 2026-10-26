import { DepartmentModel } from '../models/Department.ts';
import { EmployeeModel } from '../models/Employee.ts';
import { HttpError } from '../utils/response.ts';

export interface DepartmentRecord {
  id: string;
  name: string;
  location: string | null;
  description: string | null;
  employeeCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

function toRecord(
  department: {
    _id: unknown;
    name: string;
    location?: string | null;
    description?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  employeeCount = 0,
): DepartmentRecord {
  return {
    id: String(department._id),
    name: department.name,
    location: department.location ?? null,
    description: department.description ?? null,
    employeeCount,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
  };
}

/**
 * All departments with the number of employees in each.
 *
 * The count comes from an aggregation instead of a stored counter, so it can
 * never drift away from the real number of employees.
 */
export async function listDepartments(): Promise<DepartmentRecord[]> {
  const counts = await EmployeeModel.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: '$departmentId', count: { $sum: 1 } } },
  ]);

  const countByDepartment = new Map(counts.map((entry) => [String(entry._id), entry.count]));
  const departments = await DepartmentModel.find().sort({ name: 1 }).lean();

  return departments.map((department) =>
    toRecord(department, countByDepartment.get(String(department._id)) ?? 0),
  );
}

export async function getDepartment(id: string): Promise<DepartmentRecord> {
  const department = await DepartmentModel.findById(id).lean();
  if (!department) {
    throw new HttpError(404, 'department_not_found', 'That department no longer exists.');
  }

  const employeeCount = await EmployeeModel.countDocuments({ departmentId: department._id });
  return toRecord(department, employeeCount);
}

export async function createDepartment(input: {
  name: string;
  location?: string | null;
  description?: string | null;
}): Promise<DepartmentRecord> {
  const name = input.name.trim();

  if (await DepartmentModel.exists({ name })) {
    throw new HttpError(409, 'department_name_taken', 'A department with that name already exists.');
  }

  const department = await DepartmentModel.create({
    name,
    location: input.location?.trim() || null,
    description: input.description?.trim() || null,
  });

  return toRecord(department.toObject() as never, 0);
}

export async function updateDepartment(
  id: string,
  patch: { name?: string; location?: string | null; description?: string | null },
): Promise<DepartmentRecord> {
  const department = await DepartmentModel.findById(id);
  if (!department) {
    throw new HttpError(404, 'department_not_found', 'That department no longer exists.');
  }

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name !== department.name && (await DepartmentModel.exists({ name, _id: { $ne: department._id } }))) {
      throw new HttpError(409, 'department_name_taken', 'A department with that name already exists.');
    }
    department.name = name;
  }

  if (patch.location !== undefined) {
    department.location = patch.location?.trim() || null;
  }

  if (patch.description !== undefined) {
    department.description = patch.description?.trim() || null;
  }

  await department.save();
  const employeeCount = await EmployeeModel.countDocuments({ departmentId: department._id });
  return toRecord(department.toObject() as never, employeeCount);
}

/**
 * Delete a department.
 *
 * A department that still has employees is never deleted — the employees would
 * be left without a department. Move or deactivate them first.
 */
export async function deleteDepartment(id: string): Promise<{ deleted: boolean }> {
  const department = await DepartmentModel.findById(id);
  if (!department) {
    throw new HttpError(404, 'department_not_found', 'That department no longer exists.');
  }

  const employeeCount = await EmployeeModel.countDocuments({ departmentId: department._id });
  if (employeeCount > 0) {
    throw new HttpError(
      409,
      'department_has_employees',
      `This department still has ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. Move them to another department first.`,
    );
  }

  await department.deleteOne();
  return { deleted: true };
}
