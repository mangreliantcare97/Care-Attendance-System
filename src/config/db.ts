import mongoose from 'mongoose';
import { env } from './env.ts';

/**
 * Open the shared mongoose connection.
 *
 * The connection must be established *before* the express app is created,
 * because the session store and every model depend on it.
 *
 * `autoIndex` and `autoCreate` can be turned off for maintenance scripts:
 * otherwise mongoose builds the model indexes and creates missing collections
 * as soon as it connects, which would make a `--dry-run` migration write to
 * the database before its planning starts.
 */
export async function connectDatabase(
  uri: string = env.mongodbUri,
  options: { autoIndex?: boolean; autoCreate?: boolean } = {},
): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: options.autoIndex ?? !env.isProduction,
    autoCreate: options.autoCreate ?? true,
  });
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export { mongoose };
