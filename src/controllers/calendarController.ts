import type { Request, Response } from 'express';
import { z } from 'zod';
import * as calendar from '../services/calendar.ts';
import { EVENT_TYPES } from '../models/Event.ts';
import { ok } from '../utils/response.ts';
import { isDateString } from '../utils/dates.ts';

const dateString = z.string().refine(isDateString, 'That is not a valid date.');
const idString = z.string().regex(/^[a-f\d]{24}$/i, 'That id is not valid.');

export const calendarQuerySchema = z.object({
  start: dateString,
  end: dateString,
});

export const eventIdSchema = z.object({ id: idString });

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title.').max(200),
  description: z.string().trim().max(2000).nullish(),
  type: z.enum(EVENT_TYPES),
  startDate: dateString,
  endDate: dateString.nullish(),
});

export const updateEventSchema = createEventSchema.partial();

export async function feed(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof calendarQuerySchema>;
  const events = await calendar.calendarFeed(query.start, query.end);
  ok(res, { events, start: query.start, end: query.end });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createEventSchema>;
  ok(res, { event: await calendar.createEvent(body, req.admin!.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof eventIdSchema>;
  const body = req.valid.body as z.infer<typeof updateEventSchema>;
  ok(res, { event: await calendar.updateEvent(id, body, req.admin!.id) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof eventIdSchema>;
  ok(res, await calendar.deleteEvent(id));
}
