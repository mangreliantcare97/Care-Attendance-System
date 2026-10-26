import type { Request, Response } from 'express';
import { z } from 'zod';
import { AdminModel, hashPassword } from '../models/Admin.ts';
import { destroySessionsForAdmin } from '../config/session.ts';
import { getMailer, sendQuietly } from '../services/mailer.ts';
import { buildResetLink, consumeResetToken, createResetToken, deleteTokensForAdmin } from '../services/passwordReset.ts';
import { escapeHtml } from '../utils/escape.ts';
import { HttpError, ok } from '../utils/response.ts';

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address.').max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f\d]{64}$/i, 'This reset link is not valid.'),
  // The same policy as when an administrator is created.
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});

/** The one answer the endpoint gives — for every address, known or not. */
const FORGOT_PASSWORD_MESSAGE =
  'If an administrator account exists for that address, a password reset link has been sent.';

/**
 * Every answer takes at least this long, so the response time does not
 * reveal whether the address belongs to an administrator.
 */
const MINIMUM_RESPONSE_TIME_MS = 250;

async function waitFor(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Ask for a password reset link.
 *
 * The answer is always the same and always 200 — for an unknown address, for
 * an employee address and for an inactive administrator. Only an active
 * administrator actually receives a mail.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const { email } = req.valid.body as z.infer<typeof forgotPasswordSchema>;
  const normalised = email.trim().toLowerCase();

  const admin = await AdminModel.findOne({ email: normalised }).lean();

  if (admin && admin.isActive) {
    const token = await createResetToken(String(admin._id));
    const link = buildResetLink(token);
    const name = escapeHtml(admin.name);

    sendQuietly(getMailer(), {
      to: normalised,
      subject: 'Reset your administrator password',
      text: [
        `Hello ${admin.name},`,
        '',
        'Somebody asked to reset the password of your administrator account.',
        'Open the link below to choose a new password:',
        '',
        link,
        '',
        `The link is valid for 30 minutes. If you did not ask for it, you can ignore this mail — nothing has changed.`,
      ].join('\n'),
      html: [
        `<p>Hello ${name},</p>`,
        '<p>Somebody asked to reset the password of your administrator account.</p>',
        '<p>Open the link below to choose a new password:</p>',
        `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
        '<p>The link is valid for 30 minutes. If you did not ask for it, you can ignore this mail — nothing has changed.</p>',
      ].join(''),
    });
  }

  await waitFor(MINIMUM_RESPONSE_TIME_MS - (Date.now() - startedAt));
  ok(res, { message: FORGOT_PASSWORD_MESSAGE });
}

/**
 * Set a new password with a reset token.
 *
 * Afterwards every session of that administrator is destroyed and a notice
 * mail is sent. The administrator is not signed in automatically.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = req.valid.body as z.infer<typeof resetPasswordSchema>;

  const adminId = await consumeResetToken(token);
  if (!adminId) {
    throw new HttpError(400, 'invalid_token', 'This reset link is invalid or has expired.');
  }

  const admin = await AdminModel.findById(adminId).select('+password');
  if (!admin || !admin.isActive) {
    throw new HttpError(400, 'invalid_token', 'This reset link is invalid or has expired.');
  }

  admin.password = await hashPassword(password);
  await admin.save();

  // Every session of that administrator is signed out.
  const revokedSessions = await destroySessionsForAdmin(adminId);
  await deleteTokensForAdmin(adminId);

  sendQuietly(getMailer(), {
    to: admin.email,
    subject: 'Your password was changed',
    text: [
      `Hello ${admin.name},`,
      '',
      'The password of your administrator account was just changed.',
      'All other sessions have been signed out.',
      'If this was not you, contact your system administrator immediately.',
    ].join('\n'),
    html: [
      `<p>Hello ${escapeHtml(admin.name)},</p>`,
      '<p>The password of your administrator account was just changed and all other sessions have been signed out.</p>',
      '<p>If this was not you, contact your system administrator immediately.</p>',
    ].join(''),
  });

  ok(res, {
    message: 'Your password has been changed. Please sign in with your new password.',
    revokedSessions,
  });
}
