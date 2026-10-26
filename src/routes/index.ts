import { Router, type RequestHandler } from 'express';
import { createAuthRouter, type AuthRouterOptions } from './auth.ts';
import { adminsRouter } from './admins.ts';
import { departmentsRouter } from './departments.ts';
import { studentsRouter } from './students.ts';
import { attendanceRouter } from './attendance.ts';
import { overtimeRouter } from './overtime.ts';
import { leavesRouter } from './leaves.ts';
import { calendarRouter, eventsRouter } from './calendar.ts';
import { dashboardRouter } from './dashboard.ts';
import { reportsRouter } from './reports.ts';
import { requireCsrf } from '../middleware/csrf.ts';

/** Endpoints that run without a session — they cannot present a CSRF token. */
const CSRF_EXEMPT = ['/auth/login', '/auth/forgot-password', '/auth/reset-password'];

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
   * CSRF protection for every state-changing API request.
   *
   * The endpoints that run without a session are the exception — there is no
   * token to compare against. `POST /api/auth/logout` only needs the token
   * while a session is still alive.
   */
  router.use((req, res, next) => {
    if (CSRF_EXEMPT.includes(req.path)) {
      next();
      return;
    }
    if (req.path === '/auth/logout' && !req.session?.csrfToken) {
      next();
      return;
    }
    requireCsrf(req, res, next);
  });

  router.use(
    '/auth',
    createAuthRouter({
      loginLimiter: options.loginLimiter ?? options.loginRateLimiter,
      passwordLimiter: options.passwordLimiter,
      perEmailLimiter: options.perEmailLimiter,
    }),
  );
  router.use('/admins', adminsRouter);
  router.use('/departments', departmentsRouter);
  router.use('/students', studentsRouter);
  router.use('/attendance', attendanceRouter);
  router.use('/overtime', overtimeRouter);
  router.use('/leaves', leavesRouter);
  router.use('/calendar', calendarRouter);
  router.use('/events', eventsRouter);
  router.use('/dashboard', dashboardRouter);
  router.use('/reports', reportsRouter);

  return router;
}
