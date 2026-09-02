// Card rendering with a real-photo-first, engraving-fallback image strategy.
//
// Swapping in real art is a pure file drop: put <img>.jpg (or .webp/.png) in
// assets/images/means or assets/images/clues and it is used automatically. If
// the file is absent or fails to decode, the procedural plate renders instead,
// so the game never shows a broken image.

import { el } from './dom.js';
import { MEANS } from '../data/means.js';
import { CLUES } from '../data/clues.js';
import { ALL_TILES } from '../data/tiles.js';
import { cardArtSVG, svgDataUri, cardImageSources } from '../art/procedural.js';

const MEANS_BY_ID = new Map(MEANS.map(m => [m.id, m]));
const CLUES_BY_ID = new Map(CLUES.map(c => [c.id, c]));
const TILES_BY_ID = new Map(ALL_TILES.map(t => [t.id, t]));

export const meansById = id => MEANS_BY_ID.get(id) || null;
export const clueById  = id => CLUES_BY_ID.get(id) || null;
export const tileById  = id => TILES_BY_ID.get(id) || null;

export function itemById(id) {
  return MEANS_BY_ID.get(id) || CLUES_BY_ID.get(id) || null;
}
export function kindOf(id) {
  return MEANS_BY_ID.has(id) ? 'means' : 'clues';
}
export function nameOf(id) {
  const it = itemById(id);
  return it ? it.name : '(unknown)';
}

// Card art source.
//
// The procedural engravings are the default: they are consistent, legible at
// card size, and unmistakably of a piece with the rest of the game. The scraped
// photographs vary wildly in framing and quality, so they are opt-in.
//
// Turn photographs on with ?photos=1 (or off again with ?photos=0); the choice
// is remembered. assets/images and the fetch/review tools stay in place, so
// this is a one-flag decision either way.
const PHOTO_KEY = 'mib.usePhotos';

function photosEnabled() {
  try {
    const q = new URLSearchParams(location.search).get('photos');
    if (q === '1' || q === 'true') { localStorage.setItem(PHOTO_KEY, '1'); return true; }
    if (q === '0' || q === 'false') { localStorage.removeItem(PHOTO_KEY); return false; }
    return localStorage.getItem(PHOTO_KEY) === '1';
  } catch {
    return false;
  }
}

export const usePhotos = photosEnabled;

let manifest = null;

export async function loadImageManifest(url = 'assets/images/manifest.json') {
  if (!photosEnabled()) return null;   // engravings need no lookup
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && typeof json === 'object') manifest = json;
    return manifest;
  } catch {
    return null;   // no manifest is a perfectly normal state
  }
}

function manifestSource(item, kind) {
  if (!manifest) return null;
  const dir = kind === 'means' ? 'means' : 'clues';
  const file = manifest[dir] && manifest[dir][item.img];
  return file ? `assets/images/${dir}/${file}` : undefined;   // undefined = known-absent
}

// Engravings are generated once per card and reused.
const artCache = new Map();
function artFor(item, kind) {
  const key = item.id;
  if (!artCache.has(key)) artCache.set(key, svgDataUri(cardArtSVG(item, kind)));
  return artCache.get(key);
}

/**
 * Build a card element.
 * @param {string} id            means or clue id
 * @param {object} opts          { size, pickable, picked, dim, solution, onPick, title }
 */
