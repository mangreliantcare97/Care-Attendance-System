import { createApp } from './src/app.ts';
import { connectDatabase, disconnectDatabase } from './src/config/db.ts';
import { env } from './src/config/env.ts';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[care-attendance] listening on http://localhost:${env.port}`);
    console.log(`[care-attendance] environment: ${env.nodeEnv} | timezone: ${env.appTimezone}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[care-attendance] ${signal} received — shutting down`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[care-attendance] failed to start:', error);
  process.exit(1);
});
