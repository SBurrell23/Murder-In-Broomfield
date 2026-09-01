// Everything the player sees once a case is underway: the night briefing, the
// board, the table, the side rail, the accusation builder and the ending.
//
// This module is a pure function of the view the host sent us. It never derives
// game truth locally - if it is not in the view, this client does not know it.

import { el, $, clear, showScreen, openModal, closeModal, toast } from './dom.js';
import { cardEl, meansById, clueById, tileById, nameOf, dismissCardPreview } from './cards.js';
import * as fx from './fx.js';
import { audio } from '../audio/sfx.js';

const PHASE = {
  NIGHT_MURDERER: 'night_murderer',
  NIGHT_REVIEW: 'night_review',
  SCIENTIST_SETUP: 'scientist_setup',
  ROUND: 'round',
  REPLACING: 'replacing',
  LAST_CHANCE: 'last_chance',
  OVER: 'over'
};

const ROLE_COPY = {
  scientist: {
    title: 'Forensic Scientist',
    line: 'You know everything. You may say nothing.',
    body: 'You have read the file. From here you speak only through the bullets you place on the scene tiles. Not a word, not a look, not a sigh.'
  },
  murderer: {
    title: 'The Murderer',
    line: 'You did it. Now sit still.',
    body: 'Choose the weapon and the piece of evidence you left behind. Both are already face up in front of you, which is the problem.'
  },
  accomplice: {
    title: 'The Accomplice',
    line: 'You held the door.',
    body: 'You know who did it and exactly what they used. Steer the room away from them without ever looking like you are steering.'
  },
  witness: {
    title: 'The Witness',
    line: 'You saw two figures in the dark.',
    body: 'You cannot say which of them held the knife. Say too much and the murderer will come looking for you before the night is out.'
  },
  investigator: {
    title: 'Investigator',
    line: 'You know nothing. Yet.',
    body: 'Read the tiles, read the room, and spend your badge only when you are sure. You get exactly one.'
  }
};

let ctx = null;          // { act, youId }
let lastPhase = null;
let accuse = { suspectId: null, meansId: null, clueId: null };

// Round clock. The host sends an absolute deadline plus its own clock reading;
// we hold the skew so every table counts down to the same real moment. The
// clock is advisory - reaching zero changes nothing but the sound.
const clock = { endsAt: null, skew: 0, timer: null, beeped: false, lastPip: null };

// The deal animation belongs to the moment the cards arrive, not to every
// subsequent re-render. Without this, placing one bullet re-animated every
// hand on the table.
let dealt = false;

export function initGameUI(context) { ctx = context; }
export function resetGameUI() {
  lastPhase = null;
  dealt = false;
  lastTileIds.clear();
  accuse = { suspectId: null, meansId: null, clueId: null };
  stopClock();
}

const act = a => ctx && ctx.act(a);

// ============================================================== render ===

export function renderView(view) {
  if (!view) return;

  if (view.phase === PHASE.NIGHT_MURDERER || view.phase === PHASE.NIGHT_REVIEW) {
    stopClock();
    showScreen('night');
    renderNight(view);
  } else if (view.phase === PHASE.OVER) {
    stopClock();
    showScreen('over');
    renderOver(view);
  } else {
    showScreen('game');
    renderGame(view);
  }
  lastPhase = view.phase;
}

// =============================================================== clock ===

function stopClock() {
  clearInterval(clock.timer);
  clock.timer = null;
  clock.endsAt = null;
  clock.beeped = false;
  clock.lastPip = null;
  const box = $('#round-clock');
  if (box) { box.hidden = true; box.className = 'round-clock'; }
}

function syncClock(view) {
  const box = $('#round-clock');
  if (!box) return;

  if (!view.timerEndsAt || view.phase === PHASE.OVER) {
    if (clock.endsAt !== null) stopClock();
    else box.hidden = true;
    return;
  }

  // Correct for the difference between the host's clock and ours.
  if (typeof view.now === 'number') clock.skew = Date.now() - view.now;

  if (clock.endsAt !== view.timerEndsAt) {
    clock.endsAt = view.timerEndsAt;
    clock.beeped = false;
    clock.lastPip = null;
  }
  box.hidden = false;
  if (!clock.timer) clock.timer = setInterval(paintClock, 250);
  paintClock();
}

