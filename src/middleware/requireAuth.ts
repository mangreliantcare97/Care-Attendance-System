import type { Request, Response, NextFunction } from 'express';
import { AdminModel } from '../models/Admin.ts';
import { fail } from '../utils/response.ts';

export interface SessionAdmin {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  isActive: boolean;
}

/**
 * Re-read the admin behind the session cookie.
 *
 * The database is consulted on every request so that deactivating an admin
 * revokes access immediately instead of when the cookie expires.
 */
export async function findSessionAdmin(req: Request): Promise<SessionAdmin | null> {
  const adminId = req.session?.adminId;
  if (!adminId) return null;

  const admin = await AdminModel.findById(adminId).lean();
  if (!admin || !admin.isActive || admin.role !== 'admin') return null;

  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
  };
}

/**
 * Require a signed-in admin.
 *
 * The admin record is re-read on every request so that deactivating an admin
 * revokes their access immediately instead of when the cookie expires.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // The API router authenticates before CSRF; the per-router guards can reuse
  // that result instead of hitting the database twice.
  if (req.admin) {
    next();
    return;
  }

  const adminId = req.session?.adminId;
  if (!adminId) {
    fail(res, 401, 'unauthenticated', 'You must be signed in to continue.');
    return;
  }

  try {
    const admin = await findSessionAdmin(req);
    if (!admin) {
      await destroySession(req);
      fail(res, 401, 'session_revoked', 'This session is no longer valid. Please sign in again.');
      return;
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Defence in depth: normal sessions can only belong to an `admin`. Legacy
 * database rows with another role are rejected here as well as at login.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.admin) {
    fail(res, 401, 'unauthenticated', 'You must be signed in to continue.');
    return;
  }
  if (req.admin.role !== 'admin') {
    fail(res, 403, 'forbidden', 'Administrator access is required for this action.');
    return;
  }
  next();
}

/** Destroy the current session and clear the cookie. */
export async function destroySession(req: Request): Promise<void> {
  const session = req.session;
  if (!session) return;
  await new Promise<void>((resolve) => {
    session.destroy(() => resolve());
  });
}
