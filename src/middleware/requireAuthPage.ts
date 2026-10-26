import type { Request, Response, NextFunction } from 'express';
import { AdminModel } from '../models/Admin.ts';
import { destroySession } from './requireAuth.ts';

/**
 * Guard for the static HTML pages.
 *
 * The pages are plain files, so the session has to be checked before they are
 * served. Unauthenticated visitors are redirected to the login page instead of
 * seeing the shell.
 */
export async function requireAuthPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminId = req.session?.adminId;
  const redirect = (): void => {
    const target = encodeURIComponent(req.originalUrl || '/dashboard.html');
    res.redirect(302, `/login.html?next=${target}`);
  };

  if (!adminId) {
    redirect();
    return;
  }

  try {
    const admin = await AdminModel.findById(adminId).lean();
    if (!admin || !admin.isActive) {
      await destroySession(req);
      redirect();
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
