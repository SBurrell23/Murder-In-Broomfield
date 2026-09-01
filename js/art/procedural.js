// Procedural card art.
//
// Every card renders from this module by default, so the game is complete with
// zero image files. Drop a real photo at assets/images/<means|clues>/<img>.<ext>
// and `cardImageSources()` will prefer it automatically; if the file is missing
// or fails to decode, the card falls back to the engraving below with no error.
//
// The look is a noir case-file plate: aged paper, a single ink glyph, a plate
// number and a stamped caption. Variation comes from hashing the card name, so
// a given card always draws identically.

const INK = '#14100c';
const INK_SOFT = '#3a3128';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// A tiny deterministic generator seeded from the card name.
function seeded(h) {
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- glyphs ---
// Each glyph draws inside a 0 0 100 100 box. Kept to strokes and simple fills
// so they read like engraved plates at any size.

const G = {
  blade: () => `
    <path d="M22 74 L58 26 L66 30 L34 80 Z" fill="${INK}"/>
    <path d="M22 74 L58 26" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>
    <rect x="28" y="74" width="18" height="7" rx="2" transform="rotate(-34 37 77)" fill="${INK_SOFT}"/>
    <path d="M60 78 L78 88" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  spike: () => `
    <path d="M50 16 L57 62 L50 88 L43 62 Z" fill="${INK}"/>
    <circle cx="50" cy="66" r="7" fill="${INK_SOFT}"/>
    <path d="M50 20 L50 84" stroke="#fff" stroke-opacity=".2" stroke-width="1.5"/>`,
  glass: () => `
    <path d="M32 20 L68 20 L62 54 Q50 66 38 54 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M40 62 L44 84 M56 62 L54 84" stroke="${INK}" stroke-width="3"/>
    <path d="M34 84 L66 84" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 22 L52 40 L46 44 L56 52" stroke="${INK_SOFT}" stroke-width="2" fill="none"/>`,
  gun: () => `
    <path d="M18 44 L74 44 L74 54 L46 54 L40 70 L26 70 L30 54 L18 54 Z" fill="${INK}"/>
    <circle cx="42" cy="49" r="6" fill="#efe6d6"/>
    <circle cx="42" cy="49" r="2.4" fill="${INK}"/>
    <path d="M74 46 L86 46 L86 52 L74 52 Z" fill="${INK_SOFT}"/>`,
  cord: () => `
    <path d="M26 20 Q14 46 34 56 Q56 68 40 82 Q30 90 20 84" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="M74 20 Q86 46 66 56 Q44 68 60 82 Q70 90 80 84" fill="none" stroke="${INK_SOFT}" stroke-width="5" stroke-linecap="round"/>`,
  blunt: () => `
    <path d="M40 84 L52 30" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
    <path d="M44 34 Q52 12 70 20 Q80 26 72 40 Q62 52 48 44 Z" fill="${INK}"/>
    <path d="M38 86 L52 86" stroke="${INK_SOFT}" stroke-width="6" stroke-linecap="round"/>`,
  poison: () => `
    <path d="M42 18 L58 18 L58 34 L68 52 L68 84 L32 84 L32 52 L42 34 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M34 60 L66 60 L66 82 L34 82 Z" fill="${INK}" opacity=".8"/>
    <circle cx="44" cy="70" r="3" fill="#efe6d6"/><circle cx="56" cy="70" r="3" fill="#efe6d6"/>
    <path d="M46 76 Q50 80 54 76" stroke="#efe6d6" stroke-width="2" fill="none"/>`,
  beast: () => `
    <path d="M24 70 Q30 40 50 38 Q70 40 76 70 Q64 82 50 82 Q36 82 24 70 Z" fill="${INK}"/>
    <path d="M34 44 L26 26 L44 36 M66 44 L74 26 L56 36" fill="${INK_SOFT}"/>
    <circle cx="42" cy="60" r="3.4" fill="#efe6d6"/><circle cx="58" cy="60" r="3.4" fill="#efe6d6"/>
    <path d="M44 72 L50 68 L56 72" stroke="#efe6d6" stroke-width="2" fill="none"/>`,
  smother: () => `
    <path d="M20 40 Q50 24 80 40 Q84 62 66 74 Q50 82 34 74 Q16 62 20 40 Z" fill="${INK}" opacity=".9"/>
    <path d="M30 44 Q50 36 70 44" stroke="#efe6d6" stroke-opacity=".5" stroke-width="2" fill="none"/>`,
  water: () => `
    <path d="M18 54 Q30 44 42 54 T66 54 T90 54" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M18 68 Q30 58 42 68 T66 68 T90 68" fill="none" stroke="${INK_SOFT}" stroke-width="4"/>
    <path d="M50 16 Q62 34 62 42 A12 12 0 0 1 38 42 Q38 34 50 16 Z" fill="${INK}"/>`,
  fire: () => `
    <path d="M50 14 Q66 34 62 48 Q76 44 72 62 Q68 84 50 86 Q32 84 28 62 Q24 44 38 48 Q34 34 50 14 Z" fill="${INK}"/>
    <path d="M50 44 Q58 56 54 66 Q50 76 44 68 Q40 58 50 44 Z" fill="#efe6d6" opacity=".7"/>`,
  shock: () => `
    <path d="M56 12 L30 54 L46 54 L40 88 L70 44 L52 44 Z" fill="${INK}"/>
    <path d="M20 30 L28 36 M80 30 L72 36 M18 66 L26 62 M82 66 L74 62" stroke="${INK_SOFT}" stroke-width="3" stroke-linecap="round"/>`,
  machine: () => `
    <circle cx="50" cy="50" r="24" fill="none" stroke="${INK}" stroke-width="6"/>
    <circle cx="50" cy="50" r="8" fill="${INK}"/>
    <g stroke="${INK}" stroke-width="6" stroke-linecap="round">
      <path d="M50 16 L50 26"/><path d="M50 74 L50 84"/><path d="M16 50 L26 50"/><path d="M74 50 L84 50"/>
      <path d="M26 26 L33 33"/><path d="M74 74 L67 67"/><path d="M74 26 L67 33"/><path d="M26 74 L33 67"/>
    </g>`,
  fall: () => `
    <path d="M20 84 L20 66 L38 66 L38 50 L56 50 L56 34 L80 34" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M66 62 L74 76 L58 76 Z" fill="${INK}"/>
    <path d="M70 44 L70 60" stroke="${INK_SOFT}" stroke-width="3" stroke-dasharray="4 4"/>`,
  crush: () => `
    <rect x="20" y="18" width="60" height="26" rx="3" fill="${INK}"/>
    <path d="M26 50 L34 62 M50 50 L50 62 M74 50 L66 62" stroke="${INK_SOFT}" stroke-width="3"/>
    <path d="M18 76 Q50 66 82 76 L82 86 L18 86 Z" fill="${INK}" opacity=".85"/>`,

  time: () => `
    <circle cx="50" cy="54" r="28" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M50 54 L50 36 M50 54 L64 60" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <rect x="44" y="16" width="12" height="10" rx="2" fill="${INK}"/>
    <circle cx="50" cy="54" r="3" fill="${INK}"/>`,
  jewel: () => `
    <path d="M34 32 L66 32 L80 50 L50 84 L20 50 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M20 50 L80 50 M34 32 L50 50 L66 32 M50 50 L50 84" stroke="${INK_SOFT}" stroke-width="2.5"/>`,
  groom: () => `
    <rect x="42" y="16" width="16" height="44" rx="6" fill="${INK}"/>
    <rect x="38" y="58" width="24" height="26" rx="4" fill="${INK_SOFT}"/>
    <path d="M46 22 L54 22" stroke="#efe6d6" stroke-width="2"/>`,
  optic: () => `
    <circle cx="42" cy="42" r="20" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M57 57 L80 82" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <path d="M32 36 Q42 30 52 36" stroke="#fff" stroke-opacity=".4" stroke-width="2.5" fill="none"/>`,
  paper: () => `
    <path d="M28 16 L64 16 L74 28 L74 86 L28 86 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M64 16 L64 28 L74 28" stroke="${INK}" stroke-width="4" fill="none"/>
    <path d="M38 42 L64 42 M38 54 L64 54 M38 66 L56 66" stroke="${INK_SOFT}" stroke-width="3"/>`,
  ticket: () => `
    <path d="M18 34 L82 34 L82 48 A7 7 0 0 0 82 62 L82 76 L18 76 L18 62 A7 7 0 0 0 18 48 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M50 38 L50 72" stroke="${INK_SOFT}" stroke-width="3" stroke-dasharray="5 5"/>
    <path d="M28 50 L42 50 M28 60 L38 60" stroke="${INK_SOFT}" stroke-width="3"/>`,
  money: () => `
    <rect x="18" y="32" width="64" height="38" rx="4" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="50" cy="51" r="11" fill="none" stroke="${INK}" stroke-width="3.5"/>
    <path d="M50 42 L50 60 M45 46 Q56 44 55 51 Q54 58 45 56" stroke="${INK}" stroke-width="2.5" fill="none"/>`,
  game: () => `
    <rect x="24" y="24" width="52" height="52" rx="8" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="38" cy="38" r="5" fill="${INK}"/><circle cx="62" cy="38" r="5" fill="${INK}"/>
    <circle cx="50" cy="50" r="5" fill="${INK}"/>
    <circle cx="38" cy="62" r="5" fill="${INK}"/><circle cx="62" cy="62" r="5" fill="${INK}"/>`,
  key: () => `
    <circle cx="32" cy="42" r="15" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M42 52 L78 84" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M64 70 L74 60 M72 78 L82 68" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  box: () => `
    <path d="M18 40 L50 24 L82 40 L82 74 L50 88 L18 74 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M18 40 L50 56 L82 40 M50 56 L50 88" stroke="${INK_SOFT}" stroke-width="3"/>`,
  smoke: () => `
    <rect x="18" y="56" width="52" height="14" rx="3" fill="${INK}"/>
    <rect x="70" y="56" width="12" height="14" rx="3" fill="${INK_SOFT}"/>
    <path d="M34 46 Q42 36 34 26 Q28 18 36 12" fill="none" stroke="${INK_SOFT}" stroke-width="3"/>`,
  drink: () => `
    <path d="M32 18 L68 18 L60 48 Q50 56 40 48 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M50 56 L50 80 M34 82 L66 82" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M36 30 L64 30" stroke="${INK}" stroke-width="6" opacity=".55"/>`,
  dine: () => `
    <path d="M30 16 L30 52 M22 16 L22 34 Q22 42 30 42 M38 16 L38 34 Q38 42 30 42 M30 52 L30 86" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M68 16 Q80 24 76 44 Q74 54 68 54 L68 86" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  cloth: () => `
    <path d="M34 24 L50 34 L66 24 L82 34 L76 50 L68 46 L68 84 L32 84 L32 46 L24 50 L18 34 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M42 26 Q50 40 58 26" stroke="${INK_SOFT}" stroke-width="3" fill="none"/>`,
  bag: () => `
    <rect x="20" y="38" width="60" height="44" rx="6" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M38 38 L38 28 Q50 20 62 28 L62 38" fill="none" stroke="${INK}" stroke-width="4"/>
    <rect x="44" y="54" width="12" height="12" rx="2" fill="${INK}"/>`,
  nav: () => `
    <circle cx="50" cy="50" r="30" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M64 36 L44 44 L36 64 L56 56 Z" fill="${INK}"/>
    <path d="M50 14 L50 20 M50 80 L50 86 M14 50 L20 50 M80 50 L86 50" stroke="${INK_SOFT}" stroke-width="3"/>`,
  book: () => `
    <path d="M20 24 Q34 18 50 24 Q66 18 80 24 L80 78 Q66 72 50 78 Q34 72 20 78 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M50 24 L50 78" stroke="${INK}" stroke-width="3.5"/>
    <path d="M28 38 L42 38 M28 50 L42 50 M58 38 L72 38 M58 50 L72 50" stroke="${INK_SOFT}" stroke-width="2.5"/>`,
  image: () => `
    <rect x="18" y="26" width="64" height="52" rx="4" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M18 64 L36 46 L50 58 L62 48 L82 66" fill="none" stroke="${INK}" stroke-width="3.5"/>
    <circle cx="63" cy="40" r="6" fill="${INK_SOFT}"/>`,
  music: () => `
    <path d="M40 74 L40 26 L74 18 L74 64" fill="none" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="32" cy="76" rx="11" ry="8" transform="rotate(-18 32 76)" fill="${INK}"/>
    <ellipse cx="66" cy="66" rx="11" ry="8" transform="rotate(-18 66 66)" fill="${INK}"/>
    <path d="M40 38 L74 30" stroke="${INK}" stroke-width="4"/>`,
  curio: () => `
    <path d="M50 16 Q74 28 74 54 Q74 80 50 88 Q26 80 26 54 Q26 28 50 16 Z" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="41" cy="48" r="6.5" fill="${INK}"/><circle cx="59" cy="48" r="6.5" fill="${INK}"/>
    <path d="M44 64 L50 58 L56 64" fill="none" stroke="${INK}" stroke-width="3"/>`
};

const FALLBACK_GLYPH = 'paper';

// -------------------------------------------------------------- rendering ---

function initials(name) {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

/**
 * Deterministic SVG plate for a card.
 * @param {{name:string, motif:string, id:string}} item
 * @param {'means'|'clues'} kind
 */
export function cardArtSVG(item, kind) {
  const h = hash(item.id + item.name);
  const rnd = seeded(h);
  const glyph = (G[item.motif] || G[FALLBACK_GLYPH])();
  const rot = (rnd() * 6 - 3).toFixed(2);
  const plate = String(h % 900 + 100);
  const accent = kind === 'means' ? '#7e1d1d' : '#8a6a24';
  const uid = 'a' + h.toString(36);

  // Speckle the paper so no two plates look identical.
  let speckles = '';
  for (let i = 0; i < 26; i++) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * 100).toFixed(1);
    const r = (rnd() * 0.9 + 0.2).toFixed(2);
    speckles += `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}" opacity="${(rnd() * 0.16 + 0.04).toFixed(2)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(item.name)}">
  <defs>
    <linearGradient id="pg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ded2b8"/><stop offset="0.55" stop-color="#cdbf9f"/><stop offset="1" stop-color="#b7a684"/>
    </linearGradient>
    <radialGradient id="vg${uid}" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/>
    </radialGradient>
  </defs>
  <rect width="100" height="130" fill="url(#pg${uid})"/>
  <g>${speckles}</g>
  <rect x="5" y="5" width="90" height="120" fill="none" stroke="${INK}" stroke-opacity=".55" stroke-width="0.9"/>
  <rect x="7.5" y="7.5" width="85" height="115" fill="none" stroke="${INK}" stroke-opacity=".28" stroke-width="0.4"/>
  <g transform="translate(50 56) rotate(${rot}) scale(0.74) translate(-50 -50)">${glyph}</g>
  <rect x="7.5" y="97" width="85" height="0.7" fill="${INK}" opacity=".4"/>
  <text x="50" y="110" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="8.5"
        fill="${INK}" letter-spacing="0.4">${esc(shorten(item.name))}</text>
  <text x="50" y="119.5" text-anchor="middle" font-family="Georgia, serif" font-size="4.6"
        fill="${accent}" letter-spacing="1.6">PLATE ${plate}</text>
  <text x="11" y="16" font-family="Georgia, serif" font-size="5" fill="${INK}" opacity=".5" letter-spacing="1">${initials(item.name)}</text>
  <rect width="100" height="130" fill="url(#vg${uid})"/>
</svg>`;
}

// Long names get a smaller effective width; trim gracefully rather than clip.
function shorten(name) {
  return name.length > 22 ? name.slice(0, 21).trimEnd() + '…' : name;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function svgDataUri(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Candidate real-photo paths for a card, in priority order. The card element
 * tries each and quietly settles on the engraving if none load.
 */
export function cardImageSources(item, kind) {
  const dir = kind === 'means' ? 'means' : 'clues';
  return ['webp', 'jpg', 'jpeg', 'png'].map(ext => `assets/images/${dir}/${item.img}.${ext}`);
}