function paintClock() {
  const box = $('#round-clock');
  const out = $('#clock-value');
  if (!box || !out || clock.endsAt === null) return;

  const msLeft = clock.endsAt - (Date.now() - clock.skew);
  const secs = Math.max(0, Math.ceil(msLeft / 1000));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  out.textContent = `${mm}:${String(ss).padStart(2, '0')}`;

  box.classList.toggle('is-low', secs > 0 && secs <= 60);
  box.classList.toggle('is-done', secs === 0);

  // A pip for each of the last five seconds, then the beep once at zero.
  if (secs > 0 && secs <= 5 && clock.lastPip !== secs) {
    clock.lastPip = secs;
    audio.clockTick();
  }
  if (secs === 0 && !clock.beeped) {
    clock.beeped = true;
    audio.timeUp();
  }
}

// =============================================================== night ===

function renderNight(view) {
  const host = $('#night-inner');
  clear(host);

  const role = view.you.role;
  const copy = ROLE_COPY[role];
  const isMurdererPicking = role === 'murderer' && view.phase === PHASE.NIGHT_MURDERER;

  const dossier = el('div.dossier');
  dossier.append(
    el('p.dossier-eyebrow', { text: 'Broomfield Police Department  //  Confidential' }),
    el('h2', { text: 'Your Dossier' }),
    el('p.role-line', { class: 'role-' + role, text: copy.title }),
    el('p', { text: copy.line }),
    el('p', { text: copy.body })
  );

  // What this seat is entitled to know.
  const knows = knowledgeList(view);
  if (knows.length) dossier.append(el('ul.know-list', null, knows));

  if (isMurdererPicking) {
    dossier.append(renderMurdererPicker(view));
  } else if (view.phase === PHASE.NIGHT_MURDERER) {
    dossier.append(el('p.waiting-note', { text: 'The murderer is choosing' }));
  } else if (role === 'scientist') {
    dossier.append(
      el('div', { style: { marginTop: '1.4rem' } },
        el('button.btn.btn-primary.btn-lg', {
          text: 'I Have Read The File',
          onclick: e => { audio.click(); e.currentTarget.disabled = true; act({ type: 'acknowledgeBriefing' }); }
        })),
      el('p.action-note', { style: { marginTop: '.8rem' },
        text: 'The others are reading their own dossiers. Open the case when you are ready.' })
    );
  } else {
    // Everyone but the scientist just reads and waits.
    dossier.append(el('p.waiting-note', { text: 'The Forensic Scientist is reading the file' }));
  }

  host.append(dossier);
}

function knowledgeList(view) {
  const s = view.secrets || {};
  const out = [];
  if (s.murdererName) {
    out.push(el('li', null, 'The murderer is ', el('strong', { text: s.murdererName }), '.'));
  }
  if (s.accompliceName && view.you.role !== 'accomplice') {
    out.push(el('li', null, 'Their accomplice is ', el('strong', { text: s.accompliceName }), '.'));
  }
  if (s.witnessName && view.you.role === 'scientist') {
    out.push(el('li', null, 'The witness is ', el('strong', { text: s.witnessName }), '.'));
  }
  if (s.meansId) {
    out.push(el('li', null, 'The weapon was ', el('strong', { text: nameOf(s.meansId) }),
      ' and the evidence left behind was ', el('strong', { text: nameOf(s.clueId) }), '.'));
  }
  if (s.sawNames && s.sawNames.length) {
    out.push(el('li', null, 'You saw two figures: ',
      el('strong', { text: s.sawNames.join(' and ') }),
      '. One of them did it. You cannot say which.'));
  }
  return out;
}

