import { Router } from 'express';
import * as entries from '../controllers/entriesController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const entriesRouter = Router();

entriesRouter.use(requireAuth, requireAdmin);

entriesRouter.get('/', validate(entries.entryListQuerySchema, 'query'), entries.index);
entriesRouter.get('/export.csv', validate(entries.entryListQuerySchema, 'query'), entries.exportCsv);
entriesRouter.get('/:id', validate(entries.entryIdSchema, 'params'), entries.show);
entriesRouter.patch(
  '/:id',
  validate(entries.entryIdSchema, 'params'),
  validate(entries.updateEntrySchema, 'body'),
  entries.update,
);
entriesRouter.delete('/:id', validate(entries.entryIdSchema, 'params'), entries.remove);
