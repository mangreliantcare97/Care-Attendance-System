/**
 * Emergency password recovery.
 *
 *   RESET_ADMIN_PASSWORD='<new password>' npm run reset-admin-password -- admin@example.com
 *
 * The new password is read from the environment — never from the command line
 * (where it would end up in the shell history) and never from the repository.
 */
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { AdminModel, hashPassword } from '../src/models/Admin.ts';
import { destroySessionsForAdmin } from '../src/config/session.ts';
import { PasswordResetModel } from '../src/models/PasswordReset.ts';

async function main(): Promise<void> {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const password = process.env.RESET_ADMIN_PASSWORD ?? '';

  if (!email) {
    console.error('[reset] Usage: RESET_ADMIN_PASSWORD="…" npm run reset-admin-password -- <admin email>');
    process.exitCode = 1;
    return;
  }

  if (!password) {
    console.error('[reset] RESET_ADMIN_PASSWORD is not set — refusing to change the password.');
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error('[reset] RESET_ADMIN_PASSWORD must be at least 8 characters long.');
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    const admin = await AdminModel.findOne({ email });
    if (!admin) {
      console.error(`[reset] There is no administrator with the address "${email}".`);
      process.exitCode = 1;
      return;
    }

    admin.password = await hashPassword(password);
    admin.isActive = true;
    await admin.save();

    // Every session of that administrator is signed out.
    const revoked = await destroySessionsForAdmin(String(admin._id));
    await PasswordResetModel.deleteMany({ adminId: admin._id });

    console.log(`[reset] The password of "${email}" was changed.`);
    console.log(`[reset] ${revoked} session(s) were signed out.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[reset] failed:', error);
  process.exit(1);
});
