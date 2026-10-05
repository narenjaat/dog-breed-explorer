/**
 * Reports the size of a release bundle.
 *
 * Reads whatever `react-native bundle` produced in ./dist — it never estimates
 * or hardcodes a number, so the figures in PERFORMANCE.md are always measured.
 *
 * Usage: npm run bundle:analyze
 */

const fs = require('node:fs');
const path = require('node:path');

const DIST_DIR = path.join(__dirname, '..', 'dist');

function walk(dir) {
  const entries = [];
  if (!fs.existsSync(dir)) return entries;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) entries.push(...walk(full));
    else entries.push({ path: path.relative(DIST_DIR, full), bytes: stat.size });
  }
  return entries;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const files = walk(DIST_DIR);

if (files.length === 0) {
  console.error('No export found in ./dist. Run `npm run bundle:analyze`.');
  process.exit(1);
}

const bundles = files.filter((file) => /\.(hbc|js|bundle)$/.test(file.path));
const assets = files.filter((file) => !/\.(hbc|js|bundle)$/.test(file.path));

const sum = (list) => list.reduce((total, file) => total + file.bytes, 0);

console.log('\nJS bundles');
console.log('-'.repeat(60));
for (const file of bundles.sort((a, b) => b.bytes - a.bytes)) {
  console.log(`  ${formatBytes(file.bytes).padStart(10)}  ${file.path}`);
}

console.log('\nAssets');
console.log('-'.repeat(60));
console.log(`  ${formatBytes(sum(assets)).padStart(10)}  ${assets.length} file(s)`);

console.log('\nTotal');
console.log('-'.repeat(60));
console.log(`  ${formatBytes(sum(files)).padStart(10)}  ${files.length} file(s)\n`);
