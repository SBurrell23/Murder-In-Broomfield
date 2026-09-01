// Populate assets/images/ with real photographs from Wikimedia Commons.
//
//   node tools/fetch-images.mjs              # fetch everything still missing
//   node tools/fetch-images.mjs --only means # just the weapons
//   node tools/fetch-images.mjs --limit 20   # stop after 20 downloads
//   node tools/fetch-images.mjs --force      # re-fetch even if a file exists
//
// Only openly licensed files are accepted (public domain, CC0, CC BY, CC BY-SA)
// and every download is recorded with its author and licence in
// assets/images/CREDITS.md, so the results can be redistributed with the game.
//
// Nothing here runs at play time. If a card has no photo, the game draws its
// procedural engraving instead, so a partial or failed run is harmless.

import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MEANS } from '../js/data/means.js';
import { CLUES } from '../js/data/clues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'MurderInBroomfield/1.0 (fan game asset fetcher; contact via repository issues)';
const API = 'https://commons.wikimedia.org/w/api.php';

const OK_LICENCE = /^(cc0|cc[- ]by([- ]sa)?([- ][\d.]+)?|public domain|pd([- ]|$).*|no restrictions)/i;

// A handful of card names are ambiguous as search terms ("Ivory", "Domino"),
// or read better with a qualifier. Anything not listed searches on its name.
const QUERY_OVERRIDES = {
  'Live Wire': 'electrical cable copper',
  'Space Heater': 'electric space heater appliance',
  'Frozen Lake': 'frozen lake ice winter',
  'Stone Well': 'stone water well',
  'Well Water': 'stone water well',
  'Mill Stone': 'millstone',
  'Cut Brake Line': 'brake line hose car',
  'Locked Steering Wheel': 'car steering wheel',
  'Service Stairwell': 'stairwell staircase',
  'Roof Icicle': 'icicle',
  'Feral Dog': 'stray dog',
  'Playing Card': 'playing card ace',
  'Glass Marble': 'glass marble toy',
  'Domino': 'domino tile game',
  'Chess Piece': 'chess piece knight',
  'Pair of Dice': 'dice pair',
  'Poker Chip': 'poker chips casino',
  'Dollhouse Key': 'small brass key',
  'Coat Check Tag': 'cloakroom tag ticket',
  'Luggage Tag': 'luggage tag',
  'Business Card': 'business card',
  'Film Reel': 'film reel 35mm',
  'Phonograph Record': 'vinyl record gramophone',
  'Music Box': 'music box mechanical',
  'Taxidermy Owl': 'taxidermy owl',
  'Empty Birdcage': 'birdcage',
  'Wine Cork': 'wine cork',
  'Napkin Ring': 'napkin ring silver',
  'Shoehorn': 'shoehorn',
  'Muddy Boot': 'leather boot mud',
  'Bootlace': 'shoelace',
  'Silk Scarf': 'silk scarf',
  'Piano Wire': 'steel wire coil',
  'Barbed Wire': 'barbed wire',
  'Death Cap Mushroom': 'Amanita phalloides',
  'Nightshade Berries': 'Atropa belladonna berries',
  'Oleander Leaves': 'Nerium oleander leaves',
  'Hemlock': 'Conium maculatum',
  'Digitalis Tablets': 'digitalis foxglove',
  'Snake Venom': 'venomous snake',
  'Deathstalker Scorpion': 'Leiurus quinquestriatus scorpion',
  'Chloroform Rag': 'chloroform bottle',
  'Bottle of Ether': 'diethyl ether bottle',
  'Insulin Syringe': 'insulin syringe',
  'Morphine Ampoule': 'morphine ampoule',
  'Sleeping Pills': 'sleeping pills tablets',
  'Rat Poison': 'rodenticide rat poison',
  'Drain Cleaner': 'drain cleaner bottle',
  'Household Bleach': 'bleach bottle',
  'Antifreeze': 'antifreeze coolant bottle',
  'Strychnine Vial': 'strychnine bottle',
  'Arsenic Powder': 'arsenic trioxide',
  'Cyanide Capsule': 'potassium cyanide',
  'Goose Down Pillow': 'pillow bed',
  'Plastic Bag': 'plastic bag',
  'Duct Tape': 'duct tape roll',
  'Clawfoot Bathtub': 'clawfoot bathtub',
  'Freight Elevator': 'freight elevator',
  'Falling Chandelier': 'chandelier',
  'Toppled Bookcase': 'bookcase shelf',
  'Blacksmith Anvil': 'anvil blacksmith',
  'Wine Press': 'wine press',
  'Bear Trap': 'bear trap',
  'Grandfather Clock': 'longcase grandfather clock',
  'Service Revolver': 'revolver handgun',
  'Sawed-Off Shotgun': 'shotgun firearm',
  'Cavalry Sabre': 'sabre sword',
  'Whaling Harpoon': 'harpoon',
  'Steel-Ribbed Umbrella': 'umbrella',
  'Iron Bookend': 'bookend',
  'Stone Paperweight': 'paperweight',
  'Trophy Cup': 'trophy cup',
  'Snow Globe': 'snow globe',
  'Mourning Brooch': 'victorian brooch',
  'Tortoiseshell Comb': 'hair comb',
  'Compact Mirror': 'compact mirror powder',
  'Reading Glasses': 'reading glasses spectacles',
  'Broken Wax Seal': 'wax seal letter',
  'Foreign Postage Stamp': 'postage stamp',
  'Torn Envelope': 'envelope letter',
  'Love Letter': 'handwritten letter',
  'Ransom Note': 'handwritten note paper',
  'Newspaper Clipping': 'newspaper clipping',
  'Theatre Stub': 'theatre ticket',
  'Boarding Pass': 'boarding pass',
  'Library Card': 'library card catalogue',
  'Parking Ticket': 'parking ticket',
  'Pawn Slip': 'pawn shop ticket',
  'Crumpled Receipt': 'paper receipt',
  'Bank Ledger': 'accounting ledger book',
  'Cheque Book': 'cheque book',
  'Coin Purse': 'coin purse',
  'Money Clip': 'money clip',
  'Safe Deposit Box': 'safe deposit box',
  'Cigar Box': 'cigar box',
  'Cigarette Case': 'cigarette case',
  'Cut Glass Ashtray': 'glass ashtray',
  'Briar Pipe': 'tobacco pipe briar',
  'Brass Lighter': 'petrol lighter zippo',
  'Hip Flask': 'hip flask',
  'Porcelain Teacup': 'porcelain teacup',
  'Silver Spoon': 'silver spoon',
  'Dinner Menu': 'restaurant menu card',
  'Recipe Card': 'recipe card handwritten',
  'Grocery List': 'shopping list paper',
  'Umbrella Stand': 'umbrella stand',
  'Grey Fedora': 'fedora hat',
  'Bowler Hat': 'bowler hat',
  'Leather Glove': 'leather glove',
  'Silk Handkerchief': 'handkerchief',
  'Wool Overcoat': 'overcoat wool',
  'Bow Tie': 'bow tie',
  'Steamer Trunk': 'steamer trunk luggage',
  "Doctor's Bag": 'doctor bag medical',
  'Folded Map': 'folded road map',
  'Brass Compass': 'compass navigation brass',
  'Field Notebook': 'notebook pocket',
  'Locked Diary': 'diary book lock',
  'Address Book': 'address book',
  'Faded Photograph': 'old photograph sepia',
  'Folding Camera': 'folding camera bellows',
  'Sheet Music': 'sheet music score',
  'Violin Bow': 'violin bow',
  'Signet Ring': 'signet ring',
  'Charm Bracelet': 'charm bracelet',
  'Pearl Earring': 'pearl earring',
  'Silver Locket': 'locket pendant',
  'Wedding Ring': 'wedding ring gold band',
  'Pocket Watch': 'pocket watch'
};

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const value = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const FORCE = flag('--force');
const ONLY = value('--only', null);
const LIMIT = Number(value('--limit', Infinity));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function search(term) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '600',
    format: 'json',
    origin: '*'
  });
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const json = await res.json();
  const pages = json?.query?.pages;
  return pages ? Object.values(pages) : [];
}

