import { env } from '../src/config/env.ts';
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import mongoose from 'mongoose';
import { AdminModel } from '../src/models/Admin.ts';
import { LocationModel } from '../src/models/Location.ts';
import { EntryModel } from '../src/models/Entry.ts';
import { databaseNameFromUri } from '../seed/seed-locations.ts';

async function main() {
  console.log('Care Attendance - Doctor');
  console.log('========================');
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Timezone: ${env.appTimezone}`);
  console.log(`Database name: ${databaseNameFromUri(env.mongodbUri)}`);
  console.log(`MongoDB URI (host only): ${env.mongodbUri.replace(/\/\/([^@]+)@/, '//***:***@')}`);

  try {
    await connectDatabase();
    const state = mongoose.connection.readyState;
    console.log(`MongoDB reachable: ${state === 1 ? 'yes' : 'no'} (readyState=${state})`);
    const dbName = mongoose.connection.name || mongoose.connection.db?.databaseName;
    console.log(`Connected database: ${dbName || '(unknown)'}`);

    const adminCount = await AdminModel.countDocuments();
    const activeAdmins = await AdminModel.countDocuments({ isActive: true, role: 'admin' });
    console.log(`Admins: ${adminCount} total, ${activeAdmins} active`);

    const locationTotal = await LocationModel.countDocuments();
    const locationActive = await LocationModel.countDocuments({ active: { $ne: false } });
    console.log(`Locations: ${locationTotal} total, ${locationActive} active`);

    const entryCount = await EntryModel.countDocuments({ deletedAt: null });
    console.log(`Entries (not deleted): ${entryCount}`);

    console.log('\nNext steps:');
    if (activeAdmins === 0) {
      console.log('  - No active admins: run `npm run seed` with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
    }
    if (locationActive === 0) {
      console.log('  - No active locations: run `npm run seed:locations`');
    } else if (locationTotal === 0) {
      console.log('  - No locations: run `npm run seed:locations`');
    }
    if (activeAdmins > 0 && locationActive > 0) {
      console.log('  - Ready: run `npm start` and open http://localhost:' + env.port);
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.log('\nNext steps:');
    console.log('  - Ensure MongoDB is running and MONGODB_URI is correct in .env');
    console.log('  - Check .env has SESSION_SECRET set');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
