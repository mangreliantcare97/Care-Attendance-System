/**
 * Bootstrap the first administrator.
 *
 * The password is read from `SEED_ADMIN_PASSWORD` — it is never hardcoded and
 * never stored in the repository. Run it with a `.env` that contains:
 *
 *   SEED_ADMIN_EMAIL=admin@example.com
 *   SEED_ADMIN_PASSWORD=<a strong password>
 *   npm run seed
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { env } from '../src/config/env.ts';
import { AdminModel, hashPassword } from '../src/models/Admin.ts';

async function main(): Promise<void> {
  const { email, password, name } = env.seedAdmin;

  if (!email || !password) {
    console.error(
      '[seed] SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set in the environment.\n' +
        '       Refusing to create an admin with a guessed or empty password.',
    );
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error('[seed] SEED_ADMIN_PASSWORD must be at least 8 characters long.');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    const normalised = email.trim().toLowerCase();
    const existing = await AdminModel.findOne({ email: normalised });

    if (existing) {
      existing.name = name || existing.name;
      existing.isActive = true;
      existing.password = await hashPassword(password);
      await existing.save();
      console.log(`[seed] updated existing admin "${normalised}".`);
    } else {
      await AdminModel.create({
        name: name || 'Administrator',
        email: normalised,
        password: await hashPassword(password),
        role: 'admin',
        isActive: true,
      });
      console.log(`[seed] created admin "${normalised}".`);
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
