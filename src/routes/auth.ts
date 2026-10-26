import { Router, type RequestHandler } from 'express';
import { login, logout, me, loginSchema } from '../controllers/authController.ts';
import {
  forgotPassword,
  forgotPasswordSchema,
  resetPassword,
  resetPasswordSchema,
} from '../controllers/passwordController.ts';
import { validate } from '../utils/validation.ts';
import { requireAuth } from '../middleware/requireAuth.ts';
import {
  createApiRateLimiter,
  createLoginRateLimiter,
  createPerEmailRateLimiter,
} from '../middleware/rateLimit.ts';

export interface AuthRouterOptions {
  loginLimiter?: RequestHandler;
  passwordLimiter?: RequestHandler;
  perEmailLimiter?: RequestHandler;
}

/** Build the auth router. The limiters can be replaced (tests). */
export function createAuthRouter(options: AuthRouterOptions = {}): Router {
  const router = Router();
  const loginLimiter = options.loginLimiter ?? createLoginRateLimiter();
  const passwordLimiter = options.passwordLimiter ?? createApiRateLimiter();
  const perEmailLimiter = options.perEmailLimiter ?? createPerEmailRateLimiter();

  router.post('/login', loginLimiter, validate(loginSchema, 'body'), login);
  router.post('/logout', logout);
  router.get('/me', requireAuth, me);

  // Password reset — no session, so no CSRF token, but rate limited per IP
  // and per email address.
  router.post(
    '/forgot-password',
    passwordLimiter,
    perEmailLimiter,
    validate(forgotPasswordSchema, 'body'),
    forgotPassword,
  );
  router.post('/reset-password', passwordLimiter, validate(resetPasswordSchema, 'body'), resetPassword);

  return router;
}
