import { Router } from 'express';
import * as admins from '../controllers/adminsController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const adminsRouter = Router();

/** Every admin endpoint requires a signed-in administrator. */
adminsRouter.use(requireAuth, requireAdmin);

adminsRouter.get('/', validate(admins.listAdminsQuerySchema, 'query'), admins.index);
adminsRouter.post('/', validate(admins.createAdminSchema, 'body'), admins.create);
adminsRouter.post('/me/password', validate(admins.changePasswordSchema, 'body'), admins.changePassword);
// Bulk comes before `/:id` so that the literal path can never be mistaken for
// an administrator id.
adminsRouter.post('/bulk', validate(admins.bulkAdminSchema, 'body'), admins.bulk);
adminsRouter.get('/:id', validate(admins.adminIdSchema, 'params'), admins.show);
adminsRouter.patch(
  '/:id',
  validate(admins.adminIdSchema, 'params'),
  validate(admins.updateAdminSchema, 'body'),
  admins.update,
);
adminsRouter.delete('/:id', validate(admins.adminIdSchema, 'params'), admins.remove);
adminsRouter.post('/:id/activate', validate(admins.adminIdSchema, 'params'), admins.activate);
adminsRouter.post('/:id/deactivate', validate(admins.adminIdSchema, 'params'), admins.deactivate);
