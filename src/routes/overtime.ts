import { Router } from 'express';
import * as overtime from '../controllers/overtimeController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const overtimeRouter = Router();

overtimeRouter.use(requireAuth, requireAdmin);

overtimeRouter.get(
  '/summary.csv',
  validate(overtime.overtimeSummarySchema, 'query'),
  overtime.exportSummaryCsv,
);
overtimeRouter.get(
  '/summary',
  validate(overtime.overtimeSummarySchema, 'query'),
  overtime.summary,
);
overtimeRouter.get(
  '/export.csv',
  validate(overtime.overtimeQuerySchema, 'query'),
  overtime.exportCsv,
);
overtimeRouter.get('/', validate(overtime.overtimeQuerySchema, 'query'), overtime.index);

overtimeRouter.post('/', validate(overtime.createOvertimeSchema, 'body'), overtime.create);

overtimeRouter.patch(
  '/:id',
  validate(overtime.overtimeIdSchema, 'params'),
  validate(overtime.updateOvertimeSchema, 'body'),
  overtime.update,
);
overtimeRouter.delete(
  '/:id',
  validate(overtime.overtimeIdSchema, 'params'),
  overtime.remove,
);
