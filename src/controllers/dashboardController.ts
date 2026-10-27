import type { Request, Response } from 'express';
import { getDashboardSummary } from '../services/dashboard.ts';
import { ok } from '../utils/response.ts';

export async function index(_req: Request, res: Response): Promise<void> {
  ok(res, await getDashboardSummary());
}
