import session from 'express-session';
import MongoStore from 'connect-mongo';
import { mongoose } from './db.ts';
import { env } from './env.ts';

let store: MongoStore | null = null;

/**
 * Create the connect-mongo session store.
 *
 * `stringify: false` keeps the session payload as a real BSON document so that
 * individual sessions can be revoked by admin id (see `destroySessionsForAdmin`).
 */
export function createSessionStore(): MongoStore {
  store = MongoStore.create({
    client: mongoose.connection.getClient(),
    collectionName: 'sessions',
    ttl: env.sessionMaxHours * 60 * 60,
    touchAfter: 60,
    stringify: false,
    autoRemove: 'native',
  });
  return store;
}

export function getSessionStore(): MongoStore {
  if (!store) {
    throw new Error('Session store has not been created yet — call createSessionStore() first.');
  }
  return store;
}

/** Build the express-session middleware. */
export function createSessionMiddleware() {
  return session({
    name: env.sessionCookieName,
    secret: env.sessionSecret,
    store: createSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: env.trustProxy > 0,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      maxAge: env.sessionMaxHours * 60 * 60 * 1000,
    },
  });
}

/**
 * Revoke every session belonging to an admin.
 *
 * Used when an admin is deactivated so their access ends immediately instead of
 * when their cookie happens to expire.
 */
export async function destroySessionsForAdmin(adminId: string): Promise<number> {
  return destroySessionsForAdmins([adminId]);
}

/** Revoke every session belonging to any of the given admins in one write. */
export async function destroySessionsForAdmins(adminIds: string[]): Promise<number> {
  if (!adminIds.length) return 0;
  const collection = await getSessionStore().collectionP;
  const result = await collection.deleteMany({ 'session.adminId': { $in: adminIds } });
  return result.deletedCount ?? 0;
}
