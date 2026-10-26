import { Router } from 'express';
import * as calendar from '../controllers/calendarController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.ts';

export const calendarRouter = Router();
calendarRouter.use(requireAuth, requireAdmin);
calendarRouter.get('/', validate(calendar.calendarQuerySchema, 'query'), calendar.feed);

/** HR event CRUD — the calendar page's modal writes here. */
export const eventsRouter = Router();
eventsRouter.use(requireAuth, requireAdmin);

eventsRouter.post('/', validate(calendar.createEventSchema, 'body'), calendar.create);
eventsRouter.patch(
  '/:id',
  validate(calendar.eventIdSchema, 'params'),
  validate(calendar.updateEventSchema, 'body'),
  calendar.update,
);
eventsRouter.delete('/:id', validate(calendar.eventIdSchema, 'params'), calendar.remove);
