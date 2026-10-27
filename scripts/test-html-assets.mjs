import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const htmlFiles = [
  'checkin.html',
  'login.html',
  'dashboard.html',
  'entries.html',
  'locations.html',
  'admins.html',
  'admin-form.html',
  'my-account.html',
  'forgot-password.html',
  'reset-password.html',
];

const failures = [];

function collectAssets(html) {
  const assets = new Set();
  const patterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /url\(["']?([^"')]+)["']?\)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      const val = m[1];
      if (!val) continue;
      if (val.startsWith('http') || val.startsWith('//') || val.startsWith('data:') || val.startsWith('mailto:') || val.startsWith('#')) continue;
      assets.add(val.split('?')[0].split('#')[0]);
    }
  }
  return assets;
}

function resolveAsset(asset) {
  if (asset.startsWith('/')) return path.join(publicDir, asset.slice(1));
  return path.join(publicDir, asset);
}

for (const file of htmlFiles) {
  const full = path.join(publicDir, file);
  if (!existsSync(full)) continue;
  const html = readFileSync(full, 'utf8');
  const assets = collectAssets(html);
  for (const asset of assets) {
    const resolved = resolveAsset(asset);
    if (!existsSync(resolved)) {
      failures.push(`${file}: missing ${asset}`);
    }
  }
}

// Also check partials injected by layout.js
const partialsDir = path.join(publicDir, 'partials');
if (existsSync(partialsDir)) {
  const partialFiles = ['navbar.html', 'sidebar.html'];
  for (const pf of partialFiles) {
    const full = path.join(partialsDir, pf);
    if (!existsSync(full)) continue;
    const html = readFileSync(full, 'utf8');
    const assets = collectAssets(html);
    for (const asset of assets) {
      const resolved = resolveAsset(asset);
      if (!existsSync(resolved)) {
        failures.push(`partials/${pf}: missing ${asset}`);
      }
    }
  }
}

if (failures.length) {
  console.error('HTML asset check failed:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log('HTML asset check passed for all referenced files (including partials).');
