/**
 * Attach local profile photos to employees.
 *
 * The history seeder deliberately creates employees **without** photos (that is
 * asserted in `seed/seed-history-data.ts`). This script is the companion step
 * for local/demo review: it reads every image in `public/images/employees/` and
 * stores it on the employee whose name matches the file name.
 *
 * Matching rule: `amelia-bennett.jpg` → employee "Amelia Bennett".
 *
 * It is idempotent, only touches `photo`, and reports anything it cannot match.
 *
 *   npm run seed:photos
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../src/config/db.ts';
import { env } from '../src/config/env.ts';
import { EmployeeModel } from '../src/models/Employee.ts';
import { detectImageMime, ALLOWED_PHOTO_MIME } from '../src/services/employees.ts';

const PHOTO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images', 'employees');

/** `amelia-bennett` → `amelia bennett` so it can be compared to a name. */
function slugToName(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').trim().toLowerCase();
}

async function main(): Promise<void> {
  if (!fs.existsSync(PHOTO_DIR)) {
    console.error(`[seed:photos] no photo folder at ${PHOTO_DIR}`);
    process.exitCode = 1;
    return;
  }

  const files = fs
    .readdirSync(PHOTO_DIR)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .sort();

  if (!files.length) {
    console.error(`[seed:photos] ${PHOTO_DIR} contains no images`);
    process.exitCode = 1;
    return;
  }

  console.log(`[seed:photos] connecting to ${env.mongodbUri.split('/').pop()} �?�`);
  await connectDatabase();

  try {
    const employees = await EmployeeModel.find().select('name').sort({ name: 1 });
    const byName = new Map(employees.map((employee) => [employee.name.toLowerCase(), employee]));

    let attached = 0;
    const unmatchedFiles: string[] = [];

    for (const file of files) {
      const slug = path.basename(file, path.extname(file));
      const employee = byName.get(slugToName(slug));

      if (!employee) {
        unmatchedFiles.push(file);
        continue;
      }

      const buffer = fs.readFileSync(path.join(PHOTO_DIR, file));
      const mime = detectImageMime(buffer);

      if (!mime || !ALLOWED_PHOTO_MIME.includes(mime as (typeof ALLOWED_PHOTO_MIME)[number])) {
        console.error(`[seed:photos] ${file} is not a JPEG, PNG or WebP image �?" skipped`);
        continue;
      }

      if (buffer.length > env.employeePhotoMaxBytes) {
        console.error(`[seed:photos] ${file} is over the ${Math.round(env.employeePhotoMaxBytes / 1024)} KB limit �?" skipped`);
        continue;
      }

      employee.set({ photo: { data: buffer.toString('base64'), mime, size: buffer.length } });
      await employee.save();
      attached += 1;
      console.log(`[seed:photos] ${employee.name} ← ${file}`);
    }

    const withoutPhoto = employees.filter((employee) => !employee.photo?.data).map((employee) => employee.name);

    console.log(`\n[seed:photos] attached ${attached} of ${files.length} image(s) to ${employees.length} employee(s).`);
    if (unmatchedFiles.length) console.log(`[seed:photos] no employee matched: ${unmatchedFiles.join(', ')}`);
    if (withoutPhoto.length) console.log(`[seed:photos] still without a photo: ${withoutPhoto.join(', ')}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[seed:photos] failed:', error);
  process.exit(1);
});
