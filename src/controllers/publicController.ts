import type { Request, Response } from 'express';
import { z } from 'zod';
import { ENTRY_DIRECTIONS } from '../models/Entry.ts';
import * as entries from '../services/entries.ts';
import * as locations from '../services/locations.ts';
import { created, ok } from '../utils/response.ts';

export const publicEntrySchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  locationId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a location.'),
  direction: z.enum(ENTRY_DIRECTIONS),
});

export async function locationsIndex(_req: Request, res: Response): Promise<void> {
  ok(res, { locations: await locations.listActiveLocations() });
}

export async function createEntry(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof publicEntrySchema>;
  created(res, { entry: await entries.createEntry(body) });
}
