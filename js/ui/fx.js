// The effect stage. Each routine paints onto a fixed overlay, fires the matching
// synthesized cue, and cleans itself up. Everything is positioned from live
// element rects so effects land on the actual tile or seat involved.

import { el, $, centerOf } from './dom.js';
import { audio } from '../audio/sfx.js';

const stage = () => $('#fx-stage');
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STALE_MS = 2600;

function mount(node, ms) {
  const s = stage();
  if (!s) return;
  // Sweep anything left over from an earlier beat. In a throttled background
  // tab neither animationend nor the timer is reliable, so every new effect
  // also takes responsibility for clearing stale ones.
  const now = Date.now();
  for (const child of [...s.children]) {
    if (now - Number(child.dataset.born || 0) > STALE_MS) child.remove();
  }
  node.dataset.born = String(now);
  s.append(node);
  // Two independent cleanups: animationend for the normal case, and a timer as
  // a backstop. A backgrounded tab throttles both, so also sweep the stage when
  // the page becomes visible again - otherwise a stale effect could linger.
  const done = () => node.remove();
  node.addEventListener('animationend', done, { once: true });
  setTimeout(done, reduced() ? 250 : ms);
}

// Any effect still on the stage when we come back into view is stale by
// definition: effects are momentary and the board has since re-rendered.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const s = stage();
  if (s) while (s.firstChild) s.firstChild.remove();
});

// Effects are positioned from live element rects, but the board is taller than
// most viewports, so the seat or tile involved may be scrolled out of sight.
// Clamping keeps the effect on screen; `focusOn` pulls the element into view
// first when the point of the effect is to make everyone look at it.
function clamp(p, margin = 90) {
  return {
    x: Math.min(Math.max(p.x, margin), window.innerWidth - margin),
    y: Math.min(Math.max(p.y, margin), window.innerHeight - margin)
  };
}

function isOffScreen(node) {
  if (!node) return true;
  const r = node.getBoundingClientRect();
  return r.bottom < 40 || r.top > window.innerHeight - 40;
}

function focusOn(node) {
  if (!node || !isOffScreen(node)) return false;
  try {
    node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    return true;
  } catch { return false; }
}

function shake(intensity = 'soft') {
  if (reduced()) return;
  const app = document.getElementById('app');
  const cls = intensity === 'hard' ? 'shake-hard' : 'shake-soft';
  app.classList.remove('shake-hard', 'shake-soft');
  void app.offsetWidth;              // restart the animation
  app.classList.add(cls);
  setTimeout(() => app.classList.remove(cls), 620);
}

/** A brass casing drops onto a marked option. */
export function bulletDrop(targetNode) {
  audio.bulletPlace();
  if (!targetNode) return;
  const { x, y } = clamp(centerOf(targetNode));

  mount(el('div.fx-bullet', { style: { left: x + 'px', top: y + 'px' } }), 900);
  mount(el('div.fx-ring',   { style: { left: x + 'px', top: y + 'px' } }), 1250);

  const flash = el('div.fx-flash');
  flash.style.setProperty('--fx-x', x + 'px');
  flash.style.setProperty('--fx-y', y + 'px');
  mount(flash, 400);
  shake('soft');
}

const BADGE_SVG = `
<svg viewBox="0 0 92 108" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6dd93"/><stop offset=".45" stop-color="#c9a227"/><stop offset="1" stop-color="#6d5415"/>
    </linearGradient>
  </defs>
  <path d="M46 3 L86 17 V56 Q86 88 46 105 Q6 88 6 56 V17 Z" fill="url(#bg)" stroke="#3d2f0b" stroke-width="2.5"/>
  <path d="M46 12 L78 23 V56 Q78 82 46 96 Q14 82 14 56 V23 Z" fill="none" stroke="#7a6018" stroke-width="1.6"/>
  <circle cx="46" cy="45" r="13" fill="none" stroke="#2e2408" stroke-width="3"/>
  <path d="M56 55 L69 68" stroke="#2e2408" stroke-width="4.5" stroke-linecap="round"/>
  <text x="46" y="84" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="12"
        font-weight="900" fill="#2e2408" letter-spacing="1.5">BFD</text>
</svg>`;

/** A badge is hurled from the accuser toward the suspect. */
export function badgeThrow(fromNode, toNode) {
  audio.badgeThrow();
  if (focusOn(toNode)) {
    // Let the scroll land before measuring, or the badge aims at a stale rect.
    requestAnimationFrame(() => requestAnimationFrame(() => paintBadge(fromNode, toNode)));
    return;
  }
  paintBadge(fromNode, toNode);
}

function paintBadge(fromNode, toNode) {
  const to = clamp(centerOf(toNode));
  const from = fromNode
    ? clamp(centerOf(fromNode))
    : { x: to.x - window.innerWidth * 0.3, y: to.y + 200 };

  mount(el('div.fx-dim'), 1600);

  const badge = el('div.fx-badge', { html: BADGE_SVG, style: { left: to.x + 'px', top: to.y + 'px' } });
  badge.style.setProperty('--from-dx', (from.x - to.x) + 'px');
  badge.style.setProperty('--from-dy', (from.y - to.y) + 'px');
  mount(badge, 1700);

  mount(el('div.fx-shockwave', { style: { left: to.x + 'px', top: to.y + 'px' } }), 1700);
  setTimeout(() => shake('hard'), reduced() ? 0 : 700);
}

/** The Forensic Scientist rules on a badge. */
export function verdictStamp(correct) {
  if (correct) audio.verdictCorrect(); else audio.verdictWrong();

  const word = correct ? 'Correct' : 'Wrong';
  mount(el('div.fx-verdict', {
    class: correct ? 'is-correct' : 'is-wrong',
    text: word
  }), 1400);

  if (correct) {
    // A spray of blood behind a landed accusation.
    const wrap = el('div.fx-spatter');
    for (let i = 0; i < 26; i++) {
      const size = 5 + Math.random() * 22;
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 320;
      const d = el('div.fx-drop', {
        style: {
          left: '50%', top: '46%',
          width: size + 'px', height: size * (0.7 + Math.random() * 0.6) + 'px',
          animationDelay: (Math.random() * 0.22) + 's'
        }
      });
      d.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      d.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      wrap.append(d);
    }
    mount(wrap, 1600);
  }
  shake('hard');
}

/** Wipe between rounds. */
export function roundWipe(round) {
  audio.roundAdvance();
  const w = el('div.fx-round', null, el('div.fx-round-text', { text: `Round ${round}` }));
  mount(w, 1700);
}

/** The curtain lifting as the case opens. */
export function caseOpen() {
  audio.gameStart();
  mount(el('div.fx-open'), 1700);
}

export function gameOverFx(winner) {
  if (winner === 'investigators') audio.winSting(); else audio.loseSting();
  shake('soft');
}

export function dealSound(n = 1) {
  for (let i = 0; i < n; i++) audio.deal(i);
}
