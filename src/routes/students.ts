import { Router } from 'express';
import * as students from '../controllers/studentsController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const studentsRouter = Router();

studentsRouter.use(requireAuth, requireAdmin);

studentsRouter.get('/', validate(students.studentQuerySchema, 'query'), students.index);
studentsRouter.post('/', validate(students.createStudentSchema, 'body'), students.create);

studentsRouter.get(
  '/:id/attendance',
  validate(students.studentIdSchema, 'params'),
  validate(students.studentMonthSchema, 'query'),
  students.attendance,
);
studentsRouter.get(
  '/:id/leaves',
  validate(students.studentIdSchema, 'params'),
  students.leaves,
);
studentsRouter.get(
  '/:id/leave-totals',
  validate(students.studentIdSchema, 'params'),
  students.leaveTotals,
);
studentsRouter.get(
  '/:id/allowance/month',
  validate(students.studentIdSchema, 'params'),
  validate(students.allowanceMonthQuerySchema, 'query'),
  students.allowanceMonth,
);
studentsRouter.get(
  '/:id/allowance',
  validate(students.studentIdSchema, 'params'),
  validate(students.allowanceQuerySchema, 'query'),
  students.allowance,
);
studentsRouter.put(
  '/:id/allowance/:year',
  validate(students.allowanceYearSchema, 'params'),
  validate(students.setAllowanceSchema, 'body'),
  students.updateAllowance,
);
studentsRouter.get('/:id/photo', validate(students.studentIdSchema, 'params'), students.photo);
studentsRouter.get('/:id', validate(students.studentIdSchema, 'params'), students.show);

studentsRouter.patch(
  '/:id',
  validate(students.studentIdSchema, 'params'),
  validate(students.updateStudentSchema, 'body'),
  students.update,
);
studentsRouter.delete('/:id', validate(students.studentIdSchema, 'params'), students.remove);
