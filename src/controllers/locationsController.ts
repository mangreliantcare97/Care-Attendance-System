import type { Request, Response } from 'express';
import { z } from 'zod';
import * as locations from '../services/locations.ts';
import { ok } from '../utils/response.ts';
import { isValidUkPostcode, normalisePostcode } from '../utils/postcode.ts';

export const locationIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That location id is not valid.'),
});

const nameSchema = z
  .string()
  .trim()
  .min(3, 'Enter a location name of at least 3 characters.')
  .max(160, 'The location name must be 160 characters or fewer.');

const postcodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter a valid UK postcode.')
  .transform(normalisePostcode)
  .refine(isValidUkPostcode, 'Enter a valid UK postcode.');

const sortOrderSchema = z.coerce.number().int().min(0).max(100_000);

export const createLocationSchema = z
  .object({
    name: nameSchema,
    postcode: postcodeSchema,
    active: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
  })
  .strict();

export const updateLocationSchema = createLocationSchema.partial();

export async function index(_req: Request, res: Response): Promise<void> {
  ok(res, { locations: await locations.listLocations() });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createLocationSchema>;
  ok(res, { location: await locations.createLocation(body, req.admin!.id) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof locationIdSchema>;
  const body = req.valid.body as z.infer<typeof updateLocationSchema>;
  ok(res, { location: await locations.updateLocation(id, body, req.admin!.id) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof locationIdSchema>;
  ok(res, await locations.deleteLocation(id));
}
