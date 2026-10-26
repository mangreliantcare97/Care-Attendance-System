import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireAdmin);

dashboardRouter.get('/summary', dashboard.summary);
dashboardRouter.get('/year', validate(dashboard.dashboardYearSchema, 'query'), dashboard.year);
dashboardRouter.get('/month', validate(dashboard.dashboardMonthSchema, 'query'), dashboard.month);
