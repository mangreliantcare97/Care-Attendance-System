import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as students from '../services/students.ts';
import { studentLeaveTotals } from '../services/leaves.ts';
import {
  studentAllowance,
  studentAllowanceMonth,
  setAllowance,
} from '../services/allowances.ts';
import { HttpError, ok } from '../utils/response.ts';
import { isDateString, today } from '../utils/dates.ts';

export const studentIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That student id is not valid.'),
});

const dateString = z
  .string()
  .refine(isDateString, 'That is not a valid date.');

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, 'Enter the student’s name.').max(120),
  // An empty address means "no address" and is stored as null.
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.email('Enter a valid email address.').max(255).nullish(),
  ),
  phone: z.string().trim().max(40).nullish(),
  departmentId: z.string().regex(/^[a-f\d]{24}$/i, 'That department id is not valid.').nullish(),
  position: z.string().trim().max(120).nullish(),
  hireDate: dateString.nullish(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
  photo: z.unknown().optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

export const studentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(120).optional(),
  departmentId: z.string().trim().max(64).optional(),
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
});

export const studentMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use the format YYYY-MM.').optional(),
});

const optionalYear = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().min(2000).max(2100).optional(),
);

export const allowanceQuerySchema = z.object({
  year: optionalYear,
});

export const allowanceMonthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000, 'Use a year between 2000 and 2100.').max(2100),
  month: z.coerce.number().int().min(1, 'Choose a month.').max(12),
});

export const allowanceYearSchema = studentIdSchema.extend({
  year: z.coerce.number().int().min(2000).max(2100),
});

const halfDay = (label: string) =>
  z
    .number({ message: `Enter ${label}.` })
    .min(0, `${label} cannot be negative.`)
    .max(100, `${label} cannot be more than 100 days.`)
    .refine((value) => Number.isInteger(value * 2), 'Use whole or half days.');

export const setAllowanceSchema = z.object({
  allowance: halfDay('a holiday allowance'),
  note: z.string().trim().max(500).nullish(),
});

export async function index(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof studentQuerySchema>;
  const result = await students.listStudents(query);
  ok(res, { students: result.students }, result.meta as unknown as Record<string, unknown>);
}

export async function show(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  ok(res, { student: await students.getStudent(id) });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createStudentSchema>;
  ok(res, { student: await students.createStudent(body) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  const body = req.valid.body as z.infer<typeof updateStudentSchema>;
  ok(res, { student: await students.updateStudent(id, body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  ok(res, await students.deleteStudent(id));
}

/**
 * The photo of a student.
 *
 * The photo is stored inside the student document but it is never part of a
 * list answer — it is served from here, with cache headers.
 */
export async function photo(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  const photo = await students.getStudentPhoto(id);

  if (!photo) {
    throw new HttpError(404, 'photo_not_found', 'This student has no photo.');
  }

  const buffer = Buffer.from(photo.data, 'base64');
  const etag = `"${createHash('sha1').update(photo.data).digest('hex')}"`;

  res.set('Cache-Control', 'private, max-age=86400');
  res.set('ETag', etag);
  res.set('Content-Length', String(buffer.length));

  if (req.get('If-None-Match') === etag) {
    res.status(304).end();
    return;
  }

  res.type(photo.mime).send(buffer);
}

/** The attendance of one student for one month. */
export async function attendance(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  const { month } = req.valid.query as z.infer<typeof studentMonthSchema>;
  const result = await students.studentAttendance(id, month);
  ok(res, { records: result.records, counts: result.counts });
}

/** The leave history of one student. */
export async function leaves(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  ok(res, { leaves: await students.studentLeaves(id) });
}

/**
 * The approved leave days of one student, broken down by year and type.
 *
 * Only approved leaves count, and `days` is the number of working days — the
 * same number the attendance sync used.
 */
export async function leaveTotals(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  ok(res, { totalsByYear: await studentLeaveTotals(id) });
}

/** The holiday allowance of one student and one year. */
export async function allowance(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  const { year } = req.valid.query as z.infer<typeof allowanceQuerySchema>;
  const resolved = year ?? Number(today().slice(0, 4));
  ok(res, { allowance: await studentAllowance(id, resolved) });
}

/** The approved vacation days of one student in one month, grouped by leave. */
export async function allowanceMonth(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof studentIdSchema>;
  const { year, month } = req.valid.query as z.infer<typeof allowanceMonthQuerySchema>;
  ok(res, { month: await studentAllowanceMonth(id, year, month) });
}

/** Create or replace the allowance of one student and one year. */
export async function updateAllowance(req: Request, res: Response): Promise<void> {
  const { id, year } = req.valid.params as z.infer<typeof allowanceYearSchema>;
  const body = req.valid.body as z.infer<typeof setAllowanceSchema>;
  ok(res, {
    allowance: await setAllowance(
      id,
      year,
      { allowance: body.allowance, note: body.note ?? '' },
      req.admin!.id,
    ),
  });
}
