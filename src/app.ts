import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.ts';
import { createSessionMiddleware } from './config/session.ts';
import { createApiRouter } from './routes/index.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { requireAuthPage } from './middleware/requireAuthPage.ts';
import { destroySession, findSessionAdmin } from './middleware/requireAuth.ts';
import { NOINDEX_PAGE_PATHS, PAGES } from './config/pages.ts';
import { loginRateLimiter } from './middleware/rateLimit.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the served `public/` directory. */
export const PUBLIC_DIR = path.resolve(here, '..', 'public');

const NOINDEX_PATHS = new Set<string>(NOINDEX_PAGE_PATHS);

function setNoIndex(req: Request, res: Response, next: NextFunction): void {
  if (NOINDEX_PATHS.has(req.path)) {
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
}

export interface AppOptions {
  /** Override the login rate limiter (used by the tests). */
  loginRateLimiter?: RequestHandler;
  /** Override the public check-in rate limiter (used by the tests). */
  publicRateLimiter?: RequestHandler;
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

  app.use((req, res, next) => {
    if (env.nodeEnv !== 'production') {
      const path = req.path.toLowerCase();
      if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    }
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );

  // The public check-in endpoints accept a small body only: the form sends
  // six short fields, so anything larger is not a real submission. This parser
  // runs first for those paths; the global one below skips an already-read body.
  app.use('/api/public', express.json({ limit: '8kb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(options.sessionMiddleware ?? createSessionMiddleware());

  // Pages that must never be indexed: the public form and the sign-in flow.
  app.use(setNoIndex);

  app.use(
    '/api',
    createApiRouter({
      loginRateLimiter: options.loginRateLimiter ?? loginRateLimiter,
      publicRateLimiter: options.publicRateLimiter,
      passwordLimiter: options.passwordRateLimiter,
      perEmailLimiter: options.perEmailRateLimiter,
    }),
  );

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'User-agent: *',
        'Disallow: /',
        'Disallow: /checkin',
        'Disallow: /checkin.html',
        'Disallow: /login.html',
        'Disallow: /forgot-password.html',
        'Disallow: /reset-password.html',
        'Disallow: /admin',
        '',
      ].join('\n'),
    );
  });

  app.get('/manifest.webmanifest', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('application/manifest+json');
    res.sendFile(path.join(PUBLIC_DIR, 'manifest.webmanifest'));
  });

  app.get('/service-worker.js', (_req, res) => {
    res.set({
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.type('application/javascript');
    res.sendFile(path.join(PUBLIC_DIR, 'service-worker.js'));
  });

  app.get('/offline.html', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'offline.html'));
  });

  // ---- public entry point ------------------------------------------------
  // The check-in form is the root of the site. It never redirects and never
  // needs a session, so a bookmark or printed QR code keeps working forever.
  const sendCheckin = (_req: Request, res: Response): void => {
    res.sendFile(path.join(PUBLIC_DIR, 'checkin.html'));
  };
  app.get('/', sendCheckin);
  app.get('/checkin', sendCheckin);
  app.get('/checkin.html', sendCheckin);

  // ---- admin entry point -------------------------------------------------
  app.get('/admin', async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.adminId) {
      res.redirect(302, '/login.html?next=/dashboard.html');
      return;
    }

    try {
      const admin = await findSessionAdmin(req);
      if (!admin) {
        await destroySession(req);
        res.redirect(302, '/login.html?next=/dashboard.html');
        return;
      }
      res.redirect(302, '/dashboard.html');
    } catch (error) {
      next(error);
    }
  });

  app.get('/login.html', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.session?.adminId) {
        const admin = await findSessionAdmin(req);
        if (admin) {
          res.redirect(302, '/dashboard.html');
          return;
        }
        await destroySession(req);
      }
      res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
    } catch (error) {
      next(error);
    }
  });

  for (const page of PAGES) {
    // Public pages (password reset) are served without a session, everything
    // else is behind the session check.
    const guard = page.public ? (_req: Request, _res: Response, next: NextFunction) => next() : requireAuthPage;
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
