import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { fail } from '../utils/response.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Create a fresh, unguessable CSRF token. */
export function createCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Double-submit CSRF protection for every state-changing API request.
 *
 * The token is issued at login, handed to the browser by `GET /api/auth/me` and
 * has to be echoed back in the `X-CSRF-Token` header.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const expected = req.session?.csrfToken;
  const provided = req.get('X-CSRF-Token');

  if (!expected || !provided || !tokensMatch(provided, expected)) {
    fail(res, 403, 'csrf_token_mismatch', 'Your security token is missing or invalid. Please reload the page and try again.');
    return;
  }

  next();
}
