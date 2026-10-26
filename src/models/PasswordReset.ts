import { Schema, model, type InferSchemaType } from 'mongoose';
import { applyJsonTransform } from './plugins.ts';

/**
 * Password reset tokens.
 *
 * Only the SHA-256 hash of the token is stored — the plain token exists only
 * in the mail that is sent out. The TTL index removes the record 30 minutes
 * after it was created.
 */
const passwordResetSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    /** SHA-256 of the random token — never the token itself. */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** MongoDB removes the document once `expiresAt` is reached. */
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

applyJsonTransform(passwordResetSchema);

export type PasswordReset = InferSchemaType<typeof passwordResetSchema>;

export const PasswordResetModel = model('PasswordReset', passwordResetSchema);
