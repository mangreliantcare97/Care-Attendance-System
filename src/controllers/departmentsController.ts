import type { Request, Response } from 'express';
import { z } from 'zod';
import * as departments from '../services/departments.ts';
import { ok } from '../utils/response.ts';

export const departmentIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That department id is not valid.'),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Enter a department name.').max(120),
  location: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(500).nullish(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export async function index(_req: Request, res: Response): Promise<void> {
  ok(res, { departments: await departments.listDepartments() });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createDepartmentSchema>;
  ok(res, { department: await departments.createDepartment(body) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof departmentIdSchema>;
  const body = req.valid.body as z.infer<typeof updateDepartmentSchema>;
  ok(res, { department: await departments.updateDepartment(id, body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof departmentIdSchema>;
  ok(res, await departments.deleteDepartment(id));
}
