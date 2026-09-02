// One table, many cases. Tiles must not repeat while the table has fresh ones
// left, or a run of bad luck hands the same board to a group twice in a row.
//
// The rule under test is deck behaviour, not shuffle behaviour: locations and
// scene tiles used earlier in a session go to the discard pile and stay there
// until the deck runs out, at which point the discards come back in.

import { Game, PHASE, ROLE, MAX_ROUNDS, emptyTileHistory } from '../js/game/rules.js';
import { LOCATIONS, SCENE_TILES } from '../js/data/tiles.js';
import { Host } from '../js/net/room.js';
import { LoopbackHub, LoopbackTransport } from '../js/net/net.js';
import { makeRng } from '../js/util/rng.js';

let checks = 0;
const failures = [];
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

const players = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Player ' + (i + 1) }));

/**
 * Play one case start to finish with nobody throwing a badge, so it runs the
 * full three rounds and both scene tile replacements happen. That is the
 * six-tile case - the most a single game can consume.
 */
function playQuietCase(g, rng) {
  const murderer = g.player(g.murdererId);
  g.dispatch(g.murdererId, {
    type: 'chooseMurderCards',
    meansId: murderer.hand.means[0],
    clueId: murderer.hand.clues[0]
  });
  g.dispatch(g.scientistId, { type: 'acknowledgeBriefing' });

  const mark = (target, slot) => g.dispatch(g.scientistId,
    { type: 'placeBullet', target, slot, index: Math.floor(rng() * 6) });

  // Deal order, not board order: the four opening tiles, then each replacement
  // as it is laid down. Which tile came off the deck when is the whole point.
  const dealt = g.tiles.scenes.map(s => s.tileId);

  mark('cause');
  mark('place');
  for (const s of [...g.tiles.scenes]) mark('scene', s.slot);
  ok(g.phase === PHASE.ROUND, 'case opened');

  // Two replacements carry it through rounds two and three.
  while (g.phase === PHASE.ROUND && g.round < MAX_ROUNDS) {
    const before = g.round;
    g.dispatch(g.scientistId, { type: 'beginReplacement' });
    const slot = g.tiles.scenes[Math.floor(rng() * g.tiles.scenes.length)].slot;
    g.dispatch(g.scientistId, { type: 'replaceScene', slot });
    dealt.push(g.tiles.scenes.find(x => x.slot === slot).tileId);
    mark('scene', slot);
    ok(g.round === before + 1, 'marking the fresh tile advanced the round');
  }
  return { place: g.tiles.place.tileId, scenes: dealt };
}

// --------------------------------------------------------------- engine ---
// Fifteen consecutive cases at one table. Six scene tiles a case against a
// forty tile deck means the deck turns over inside this run, so both the
// no-repeat rule and the reshuffle get exercised.
console.log('Engine: consecutive cases at one table');
{
  const rng = makeRng(0xC0FFEE);
  let history = emptyTileHistory();
  let placeTurnovers = 0, sceneTurnovers = 0;

  // The property, stated once and applied to both decks: while the table still
  // has fresh tiles, every tile it is dealt is one it has not seen. Only after
  // the fresh ones run out - the deck turning over mid-deal - may a used tile
  // come back, and then the history restarts from the tiles dealt after it.
  function auditDeck(deckSize, prevSeen, dealt, nextSeen, label, caseNo) {
    const freshBefore = deckSize - prevSeen.length;
    const seen = new Set(prevSeen);
    dealt.slice(0, freshBefore).forEach(id => {
      ok(!seen.has(id),
        `case ${caseNo}: ${label} ${id} repeated with ${freshBefore} fresh tiles still in the deck`);
    });
    ok(new Set(dealt).size === dealt.length, `case ${caseNo}: ${label} dealt twice in one game`);

    if (dealt.length > freshBefore) {
      ok(nextSeen.length === dealt.length - freshBefore,
        `case ${caseNo}: after the ${label} deck turned over the history holds only the new cycle`);
      return 1;
    }
    const expected = new Set([...prevSeen, ...dealt]);
    ok(nextSeen.length === (expected.size >= deckSize ? 0 : expected.size),
      `case ${caseNo}: ${label} history accounts for every tile dealt`);
    ok(nextSeen.length < deckSize, `case ${caseNo}: ${label} history never fills up`);
    return expected.size >= deckSize ? 1 : 0;
  }

  for (let caseNo = 1; caseNo <= 15; caseNo++) {
    const g = new Game({ players: players(6), seed: 0x1000 + caseNo, seenTiles: history });
    const dealt = playQuietCase(g, rng);
    ok(dealt.scenes.length === 6, `case ${caseNo}: a full case deals six scene tiles`);

    const before = history;
    history = g.tileHistoryAfter();
    placeTurnovers += auditDeck(LOCATIONS.length, before.places, [dealt.place], history.places, 'location', caseNo);
    sceneTurnovers += auditDeck(SCENE_TILES.length, before.scenes, dealt.scenes, history.scenes, 'scene tile', caseNo);
  }
  ok(placeTurnovers >= 1, 'the location deck turned over within fifteen cases');
  ok(sceneTurnovers >= 1, 'the scene deck turned over within fifteen cases');
  console.log(`  15 cases, 90 scene tiles dealt, ${sceneTurnovers} scene turnover(s), ${placeTurnovers} location turnover(s)`);
}

