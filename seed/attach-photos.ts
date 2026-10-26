/**
 * Attach local profile photos to students.
 *
 * The history seeder deliberately creates students **without** photos (that is
 * asserted in `seed/seed-history-data.ts`). This script is the companion step
 * for local/demo review: it reads every image in `public/images/students/` and
 * stores it on the student whose name matches the file name.
 *
 * Matching rule: `amelia-bennett.jpg` → student "Amelia Bennett".
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
import { StudentModel } from '../src/models/Student.ts';
import { detectImageMime, ALLOWED_PHOTO_MIME } from '../src/services/students.ts';

const PHOTO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images', 'students');

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
    const students = await StudentModel.find().select('name').sort({ name: 1 });
    const byName = new Map(students.map((student) => [student.name.toLowerCase(), student]));

    let attached = 0;
    const unmatchedFiles: string[] = [];

    for (const file of files) {
      const slug = path.basename(file, path.extname(file));
      const student = byName.get(slugToName(slug));

      if (!student) {
        unmatchedFiles.push(file);
        continue;
      }

      const buffer = fs.readFileSync(path.join(PHOTO_DIR, file));
      const mime = detectImageMime(buffer);

      if (!mime || !ALLOWED_PHOTO_MIME.includes(mime as (typeof ALLOWED_PHOTO_MIME)[number])) {
        console.error(`[seed:photos] ${file} is not a JPEG, PNG or WebP image �?" skipped`);
        continue;
      }

      if (buffer.length > env.studentPhotoMaxBytes) {
        console.error(`[seed:photos] ${file} is over the ${Math.round(env.studentPhotoMaxBytes / 1024)} KB limit �?" skipped`);
        continue;
      }

      student.set({ photo: { data: buffer.toString('base64'), mime, size: buffer.length } });
      await student.save();
      attached += 1;
      console.log(`[seed:photos] ${student.name} ← ${file}`);
    }

    const withoutPhoto = students.filter((student) => !student.photo?.data).map((student) => student.name);

    console.log(`\n[seed:photos] attached ${attached} of ${files.length} image(s) to ${students.length} student(s).`);
    if (unmatchedFiles.length) console.log(`[seed:photos] no student matched: ${unmatchedFiles.join(', ')}`);
    if (withoutPhoto.length) console.log(`[seed:photos] still without a photo: ${withoutPhoto.join(', ')}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('[seed:photos] failed:', error);
  process.exit(1);
});