function licenceOf(page) {
  const md = page?.imageinfo?.[0]?.extmetadata || {};
  const name = (md.LicenseShortName?.value || md.License?.value || '').trim();
  const artist = (md.Artist?.value || 'Unknown').replace(/<[^>]*>/g, '').trim();
  return { name, artist, url: md.LicenseUrl?.value || '' };
}

function pickBest(pages) {
  for (const p of pages) {
    const info = p?.imageinfo?.[0];
    if (!info || !info.thumburl) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(info.mime || '')) continue;
    const lic = licenceOf(p);
    if (!OK_LICENCE.test(lic.name)) continue;
    return { page: p, info, lic };
  }
  return null;
}

// Commons rate-limits bursts with 429; back off and try again rather than
// dropping the card.
async function fetchWithRetry(url, tries = 4) {
  let wait = 900;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status !== 429 && res.status !== 503) return res;
    const retryAfter = Number(res.headers.get('retry-after')) * 1000;
    await sleep(Math.max(retryAfter || 0, wait));
    wait *= 2;
  }
  return fetch(url, { headers: { 'User-Agent': UA } });
}

async function download(url, dest) {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1200) throw new Error('suspiciously small image');
  await writeFile(dest, buf);
  return buf.length;
}

async function run() {
  const sets = [];
  if (!ONLY || ONLY === 'means') sets.push(['means', MEANS]);
  if (!ONLY || ONLY === 'clues') sets.push(['clues', CLUES]);

  const credits = [];
  let got = 0, skipped = 0, failed = 0;

  for (const [dir, items] of sets) {
    const outDir = path.join(ROOT, 'assets', 'images', dir);
    await mkdir(outDir, { recursive: true });

    for (const item of items) {
      if (got >= LIMIT) break;
      const dest = path.join(outDir, `${item.img}.jpg`);
      if (!FORCE && existsSync(dest)) { skipped++; continue; }

      const term = QUERY_OVERRIDES[item.name] || item.name;
      try {
        const pages = await search(term);
        const best = pickBest(pages);
        if (!best) {
          console.log(`  no open-licensed match  ${item.name}  (searched "${term}")`);
          failed++;
        } else {
          const bytes = await download(best.info.thumburl, dest);
          credits.push({
            card: item.name, file: `${dir}/${item.img}.jpg`,
            source: best.info.descriptionurl, artist: best.lic.artist,
            licence: best.lic.name, licenceUrl: best.lic.url
          });
          got++;
          console.log(`  ok  ${item.name}  <- ${best.lic.name}  (${(bytes / 1024).toFixed(0)}kB)`);
        }
      } catch (err) {
        failed++;
        console.log(`  fail  ${item.name}: ${err.message}`);
      }
      // Be a good citizen with the Commons API.
      await sleep(450);
    }
  }

  if (credits.length) {
    const creditsPath = path.join(ROOT, 'assets', 'images', 'CREDITS.md');
    let existing = '';
    try { existing = await readFile(creditsPath, 'utf8'); } catch { /* first run */ }
    const header = existing || `# Image Credits

Photographs below come from Wikimedia Commons and remain under the licence
listed for each file. Cards without a photograph are drawn procedurally by
\`js/art/procedural.js\` and need no attribution.

| Card | File | Author | Licence |
| --- | --- | --- | --- |
`;
    const rows = credits.map(c =>
      `| ${c.card} | \`${c.file}\` | ${c.artist || 'Unknown'} | [${c.licence}](${c.licenceUrl || c.source}) |`
    ).join('\n');
    await writeFile(creditsPath, header + rows + '\n');
    console.log(`\nWrote ${credits.length} credit rows to assets/images/CREDITS.md`);
  }

  console.log(`\nDownloaded ${got}, already present ${skipped}, no match ${failed}.`);
  console.log('Cards without a photo fall back to the procedural engraving automatically.');
}

run().catch(err => { console.error(err); process.exit(1); });
