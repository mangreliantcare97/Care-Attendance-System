import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { env } from '../config/env.ts';
import * as publicApi from '../controllers/publicController.ts';
import { validate } from '../utils/validation.ts';
import { fail } from '../utils/response.ts';

/** The origin of `APP_BASE_URL`, or '' when it cannot be parsed. */
function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

const APP_ORIGIN = originOf(env.appBaseUrl);

/**
 * Refuse a browser request that comes from another site.
 *
 * Only a present `Origin` header is checked: a missing one means a non-browser
 * client (curl, a test), and same-origin form posts always carry our own
 * origin. This is what stops another page from submitting entries as us.
 */
function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  if (originOf(origin) === APP_ORIGIN && APP_ORIGIN !== '') {
    next();
    return;
  }

  fail(res, 403, 'cross_site_request', 'This request came from another site and was not accepted.');
}

/**
 * Silently accept and discard a submission that filled the hidden field.
 *
 * The answer looks exactly like a real confirmation, so a bot learns nothing;
 * no record is written.
 */
function honeypot(req: Request, res: Response, next: NextFunction): void {
  if (typeof req.body?.company === 'string' && req.body.company.trim() !== '') {
    publicApi.honeypotAnswer(res);
    return;
  }
  next();
}

/**
 * Optional Cloudflare Turnstile verification.
 *
 * Off unless `TURNSTILE_SECRET` is set; when it is, a missing or rejected
 * token is refused. The secret never leaves the server.
 */
async function verifyTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!env.turnstileSecret) {
    next();
    return;
  }

  const token = typeof req.body?.turnstileToken === 'string' ? req.body.turnstileToken : '';
  if (!token) {
    fail(res, 403, 'turnstile_required', 'Please complete the security check and try again.');
    return;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.turnstileSecret, response: token }),
    });
    const result = (await response.json()) as { success?: boolean };

    if (!result.success) {
      fail(res, 403, 'turnstile_failed', 'The security check failed. Please try again.');
      return;
    }
    next();
  } catch {
    fail(res, 503, 'turnstile_unavailable', 'The security check could not be verified. Please try again.');
  }
}

/**
 * Cookie-free public endpoints.
 *
 * They are mounted before the admin auth gate, never read or write a session
 * and are covered by one shared per-IP rate limiter (applied by the API
 * router). The body limit for these routes is set in `app.ts`.
 */
export const publicRouter = Router();

publicRouter.use(requireSameOrigin);
publicRouter.get('/locations', publicApi.locationsIndex);
publicRouter.post(
  '/entries',
  honeypot,
  verifyTurnstile,
  validate(publicApi.publicEntrySchema, 'body', 400),
  publicApi.createEntry,
);
