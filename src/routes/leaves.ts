import { Router } from 'express';
import * as leaves from '../controllers/leavesController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const leavesRouter = Router();

leavesRouter.use(requireAuth, requireAdmin);

leavesRouter.get('/export.csv', validate(leaves.leaveQuerySchema, 'query'), leaves.exportCsv);
leavesRouter.get(
  '/allowances/export.csv',
  validate(leaves.allowanceQuerySchema, 'query'),
  leaves.allowancesCsv,
);
leavesRouter.get(
  '/allowances',
  validate(leaves.allowanceQuerySchema, 'query'),
  leaves.allowancesIndex,
);
leavesRouter.get(
  '/preview',
  validate(leaves.previewLeaveQuerySchema, 'query'),
  leaves.preview,
);
leavesRouter.get('/', validate(leaves.leaveQuerySchema, 'query'), leaves.index);
leavesRouter.post('/', validate(leaves.createLeaveSchema, 'body'), leaves.create);

leavesRouter.get('/:id', validate(leaves.leaveIdSchema, 'params'), leaves.show);
leavesRouter.patch(
  '/:id',
  validate(leaves.leaveIdSchema, 'params'),
  validate(leaves.updateLeaveSchema, 'body'),
  leaves.update,
);
leavesRouter.delete('/:id', validate(leaves.leaveIdSchema, 'params'), leaves.remove);
