import { Router } from 'express';
import * as attendance from '../controllers/attendanceController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth, requireAdmin);

attendanceRouter.get('/sheet', validate(attendance.sheetQuerySchema, 'query'), attendance.sheet);
attendanceRouter.post('/sheet', validate(attendance.saveSheetSchema, 'body'), attendance.saveSheet);

attendanceRouter.get('/export.csv', validate(attendance.attendanceQuerySchema, 'query'), attendance.exportCsv);
attendanceRouter.get('/', validate(attendance.attendanceQuerySchema, 'query'), attendance.report);
attendanceRouter.post('/', validate(attendance.createAttendanceSchema, 'body'), attendance.create);

attendanceRouter.patch(
  '/:id',
  validate(attendance.attendanceIdSchema, 'params'),
  validate(attendance.updateAttendanceSchema, 'body'),
  attendance.update,
);
attendanceRouter.delete('/:id', validate(attendance.attendanceIdSchema, 'params'), attendance.remove);
