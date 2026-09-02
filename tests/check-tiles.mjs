// Scene tile vetting.
//
// Structural rules first, then the softer checks that catch a dud: a tile whose
// options the Forensic Scientist cannot use to point at anything on the table.
// The Scientist cannot speak, so a tile only earns its slot if its options turn
// on something observable about the weapon or the evidence.

import { CAUSE_OF_DEATH, LOCATIONS, SCENE_TILES, ALL_TILES } from '../js/data/tiles.js';
import { MEANS } from '../js/data/means.js';
import { CLUES } from '../js/data/clues.js';

let fail = 0;
const problem = (msg) => { fail++; console.log('  ' + msg); };

console.log(`Deck size     : ${CAUSE_OF_DEATH.length} cause, ${LOCATIONS.length} location, ${SCENE_TILES.length} scene`);

// --- structure ------------------------------------------------------------
console.log('\nStructure');
for (const t of ALL_TILES) {
  if (!Array.isArray(t.options) || t.options.length !== 6) {
    problem(`${t.id} has ${t.options?.length} options, needs 6`);
  }
  const seen = new Set();
  for (const o of t.options || []) {
    const key = o.toLowerCase();
    if (seen.has(key)) problem(`${t.id} repeats the option "${o}"`);
    seen.add(key);
    if (!o.trim()) problem(`${t.id} has a blank option`);
  }
}
const ids = ALL_TILES.map(t => t.id);
if (new Set(ids).size !== ids.length) problem('duplicate tile ids');

// Scene titles must be unique; locations deliberately share a title and differ
// by subtitle, so they are keyed on the pair.
const sceneTitles = SCENE_TILES.map(t => t.title.toLowerCase());
if (new Set(sceneTitles).size !== sceneTitles.length) {
  const dupes = sceneTitles.filter((t, i) => sceneTitles.indexOf(t) !== i);
  problem(`duplicate scene tile titles: ${[...new Set(dupes)].join(', ')}`);
}
const placeKeys = LOCATIONS.map(t => `${t.title}|${t.subtitle}`);
if (new Set(placeKeys).size !== placeKeys.length) problem('duplicate location subtitles');
if (LOCATIONS.some(t => !t.subtitle)) problem('a location is missing its subtitle');
console.log(`  ${ALL_TILES.length} tiles, all with 6 unique options`);

// --- option length: long text wraps badly on a narrow tile ----------------
console.log('\nOption length');
const LONG = 26;
const longOnes = [];
for (const t of ALL_TILES) {
  for (const o of t.options) if (o.length > LONG) longOnes.push(`${t.id} "${o}" (${o.length})`);
}
if (longOnes.length > 6) {
  problem(`${longOnes.length} options over ${LONG} chars - the board gets cramped`);
  longOnes.slice(0, 8).forEach(o => console.log('    ' + o));
} else {
  console.log(`  longest ${Math.max(...ALL_TILES.flatMap(t => t.options.map(o => o.length)))} chars, ${longOnes.length} over ${LONG}`);
}

// --- dud detection --------------------------------------------------------
// A tile is useful when its options attach to something physical. These word
// sets are the vocabulary of the 200 cards: materials, actions, places, sizes.
// A tile with no overlap at all is describing something other than the crime.
console.log('\nUsefulness');

// Vocabulary the 200 cards actually trade in. A tile is useful when its options
// land somewhere in here - either on a physical property, or on a person whose
// belongings the deck represents ("Physician" points straight at the Scalpel,
// the Insulin Syringe and the Doctor's Bag).
const ANCHORS = [
  // materials and make
  'steel','iron','glass','ceramic','porcelain','wood','rope','cloth','leather','stone','earth','metal',
  'paper','card','bone','silk','brass','silver','wool','plastic',
  // what a weapon does
  'cut','pierced','crush','struck','choke','smother','burn','scald','poison','sicken','drown','froze',
  'blow','wound','edge','tear','bruise','puncture','swung','thrust','pulled','poured','dropped',
  // where things live
  'kitchen','workshop','medicine','garden','pocket','bag','case','drawer','room','house','door',
  'window','stair','cellar','hidden','worn','body','floor','shed','garage',
  // scale and state
  'palm','arm','hands','building','object','new','broken','stained','torn','mended','clean','washed',
  'wiped','burned','ash','print','hair','fiber','fibre','tread','residue','soil','smoke','chemical',
  'damp','perfume','blood','light','car','coat','clothes','weapon','cash','jewelry','documents',
  'money','travel','amusement','grooming','writing','worth','wages','fortune','coin','watch','ring',
  // sound and duration that still points at a thing
  'scream','gunshot','engine','barking','silence','seconds','minute','minutes','hour','night','days',
  // people, because the deck is full of their belongings
  'physician','banker','journalist','schoolteacher','detective','undertaker','landlord','coworker',
  'postman','child','stranger','neighbor','neighbour','colleague','relative','lover','friend','murderer',
  'victim','sedated','intoxicated','injured','exhausted'
];