function renderMurdererPicker(view) {
  const me = view.players.find(p => p.id === view.you.id);
  const wrap = el('div.pick-grid');
  let picked = { meansId: null, clueId: null };

  // The murderer picks from their own hand, but the choice only makes sense
  // against what everyone else is holding - a weapon nobody can confuse with
  // another player's is a short game. So the whole table is shown first.
  const others = view.players.filter(p => !p.isScientist && p.id !== view.you.id);
  if (others.length) {
    const table = el('div.pick-table');
    for (const p of others) {
      table.append(el('div.pick-seat', null,
        el('h5', { text: p.name }),
        el('div.hand-row', null,
          el('div.hand-cards', null, p.hand.means.map(id => cardEl(id, { size: 'sm' })))),
        el('div.hand-row', null,
          el('div.hand-cards', null, p.hand.clues.map(id => cardEl(id, { size: 'sm' }))))));
    }
    wrap.append(el('div.pick-group', null,
      el('h4', { text: 'What everyone else is holding' }),
      table));
  }

  const confirm = el('button.btn.btn-danger.btn-lg', {
    text: 'Commit The Deed', disabled: true,
    onclick: () => {
      if (!picked.meansId || !picked.clueId) return;
      audio.click();
      confirm.disabled = true;
      act({ type: 'chooseMurderCards', meansId: picked.meansId, clueId: picked.clueId });
    }
  });

  const group = (label, ids, key) => {
    const row = el('div.pick-cards');
    const g = el('div.pick-group', null, el('h4', { text: label }), row);
    ids.forEach(id => {
      const c = cardEl(id, {
        size: 'lg', pickable: true,
        onPick: (cardId, node) => {
          audio.flip();
          picked[key] = cardId;
          [...row.children].forEach(n => {
            n.classList.toggle('is-picked', n === node);
            n.setAttribute('aria-pressed', String(n === node));
          });
          confirm.disabled = !(picked.meansId && picked.clueId);
        }
      });
      row.append(c);
    });
    return g;
  };

  wrap.append(
    group('The weapon you used', me.hand.means, 'meansId'),
    group('The evidence you left', me.hand.clues, 'clueId'),
    el('div', null, confirm)
  );
  return wrap;
}

// ================================================================ game ===

function renderGame(view) {
  dismissCardPreview();
  syncClock(view);
  renderHead(view);
  renderBoard(view);
  renderTable(view);
  renderLog(view);
  renderActions(view);
}

function renderHead(view) {
  $('#round-num').textContent = view.round;
  $('#phase-line').textContent = phaseLine(view);

  // The Forensic Scientist is named for everyone, always - they hold the file
  // and everyone needs to know who to watch. Your own role sits beside it.
  const chip = $('#you-chip');
  clear(chip);
  const role = view.you.role;
  const sci = view.players.find(p => p.id === view.scientistId);

  // When you are the scientist the two chips would say the same thing twice.
  if (role !== 'scientist') {
    chip.append(el('span.chip-part', null,
      el('span.chip-label', { text: 'You' }),
      el('span.role-name', { class: 'role-' + role, text: ROLE_COPY[role].title })));
  }

  chip.append(el('span.chip-part.chip-sci', null,
    el('span.chip-label', { text: 'Forensic Scientist' }),
    el('span.role-name.role-scientist', {
      text: (sci ? sci.name : '-') + (role === 'scientist' ? ' - You' : '')
    })));
}

function phaseLine(view) {
  const sci = view.players.find(p => p.id === view.scientistId);
  const sciName = sci ? sci.name : 'The Forensic Scientist';
  const iAmSci = view.you.id === view.scientistId;

  if (view.pendingAccusation) {
    const by = view.players.find(p => p.id === view.pendingAccusation.byId);
    const at = view.players.find(p => p.id === view.pendingAccusation.suspectId);
    return `${by?.name} has accused ${at?.name}. ${iAmSci ? 'Rule on it.' : `${sciName} is checking the file.`}`;
  }
  switch (view.phase) {
    case PHASE.SCIENTIST_SETUP:
      return iAmSci ? 'Mark one option on every tile, then open the case.'
                    : `${sciName} is reading the evidence.`;
    case PHASE.REPLACING:
      return iAmSci
        ? (view.replacingSlot === null ? 'Choose a scene tile to replace.' : 'Mark the new tile.')
        : `${sciName} is revising the file.`;
    case PHASE.LAST_CHANCE:
      return 'The badge landed. The murderer has one last card to play: name the witness.';
    default:
      return 'The floor is open. Talk it through.';
  }
}

// A scene tile should flip once, when it is actually swapped. Keying off the
// REPLACING phase re-ran the flip on every later render - including when the
// scientist placed the new tile's bullet, so it flipped a second time.
const lastTileIds = new Map();
function justSwapped(entry) {
  if (entry.target !== 'scene') return false;
  const prev = lastTileIds.get(entry.slot);
  lastTileIds.set(entry.slot, entry.tileId);
  return prev !== undefined && prev !== entry.tileId;
}

