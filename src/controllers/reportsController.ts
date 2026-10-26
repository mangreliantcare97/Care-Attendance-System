import type { Request, Response } from 'express';
import { z } from 'zod';
import * as reports from '../services/reports.ts';
import { ok } from '../utils/response.ts';
import { toCsv } from '../utils/csv.ts';
import { isDateString } from '../utils/dates.ts';

const dateString = z.string().refine(isDateString, 'That is not a valid date.');
const idString = z.string().regex(/^[a-f\d]{24}$/i, 'That id is not valid.');

export const attendanceSummaryQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  departmentId: idString.optional(),
  studentId: idString.optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

export async function attendanceSummary(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof attendanceSummaryQuerySchema>;
  const result = await reports.attendanceSummary(query);
  ok(res, { rows: result.rows, totals: result.totals }, result.meta as unknown as Record<string, unknown>);
}

/** The attendance summary as a CSV file (same filters, every row). */
export async function attendanceSummaryCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof attendanceSummaryQuerySchema>;
  const rows = await reports.attendanceSummaryRows(query);

  const csv = toCsv(
    [
      'Student',
      'Department',
      'Position',
      'Present',
      'Late',
      'Absent',
      'On leave',
      'Vacation',
      'Attendance rate (%)',
    ],
    rows.map((row) => [
      row.name,
      row.department ?? '',
      row.position ?? '',
      row.present,
      row.late,
      row.absent,
      row.onLeave,
      row.vacation,
      row.rate ?? '',
    ]),
  );

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="attendance-summary-${Date.now()}.csv"`);
  res.send(csv);
}