// A table that abandons cases without finishing them still burns its tiles.
console.log('\nEngine: an abandoned case still consumes its tiles');
{
  let history = emptyTileHistory();
  const g1 = new Game({ players: players(4), seed: 7, seenTiles: history });
  const opening = g1.tiles.scenes.map(s => s.tileId);
  history = g1.tileHistoryAfter();               // walked away during setup
  ok(history.scenes.length === 4, 'the four tiles on the table were recorded');
  ok(opening.every(id => history.scenes.includes(id)), 'the right four were recorded');
  ok(history.places.includes(g1.tiles.place.tileId), 'the location was recorded');

  const g2 = new Game({ players: players(4), seed: 8, seenTiles: history });
  ok(g2.tiles.scenes.every(s => !opening.includes(s.tileId)), 'the next case avoids all four');
  ok(g2.tiles.place.tileId !== g1.tiles.place.tileId, 'the next case avoids the location');
}

// The whole deck, one case at a time, to prove the cycle is exhaustive rather
// than merely unlikely to repeat.
console.log('\nEngine: a full cycle deals every tile exactly once');
{
  let history = emptyTileHistory();
  const seenPlaces = [];
  const seenScenes = [];
  for (let i = 0; i < 10; i++) {
    const g = new Game({ players: players(4), seed: 900 + i, seenTiles: history });
    seenPlaces.push(g.tiles.place.tileId);
    seenScenes.push(...g.tiles.scenes.map(s => s.tileId));
    history = g.tileHistoryAfter();
  }
  ok(new Set(seenPlaces).size === LOCATIONS.length,
    `ten cases dealt all ${LOCATIONS.length} locations, got ${new Set(seenPlaces).size}`);
  ok(new Set(seenScenes).size === 40, `ten four-tile cases dealt 40 distinct scene tiles, got ${new Set(seenScenes).size}`);
  ok(history.places.length === 0, 'a completed location cycle resets');
  ok(history.scenes.length === 0, 'a completed scene cycle resets');
  console.log(`  every location and every scene tile dealt once across ten cases`);
}

// A fresh game with no history behaves exactly as before.
{
  const a = new Game({ players: players(5), seed: 42 });
  const b = new Game({ players: players(5), seed: 42, seenTiles: emptyTileHistory() });
  ok(a.tiles.place.tileId === b.tiles.place.tileId, 'an empty history changes nothing');
  ok(a.tiles.scenes.map(s => s.tileId).join() === b.tiles.scenes.map(s => s.tileId).join(),
    'an empty history deals the same scene tiles');
}

// ----------------------------------------------------------------- host ---
// The history has to survive the trip back to the lobby, which is the whole
// point: it is the room that remembers, not the game.
console.log('\nHost: history survives return-to-lobby');
{
  const hub = new LoopbackHub();
  const host = new Host(new LoopbackTransport(hub, 'host-a'), { hostName: 'Halloran' });
  await host.open('ROOMA');
  for (let i = 0; i < 3; i++) {
    host.seats.push({ id: 'g' + i, name: 'Guest ' + i, peerId: null, isHost: false, connected: true, token: 't' + i });
  }

  const boards = [];
  for (let caseNo = 0; caseNo < 4; caseNo++) {
    const res = host.start();
    ok(res.ok, `case ${caseNo + 1} started`);
    boards.push({
      place: host.game.tiles.place.tileId,
      scenes: host.game.tiles.scenes.map(s => s.tileId)
    });
    host.restart();                     // everyone goes back to the lobby
  }

  const allPlaces = boards.map(b => b.place);
  const allScenes = boards.flatMap(b => b.scenes);
  ok(new Set(allPlaces).size === 4, 'four cases in a row, four different locations');
  ok(new Set(allScenes).size === 16, 'four cases in a row, sixteen different scene tiles');
  ok(host.casesPlayed === 4, 'the room counted four cases');

  const lobby = host.lobbyPayload();
  ok(lobby.freshTiles.places === LOCATIONS.length - 4, 'lobby reports the locations still unseen');
  ok(lobby.freshTiles.scenes === SCENE_TILES.length - 16, 'lobby reports the scene tiles still unseen');
  console.log(`  4 cases: ${new Set(allPlaces).size} locations, ${new Set(allScenes).size} scene tiles, no repeats`);
  console.log(`  lobby shows ${lobby.freshTiles.scenes}/${lobby.freshTiles.scenesTotal} scene tiles unseen`);
  host.destroy();
}

// A new room is a new table: it starts from a clean deck.
{
  const hub = new LoopbackHub();
  const host = new Host(new LoopbackTransport(hub, 'host-b'), { hostName: 'Halloran' });
  await host.open('ROOMB');
  const lobby = host.lobbyPayload();
  ok(lobby.freshTiles.places === LOCATIONS.length, 'a new room has every location fresh');
  ok(lobby.freshTiles.scenes === SCENE_TILES.length, 'a new room has every scene tile fresh');
  ok(host.casesPlayed === 0, 'a new room has played nothing');
  host.destroy();
}

console.log(`\nAssertions: ${checks}`);
if (failures.length) {
  console.log(`\nSESSION TILE CHECK FAILED (${failures.length})`);
  [...new Set(failures)].slice(0, 20).forEach(f => console.log('  ' + f));
  process.exit(1);
}
console.log('Session tile check passed: one table never repeats a board until its decks run out.');