function renderBoard(view) {
  const row = $('#tile-row');
  clear(row);
  const iAmSci = view.you.id === view.scientistId;

  const entries = [
    { ...view.tiles.cause, key: 'cause', target: 'cause' },
    { ...view.tiles.place, key: 'place', target: 'place' },
    ...view.tiles.scenes.map(s => ({ ...s, key: 'scene-' + s.slot, target: 'scene' }))
  ];

  for (const entry of entries) {
    const tile = tileById(entry.tileId);
    if (!tile) continue;

    const canMark = iAmSci && (
      (view.phase === PHASE.SCIENTIST_SETUP) ||
      (view.phase === PHASE.REPLACING && entry.target === 'scene' && entry.slot === view.replacingSlot)
    );
    const canPickForSwap = iAmSci && view.phase === PHASE.REPLACING &&
      view.replacingSlot === null && entry.target === 'scene';

    const node = el('div.tile', {
      class: [
        'tile-' + tile.kind,
        canMark ? 'is-live' : '',
        canMark && entry.bullet === null ? 'needs-bullet' : '',
        canPickForSwap ? 'is-selectable' : '',
        justSwapped(entry) ? 'is-replacing' : ''
      ].filter(Boolean).join(' '),
      'data-tile': entry.key
    });

    node.append(el('div.tile-head', null,
      el('div', null,
        el('div.tile-title', { text: tile.title })),
      el('span.tile-kind')));

    const list = el('ul.tile-options');
    tile.options.forEach((opt, i) => {
      const marked = entry.bullet === i;
      const dot = el('span.opt-dot');
      if (marked) dot.append(el('span.bullet'));

      const li = el('li');
      const optNode = el(canMark ? 'button.tile-opt' : 'div.tile-opt', {
        class: marked ? 'is-marked' : '',
        type: canMark ? 'button' : null,
        'data-opt': i,
        onclick: canMark ? (() => {
          audio.click();
          act({ type: 'placeBullet', target: entry.target, slot: entry.slot ?? null, index: i });
        }) : null
      }, dot, el('span.opt-label', { text: opt }));

      li.append(optNode);
      list.append(li);
    });
    node.append(list);

    if (canPickForSwap) {
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      const swap = () => { audio.flip(); act({ type: 'replaceScene', slot: entry.slot }); };
      node.addEventListener('click', swap);
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); swap(); } });
    }
    row.append(node);
  }
}

function renderTable(view) {
  const host = $('#table');
  clear(host);

  const pending = view.pendingAccusation;

  // Every hand sits under the board together, yours included and marked as
  // such. The Forensic Scientist holds no cards and is named in the header, so
  // they get no seat here.
  for (const p of view.players) {
    const target = host;
    if (p.isScientist) continue;

    const isSuspect = pending && pending.suspectId === p.id;
    const offline = p.connected === false;
    const card = el('div.seat-card', {
      class: [p.id === view.you.id ? 'is-you' : '', isSuspect ? 'is-suspect' : '',
              offline ? 'is-offline' : ''].filter(Boolean).join(' '),
      'data-seat': p.id
    });

    const flags = el('span.seat-flags');
    if (offline) flags.append(el('span.badge-pip', { class: 'is-spent', text: 'Disconnected' }));
    flags.append(el('span.badge-pip', {
      class: p.badge === 'spent' ? 'is-spent' : '',
      text: p.badge === 'spent' ? 'Badge Spent' : 'Badge'
    }));

    const isYou = p.id === view.you.id;
    if (isYou) {
      // Only ever rendered in your own view, so this reveals nothing.
      flags.prepend(el('span.badge-pip.pip-role', {
        class: 'role-' + view.you.role,
        text: ROLE_COPY[view.you.role].title
      }));
    }
    card.append(el('div.seat-card-head', null,
      el('span.seat-card-name', { text: p.name + (isYou ? ' - You' : '') }),
      flags));

    // Both hands are public - that is the whole puzzle. Means carry an orange
    // border and evidence a blue one, which reads faster than a row label and
    // leaves the whole width for the cards themselves.
    const solutionIds = view.phase === PHASE.OVER ? [view.secrets?.meansId, view.secrets?.clueId] : [];
    const deal = !dealt;
    const hand = el('div.hand');
    hand.append(
      el('div.hand-row', null,
        el('div.hand-cards', null, p.hand.means.map(id =>
          cardEl(id, { solution: solutionIds.includes(id), animate: deal })))),
      el('div.hand-row', null,
        el('div.hand-cards', null, p.hand.clues.map(id =>
          cardEl(id, { solution: solutionIds.includes(id), animate: deal }))))
    );
    card.append(hand);
    target.append(card);
  }

  dealt = true;
}

