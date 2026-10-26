import type { Request, Response, NextFunction } from 'express';
import { destroySession, findSessionAdmin } from './requireAuth.ts';

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
    const admin = await findSessionAdmin(req);
    if (!admin) {
      await destroySession(req);
      redirect();
      return;
    }
    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}
