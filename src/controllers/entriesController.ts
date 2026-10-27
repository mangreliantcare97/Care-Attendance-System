import type { Request, Response } from 'express';
import { z } from 'zod';
import * as entries from '../services/entries.ts';
import { ok } from '../utils/response.ts';
import { ENTRY_DIRECTIONS, ENTRY_USER_TYPES } from '../models/Entry.ts';
import { isDateString, today } from '../utils/dates.ts';
import { env } from '../config/env.ts';
import { toCsv } from '../utils/csv.ts';

export const entryListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  userType: z.enum(ENTRY_USER_TYPES).optional(),
  direction: z.enum(ENTRY_DIRECTIONS).optional(),
  locationId: z.string().regex(/^[a-f\d]{24}$/i, 'That location id is not valid.').optional(),
  dateFrom: z.string().refine(isDateString, 'Enter a valid start date.').optional(),
  dateTo: z.string().refine(isDateString, 'Enter a valid end date.').optional(),
  sort: z.enum(['date', 'time', 'name', 'userType', 'direction', 'location', 'receivedAt']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
}).strict().superRefine((query, context) => {
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    context.addIssue({
      code: 'custom',
      path: ['dateTo'],
      message: 'End date must be on or after the start date.',
    });
  }
});

export const entryIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That entry id is not valid.'),
});

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export const updateEntrySchema = z.object({
  userType: z.enum(ENTRY_USER_TYPES).optional(),
  name: z.string().trim().min(2, 'Enter a name of at least 2 characters.')
    .max(80, 'The name must be 80 characters or fewer.')
    .refine((value) => !CONTROL_CHARS.test(value), 'That name contains characters that are not allowed.')
    .optional(),
  direction: z.enum(ENTRY_DIRECTIONS).optional(),
  enteredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid time.').optional(),
  date: z.string().refine(isDateString, 'Enter a valid calendar date.').optional(),
  locationId: z.string().regex(/^[a-f\d]{24}$/i, 'That location id is not valid.').optional(),
  notes: z.string().trim().min(1, 'Enter a note for the record.')
    .max(500, 'Notes must be 500 characters or fewer.').optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, 'Nothing to update.');

export async function index(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof entryListQuerySchema>;
  const result = await entries.listEntries(query);
  ok(res, { entries: result.entries }, { pagination: result.meta });
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof entryListQuerySchema>;
  const rows = await entries.exportEntries(query);
  const csv = toCsv(
    ['Entry ID', 'Date', 'Entered time', 'Name', 'User type', 'Direction', 'Location', 'Postcode', 'Notes', 'Received at'],
    rows.map((entry) => [
      entry.id,
      entry.date,
      entry.enteredTime,
      entry.name,
      entry.userType,
      entry.direction,
      entry.location?.name ?? '',
      entry.location?.postcode ?? '',
      entry.notes,
      entry.receivedAt.toISOString(),
    ]),
  );
  const filenameDate = today(env.appTimezone);
  res
    .status(200)
    .type('text/csv')
    .set('Content-Disposition', `attachment; filename="care-attendance-entries-${filenameDate}.csv"`)
    .send(csv);
}

export async function show(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof entryIdSchema>;
  const entry = await entries.getEntry(id);
  ok(res, { entry });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof entryIdSchema>;
  const patch = req.valid.body as z.infer<typeof updateEntrySchema>;
  ok(res, { entry: await entries.updateEntry(id, patch, req.admin!.id) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof entryIdSchema>;
  ok(res, await entries.deleteEntry(id, req.admin!.id));
}