function renderLog(view) {
  const log = $('#log');
  clear(log);
  // The list is column-reverse, so appending in order puts newest on top.
  for (const entry of view.log) {
    log.append(el('li', { class: 'kind-' + entry.kind, text: entry.text }));
  }
}

function renderActions(view) {
  const stack = $('#action-stack');
  clear(stack);

  const iAmSci = view.you.id === view.scientistId;
  const me = view.players.find(p => p.id === view.you.id);

  // --- what only you know ---
  const s = view.secrets || {};
  if (s.meansId || s.murdererName || s.sawNames) {
    const box = el('div.secret-box', null, el('h4', { text: 'Known Only To You' }));
    if (s.murdererName) box.append(el('p', null, 'Murderer: ', el('strong', { text: s.murdererName })));
    if (s.accompliceName && view.you.role !== 'accomplice') box.append(el('p', null, 'Accomplice: ', el('strong', { text: s.accompliceName })));
    if (s.witnessName && iAmSci) box.append(el('p', null, 'Witness: ', el('strong', { text: s.witnessName })));
    if (s.sawNames) box.append(el('p', null, 'You saw: ', el('strong', { text: s.sawNames.join(' and ') })));
    if (s.meansId) {
      box.append(el('div.secret-cards', null,
        cardEl(s.meansId, { size: 'sm' }), cardEl(s.clueId, { size: 'sm' })));
    }
    stack.append(box);
  }

  // --- scientist controls ---
  if (iAmSci) {
    if (view.pendingAccusation) {
      // The engine already knows the truth; the button says which way it falls,
      // so the Scientist controls the timing without being able to lie.
      const a = view.pendingAccusation;
      const correct = a.suspectId === s.murdererId && a.meansId === s.meansId && a.clueId === s.clueId;
      stack.append(
        el('p.action-note', null,
          'They named ', el('strong', { text: nameOf(a.meansId) }), ' and ',
          el('strong', { text: nameOf(a.clueId) }), '.'),
        el('button', {
          class: 'btn ' + (correct ? 'btn-primary' : 'btn-danger'),
          text: correct ? 'Mark It Correct' : 'Mark It Wrong',
          onclick: () => { audio.click(); act({ type: 'resolveAccusation' }); }
        }));
    } else if (view.phase === PHASE.SCIENTIST_SETUP) {
      const placed = view.tiles.cause.bullet !== null && view.tiles.place.bullet !== null &&
        view.tiles.scenes.every(t => t.bullet !== null);
      stack.append(
        el('p.action-note', { text: placed ? 'Every tile is marked.' : 'Mark one option on each tile above.' }),
        el('button.btn.btn-primary', {
          text: 'Open The Case', disabled: !placed,
          onclick: () => { audio.click(); act({ type: 'confirmSetup' }); }
        }));
    } else if (view.phase === PHASE.ROUND) {
      const left = 2 - view.replacementsUsed;
      stack.append(
        el('p.action-note', {
          text: left > 0
            ? `You may replace a scene tile ${left} more time${left === 1 ? '' : 's'}.`
            : 'No replacements remain. The badges must decide it.'
        }),
        left > 0 ? el('button.btn', {
          text: 'End Round & Replace A Tile',
          onclick: () => { audio.click(); act({ type: 'beginReplacement' }); }
        }) : null);
    } else if (view.phase === PHASE.REPLACING) {
      const slot = view.replacingSlot;
      const target = slot !== null ? view.tiles.scenes.find(t => t.slot === slot) : null;
      stack.append(
        el('p.action-note', {
          text: slot === null ? 'Pick the scene tile to swap out.' : 'Mark the new tile, then continue.'
        }),
        el('button.btn.btn-primary', {
          text: 'Begin Next Round',
          disabled: !target || target.bullet === null,
          onclick: () => { audio.click(); act({ type: 'confirmReplacement' }); }
        }));
    }
  }

  // --- badge ---
  if (!iAmSci && me && me.badge === 'held' && view.phase === PHASE.ROUND && !view.pendingAccusation) {
    stack.append(el('button.btn.btn-danger', {
      text: 'Throw Your Badge',
      onclick: () => { audio.click(); openAccuse(view); }
    }));
  } else if (!iAmSci && me && me.badge === 'spent') {
    stack.append(el('p.action-note', { text: 'Your badge is spent. All you have left is your voice.' }));
  }

  // --- last chance ---
  if (view.phase === PHASE.LAST_CHANCE) {
    const canGuess = view.you.role === 'murderer' || view.you.role === 'accomplice';
    if (canGuess) {
      stack.append(el('p.action-note', { text: 'Name the witness and the case is yours.' }));
      const targets = view.players.filter(p =>
        !p.isScientist && p.id !== s.murdererId && p.id !== s.accompliceId && p.id !== view.you.id);
      targets.forEach(p => stack.append(el('button.btn', {
        text: p.name,
        onclick: () => { audio.click(); act({ type: 'guessWitness', targetId: p.id }); }
      })));
    } else {
      stack.append(el('p.action-note', { text: 'The murderer is deciding who saw them.' }));
    }
  }

  if (!stack.children.length) {
    stack.append(el('p.action-note', { text: 'Nothing to do but talk.' }));
  }
}

