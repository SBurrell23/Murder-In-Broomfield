// Regenerate assets/images/manifest.json from whatever is actually on disk.
//
//   node tools/build-manifest.mjs
//
// Run this after adding or removing card photographs by hand. The game reads
// the manifest to load exactly the files that exist, instead of probing for
// four extensions per card and taking 404s for the ones that do not.
//
// The manifest is an optimisation, not a requirement: if it is missing the game
// falls back to probing, so dropping a file in and reloading still works.

import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MEANS } from '../js/data/means.js';
import { CLUES } from '../js/data/clues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = /\.(webp|jpe?g|png)$/i;

async function scan(dir, items) {
  const full = path.join(ROOT, 'assets', 'images', dir);
  let files = [];
  try { files = await readdir(full); } catch { return {}; }

  // Map basename -> filename, preferring webp then jpg for size.
  const rank = f => ({ webp: 0, jpg: 1, jpeg: 2, png: 3 }[path.extname(f).slice(1).toLowerCase()] ?? 9);
  const byBase = new Map();
  for (const f of files) {
    if (!EXT.test(f)) continue;
    const base = f.replace(EXT, '');
    if (!byBase.has(base) || rank(f) < rank(byBase.get(base))) byBase.set(base, f);
  }

  const out = {};
  const known = new Set(items.map(i => i.img));
  for (const [base, file] of byBase) {
    if (!known.has(base)) {
      console.log(`  note: ${dir}/${file} does not match any card slug, ignoring`);
      continue;
    }
    out[base] = file;
  }
  return out;
}

const manifest = {
  generated: new Date().toISOString().slice(0, 10),
  means: await scan('means', MEANS),
  clues: await scan('clues', CLUES)
};

const dest = path.join(ROOT, 'assets', 'images', 'manifest.json');
await writeFile(dest, JSON.stringify(manifest, null, 2) + '\n');

const m = Object.keys(manifest.means).length, c = Object.keys(manifest.clues).length;
console.log(`manifest.json written: ${m}/${MEANS.length} means, ${c}/${CLUES.length} evidence.`);
console.log(`The other ${MEANS.length - m + CLUES.length - c} cards render as procedural engravings.`);
