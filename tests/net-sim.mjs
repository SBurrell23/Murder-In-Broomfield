// Headless multiplayer sweep.
//
// Runs the real Host and real Client classes over the loopback transport with
// latency and jitter, so message ordering, per-seat view filtering, reconnects
// and hostile clients are all exercised without a browser.

import { LoopbackHub, LoopbackTransport, MSG } from '../js/net/net.js';
import { Host, Client } from '../js/net/room.js';
import { PHASE, ROLE } from '../js/game/rules.js';

// Node has no web storage; the client guards with try/catch but give it a stub
// so the reconnect-token path is genuinely exercised rather than silently skipped.
const mem = new Map();
globalThis.sessionStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k)
};

let checks = 0; const failures = [];
const ok = (c, m) => { checks++; if (!c) failures.push(m); };
// Heavy jitter below means a round trip can take ~2x the jitter window, so
// every wait gets a floor comfortably above that.
const SETTLE_FLOOR = 140;
const settle = (ms = 40) => new Promise(r => setTimeout(r, Math.max(ms, SETTLE_FLOOR)));

async function scenario({ nClients, useAW, pickScientist, label }) {
  const hub = new LoopbackHub({ latency: 2, jitter: 18 });
  const hostT = new LoopbackTransport(hub, 'host');
  const host = new Host(hostT, { hostName: 'Halloran' });
  const code = await host.open('TEST');

  // Each client keeps its own copy of whatever the host sent it.
  const clients = [];
  for (let i = 0; i < nClients; i++) {
    const t = new LoopbackTransport(hub, 'c' + i);
    const c = new Client(t, { name: 'Detective ' + (i + 1), token: null });
    c._explicitToken = true;   // isolate: harness clients must not share tab storage
    c.errors = [];
    c.fx = [];
    c.on('error', m => c.errors.push(m));
    c.on('fx', f => c.fx.push(f));
    await c.join(code);
    clients.push(c);
  }
  await settle(120);

  ok(host.seats.length === nClients + 1, `${label}: all clients seated`);
  ok(clients.every(c => c.youId), `${label}: every client got a seat id`);
  ok(clients.every(c => c.lobby && c.lobby.players.length === nClients + 1), `${label}: lobby replicated`);
  ok(new Set(clients.map(c => c.youId)).size === nClients, `${label}: seat ids are unique`);

  // Duplicate names must be disambiguated.
  const names = host.seats.map(s => s.name);
  ok(new Set(names).size === names.length, `${label}: names unique`);

  if (pickScientist) {
    host.setSettings({ scientistId: clients[0].youId });
    await settle(30);
    ok(clients[0].lobby.settings.scientistId === clients[0].youId, `${label}: scientist choice replicated`);
  }
  host.setSettings({ useAccompliceWitness: useAW });
  await settle(30);

  // A client must not be able to change lobby settings by faking the message.
  clients[1].t.sendToHost({ t: MSG.LOBBY_SET, settings: { useAccompliceWitness: !useAW } });
  await settle(30);
  ok(host.settings.useAccompliceWitness === useAW, `${label}: clients cannot rewrite lobby settings`);

  ok(host.canStart(), `${label}: host can start`);
  const started = host.start();
  ok(started.ok, `${label}: game started`);
  await settle(80);

  // ---- view isolation: the single most important netcode property ----
  const g = host.game;
  const views = new Map();
  for (const c of clients) views.set(c.youId, c.view);
  ok(clients.every(c => c.view), `${label}: every client received a view`);

  for (const c of clients) {
    const v = c.view;
    const seat = host.seat(c.youId);
    const role = g.player(seat.id).role;
    ok(v.you.role === role, `${label}: client told its own role`);
    // No view may ever contain the raw solution unless entitled to it.
    const entitled = role === ROLE.SCIENTIST || role === ROLE.MURDERER || role === ROLE.ACCOMPLICE;
    if (!entitled) {
      ok(!v.secrets.meansId && !v.secrets.clueId,
        `${label}: ${role} never receives the murder cards`);
    }
    if (role === ROLE.INVESTIGATOR) {
      ok(Object.keys(v.secrets).length === 0, `${label}: investigator view carries no secrets at all`);
    }
    // The serialized payload must not smuggle roles for other players.
    const blob = JSON.stringify(v.players);
    ok(!blob.includes('"role"'), `${label}: public player list has no roles`);
  }

  // A client cannot act as someone else: the host keys off the connection, not
  // any id in the payload, so this forged action must be rejected outright.
  const murdererSeat = host.seat(g.murdererId);
  const impostor = clients.find(c => c.youId !== g.murdererId && c.youId !== g.scientistId);
  const beforeSolution = JSON.stringify(g.solution);
  impostor.t.sendToHost({
    t: MSG.ACTION,
    actorId: g.murdererId,                      // forged - must be ignored
    action: { type: 'chooseMurderCards', meansId: g.player(g.murdererId).hand.means[0], clueId: g.player(g.murdererId).hand.clues[0] }
  });
  await settle(60);
  ok(JSON.stringify(g.solution) === beforeSolution, `${label}: forged actor id is ignored`);
  ok(impostor.errors.length > 0, `${label}: impostor got an error back`);

  // ---- night ----
  const asClient = id => clients.find(c => c.youId === id);
  const murdererClient = asClient(g.murdererId);
  const mHand = g.player(g.murdererId).hand;
  const meansId = mHand.means[1], clueId = mHand.clues[2];

  if (murdererClient) murdererClient.action({ type: 'chooseMurderCards', meansId, clueId });
  else host.localAction({ type: 'chooseMurderCards', meansId, clueId });
  await settle(60);
  ok(g.phase === PHASE.NIGHT_REVIEW, `${label}: night review reached`);

  // Accomplice learns the cards only after the choice is made.
  if (g.accompliceId) {
    const ac = asClient(g.accompliceId);
    const av = ac ? ac.view : g.viewFor(g.accompliceId);
    ok(av.secrets.meansId === meansId && av.secrets.murdererId === g.murdererId,
      `${label}: accomplice briefed correctly`);
  }
  if (g.witnessId) {
    const wc = asClient(g.witnessId);
    const wv = wc ? wc.view : g.viewFor(g.witnessId);
    ok(wv.secrets.sawIds.length === 2 && !wv.secrets.meansId,
      `${label}: witness sees a pair but no cards`);
  }

  for (const c of clients) c.action({ type: 'acknowledgeBriefing' });
  host.localAction({ type: 'acknowledgeBriefing' });
  await settle(90);
  ok(g.phase === PHASE.SCIENTIST_SETUP, `${label}: setup phase reached`);

  // ---- setup: only the scientist may place bullets ----
  const sciClient = asClient(g.scientistId);
  const notSci = clients.find(c => c.youId !== g.scientistId);
  notSci.errors.length = 0;
  notSci.action({ type: 'placeBullet', target: 'cause', index: 3 });
  await settle(50);
  ok(g.tiles.cause.bullet === null, `${label}: non-scientist bullet refused`);
  ok(notSci.errors.length > 0, `${label}: non-scientist told why`);

  const sciAct = a => (sciClient ? sciClient.action(a) : host.localAction(a));
  sciAct({ type: 'placeBullet', target: 'cause', index: 2 });
  sciAct({ type: 'placeBullet', target: 'place', index: 4 });
  for (const s of g.tiles.scenes) sciAct({ type: 'placeBullet', target: 'scene', slot: s.slot, index: s.slot % 6 });
  await settle(90);
  sciAct({ type: 'confirmSetup' });
  await settle(70);
  ok(g.phase === PHASE.ROUND, `${label}: round 1 live`);
  ok(clients.every(c => c.view.tiles.cause.bullet === 2), `${label}: bullets replicated to all clients`);
  ok(clients.some(c => c.fx.some(f => f.kind === 'begin')), `${label}: begin fx broadcast`);

  // ---- a wrong badge, resolved by the scientist ----
  const accuser = clients.find(c => c.youId !== g.scientistId && g.player(c.youId).badge === 'held');
  const suspect = g.players.find(p => p.role !== ROLE.SCIENTIST && p.id !== accuser.youId && p.id !== g.murdererId)
    || g.players.find(p => p.role !== ROLE.SCIENTIST && p.id !== accuser.youId);
  accuser.action({ type: 'throwBadge', suspectId: suspect.id, meansId: suspect.hand.means[0], clueId: suspect.hand.clues[0] });
  await settle(60);
  ok(g.pendingAccusation !== null, `${label}: badge landed`);
  // The pending accusation must not leak whether it is correct.
  ok(clients.every(c => c.view.pendingAccusation && c.view.pendingAccusation.correct === undefined),
    `${label}: pending verdict is hidden until the scientist rules`);

  accuser.errors.length = 0;
  accuser.action({ type: 'resolveAccusation' });
  await settle(50);
  ok(g.pendingAccusation !== null, `${label}: accuser cannot rule on their own badge`);

  sciAct({ type: 'resolveAccusation' });
  await settle(70);
  ok(g.pendingAccusation === null, `${label}: scientist resolved the badge`);
  ok(clients.every(c => c.fx.some(f => f.kind === 'verdict')), `${label}: verdict fx reached everyone`);

  // ---- reconnect: drop a client mid-game and let it reclaim its seat ----
  if (g.phase === PHASE.ROUND) {
    const victim = clients.find(c => c.youId !== g.scientistId);
    const victimId = victim.youId;
    const savedRole = g.player(victimId).role;
    const victimToken = victim.token;
    victim.destroy();
    await settle(60);
    ok(host.seat(victimId) && !host.seat(victimId).connected, `${label}: dropped seat marked offline`);
    ok(host.seats.length === nClients + 1, `${label}: mid-game seat is held, not freed`);

    const t2 = new LoopbackTransport(hub, 'rejoin');
    const back = new Client(t2, { name: 'ignored', token: victimToken });
    await back.join(code);
    await settle(120);
    ok(back.youId === victimId, `${label}: reclaimed the original seat`);
    ok(host.seat(victimId).connected, `${label}: seat marked back online`);
    ok(back.view && back.view.you.role === savedRole, `${label}: role survived the reconnect`);
    ok(back.view.you.badge === g.player(victimId).badge, `${label}: badge state survived the reconnect`);
    clients[clients.indexOf(victim)] = back;
    back.fx = []; back.errors = [];
    back.on('fx', f => back.fx.push(f));
    back.on('error', m => back.errors.push(m));
  }

  // ---- run the game out to a conclusion ----
  let guard = 0;
  while (g.phase !== PHASE.OVER && guard++ < 40) {
    if (g.phase === PHASE.LAST_CHANCE) {
      const guesser = asClient(g.murdererId);
      const target = g.players.find(p => p.role !== ROLE.SCIENTIST && p.id !== g.murdererId && p.id !== g.accompliceId);
      if (guesser) guesser.action({ type: 'guessWitness', targetId: target.id });
      else host.localAction({ type: 'guessWitness', targetId: target.id });
      await settle(60);
      continue;
    }
    if (g.phase !== PHASE.ROUND) break;

    const holder = g.players.find(p => p.role !== ROLE.SCIENTIST && p.badge === 'held');
    if (host.game.replacementsUsed < 2) {
      sciAct({ type: 'beginReplacement' });
      await settle(40);
      const slot = g.tiles.scenes[0].slot;
      sciAct({ type: 'replaceScene', slot });
      await settle(40);
      sciAct({ type: 'placeBullet', target: 'scene', slot, index: 1 });
      await settle(40);
      sciAct({ type: 'confirmReplacement' });
      await settle(60);
    } else if (holder) {
      const c = asClient(holder.id);
      const susp = g.players.find(p => p.role !== ROLE.SCIENTIST && p.id !== holder.id);
      const truth = holder.id !== g.murdererId && susp.id === g.murdererId;
      const mi = truth ? meansId : susp.hand.means[0];
      const ci = truth ? clueId : susp.hand.clues[0];
      if (c) c.action({ type: 'throwBadge', suspectId: susp.id, meansId: mi, clueId: ci });
      else host.localAction({ type: 'throwBadge', suspectId: susp.id, meansId: mi, clueId: ci });
      await settle(50);
      sciAct({ type: 'resolveAccusation' });
      await settle(60);
    } else break;
  }

  ok(g.phase === PHASE.OVER, `${label}: game concluded (guard=${guard})`);
  await settle(80);
  ok(clients.every(c => c.view.phase === PHASE.OVER), `${label}: every client saw the ending`);
  ok(clients.every(c => c.view.secrets.murdererId === g.murdererId), `${label}: full reveal broadcast at the end`);
  ok(clients.some(c => c.fx.some(f => f.kind === 'gameOver')), `${label}: gameOver fx broadcast`);

  // ---- room full ----
  if (nClients + 1 === 6) {
    const extraT = new LoopbackTransport(hub, 'extra');
    const extra = new Client(extraT, { name: 'Latecomer' });
    extra._explicitToken = true;
    extra.errors = [];
    extra.on('error', m => extra.errors.push(m));
    await extra.join(code);
    await settle(90);
    ok(host.seats.length === 6, `${label}: seventh player refused`);
    ok(extra.errors.length > 0, `${label}: latecomer told the room is closed`);
    extra.destroy();
  }

  clients.forEach(c => c.destroy());
  host.destroy();
}

const cases = [
  { nClients: 3, useAW: false, pickScientist: false, label: '4p random-scientist' },
  { nClients: 4, useAW: false, pickScientist: true,  label: '5p chosen-scientist' },
  { nClients: 5, useAW: true,  pickScientist: true,  label: '6p accomplice+witness' },
  { nClients: 5, useAW: false, pickScientist: false, label: '6p no-pair' }
];

for (const c of cases) {
  try { await scenario(c); }
  catch (e) { failures.push(`${c.label} threw: ${e.stack || e.message}`); }
}

console.log(`\nAssertions: ${checks}`);
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  [...new Set(failures)].forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('Netcode sweep passed: seating, view isolation, forged actions, reconnect, full games.');
