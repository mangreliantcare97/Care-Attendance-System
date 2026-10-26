import type { Request, Response } from 'express';
import { z } from 'zod';
import * as dashboard from '../services/dashboard.ts';
import { ok } from '../utils/response.ts';

export const dashboardYearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const dashboardMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM.'),
});

/** The cards for today in APP_TIMEZONE. */
export async function summary(_req: Request, res: Response): Promise<void> {
  ok(res, await dashboard.dashboardSummary());
}

export async function year(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof dashboardYearSchema>;
  ok(res, await dashboard.dashboardYear(query.year));
}

export async function month(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof dashboardMonthSchema>;
  ok(res, await dashboard.dashboardMonth(query.month));
}
