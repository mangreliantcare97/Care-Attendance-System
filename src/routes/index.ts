import { Router, type RequestHandler } from 'express';
import { createAuthRouter, type AuthRouterOptions } from './auth.ts';
import { adminsRouter } from './admins.ts';
import { entriesRouter } from './entries.ts';
import { locationsRouter } from './locations.ts';
import { dashboardRouter } from './dashboard.ts';
import { publicRouter } from './public.ts';
import { requireCsrf } from '../middleware/csrf.ts';
import { requireAuth } from '../middleware/requireAuth.ts';
import { publicRateLimiter } from '../middleware/rateLimit.ts';

/** Endpoints that run without a session — they cannot present a CSRF token. */
const PUBLIC_API_PATHS = new Set([
  '/health',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

function isPublicApi(path: string): boolean {
  return PUBLIC_API_PATHS.has(path) || path.startsWith('/public/');
}

/** A logout without a live session needs neither auth nor CSRF. */
function isAnonymousLogout(path: string, hasCsrfToken: boolean): boolean {
  return path === '/auth/logout' && !hasCsrfToken;
}

export interface ApiRouterOptions extends AuthRouterOptions {
  loginRateLimiter?: RequestHandler;
  /** Override the public check-in limiter (used by the tests). */
  publicRateLimiter?: RequestHandler;
}

/** Build the API router. The limiters can be replaced (tests). */
export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const router = Router();

  /** Liveness probe — used by the host to check the service. */
  router.get('/health', async (_req, res) => {
    const mongoose = (await import('mongoose')).default;
    const dbState = mongoose.connection.readyState;
    const dbConnected = dbState === 1;
    let dbName: string | undefined;
    try {
      dbName = mongoose.connection.name || mongoose.connection.db?.databaseName;
    } catch {}
    res.status(200).json({
      success: true,
      data: {
        status: dbConnected ? 'ok' : 'degraded',
        uptime: Math.round(process.uptime()),
        db: {
          connected: dbConnected,
          readyState: dbState,
          name: dbName,
        },
      },
    });
  });

  /**
   * Authentication runs before CSRF for protected APIs. An anonymous
   * state-changing request is therefore a 401, not a misleading 403 about a
   * token it was never given.
   */
  router.use((req, res, next) => {
    if (isPublicApi(req.path) || isAnonymousLogout(req.path, Boolean(req.session?.csrfToken))) {
      next();
      return;
    }
    void requireAuth(req, res, next);
  });

  /**
   * CSRF protection for every state-changing protected API request.
   *
   * The endpoints that run without a session are the exception — there is no
   * token to compare against. `POST /api/auth/logout` only needs the token
   * while a session is still alive.
   */
  router.use((req, res, next) => {
    if (isPublicApi(req.path) || isAnonymousLogout(req.path, Boolean(req.session?.csrfToken))) {
      next();
      return;
    }
    requireCsrf(req, res, next);
  });

  router.use('/public', options.publicRateLimiter ?? publicRateLimiter, publicRouter);
  router.use(
    '/auth',
    createAuthRouter({
      loginLimiter: options.loginLimiter ?? options.loginRateLimiter,
      passwordLimiter: options.passwordLimiter,
      perEmailLimiter: options.perEmailLimiter,
    }),
  );
  router.use('/admins', adminsRouter);
  router.use('/entries', entriesRouter);
  router.use('/locations', locationsRouter);
  router.use('/dashboard', dashboardRouter);

  return router;
}
