import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ENTRY_DIRECTIONS, ENTRY_USER_TYPES } from '../models/Entry.ts';
import * as entries from '../services/entries.ts';
import * as locations from '../services/locations.ts';
import { created, ok } from '../utils/response.ts';
import { today } from '../utils/dates.ts';
import { env } from '../config/env.ts';

const OBJECT_ID = /^[a-f\d]{24}$/i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Strict: unknown keys are rejected, every field is required. */
export const publicEntrySchema = z
  .object({
    userType: z.enum(ENTRY_USER_TYPES, { message: 'Choose a user type.' }),
    name: z
      .string({ message: 'Enter your name.' })
      .trim()
      .min(2, 'Enter a name of at least 2 characters.')
      .max(80, 'The name must be 80 characters or fewer.')
      .refine((value) => !CONTROL_CHARS.test(value), 'That name contains characters that are not allowed.'),
    direction: z.enum(ENTRY_DIRECTIONS, { message: 'Choose check in or check out.' }),
    time: z
      .string({ message: 'Choose a time.' })
      .regex(CLOCK, 'Choose a valid time.'),
    locationId: z
      .string({ message: 'Choose a location.' })
      .regex(OBJECT_ID, 'Choose an active location.'),
    notes: z
      .string({ message: 'Enter a note.' })
      .trim()
      .min(1, 'Enter a note for the record.')
      .max(500, 'Notes must be 500 characters or fewer.'),
    /** Hidden honeypot — a filled value means a bot. */
    company: z.string().max(200).optional(),
    turnstileToken: z.string().max(2000).optional(),
  })
  .strict();

/**
 * Active locations for the public form: id and name only.
 *
 * `meta.timezone` carries `APP_TIMEZONE` so the browser can fill the "Now"
 * button with the server's clock instead of the device's; `data` keeps the
 * documented `{ locations: [...] }` shape.
 */
export async function locationsIndex(_req: unknown, res: Response): Promise<void> {
  ok(res, { locations: await locations.listActiveLocations() }, { timezone: env.appTimezone });
}

/**
 * The answer a honeypot submission gets: identical in shape to a real
 * confirmation, but nothing is stored.
 */
export function honeypotAnswer(res: Response): void {
  const body = res.req.body as Record<string, unknown>;
  created(res, {
    entry: {
      id: new Types.ObjectId().toHexString(),
      name: String(body.name ?? '').trim() || 'Visitor',
      direction: body.direction === 'out' ? 'out' : 'in',
      time: String(body.time ?? '00:00'),
      date: today(env.appTimezone),
    },
  });
}

/** Record one public check-in or check-out. */
export async function createEntry(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof publicEntrySchema>;
  const entry = await entries.createPublicEntry({
    userType: body.userType,
    name: body.name,
    direction: body.direction,
    time: body.time,
    locationId: body.locationId,
    notes: body.notes,
  });

  // No name, no location and no address in the log — only what the request was.
  console.log('[public] entry accepted', {
    userType: body.userType,
    direction: body.direction,
    date: entry.date,
  });

  created(res, { entry });
}