const cardWords = new Set();
for (const c of [...MEANS, ...CLUES]) {
  for (const w of c.name.toLowerCase().split(/[^a-z]+/)) if (w.length > 2) cardWords.add(w);
}

// Matching has to be tighter than a bare prefix test in both directions: that
// let "None Was Given" match the anchor "washed" and scored a known dud as
// useful. A short word may only match exactly (or as a plural); a prefix match
// needs at least four characters of real overlap.
function matches(word, anchor) {
  if (word === anchor || word === anchor + 's' || word + 's' === anchor) return true;
  if (anchor.length >= 4 && word.startsWith(anchor)) return true;
  if (word.length >= 4 && anchor.startsWith(word)) return true;
  return false;
}

function score(tile) {
  const words = new Set(tile.options.join(' ').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2));
  let hits = 0;
  for (const w of words) {
    if (ANCHORS.some(a => matches(w, a)) || cardWords.has(w)) hits++;
  }
  return hits;
}

// The detector is only worth anything if it still catches the tiles that were
// cut for being duds. These are kept here as a regression fixture: if a future
// edit makes the check permissive enough to pass them, the check has stopped
// doing its job and this fails.
const KNOWN_DUDS = [
  { title: "The Murderer's State of Mind",
    options: ['Panicked', 'Methodical', 'Enraged', 'Remorseful', 'Utterly Detached', 'Euphoric'] },
  { title: 'Witness Account',
    options: ['Contradictory', 'Fragmentary', 'Flatly Refused', 'Anonymous', 'Later Retracted', 'None Was Given'] }
];
for (const dud of KNOWN_DUDS) {
  if (score(dud) > 0) problem(`the dud detector no longer catches "${dud.title}" - it has gone soft`);
}
console.log(`  detector still rejects ${KNOWN_DUDS.length} known duds`);

const scored = SCENE_TILES.map(t => ({ t, n: score(t) })).sort((a, b) => a.n - b.n);
const weak = scored.filter(s => s.n === 0);
if (weak.length) {
  weak.forEach(s => problem(`DUD: "${s.t.title}" - nothing in its options attaches to the table`));
} else {
  console.log('  every scene tile attaches to something on the table');
}
console.log('  weakest five (lower = less for the Scientist to point at):');
scored.slice(0, 5).forEach(s => console.log(`    ${String(s.n).padStart(2)}  ${s.t.title}`));
console.log('  strongest five:');
scored.slice(-5).reverse().forEach(s => console.log(`    ${String(s.n).padStart(2)}  ${s.t.title}`));

// --- catch-all options ----------------------------------------------------
// "Nothing at all" is a legitimate sixth option, but a deck full of them means
// the Scientist is often left with nothing to say.
const CATCH_ALL = /^(nothing|none|nobody|impossible|it cannot|no one|cannot be)/i;
const catchAlls = SCENE_TILES.flatMap(t => t.options.filter(o => CATCH_ALL.test(o)).map(o => `${t.title}: "${o}"`));
const ratio = catchAlls.length / SCENE_TILES.length;
console.log(`\nCatch-all options: ${catchAlls.length} across ${SCENE_TILES.length} tiles (${(ratio * 100).toFixed(0)}%)`);
if (ratio > 0.5) problem('too many tiles lean on a "nothing at all" option');
for (const t of SCENE_TILES) {
  const n = t.options.filter(o => CATCH_ALL.test(o)).length;
  if (n > 1) problem(`${t.id} "${t.title}" has ${n} catch-all options`);
}

// --- deck depth -----------------------------------------------------------
// Four scene tiles are in play and two get replaced, so six are drawn.
console.log('\nDeck depth');
if (SCENE_TILES.length < 6) problem('not enough scene tiles to run a full game');
console.log(`  ${SCENE_TILES.length} scene tiles, 6 drawn per game - ${(SCENE_TILES.length / 6).toFixed(1)}x the minimum`);
console.log(`  ${LOCATIONS.length} locations, 1 drawn per game`);

console.log(fail ? `\nTILE CHECK FAILED (${fail})` : '\nTile check passed.');
process.exit(fail ? 1 : 0);
