// Headless rules soak test. Plays thousands of randomised full games through
// the real engine and asserts the invariants that matter, including the ones a
// cheating client would try to break.

import { Game, PHASE, ROLE, MAX_ROUNDS } from '../js/game/rules.js';
import { makeRng } from '../js/util/rng.js';

let checks = 0, failures = [];
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

function mkPlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Player ' + (i + 1) }));
}

// Drive one whole game to a terminal state with random-but-legal choices.
function playGame(seed, nPlayers, useAW, style) {
  const rng = makeRng(seed);
  const players = mkPlayers(nPlayers);
  const pickScientist = rng() < 0.5 ? players[Math.floor(rng() * nPlayers)].id : null;
  const timerSeconds = seed % 3 === 0 ? 0 : 600;   // exercise both on and off
  const g = new Game({ players, seed, scientistId: pickScientist, useAccompliceWitness: useAW, timerSeconds });

  if (pickScientist) ok(g.scientistId === pickScientist, 'lobby-chosen scientist honoured');

  // --- role sanity -----------------------------------------------------
  const roles = g.players.map(p => p.role);
  ok(roles.filter(r => r === ROLE.SCIENTIST).length === 1, 'exactly one scientist');
  ok(roles.filter(r => r === ROLE.MURDERER).length === 1, 'exactly one murderer');
  ok(g.players.length === nPlayers, 'player count preserved');
  const expectPair = useAW && nPlayers >= 6;
  ok(!!g.accompliceId === expectPair, `accomplice presence matches config (n=${nPlayers})`);
  ok(!!g.witnessId === expectPair, `witness presence matches config (n=${nPlayers})`);

  // --- hands are disjoint and correctly sized ---------------------------
  const seenMeans = new Set(), seenClues = new Set();
  for (const p of g.players) {
    if (p.role === ROLE.SCIENTIST) {
      ok(p.hand.means.length === 0, 'scientist holds no cards');
      ok(p.badge === null, 'scientist has no badge');
      continue;
    }
    ok(p.hand.means.length === 4 && p.hand.clues.length === 4, 'hand is 4 + 4');
    ok(p.badge === 'held', 'non-scientist starts with a badge');
    for (const m of p.hand.means) { ok(!seenMeans.has(m), 'no duplicate means dealt'); seenMeans.add(m); }
    for (const c of p.hand.clues) { ok(!seenClues.has(c), 'no duplicate evidence dealt'); seenClues.add(c); }
  }

  // --- cheat attempts must be rejected ---------------------------------
  const investigator = g.players.find(p => p.role === ROLE.INVESTIGATOR || p.role === ROLE.WITNESS);
  ok(!g.dispatch(g.scientistId, { type: 'chooseMurderCards', meansId: 'M001', clueId: 'C001' }).ok,
    'scientist cannot choose the murder cards');
  const mHand = g.player(g.murdererId).hand;
  const foreign = g.players.find(p => p.id !== g.murdererId && p.role !== ROLE.SCIENTIST);
  const foreignMeans = foreign.hand.means[0];
  ok(!g.dispatch(g.murdererId, { type: 'chooseMurderCards', meansId: foreignMeans, clueId: mHand.clues[0] }).ok,
    'murderer cannot use a card from another hand');
  if (investigator) {
    ok(!g.dispatch(investigator.id, { type: 'placeBullet', target: 'cause', index: 0 }).ok,
      'non-scientist cannot place bullets');
  }
  ok(!g.dispatch(g.murdererId, { type: 'throwBadge', suspectId: foreign.id, meansId: foreign.hand.means[0], clueId: foreign.hand.clues[0] }).ok,
    'badges are not live during the night');

  // --- night ------------------------------------------------------------
  const meansId = mHand.means[Math.floor(rng() * 4)];
  const clueId = mHand.clues[Math.floor(rng() * 4)];
  ok(g.dispatch(g.murdererId, { type: 'chooseMurderCards', meansId, clueId }).ok, 'murderer commits');
  ok(g.phase === PHASE.NIGHT_REVIEW, 'moves to night review');

  // Secrets must be correctly scoped BEFORE the game ends.
  for (const p of g.players) {
    const v = g.viewFor(p.id);
    ok(v.you.role === p.role, 'view reports own role');
    if (p.role === ROLE.INVESTIGATOR) {
      ok(!v.secrets.murdererId && !v.secrets.meansId && !v.secrets.sawIds,
        'investigator learns nothing secret');
    }
    if (p.role === ROLE.SCIENTIST) {
      ok(v.secrets.murdererId === g.murdererId && v.secrets.meansId === meansId && v.secrets.clueId === clueId,
        'scientist knows the full solution');
    }
    if (p.role === ROLE.ACCOMPLICE) {
      ok(v.secrets.murdererId === g.murdererId && v.secrets.meansId === meansId,
        'accomplice knows murderer and cards');
    }
    if (p.role === ROLE.WITNESS) {
      ok(Array.isArray(v.secrets.sawIds) && v.secrets.sawIds.length === 2, 'witness saw two figures');
      ok(v.secrets.sawIds.includes(g.murdererId) && v.secrets.sawIds.includes(g.accompliceId),
        'witness saw the right pair');
      ok(!v.secrets.murdererId, 'witness cannot tell which is which');
    }
    // Nobody's private view ever leaks another player's role.
    ok(v.players.every(pp => pp.role === undefined), 'public player list carries no roles');
  }

  g.players.forEach(p => g.dispatch(p.id, { type: 'acknowledgeBriefing' }));
  ok(g.phase === PHASE.SCIENTIST_SETUP, 'all briefed -> setup');

  // --- scientist setup --------------------------------------------------
  ok(!g.dispatch(g.scientistId, { type: 'confirmSetup' }).ok, 'cannot confirm with bullets missing');
  ok(!g.dispatch(g.scientistId, { type: 'placeBullet', target: 'cause', index: 9 }).ok, 'bullet index bounds enforced');
  g.dispatch(g.scientistId, { type: 'placeBullet', target: 'cause', index: Math.floor(rng() * 6) });
  g.dispatch(g.scientistId, { type: 'placeBullet', target: 'place', index: Math.floor(rng() * 6) });
  for (const s of g.tiles.scenes) {
    g.dispatch(g.scientistId, { type: 'placeBullet', target: 'scene', slot: s.slot, index: Math.floor(rng() * 6) });
  }
  ok(g.timerEndsAt === null, 'clock does not run before the case opens');
  ok(g.dispatch(g.scientistId, { type: 'confirmSetup' }).ok, 'setup confirms once complete');
  ok(g.phase === PHASE.ROUND && g.round === 1, 'round 1 live');

  // The clock starts only once every bullet is down and the case is opened.
  if (timerSeconds) {
    ok(g.timerEndsAt !== null, 'clock starts when the case opens');
    const left = g.timerEndsAt - Date.now();
    ok(left > (timerSeconds - 5) * 1000 && left <= timerSeconds * 1000, 'clock starts at the configured length');
    ok(g.publicState().timerSeconds === timerSeconds, 'clock length is published');
    ok(typeof g.publicState().now === 'number', 'host clock reading is published for skew correction');
  } else {
    ok(g.timerEndsAt === null, 'no clock when the timer is disabled');
    ok(g.publicState().timerEndsAt === null, 'disabled clock publishes no deadline');
  }
  let lastDeadline = g.timerEndsAt;

  // --- rounds -----------------------------------------------------------
  let guard = 0;
  while (g.phase !== PHASE.OVER && guard++ < 60) {
    if (g.phase === PHASE.LAST_CHANCE) {
      const guesser = g.accompliceId && rng() < 0.5 ? g.accompliceId : g.murdererId;
      const candidates = g.players.filter(p => p.role !== ROLE.SCIENTIST && p.id !== g.murdererId && p.id !== g.accompliceId);
      const target = candidates[Math.floor(rng() * candidates.length)];
      ok(!g.dispatch(g.scientistId, { type: 'guessWitness', targetId: target.id }).ok,
        'scientist cannot make the last-chance guess');
      g.dispatch(guesser, { type: 'guessWitness', targetId: target.id });
      break;
    }

    if (g.phase !== PHASE.ROUND) break;

    const holders = g.players.filter(p => p.role !== ROLE.SCIENTIST && p.badge === 'held');
    // `style` steers how eager the table is to accuse, so we cover both the
    // solved-early and ran-out-of-rounds endings.
    const wantsThrow = holders.length && (style === 'trigger-happy' ? rng() < 0.8 : rng() < 0.25);

    if (wantsThrow) {
      const by = holders[Math.floor(rng() * holders.length)];
      const suspects = g.players.filter(p => p.role !== ROLE.SCIENTIST && p.id !== by.id);
      // Occasionally aim straight at the truth so correct verdicts get exercised.
      const aimTrue = rng() < 0.35 && by.id !== g.murdererId;
      const suspect = aimTrue ? g.player(g.murdererId) : suspects[Math.floor(rng() * suspects.length)];
      const useTrue = aimTrue && suspect.id === g.murdererId;
      const mi = useTrue ? meansId : suspect.hand.means[Math.floor(rng() * 4)];
      const ci = useTrue ? clueId : suspect.hand.clues[Math.floor(rng() * 4)];

      const before = by.badge;
      const r = g.dispatch(by.id, { type: 'throwBadge', suspectId: suspect.id, meansId: mi, clueId: ci });
      if (r.ok) {
        ok(before === 'held' && by.badge === 'spent', 'badge is consumed on throw');
        ok(g.pendingAccusation !== null, 'accusation is pending');
        // A second badge cannot land while one is on the table.
        const other = g.players.find(p => p.role !== ROLE.SCIENTIST && p.badge === 'held');
        if (other) {
          const os = g.players.find(p => p.role !== ROLE.SCIENTIST && p.id !== other.id);
          ok(!g.dispatch(other.id, { type: 'throwBadge', suspectId: os.id, meansId: os.hand.means[0], clueId: os.hand.clues[0] }).ok,
            'only one accusation at a time');
        }
        ok(!g.dispatch(by.id, { type: 'resolveAccusation' }).ok, 'accuser cannot rule on their own badge');
        const res = g.dispatch(g.scientistId, { type: 'resolveAccusation' });
        ok(res.ok, 'scientist resolves the badge');
        const truth = suspect.id === g.murdererId && mi === meansId && ci === clueId;
        ok(res.correct === truth, 'verdict matches the hidden solution');
      }
      continue;
    }

    // Otherwise the scientist advances the round.
    if (g.replacementsUsed >= 2) {
      // No replacements left and nobody is accusing: force badges out so the
      // game terminates rather than stalling.
      if (!holders.length) { ok(false, 'game stalled with no badges and no replacements'); break; }
      const by = holders[0];
      const suspect = g.players.find(p => p.role !== ROLE.SCIENTIST && p.id !== by.id);
      g.dispatch(by.id, { type: 'throwBadge', suspectId: suspect.id, meansId: suspect.hand.means[0], clueId: suspect.hand.clues[0] });
      if (g.pendingAccusation) g.dispatch(g.scientistId, { type: 'resolveAccusation' });
      continue;
    }

    ok(!g.dispatch(g.murdererId, { type: 'beginReplacement' }).ok, 'only scientist replaces tiles');
    const b = g.dispatch(g.scientistId, { type: 'beginReplacement' });
    if (!b.ok) break;
    const slot = g.tiles.scenes[Math.floor(rng() * g.tiles.scenes.length)].slot;
    const beforeTile = g.tiles.scenes.find(s => s.slot === slot).tileId;
    ok(g.dispatch(g.scientistId, { type: 'replaceScene', slot }).ok, 'scene replaced');
    const after = g.tiles.scenes.find(s => s.slot === slot);
    ok(after.tileId !== beforeTile, 'a genuinely new tile is drawn');
    ok(after.bullet === null, 'new tile starts unmarked');
    ok(!g.dispatch(g.scientistId, { type: 'confirmReplacement' }).ok, 'must mark the new tile first');
    // Marking a different, older tile must be refused mid-replacement.
    const otherSlot = g.tiles.scenes.find(s => s.slot !== slot);
    if (otherSlot) {
      ok(!g.dispatch(g.scientistId, { type: 'placeBullet', target: 'scene', slot: otherSlot.slot, index: 0 }).ok,
        'old tiles are locked during a replacement');
    }
    g.dispatch(g.scientistId, { type: 'placeBullet', target: 'scene', slot, index: Math.floor(rng() * 6) });
    const roundBefore = g.round;
    ok(g.dispatch(g.scientistId, { type: 'confirmReplacement' }).ok, 'replacement confirms');
    // Each new round gets a full clock. (The soak test finishes rounds inside a
    // single millisecond, so compare remaining time rather than the deadline
    // value, which can legitimately repeat.)
    if (timerSeconds && g.round > roundBefore && g.phase === PHASE.ROUND) {
      const remaining = g.timerEndsAt - Date.now();
      ok(g.timerEndsAt !== null, 'clock is running in the new round');
      ok(remaining > (timerSeconds - 5) * 1000 && remaining <= timerSeconds * 1000,
        'new round starts with a full clock');
      ok(g.timerEndsAt >= lastDeadline, 'clock deadline never moves backwards');
      lastDeadline = g.timerEndsAt;
    }
  }

  ok(g.phase === PHASE.OVER, `game reached a terminal state (guard=${guard})`);
  ok(g.timerEndsAt === null, 'clock is cleared once the case closes');
  ok(g.winner === 'investigators' || g.winner === 'murderer', 'a side won');
  ok(g.round <= MAX_ROUNDS + 1, 'round counter stayed in range');

  // After the game, everyone may see the truth.
  for (const p of g.players) {
    const v = g.viewFor(p.id);
    ok(v.secrets.murdererId === g.murdererId, 'final view reveals the murderer to all');
  }
  const reveal = g.finalReveal();
  ok(reveal.meansId === meansId && reveal.clueId === clueId, 'reveal matches the committed cards');

  // A correct badge must never coexist with a murderer win unless the witness
  // was successfully unmasked.
  const solved = g.accusations.some(a => a.correct);
  if (solved && g.winner === 'murderer') {
    ok(g.lastChanceGuess && g.lastChanceGuess.correct, 'murderer only survives a solve by naming the witness');
  }
  if (!solved) ok(g.winner === 'murderer', 'unsolved games go to the murderer');

  return g.winner;
}

// ------------------------------------------------------------------ run ---
const tally = { investigators: 0, murderer: 0 };
const styles = ['trigger-happy', 'cagey'];
let games = 0;
for (let seed = 1; seed <= 1200; seed++) {
  const n = 4 + (seed % 3);              // 4, 5, 6
  const useAW = seed % 2 === 0;
  const style = styles[seed % styles.length];
  try {
    tally[playGame(seed, n, useAW, style)]++;
    games++;
  } catch (e) {
    failures.push(`seed ${seed} (n=${n}, aw=${useAW}) threw: ${e.message}`);
  }
}

console.log(`\nGames played : ${games}`);
console.log(`Assertions   : ${checks}`);
console.log(`Outcomes     : investigators ${tally.investigators} / murderer ${tally.murderer}`);
if (failures.length) {
  const uniq = [...new Set(failures)];
  console.log(`\nFAILURES (${failures.length} total, ${uniq.length} distinct):`);
  uniq.slice(0, 25).forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('\nAll rules invariants held.');
