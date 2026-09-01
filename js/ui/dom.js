// Small DOM helpers, the screen router and toasts.

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div.card', { onclick }, child, 'text') */
export function el(spec, props = null, ...kids) {
  const [tagPart, ...classes] = String(spec).split('.');
  const tag = tagPart || 'div';
  const node = document.createElement(tag);
  if (classes.length) node.className = classes.join(' ');

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// ------------------------------------------------------------- screens ---

let currentScreen = 'title';

export function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + name));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

export function activeScreen() { return currentScreen; }

// -------------------------------------------------------------- toasts ---

export function toast(message, kind = '', ms = 3400) {
  const stack = $('#toast-stack');
  if (!stack) return;
  const t = el('div.toast', { text: message });
  if (kind) t.classList.add('is-' + kind);
  stack.append(t);
  setTimeout(() => {
    t.classList.add('is-out');
    setTimeout(() => t.remove(), 320);
  }, ms);
  // Never let the stack run away during a noisy sequence.
  while (stack.children.length > 4) stack.firstChild.remove();
}

// -------------------------------------------------------------- modals ---

export function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.hidden = false;
  const focusable = m.querySelector('input, button, select, [tabindex]');
  if (focusable) setTimeout(() => focusable.focus(), 40);
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.hidden = true;
}

// Wire the shared close affordances once at boot.
export function wireModals() {
  $$('.modal-back').forEach(back => {
    back.addEventListener('click', e => {
      if (e.target === back || e.target.hasAttribute('data-close')) back.hidden = true;
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = $$('.modal-back').filter(m => !m.hidden);
    if (open.length) open[open.length - 1].hidden = true;
  });
}

/** Centre point of an element in viewport coordinates, for the fx stage. */
export function centerOf(node) {
  if (!node) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
