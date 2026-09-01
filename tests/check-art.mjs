// Card art integrity. Every card must have its own drawing, and no two cards
// may share one - the whole point of the deck is telling items apart.

import { MEANS } from '../js/data/means.js';
import { CLUES } from '../js/data/clues.js';
import { ITEM_GLYPHS } from '../js/art/glyphs/index.js';

const items = [...MEANS.map(m => ({ ...m, kind: 'means' })), ...CLUES.map(c => ({ ...c, kind: 'clues' }))];
let fail = 0;

// --- coverage ---
const missing = items.filter(i => !ITEM_GLYPHS[i.img]);
console.log(`Coverage      : ${items.length - missing.length}/${items.length} cards have their own drawing`);
if (missing.length) {
  fail++;
  console.log(`  MISSING (${missing.length}): ${missing.slice(0, 12).map(m => m.img).join(', ')}${missing.length > 12 ? ' ...' : ''}`);
}

// --- duplicates ---
const byArt = new Map();
for (const [slug, svg] of Object.entries(ITEM_GLYPHS)) {
  const norm = svg.replace(/\s+/g, ' ').trim();
  if (!byArt.has(norm)) byArt.set(norm, []);
  byArt.get(norm).push(slug);
}
const dupes = [...byArt.values()].filter(v => v.length > 1);
console.log(`Duplicates    : ${dupes.length} groups`);
if (dupes.length) {
  fail++;
  dupes.forEach(g => console.log(`  SHARED ART: ${g.join(' = ')}`));
}

// --- forbidden constructs that would break the inlined plate ---
const BAD = /<svg|<defs|<style|<text|<use|<image|\sid=|\sclass=|url\(/i;
const bad = Object.entries(ITEM_GLYPHS).filter(([, v]) => BAD.test(v));
console.log(`Unsafe markup : ${bad.length}`);
if (bad.length) { fail++; bad.forEach(([k]) => console.log(`  UNSAFE: ${k}`)); }

// --- palette discipline ---
const ALLOWED = new Set(['#14100c', '#3a3128', '#efe6d6', 'none', 'currentColor']);
const offPalette = [];
for (const [slug, svg] of Object.entries(ITEM_GLYPHS)) {
  for (const m of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
    if (!ALLOWED.has(m[1])) offPalette.push(`${slug}: ${m[1]}`);
  }
}
console.log(`Off-palette   : ${offPalette.length}`);
if (offPalette.length) { fail++; offPalette.slice(0, 10).forEach(o => console.log(`  ${o}`)); }

// --- balanced tags, so a fragment cannot corrupt the plate ---
const unbalanced = [];
for (const [slug, svg] of Object.entries(ITEM_GLYPHS)) {
  const opens = (svg.match(/<g[\s>]/g) || []).length;
  const closes = (svg.match(/<\/g>/g) || []).length;
  if (opens !== closes) unbalanced.push(`${slug} (${opens} <g> vs ${closes} </g>)`);
}
console.log(`Unbalanced <g>: ${unbalanced.length}`);
if (unbalanced.length) { fail++; unbalanced.forEach(u => console.log(`  ${u}`)); }

console.log(fail ? '\nCARD ART CHECK FAILED' : '\nCard art check passed.');
process.exit(fail ? 1 : 0);
