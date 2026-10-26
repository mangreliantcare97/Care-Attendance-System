import { Router } from 'express';
import * as publicApi from '../controllers/publicController.ts';
import { validate } from '../utils/validation.ts';

/**
 * Cookie-free public endpoints. They are mounted before the admin auth gate
 * and never read or write a session.
 */
export const publicRouter = Router();

publicRouter.get('/locations', publicApi.locationsIndex);
publicRouter.post('/entries', validate(publicApi.publicEntrySchema, 'body'), publicApi.createEntry);