export function cardEl(id, opts = {}) {
  const kind = kindOf(id);
  const item = itemById(id);
  const { size = '', pickable = false, picked = false, dim = false,
          solution = false, onPick = null, title = null } = opts;

  if (!item) return el('div.card', { title: 'Unknown card' });

  const node = el('div.card', {
    // The kind class carries the border colour, which is what tells means from
    // evidence now that the row labels are gone.
    class: [kind === 'means' ? 'card-means' : 'card-clue',
            size ? 'card-' + size : '', pickable ? 'is-pickable' : '',
            picked ? 'is-picked' : '', dim ? 'is-dim' : '',
            solution ? 'is-solution' : '',
            opts.animate ? 'is-dealing' : ''].filter(Boolean).join(' '),
    title: title || item.name,
    'data-card': id
  });

  const img = el('img.card-img', { alt: item.name, loading: 'lazy', decoding: 'async' });
  const label = el('span.card-name', { text: item.name });

  // Engravings unless photographs are switched on. When they are, walk the
  // candidate paths; the first that decodes wins, and anything missing or
  // undecodable falls back to the engraving.
  const fromManifest = manifestSource(item, kind);
  const sources = !photosEnabled()
    ? []
    : fromManifest === undefined && manifest
      ? []                                // manifest says this card has no photo
      : fromManifest ? [fromManifest] : cardImageSources(item, kind);
  let attempt = 0;
  const tryNext = () => {
    if (attempt < sources.length) {
      img.src = sources[attempt++];
    } else {
      node.classList.add('is-art');
      img.onerror = null;
      img.src = artFor(item, kind);
    }
  };
  img.onerror = tryNext;
  img.onload = () => { if (!node.classList.contains('is-art')) node.classList.remove('is-art'); };
  tryNext();

  node.append(img, label);

  attachPreview(node, item, kind);

  if (pickable && onPick) {
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-pressed', String(picked));
    const fire = e => { e.preventDefault(); onPick(id, node); };
    node.addEventListener('click', fire);
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') fire(e);
    });
  }
  return node;
}

// ------------------------------------------------------------- preview ---
// Cards are small on a crowded table, so hovering one shows it at a readable
// size immediately. No delay: the whole point is to glance and move on.

let previewEl = null;

function previewNode() {
  if (previewEl) return previewEl;
  previewEl = el('div.card-preview', { 'aria-hidden': 'true' });
  document.body.append(previewEl);
  return previewEl;
}

function showPreview(item, kind, anchor) {
  const box = previewNode();
  // Class first so the sizing rules apply before anything is measured.
  box.className = 'card-preview is-on ' + (kind === 'means' ? 'card-means' : 'card-clue');
  box.innerHTML = '';
  const img = el('img', { alt: '', src: artFor(item, kind) });
  // If a photograph is in use for this card, preview that instead.
  const src = manifestSource(item, kind);
  if (photosEnabled() && src) img.src = src;
  // Art only. The name is already printed on the card, so repeating it here
  // just covered the illustration.
  box.append(img);

  // Sit beside the card, flipped or nudged to stay on screen.
  // Measure the preview rather than assuming its size. These were hard-coded
  // and went stale when the preview grew, so the clamp used a height barely
  // three quarters of the real one and let it run off the bottom of the screen.
  const r = anchor.getBoundingClientRect();
  const W = box.offsetWidth || 260;
  const H = box.offsetHeight || Math.round(W * 1.3);
  const pad = 12, edge = 10;

  let left = r.right + pad;
  if (left + W > window.innerWidth - edge) left = r.left - W - pad;
  left = Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - W - edge));

  let top = r.top + r.height / 2 - H / 2;
  top = Math.min(Math.max(edge, top), Math.max(edge, window.innerHeight - H - edge));

  box.style.left = Math.round(left) + 'px';
  box.style.top = Math.round(top) + 'px';
}

function hidePreview() {
  if (previewEl) previewEl.classList.remove('is-on');
}

function attachPreview(node, item, kind) {
  node.addEventListener('pointerenter', () => showPreview(item, kind, node));
  node.addEventListener('pointerleave', hidePreview);
  // A card can be removed mid-hover when the board re-renders.
  node.addEventListener('pointercancel', hidePreview);
}

/** Hide any open preview - used when the board re-renders under the pointer. */
export function dismissCardPreview() { hidePreview(); }

/** A read-only strip of cards. */
export function cardRow(ids, opts = {}) {
  return el('div.hand-cards', null, ids.map(id => cardEl(id, opts)));
}
