import { Router } from 'express';
import * as reports from '../controllers/reportsController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireAdmin);

reportsRouter.get(
  '/attendance-summary.csv',
  validate(reports.attendanceSummaryQuerySchema, 'query'),
  reports.attendanceSummaryCsv,
);
reportsRouter.get(
  '/attendance-summary',
  validate(reports.attendanceSummaryQuerySchema, 'query'),
  reports.attendanceSummary,
);
