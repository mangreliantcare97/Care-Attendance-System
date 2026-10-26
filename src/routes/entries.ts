import { Router } from 'express';
import * as entries from '../controllers/entriesController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const entriesRouter = Router();

entriesRouter.use(requireAuth, requireAdmin);

entriesRouter.get('/', validate(entries.entryListQuerySchema, 'query'), entries.index);
