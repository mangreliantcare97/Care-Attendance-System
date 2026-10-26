import { Router } from 'express';
import * as locations from '../controllers/locationsController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const locationsRouter = Router();

locationsRouter.use(requireAuth, requireAdmin);

locationsRouter.get('/', locations.index);
locationsRouter.post('/', validate(locations.createLocationSchema, 'body'), locations.create);
locationsRouter.patch(
  '/:id',
  validate(locations.locationIdSchema, 'params'),
  validate(locations.updateLocationSchema, 'body'),
  locations.update,
);
locationsRouter.delete(
  '/:id',
  validate(locations.locationIdSchema, 'params'),
  locations.remove,
);
