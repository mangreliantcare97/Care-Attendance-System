import type { Request, Response } from 'express';
import { z } from 'zod';
import { AdminModel, findAdminWithPassword, publicAdmin, verifyPassword } from '../models/Admin.ts';
import { createCsrfToken } from '../middleware/csrf.ts';
import { destroySession } from '../middleware/requireAuth.ts';
import { env } from '../config/env.ts';
import { HttpError, ok } from '../utils/response.ts';

export const loginSchema = z.object({
  email: z.email('Enter a valid email address').max(255),
  password: z.string().min(1, 'Enter your password').max(200),
});

/**
 * A real bcrypt hash of a random string. Verifying against it when the email
 * is unknown keeps the response time of "no such user" and "wrong password"
 * roughly identical, so the endpoint cannot be used to enumerate accounts.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.fKlQTFVXqL4i4jJkjL1zO3wqNJkD9hPC';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.valid.body as z.infer<typeof loginSchema>;

  const admin = await findAdminWithPassword(email);
  if (!admin) {
    await verifyPassword(password, DUMMY_HASH);
    throw new HttpError(401, 'invalid_credentials', 'Those credentials do not match our records.');
  }

  const matches = await verifyPassword(password, admin.password);
  if (!matches) {
    throw new HttpError(401, 'invalid_credentials', 'Those credentials do not match our records.');
  }

  if (!admin.isActive) {
    throw new HttpError(403, 'account_disabled', 'This account has been deactivated. Please contact an administrator.');
  }

  // Only administrators can sign in. This also protects against a legacy
  // database row that predates the single-role model.
  if (admin.role !== 'admin') {
    throw new HttpError(403, 'forbidden', 'Administrator access is required to sign in.');
  }

  // New session id on every login — defeats session fixation.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });

  req.session.adminId = String(admin._id);
  req.session.csrfToken = createCsrfToken();

  await new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

  admin.lastLoginAt = new Date();
  await admin.save();

  ok(res, { admin: publicAdmin(admin) }, { csrfToken: req.session.csrfToken });
}

/**
 * Sign out.
 *
 * Deliberately idempotent and CSRF exempt: signing out must always work, even
 * when the session was already invalidated server-side.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  await destroySession(req);
  res.clearCookie(env.sessionCookieName, { path: '/' });
  ok(res, { loggedOut: true });
}

/** The signed-in admin plus a fresh CSRF token. */
export async function me(req: Request, res: Response): Promise<void> {
  const admin = await AdminModel.findById(req.admin!.id).lean();
  if (!admin) {
    throw new HttpError(401, 'unauthenticated', 'You must be signed in to continue.');
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = createCsrfToken();
  }

  ok(
    res,
    { admin: publicAdmin(admin), timezone: env.appTimezone },
    { csrfToken: req.session.csrfToken },
  );
}
