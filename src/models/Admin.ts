import { Schema, model, type InferSchemaType } from 'mongoose';
import bcrypt from 'bcryptjs';
import { applyJsonTransform } from './plugins.ts';

const BCRYPT_ROUNDS = 12;

/**
 * Admins are the only accounts that can log in. They are deliberately kept
 * separate from `employees`, which are HR records and never authenticate.
 */
const adminSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** bcrypt hash — never selected by default and never serialised. */
    password: { type: String, required: true, select: false },
    /** Deactivated admins lose access immediately, even with a live session. */
    isActive: { type: Boolean, default: true },
    /** There is exactly one role: every account that can sign in is an admin. */
    role: { type: String, enum: ['admin'], default: 'admin' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applyJsonTransform(adminSchema, (ret) => {
  delete ret.password;
});

export type Admin = InferSchemaType<typeof adminSchema>;

export const AdminModel = model('Admin', adminSchema);

/** Find an admin together with the password hash (used by the login flow). */
export function findAdminWithPassword(email: string) {
  return AdminModel.findOne({ email: email.trim().toLowerCase() }).select('+password');
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** The public shape of an admin — safe to send to the browser. */
export function publicAdmin(admin: {
  _id: unknown;
  name: string;
  email: string;
  role: 'admin';
  isActive: boolean;
  lastLoginAt?: Date | null;
}) {
  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt ?? null,
  };
}