// ========================================================== accusation ===

function openAccuse(view) {
  accuse = { suspectId: null, meansId: null, clueId: null };
  const body = $('#accuse-body');
  clear(body);

  const confirmBtn = $('#btn-accuse-confirm');
  confirmBtn.disabled = true;
  confirmBtn.onclick = () => {
    if (!accuse.suspectId || !accuse.meansId || !accuse.clueId) return;
    closeModal('modal-accuse');
    act({ type: 'throwBadge', ...accuse });
  };

  const suspects = view.players.filter(p => !p.isScientist && p.id !== view.you.id);
  const cardsHost = el('div');

  const suspectRow = el('div.suspect-row', null, suspects.map(p =>
    el('button.suspect-btn', {
      type: 'button', text: p.name,
      onclick: e => {
        audio.click();
        accuse.suspectId = p.id;
        accuse.meansId = null; accuse.clueId = null;
        [...suspectRow.children].forEach(b => b.classList.toggle('is-on', b === e.currentTarget));
        renderAccuseCards(p, cardsHost, confirmBtn);
        confirmBtn.disabled = true;
      }
    })));

  body.append(
    el('div.accuse-step', null, el('h4', { text: 'Step 1  //  The suspect' }), suspectRow),
    cardsHost
  );
  if (!suspects.length) body.append(el('p.accuse-empty', { text: 'There is no one to accuse.' }));

  openModal('modal-accuse');
}

function renderAccuseCards(player, host, confirmBtn) {
  clear(host);

  const mkGroup = (label, ids, key) => {
    const row = el('div.hand-cards');
    ids.forEach(id => row.append(cardEl(id, {
      size: 'lg', pickable: true,
      onPick: (cardId, node) => {
        audio.flip();
        accuse[key] = cardId;
        [...row.children].forEach(n => {
          n.classList.toggle('is-picked', n === node);
          n.setAttribute('aria-pressed', String(n === node));
        });
        confirmBtn.disabled = !(accuse.suspectId && accuse.meansId && accuse.clueId);
      }
    })));
    return el('div.accuse-step', null, el('h4', { text: label }), row);
  };

  host.append(
    mkGroup(`Step 2  //  The weapon ${player.name} used`, player.hand.means, 'meansId'),
    mkGroup(`Step 3  //  The evidence ${player.name} left`, player.hand.clues, 'clueId')
  );
}

// ============================================================== ending ===

