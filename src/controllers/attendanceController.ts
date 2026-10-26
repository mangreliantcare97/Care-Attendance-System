import type { Request, Response } from 'express';
import { z } from 'zod';
import * as attendance from '../services/attendance.ts';
import { ATTENDANCE_STATUSES } from '../models/Attendance.ts';
import { ok } from '../utils/response.ts';
import { toCsv } from '../utils/csv.ts';
import { isDateString } from '../utils/dates.ts';

const dateString = z.string().refine(isDateString, 'That is not a valid date.');

const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:mm.')
  .nullish();

const entrySchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i, 'That employee id is not valid.'),
  status: z.enum(ATTENDANCE_STATUSES),
  checkIn: timeString,
  checkOut: timeString,
  note: z.string().trim().max(500).nullish(),
});

export const sheetQuerySchema = z.object({
  date: dateString,
});

export const saveSheetSchema = z.object({
  date: dateString,
  entries: z.array(entrySchema).max(1000),
});

export const attendanceQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  departmentId: z.string().trim().max(64).optional(),
  employeeId: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export const attendanceIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That attendance id is not valid.'),
});

export const createAttendanceSchema = entrySchema.extend({ date: dateString });

export const updateAttendanceSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  checkIn: timeString,
  checkOut: timeString,
  note: z.string().trim().max(500).nullish(),
});

/** The daily sheet. */
export async function sheet(req: Request, res: Response): Promise<void> {
  const { date } = req.valid.query as z.infer<typeof sheetQuerySchema>;
  const result = await attendance.getSheet(date);
  ok(res, result);
}

/** Save the whole sheet in one request. */
export async function saveSheet(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof saveSheetSchema>;
  const result = await attendance.saveSheet(body.date, body.entries, req.admin!.id);
  ok(res, { saved: result.saved, unchanged: result.unchanged, records: result.records });
}

/** The attendance report. */
export async function report(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof attendanceQuerySchema>;
  const result = await attendance.attendanceReport(query);
  ok(res, { records: result.records, counts: result.counts }, result.meta as unknown as Record<string, unknown>);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createAttendanceSchema>;
  ok(res, { record: await attendance.addAttendance(body, req.admin!.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof attendanceIdSchema>;
  const body = req.valid.body as z.infer<typeof updateAttendanceSchema>;
  ok(res, { record: await attendance.updateAttendance(id, body, req.admin!.id) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof attendanceIdSchema>;
  ok(res, await attendance.deleteAttendance(id));
}

/** The report as a CSV file. */
export async function exportCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof attendanceQuerySchema>;
  const rows = (await attendance.attendanceRows(query)) as Array<Record<string, unknown>>;

  const data = rows.map((record) => {
    const employee = (record.employeeId ?? {}) as Record<string, unknown>;
    const department = (employee.departmentId ?? {}) as Record<string, unknown>;

    return [
      record.date,
      employee.name ?? '',
      (department as { name?: string }).name ?? '',
      employee.position ?? '',
      record.status,
      record.checkIn ?? '',
      record.checkOut ?? '',
      record.note ?? '',
    ];
  });

  const csv = toCsv(
    ['Date', 'Employee', 'Department', 'Position', 'Status', 'Check in', 'Check out', 'Note'],
    data,
  );

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="attendance-${Date.now()}.csv"`);
  res.send(csv);
}
