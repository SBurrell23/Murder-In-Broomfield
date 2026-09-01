// Per-item card artwork.
//
// One drawing per card, keyed by the `img` slug in js/data/means.js and
// js/data/clues.js. Each value is an SVG fragment drawn inside a 0 0 100 100
// box, which procedural.js inlines into the card plate.
//
// Files are split only to keep them a readable size; the split has no meaning
// beyond that. A slug with no entry here falls back to a generic motif icon,
// so the game is never broken by a gap.

import M1 from './means-1.js';
import M2 from './means-2.js';
import M3 from './means-3.js';
import M4 from './means-4.js';
import C1 from './clues-1.js';
import C2 from './clues-2.js';
import C3 from './clues-3.js';
import C4 from './clues-4.js';

export const ITEM_GLYPHS = Object.assign({}, M1, M2, M3, M4, C1, C2, C3, C4);
