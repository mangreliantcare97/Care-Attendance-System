/**
 * Shared test setup.
 *
 * The environment has to be prepared *before* the application modules are
 * imported, because `src/config/env.ts` reads `process.env` once at load time.
 * That is why the application is imported dynamically in here.
 */
import type { Express } from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.SESSION_COOKIE_NAME = 'care.test.sid';
process.env.TRUST_PROXY = '1';
// The tests must not depend on a local .env file — dotenv never overrides a
// value that is already set.
process.env.MAIL_PROVIDER = 'none';
process.env.APP_BASE_URL = 'http://localhost:3000';

export const OWNER_EMAIL = 'owner@example.com';
export const OWNER_PASSWORD = 'correct-horse-battery';

export interface TestContext {
  app: Express;
  stop: () => Promise<void>;
}

export interface TestAppOptions {
  loginLimit?: number;
  passwordLimit?: number;
  perEmailLimit?: number;
}

export async function startTestApp(options: TestAppOptions = {}): Promise<TestContext> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();

  process.env.MONGODB_URI = mongod.getUri();
  process.env.LOGIN_RATE_LIMIT_MAX = String(options.loginLimit ?? 1000);

  const { connectDatabase, disconnectDatabase } = await import('../src/config/db.ts');
  await connectDatabase(process.env.MONGODB_URI);

  const { createApp } = await import('../src/app.ts');
  const { createLoginRateLimiter, createApiRateLimiter, createPerEmailRateLimiter } = await import(
    '../src/middleware/rateLimit.ts'
  );
  const { AdminModel } = await import('../src/models/Admin.ts');

  // Make sure the indexes exist before the first write.
  await AdminModel.init();

  const app = createApp({
    loginRateLimiter: createLoginRateLimiter({ max: options.loginLimit ?? 1000 }),
    passwordRateLimiter: createApiRateLimiter({ max: options.passwordLimit ?? 1000 }),
    perEmailRateLimiter: createPerEmailRateLimiter({ max: options.perEmailLimit ?? 1000 }),
  });

  return {
    app,
    stop: async () => {
      await disconnectDatabase();
      await mongod.stop();
    },
  };
}

/** Create an administrator directly in the database. */
export async function createAdmin(input: {
  name: string;
  email: string;
  password?: string;
  isActive?: boolean;
}) {
  const { AdminModel, hashPassword } = await import('../src/models/Admin.ts');
  const password = input.password ?? 'another-secret-1';

  return AdminModel.create({
    name: input.name,
    email: input.email.trim().toLowerCase(),
    password: await hashPassword(password),
    role: 'admin',
    isActive: input.isActive ?? true,
  });
}

/** Sign in and return the agent, the answer and the CSRF token. */
export async function signIn(
  app: Express,
  email = OWNER_EMAIL,
  password = OWNER_PASSWORD,
) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });

  return {
    agent,
    response,
    csrf: response.body?.meta?.csrfToken as string,
  };
}
