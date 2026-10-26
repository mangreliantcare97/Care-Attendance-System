import mongoose from 'mongoose';
import { env } from './env.ts';

/**
 * Open the shared mongoose connection.
 *
 * The connection must be established *before* the express app is created,
 * because the session store and every model depend on it.
 */
export async function connectDatabase(uri: string = env.mongodbUri): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: !env.isProduction,
  });
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export { mongoose };
