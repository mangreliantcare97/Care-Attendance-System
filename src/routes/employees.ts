import { Router } from 'express';
import * as employees from '../controllers/employeesController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const employeesRouter = Router();

employeesRouter.use(requireAuth, requireAdmin);

employeesRouter.get('/', validate(employees.employeeQuerySchema, 'query'), employees.index);
employeesRouter.post('/', validate(employees.createEmployeeSchema, 'body'), employees.create);

employeesRouter.get(
  '/:id/attendance',
  validate(employees.employeeIdSchema, 'params'),
  validate(employees.employeeMonthSchema, 'query'),
  employees.attendance,
);
employeesRouter.get(
  '/:id/leaves',
  validate(employees.employeeIdSchema, 'params'),
  employees.leaves,
);
employeesRouter.get(
  '/:id/leave-totals',
  validate(employees.employeeIdSchema, 'params'),
  employees.leaveTotals,
);
employeesRouter.get(
  '/:id/allowance/month',
  validate(employees.employeeIdSchema, 'params'),
  validate(employees.allowanceMonthQuerySchema, 'query'),
  employees.allowanceMonth,
);
employeesRouter.get(
  '/:id/allowance',
  validate(employees.employeeIdSchema, 'params'),
  validate(employees.allowanceQuerySchema, 'query'),
  employees.allowance,
);
employeesRouter.put(
  '/:id/allowance/:year',
  validate(employees.allowanceYearSchema, 'params'),
  validate(employees.setAllowanceSchema, 'body'),
  employees.updateAllowance,
);
employeesRouter.get('/:id/photo', validate(employees.employeeIdSchema, 'params'), employees.photo);
employeesRouter.get('/:id', validate(employees.employeeIdSchema, 'params'), employees.show);

employeesRouter.patch(
  '/:id',
  validate(employees.employeeIdSchema, 'params'),
  validate(employees.updateEmployeeSchema, 'body'),
  employees.update,
);
employeesRouter.delete('/:id', validate(employees.employeeIdSchema, 'params'), employees.remove);
