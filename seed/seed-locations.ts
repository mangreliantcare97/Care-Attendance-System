/**
 * Insert the real care locations.
 *
 *   npm run seed:locations
 *
 * The data lives in `seed/locations.json` exactly as supplied. The script is
 * insert-only: it keys on (normalised name, postcode) and uses `$setOnInsert`,
 * so a location an administrator has edited or deactivated is never touched
 * again, and entries are never modified. It creates no administrator; run
 * `npm run seed` first.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { env } from '../src/config/env.ts';
import { AdminModel } from '../src/models/Admin.ts';
import { LocationModel } from '../src/models/Location.ts';
import { isValidUkPostcode, normalisePostcode } from '../src/utils/postcode.ts';
import { normaliseNameKey } from '../src/utils/text.ts';

export interface SeedLocation {
  name: string;
  postcode: string;
}

export interface InvalidSeedPostcode {
  name: string;
  postcode: string;
}

export interface LocationSeedSummary {
  inserted: number;
  existing: number;
  total: number;
  invalidPostcodes: InvalidSeedPostcode[];
}

const SEED_FILE = fileURLToPath(new URL('./locations.json', import.meta.url));

/** Read the seed file exactly as written (`name` is never re-typed). */
export function loadSeedLocations(file: string = SEED_FILE): SeedLocation[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('seed/locations.json must contain a non-empty array.');
  }

  return parsed.map((entry, index) => {
    const record = entry as Partial<SeedLocation>;
    if (typeof record.name !== 'string' || typeof record.postcode !== 'string') {
      throw new Error(`seed/locations.json entry ${index} needs a name and a postcode.`);
    }
    return { name: record.name, postcode: record.postcode };
  });
}

/** The database name only — never a credential. */
export function databaseNameFromUri(uri: string): string {
  const withoutQuery = uri.split('?')[0];
  const slash = withoutQuery.lastIndexOf('/');
  if (slash === -1) return '(unknown)';
  const name = withoutQuery.slice(slash + 1);
  return name ? decodeURIComponent(name) : '(unknown)';
}

/**
 * Insert the locations that do not exist yet.
 *
 * `createdBy` is the administrator recorded on new rows. Existing rows are
 * left exactly as they are, whatever an administrator has changed.
 */
export async function upsertSeedLocations(
  entries: SeedLocation[],
  createdBy: string,
): Promise<LocationSeedSummary> {
  let inserted = 0;
  let existing = 0;
  const invalidPostcodes: InvalidSeedPostcode[] = [];

  for (const [index, entry] of entries.entries()) {
    const name = entry.name;
    const postcode = normalisePostcode(entry.postcode);
    const nameKey = normaliseNameKey(name);

    if (!isValidUkPostcode(postcode)) {
      invalidPostcodes.push({ name, postcode: entry.postcode });
    }

    const result = await LocationModel.updateOne(
      { nameKey, postcode },
      {
        $setOnInsert: {
          name,
          nameKey,
          postcode,
          isActive: true,
          sortOrder: index,
          createdBy,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) {
      inserted += 1;
    } else {
      existing += 1;
    }
  }

  return {
    inserted,
    existing,
    total: await LocationModel.countDocuments(),
    invalidPostcodes,
  };
}

/** Prefer the configured seed administrator, otherwise the oldest active one. */
async function findSeedAdmin() {
  const configuredEmail = env.seedAdmin.email.trim().toLowerCase();

  if (configuredEmail) {
    const preferred = await AdminModel.findOne({
      email: configuredEmail,
      isActive: true,
      role: 'admin',
    });
    if (preferred) return preferred;
  }

  return AdminModel.findOne({ isActive: true, role: 'admin' }).sort({ createdAt: 1 });
}

async function main(): Promise<void> {
  const entries = loadSeedLocations();
  await connectDatabase();

  try {
    console.log(`[seed:locations] database: ${databaseNameFromUri(env.mongodbUri)}`);

    const admin = await findSeedAdmin();
    if (!admin) {
      console.error(
        '[seed:locations] No active administrator exists in this database, so createdBy cannot be set.\n' +
          '                 Run `npm run seed` first, then try again.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(`[seed:locations] administrator: ${admin.email}`);

    // Replace the retired single-field name index with the (name, postcode)
    // rule, so the same label may exist at two postcodes.
    await LocationModel.syncIndexes();

    const summary = await upsertSeedLocations(entries, String(admin._id));

    console.log(
      `[seed:locations] inserted ${summary.inserted}, already existed ${summary.existing}` +
        ` (${entries.length} in seed/locations.json, ${summary.total} in this database).`,
    );

    if (summary.invalidPostcodes.length) {
      console.log('[seed:locations] postcode warnings (the address text was not changed):');
      for (const invalid of summary.invalidPostcodes) {
        console.log(`  - ${invalid.name}: "${invalid.postcode}"`);
      }
    }
  } finally {
    await disconnectDatabase();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : '';
const modulePath = fileURLToPath(import.meta.url).toLowerCase();

if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error('[seed:locations] failed:', error);
    process.exit(1);
  });
}
