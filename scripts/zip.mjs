// Packs dist/ into build.zip with index.html at the archive root (Yandex Games Console requirement).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const root = resolve(import.meta.dirname, '..');
const distDir = join(root, 'dist');
const outFile = join(root, 'build.zip');

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('dist/index.html not found. Run "npm run build" first.');
  process.exit(1);
}

/** @param {string} dir @param {Record<string, Uint8Array>} files */
function collect(dir, files) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collect(full, files);
    } else {
      files[relative(distDir, full).split(sep).join('/')] = readFileSync(full);
    }
  }
  return files;
}

const files = collect(distDir, {});
const zip = zipSync(files, { level: 9 });
writeFileSync(outFile, zip);

const kb = (zip.byteLength / 1024).toFixed(1);
console.log(`build.zip: ${Object.keys(files).length} files, ${kb} KB`);
