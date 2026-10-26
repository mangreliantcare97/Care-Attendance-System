import { Router } from 'express';
import * as departments from '../controllers/departmentsController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const departmentsRouter = Router();

departmentsRouter.use(requireAuth, requireAdmin);

departmentsRouter.get('/', departments.index);
departmentsRouter.post('/', validate(departments.createDepartmentSchema, 'body'), departments.create);
departmentsRouter.patch(
  '/:id',
  validate(departments.departmentIdSchema, 'params'),
  validate(departments.updateDepartmentSchema, 'body'),
  departments.update,
);
departmentsRouter.delete('/:id', validate(departments.departmentIdSchema, 'params'), departments.remove);
