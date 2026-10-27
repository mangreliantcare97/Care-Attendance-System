import { createHash } from 'node:crypto';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.ts';
import { fail } from '../utils/response.ts';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
}

/**
 * Brute-force protection for the login endpoint.
 *
 * The limiter is a factory so tests (and future endpoints) can use their own
 * budget without touching the global configuration.
 */
export function createLoginRateLimiter(options: RateLimiterOptions = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? env.loginRateLimit.windowMs,
    limit: options.max ?? env.loginRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      fail(res, 429, 'too_many_requests', 'Too many login attempts. Please wait a few minutes and try again.');
    },
  });
}

export const loginRateLimiter = createLoginRateLimiter();

/**
 * Abuse protection for the cookie-free public endpoints.
 *
 * The default budget is deliberately generous (an office shares one IP), and
 * the same limiter covers the locations feed and the entry submission.
 */
export function createPublicRateLimiter(options: RateLimiterOptions = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? env.publicRateLimit.windowMs,
    limit: options.max ?? env.publicRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      fail(res, 429, 'too_many_requests', 'Too many requests. Please wait a few minutes and try again.');
    },
  });
}

export const publicRateLimiter = createPublicRateLimiter();

/** A generic limiter for the unauthenticated password endpoints. */
export function createApiRateLimiter(options: RateLimiterOptions = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? env.passwordReset.rateLimitWindowMs,
    limit: options.max ?? env.passwordReset.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      fail(res, 429, 'too_many_requests', 'Too many requests. Please wait a few minutes and try again.');
    },
  });
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limit how often a single email address may ask for a reset link.
 *
 * The key is the SHA-256 of the address, so the raw address never has to be
 * kept in memory.
 */
export function createPerEmailRateLimiter(options: RateLimiterOptions = {}): RequestHandler {
  const windowMs = options.windowMs ?? env.passwordReset.rateLimitWindowMs;
  const max = options.max ?? env.passwordReset.rateLimitMax;
  const buckets = new Map<string, Bucket>();

  return (req, res, next): void => {
    const raw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const key = createHash('sha256').update(raw).digest('hex');
    const now = Date.now();

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else if (bucket.count >= max) {
      fail(res, 429, 'too_many_requests', 'Too many requests for this address. Please wait a few minutes and try again.');
      return;
    } else {
      bucket.count += 1;
    }

    // Keep the map from growing forever.
    if (buckets.size > 10_000) {
      for (const [entryKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(entryKey);
      }
    }

    next();
  };
}
