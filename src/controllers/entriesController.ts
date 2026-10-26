import type { Request, Response } from 'express';
import { z } from 'zod';
import * as entries from '../services/entries.ts';
import { ok } from '../utils/response.ts';

export const entryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  locationId: z.string().regex(/^[a-f\d]{24}$/i, 'That location id is not valid.').optional(),
});

export async function index(req: Request, res: Response): Promise<void> {
  const query = req.valid.query as z.infer<typeof entryListQuerySchema>;
  const result = await entries.listEntries(query);
  ok(res, { entries: result.entries }, { pagination: result.meta });
}
