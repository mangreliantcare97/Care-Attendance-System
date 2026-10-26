import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.ts';
import { createSessionMiddleware } from './config/session.ts';
import { createApiRouter } from './routes/index.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { requireAuthPage } from './middleware/requireAuthPage.ts';
import { PAGES } from './config/pages.ts';
import { loginRateLimiter } from './middleware/rateLimit.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the served `public/` directory. */
export const PUBLIC_DIR = path.resolve(here, '..', 'public');

export interface AppOptions {
  /** Override the login rate limiter (used by the tests). */
  loginRateLimiter?: RequestHandler;
  /** Override the rate limiter of the password endpoints (used by the tests). */
  passwordRateLimiter?: RequestHandler;
  /** Override the per email rate limiter (used by the tests). */
  perEmailRateLimiter?: RequestHandler;
  /** Override the session middleware (used by the tests). */
  sessionMiddleware?: RequestHandler;
}

/**
 * Content Security Policy.
 *
 * Everything is served from our own origin — AdminLTE, Bootstrap, jQuery, the
 * webfont and all scripts are vendored, so no third party is ever contacted.
 *
 * Scripts: strictly same origin. There is not a single inline `<script>` or
 * `onclick=` handler in the app, and none of the vendored libraries use
 * `eval`/`new Function`, so `'unsafe-inline'` and `'unsafe-eval'` are not
 * needed and are not granted.
 *
 * Styles: AdminLTE, Bootstrap (modals, dropdowns) and Chart.js set element
 * styles from JavaScript, and the login screen carries an inline `<style>`
 * block — so inline styles are allowed, and that is the only relaxation.
 */
const contentSecurityPolicy = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    /** No inline event handlers (onclick=…) anywhere. */
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    styleSrcAttr: ["'unsafe-inline'"],
    styleSrcElem: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: env.isProduction ? [] : null,
  },
};

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  // Behind a single reverse proxy (Render, Heroku, nginx, …).
  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(options.sessionMiddleware ?? createSessionMiddleware());

  app.use(
    '/api',
    createApiRouter({
      loginRateLimiter: options.loginRateLimiter ?? loginRateLimiter,
      passwordLimiter: options.passwordRateLimiter,
      perEmailLimiter: options.perEmailRateLimiter,
    }),
  );

  // ---- static pages -------------------------------------------------------
  app.get('/login.html', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  });

  app.get('/', (_req, res) => {
    res.redirect(302, '/dashboard.html');
  });

  for (const page of PAGES) {
    // Public pages (password reset) are served without a session, everything
    // else is behind the session check.
    const guard = page.public ? (_req: Request, res: Response, next: NextFunction) => next() : requireAuthPage;
    app.get(`/${page.file}`, guard, (_req, res) => {
      for (const [name, value] of Object.entries(page.headers ?? {})) {
        res.set(name, value);
      }
      res.sendFile(path.join(PUBLIC_DIR, page.file));
    });
  }

  // ---- static assets ------------------------------------------------------
  const staticOptions = { index: false, maxAge: env.isProduction ? '7d' : 0, fallthrough: true };
  app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), staticOptions));
  app.use('/vendor', express.static(path.join(PUBLIC_DIR, 'vendor'), staticOptions));
  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), staticOptions));
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), staticOptions));
  app.use('/partials', express.static(path.join(PUBLIC_DIR, 'partials'), staticOptions));
  app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), staticOptions));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
