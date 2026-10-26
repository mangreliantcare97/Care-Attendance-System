import type { Request, Response } from 'express';
import { z } from 'zod';
import * as locations from '../services/locations.ts';
import { ok } from '../utils/response.ts';

export const locationIdSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That location id is not valid.'),
});

export const createLocationSchema = z.object({
  name: z.string().trim().min(2, 'Enter a location name.').max(120),
  isActive: z.boolean().optional(),
  note: z.string().trim().max(500).nullish(),
});

export const updateLocationSchema = createLocationSchema.partial();

export async function index(_req: Request, res: Response): Promise<void> {
  ok(res, { locations: await locations.listLocations() });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.valid.body as z.infer<typeof createLocationSchema>;
  ok(res, { location: await locations.createLocation(body) });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof locationIdSchema>;
  const body = req.valid.body as z.infer<typeof updateLocationSchema>;
  ok(res, { location: await locations.updateLocation(id, body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = req.valid.params as z.infer<typeof locationIdSchema>;
  ok(res, await locations.deleteLocation(id));
}
