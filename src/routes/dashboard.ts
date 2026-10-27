import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController.ts';
import { requireAdmin, requireAuth } from '../middleware/requireAuth.ts';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireAdmin);
dashboardRouter.get('/', dashboard.index);
