import type { Request, Response } from 'express';
import { z } from 'zod';
import * as overtime from '../services/overtime.ts';
import { ok } from '../utils/response.ts';
import { toCsv } from '../utils/csv.ts';
import { isDateString } from '../utils/dates.ts';

const dateString = z.string().refine(isDateString, 'That is not a valid date.');
const idString = z.string().regex(/^[a-f\d]{24}$/i, 'That id is not valid.');

export const overtimeIdSchema = z.object({ id: idString });

export const overtimeQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  studentId: idString.optional(),
  departmentId: idString.optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export const overtimeSummarySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM.').optional(),
  departmentId: idString.optional(),
});

export const createOvertimeSchema = z.object({
  studentId: idString,
  date: dateString,
  hours: z.coerce
    .number()
    .min(0.25, 'The minimum is 0.25 hours.')
    .max(24, 'A single entry cannot exceed 24 hours.')
    .multipleOf(0.25, 'Hours are booked in steps of 0.25.'),
  note: z.string().trim().max(500).nullish(),
});

export const updateOvertimeSchema = createOvertimeSchema.partial();

export async function index(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof overtimeQuerySchema>;
  const result = await overtime.listOvertime(query);
  ok(
    res,
    { records: result.records, totalHours: result.totalHours },
    result.meta as unknown as Record<string, unknown>,
  );
}

export async function summary(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof overtimeSummarySchema>;
  ok(res, await overtime.overtimeSummary(query));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createOvertimeSchema>;
  ok(res, { record: await overtime.createOvertime(body, req.admin!.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof overtimeIdSchema>;
  const body = req.valid.body as z.infer<typeof updateOvertimeSchema>;
  ok(res, { record: await overtime.updateOvertime(id, body, req.admin!.id) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof overtimeIdSchema>;
  ok(res, await overtime.deleteOvertime(id));
}

/** The overtime list as a CSV file. */
export async function exportCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof overtimeQuerySchema>;
  const rows = (await overtime.overtimeRows(query)) as Array<Record<string, unknown>>;

  const data = rows.map((record) => {
    const student = (record.studentId ?? {}) as Record<string, unknown>;
    const department = (student.departmentId ?? {}) as Record<string, unknown>;

    return [
      student.name ?? '',
      department.name ?? '',
      record.date,
      record.hours,
      record.note ?? '',
    ];
  });

  const csv = toCsv(['Student', 'Department', 'Date', 'Hours', 'Note'], data);

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="overtime-${Date.now()}.csv"`);
  res.send(csv);
}

/** The monthly summary as a CSV file. */
export async function exportSummaryCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof overtimeSummarySchema>;
  const result = await overtime.overtimeSummary(query);

  const csv = toCsv(
    ['Student', 'Department', 'Entries', 'Total hours'],
    result.rows.map((row) => [row.name, row.department, row.entries, row.totalHours]),
  );

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="overtime-summary-${result.month}.csv"`);
  res.send(csv);
}
