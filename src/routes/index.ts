import { Router, type RequestHandler } from 'express';
import { createAuthRouter, type AuthRouterOptions } from './auth.ts';
import { adminsRouter } from './admins.ts';
import { departmentsRouter } from './departments.ts';
import { employeesRouter } from './employees.ts';
import { attendanceRouter } from './attendance.ts';
import { overtimeRouter } from './overtime.ts';
import { leavesRouter } from './leaves.ts';
import { calendarRouter, eventsRouter } from './calendar.ts';
import { dashboardRouter } from './dashboard.ts';
import { reportsRouter } from './reports.ts';
import { entriesRouter } from './entries.ts';
import { locationsRouter } from './locations.ts';
import { publicRouter } from './public.ts';
import { requireCsrf } from '../middleware/csrf.ts';
import { requireAuth } from '../middleware/requireAuth.ts';

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
}

/** Build the API router. The limiters can be replaced (tests). */
export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const router = Router();

  /** Liveness probe — used by the host to check the service. */
  router.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      data: { status: 'ok', uptime: Math.round(process.uptime()) },
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

  router.use('/public', publicRouter);
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
  router.use('/departments', departmentsRouter);
  router.use('/employees', employeesRouter);
  router.use('/attendance', attendanceRouter);
  router.use('/overtime', overtimeRouter);
  router.use('/leaves', leavesRouter);
  router.use('/calendar', calendarRouter);
  router.use('/events', eventsRouter);
  router.use('/dashboard', dashboardRouter);
  router.use('/reports', reportsRouter);

  return router;
}