function renderOver(view) {
  const host = $('#over-inner');
  clear(host);

  const s = view.secrets || {};
  const win = view.winner;
  const iWon = didIWin(view);

  host.append(
    el('div.verdict-banner', {
      class: 'win-' + win,
      text: win === 'investigators' ? 'Case Closed' : 'The Murderer Walks'
    }),
    el('p.verdict-reason', { text: view.winReason || '' }),
    el('p.verdict-reason', {
      class: iWon ? 'is-good' : '',
      text: iWon ? 'You were on the winning side.' : 'Your side lost this one.'
    })
  );

  const grid = el('div.reveal-grid');
  grid.append(
    el('div.reveal-card', null,
      el('h4', { text: 'The Murderer' }),
      el('div.big', { text: s.murdererName || '(unknown)' })),
    el('div.reveal-card', null,
      el('h4', { text: 'The Weapon And The Evidence' }),
      el('div.reveal-cards', null,
        s.meansId ? cardEl(s.meansId, { size: 'lg', solution: true }) : null,
        s.clueId ? cardEl(s.clueId, { size: 'lg', solution: true }) : null),
      el('div.big', { style: { fontSize: '.95rem', marginTop: '.5rem' },
        text: s.meansId ? `${nameOf(s.meansId)} / ${nameOf(s.clueId)}` : '' })),
    el('div.reveal-card', null,
      el('h4', { text: 'How It Went' }),
      el('ul.roster', null, view.accusations.length
        ? view.accusations.map(a => {
            const by = view.players.find(p => p.id === a.byId);
            const at = view.players.find(p => p.id === a.suspectId);
            return el('li', null,
              el('span.r-name', { text: `${by?.name} to ${at?.name}` }),
              el('span.r-role', {
                class: a.correct ? 'role-scientist' : 'role-murderer',
                text: a.correct ? 'Correct' : 'Wrong'
              }));
          })
        : [el('li', null, el('span.r-name', { text: 'No badge was ever thrown.' }))]))
  );
  host.append(grid);

  host.append(
    el('div.side-block', { style: { textAlign: 'left', maxWidth: '420px', margin: '0 auto 2rem' } },
      el('h3', { text: 'Everyone At The Table' }),
      el('ul.roster', null, rosterRows(view))));

  const actions = el('div', { style: { display: 'flex', gap: '.8rem', justifyContent: 'center', flexWrap: 'wrap' } });
  if (ctx && ctx.isHost) {
    actions.append(el('button.btn.btn-primary.btn-lg', {
      text: 'Open A New Case',
      onclick: () => { audio.click(); ctx.restart(); }
    }));
  } else {
    actions.append(el('p.action-note', { text: 'Waiting for the host to open a new case.' }));
  }
  actions.append(el('button.btn.btn-ghost', {
    text: 'Leave', onclick: () => { audio.click(); ctx.leave(); }
  }));
  host.append(actions);
}

function rosterRows(view) {
  const s = view.secrets || {};
  return view.players.map(p => {
    let role = 'Investigator';
    if (p.isScientist) role = 'Forensic Scientist';
    else if (p.id === s.murdererId) role = 'Murderer';
    else if (p.id === s.accompliceId) role = 'Accomplice';
    else if (p.id === s.witnessId) role = 'Witness';
    const cls = 'role-' + role.toLowerCase().replace(/[^a-z]/g, '');
    return el('li', null,
      el('span.r-name', { text: p.name + (p.id === view.you.id ? ' (you)' : '') }),
      el('span.r-role', { class: cls, text: role }));
  });
}

function didIWin(view) {
  const murderSide = view.you.role === 'murderer' || view.you.role === 'accomplice';
  if (view.you.role === 'scientist') return view.winner === 'investigators';
  return view.winner === 'murderer' ? murderSide : !murderSide;
}

// =============================================================== effects ===

/** Play a broadcast effect. Runs on every client so the table sees one beat. */
export function playFx(f, view) {
  switch (f.kind) {
    case 'bullet': {
      const key = f.target === 'scene' ? 'scene-' + f.slot : f.target;
      // The board re-renders on the same tick, so wait a frame for the new node.
      requestAnimationFrame(() => {
        const tile = document.querySelector(`[data-tile="${key}"]`);
        const opt = tile && tile.querySelector(`[data-opt="${f.index}"] .opt-dot`);
        fx.bulletDrop(opt || tile);
      });
      break;
    }
    case 'badge': {
      requestAnimationFrame(() => {
        const from = document.querySelector(`[data-seat="${f.byId}"]`);
        const to = document.querySelector(`[data-seat="${f.suspectId}"]`);
        fx.badgeThrow(from, to);
      });
      break;
    }
    case 'verdict':
      fx.verdictStamp(f.correct);
      break;
    case 'round':
      fx.roundWipe(f.round);
      break;
    case 'begin':
      fx.caseOpen();
      break;
    case 'witnessGuess':
      fx.verdictStamp(f.correct);
      break;
    case 'gameOver':
      setTimeout(() => fx.gameOverFx(f.winner), 400);
      break;
  }
}
