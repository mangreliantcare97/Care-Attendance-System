import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PasswordResetModel } from '../models/PasswordReset.ts';
import { env } from '../config/env.ts';

/** SHA-256 of a token — the only thing that is ever stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create a reset token for an administrator.
 *
 * The plain token is returned once and only its hash is stored. Any token
 * that was issued before is removed, so only the newest link works.
 */
export async function createResetToken(adminId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await PasswordResetModel.deleteMany({ adminId });
  await PasswordResetModel.create({
    adminId,
    tokenHash,
    expiresAt: new Date(Date.now() + env.passwordReset.ttlMinutes * 60 * 1000),
  });

  return token;
}

/**
 * Validate a token and consume it.
 *
 * Returns the admin id when the token was valid, `null` otherwise. A token
 * can only be used once — it is removed as soon as it is consumed.
 */
export async function consumeResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const record = await PasswordResetModel.findOne({ tokenHash });
  if (!record) return null;

  // Constant time comparison of the stored hash with the computed one.
  const stored = Buffer.from(record.tokenHash, 'utf8');
  const computed = Buffer.from(tokenHash, 'utf8');
  if (stored.length !== computed.length || !timingSafeEqual(stored, computed)) {
    return null;
  }

  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) {
    await record.deleteOne();
    return null;
  }

  await record.deleteOne();
  return String(record.adminId);
}

/** Remove every reset token of an administrator. */
export async function deleteTokensForAdmin(adminId: string): Promise<void> {
  await PasswordResetModel.deleteMany({ adminId });
}

/**
 * The reset link is always built from `APP_BASE_URL` — never from the request
 * headers, so a forged `Host` header cannot send an admin to a hostile site.
 */
export function buildResetLink(token: string): string {
  return `${env.appBaseUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
}
