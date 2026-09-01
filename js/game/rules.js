// Murder In Broomfield - authoritative rules engine.
//
// Pure and environment-free: no DOM, no network, no timers. The host owns one
// instance, feeds it actions, and broadcasts the per-player views it produces.
// Because it is pure it can be driven headlessly by the test harness.

import { makeRng, shuffle } from '../util/rng.js';
import { MEANS } from '../data/means.js';
import { CLUES } from '../data/clues.js';
import { CAUSE_OF_DEATH, LOCATIONS, SCENE_TILES } from '../data/tiles.js';

export const ROLE = {
  SCIENTIST: 'scientist',
  MURDERER: 'murderer',
  ACCOMPLICE: 'accomplice',
  WITNESS: 'witness',
  INVESTIGATOR: 'investigator'
};

export const PHASE = {
  LOBBY: 'lobby',
  NIGHT_MURDERER: 'night_murderer', // murderer picks means + evidence
  NIGHT_REVIEW: 'night_review',     // everyone reads their private briefing
  SCIENTIST_SETUP: 'scientist_setup', // scientist places the opening bullets
  ROUND: 'round',                   // open discussion, badges live
  REPLACING: 'replacing',           // scientist swapping a scene tile
  LAST_CHANCE: 'last_chance',       // murderer team hunts the witness
  OVER: 'over'
};

export const HAND_SIZE = 4;
export const SCENE_TILES_IN_PLAY = 4;
export const MAX_ROUNDS = 3;
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 4;

// Which roles exist at each player count. Accomplice and Witness are a pair and
// are only dealt when the lobby enables them and the table is big enough.
export function roleLineup(playerCount, opts = {}) {
  const roles = [ROLE.SCIENTIST, ROLE.MURDERER];
  const wantsPair = !!opts.useAccompliceWitness && playerCount >= 6;
  if (wantsPair) roles.push(ROLE.ACCOMPLICE, ROLE.WITNESS);
  while (roles.length < playerCount) roles.push(ROLE.INVESTIGATOR);
  return roles.slice(0, playerCount);
}

export class Game {
  constructor(config) {
    const {
      players,                 // [{id, name}]
      seed,
      scientistId = null,      // pre-chosen in lobby, or null to randomize
      useAccompliceWitness = false,
      timerSeconds = 0         // 0 disables the round clock entirely
    } = config;

    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new Error(`Need ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
    }

    this.seed = seed;
    this.rng = makeRng(seed);
    this.log = [];
    this.winner = null;
    this.winReason = null;
    this.round = 1;
    this.replacementsUsed = 0;
    this.accusations = [];
    this.pendingAccusation = null;
    this.lastChanceGuess = null;
    this.replacingSlot = null;

    // A per-round advisory clock. It never changes the game state - at zero it
    // simply stops, and the clients beep. Stored as an absolute deadline so
    // every client counts down to the same moment.
    this.timerSeconds = Math.max(0, Math.floor(timerSeconds));
    this.timerEndsAt = null;

    this._assignRoles(players, scientistId, useAccompliceWitness);
    this._dealHands();
    this._drawTiles();

    this.phase = PHASE.NIGHT_MURDERER;
    this.solution = { murdererId: this.murdererId, meansId: null, clueId: null };
    this._log('system', 'The lamps go out over Broomfield.');
  }

  // ---------------------------------------------------------------- setup ---

  _assignRoles(players, scientistId, useAccompliceWitness) {
    const lineup = roleLineup(players.length, { useAccompliceWitness });
    const nonScientist = lineup.filter(r => r !== ROLE.SCIENTIST);

    let order = shuffle(players, this.rng);
    let scientist;
    if (scientistId && players.some(p => p.id === scientistId)) {
      scientist = players.find(p => p.id === scientistId);
      order = order.filter(p => p.id !== scientistId);
    } else {
      scientist = order.shift();
    }

    const shuffledRoles = shuffle(nonScientist, this.rng);
    this.players = [
      { ...scientist, role: ROLE.SCIENTIST },
      ...order.map((p, i) => ({ ...p, role: shuffledRoles[i] }))
    ].map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      // Every player except the Forensic Scientist carries one badge, the
      // murderer's team included - a bluffed badge is a legal play.
      badge: p.role === ROLE.SCIENTIST ? null : 'held',
      hand: { means: [], clues: [] }
    }));

    // Seat order is the shuffled order; keep it stable for the UI.
    this.scientistId = scientist.id;
    this.murdererId = this.players.find(p => p.role === ROLE.MURDERER).id;
    this.accompliceId = this.players.find(p => p.role === ROLE.ACCOMPLICE)?.id || null;
    this.witnessId = this.players.find(p => p.role === ROLE.WITNESS)?.id || null;
  }

  _dealHands() {
    const meansDeck = shuffle(MEANS.map(m => m.id), this.rng);
    const clueDeck = shuffle(CLUES.map(c => c.id), this.rng);
    for (const p of this.players) {
      if (p.role === ROLE.SCIENTIST) continue;
      p.hand.means = meansDeck.splice(0, HAND_SIZE);
      p.hand.clues = clueDeck.splice(0, HAND_SIZE);
    }
    this.meansDeck = meansDeck;
    this.clueDeck = clueDeck;
  }

  _drawTiles() {
    const cause = shuffle(CAUSE_OF_DEATH, this.rng)[0];
    const place = shuffle(LOCATIONS, this.rng)[0];
    const sceneOrder = shuffle(SCENE_TILES, this.rng);

    this.tiles = {
      cause: { tileId: cause.id, bullet: null },
      place: { tileId: place.id, bullet: null },
      scenes: sceneOrder.slice(0, SCENE_TILES_IN_PLAY)
        .map(t => ({ tileId: t.id, bullet: null, slot: null }))
    };
    this.tiles.scenes.forEach((s, i) => { s.slot = i; });
    this.sceneDeck = sceneOrder.slice(SCENE_TILES_IN_PLAY).map(t => t.id);
  }

  _log(kind, text, data = null) {
    this.log.push({ kind, text, data, at: this.log.length });
  }

  player(id) { return this.players.find(p => p.id === id) || null; }

  // --------------------------------------------------------------- actions ---
  // Every action returns { ok:true } or { ok:false, error:'...' }. The host
  // rejects anything invalid rather than trusting the client.

  dispatch(actorId, action) {
    const fn = this._handlers[action.type];
    if (!fn) return { ok: false, error: `Unknown action ${action.type}` };
    return fn.call(this, actorId, action);
  }

  get _handlers() {
    return {
      chooseMurderCards: this._chooseMurderCards,
      acknowledgeBriefing: this._acknowledgeBriefing,
      placeBullet: this._placeBullet,
      confirmSetup: this._confirmSetup,
      throwBadge: this._throwBadge,
      resolveAccusation: this._resolveAccusation,
      beginReplacement: this._beginReplacement,
      replaceScene: this._replaceScene,
      confirmReplacement: this.confirmReplacement,
      guessWitness: this._guessWitness
    };
  }

  // Murderer secretly commits to one of their own means + evidence cards.
  _chooseMurderCards(actorId, { meansId, clueId }) {
    if (this.phase !== PHASE.NIGHT_MURDERER) return { ok: false, error: 'Not the night phase' };
    if (actorId !== this.murdererId) return { ok: false, error: 'Only the murderer chooses' };
    const hand = this.player(actorId).hand;
    if (!hand.means.includes(meansId)) return { ok: false, error: 'That means is not in your hand' };
    if (!hand.clues.includes(clueId)) return { ok: false, error: 'That evidence is not in your hand' };

    this.solution.meansId = meansId;
    this.solution.clueId = clueId;
    this.phase = PHASE.NIGHT_REVIEW;
    this.briefed = new Set([]);
    this._log('system', 'The deed is done. Each party reviews what they know.');
    return { ok: true };
  }

  _acknowledgeBriefing(actorId) {
    if (this.phase !== PHASE.NIGHT_REVIEW) return { ok: false, error: 'Nothing to acknowledge' };
    this.briefed.add(actorId);
    if (this.briefed.size >= this.players.length) {
      this.phase = PHASE.SCIENTIST_SETUP;
      this._log('system', 'The Forensic Scientist opens the case file.');
    }
    return { ok: true };
  }

  // Scientist marks one option per tile. Legal during setup and while replacing.
  _placeBullet(actorId, { target, slot, index }) {
    if (actorId !== this.scientistId) return { ok: false, error: 'Only the Forensic Scientist places bullets' };
    if (this.phase !== PHASE.SCIENTIST_SETUP && this.phase !== PHASE.REPLACING) {
      return { ok: false, error: 'Bullets are locked this phase' };
    }
    if (!Number.isInteger(index) || index < 0 || index > 5) return { ok: false, error: 'Bad option index' };

    if (target === 'cause') this.tiles.cause.bullet = index;
    else if (target === 'place') this.tiles.place.bullet = index;
    else if (target === 'scene') {
      const s = this.tiles.scenes.find(x => x.slot === slot);
      if (!s) return { ok: false, error: 'No such scene slot' };
      // While replacing, only the freshly-drawn tile may be marked.
      if (this.phase === PHASE.REPLACING && slot !== this.replacingSlot) {
        return { ok: false, error: 'Only the new tile can be marked now' };
      }
      s.bullet = index;
    } else return { ok: false, error: 'Bad target' };
    return { ok: true };
  }

  _allBulletsPlaced() {
    return this.tiles.cause.bullet !== null &&
      this.tiles.place.bullet !== null &&
      this.tiles.scenes.every(s => s.bullet !== null);
  }

  _confirmSetup(actorId) {
    if (actorId !== this.scientistId) return { ok: false, error: 'Only the Forensic Scientist' };
    if (this.phase !== PHASE.SCIENTIST_SETUP) return { ok: false, error: 'Not in setup' };
    if (!this._allBulletsPlaced()) return { ok: false, error: 'Every tile needs a bullet' };
    this.phase = PHASE.ROUND;
    this.round = 1;
    this._startTimer();
    this._log('system', 'Round 1 begins. The floor is open.');
    return { ok: true };
  }

  // Any badge-holder may accuse at any time during a round.
  _throwBadge(actorId, { suspectId, meansId, clueId }) {
    if (this.phase !== PHASE.ROUND) return { ok: false, error: 'Badges are not live right now' };
    const me = this.player(actorId);
    if (!me) return { ok: false, error: 'Unknown player' };
    if (me.role === ROLE.SCIENTIST) return { ok: false, error: 'The Forensic Scientist has no badge' };
    if (me.badge !== 'held') return { ok: false, error: 'Your badge is already spent' };
    if (this.pendingAccusation) return { ok: false, error: 'An accusation is already on the table' };

    const suspect = this.player(suspectId);
    if (!suspect) return { ok: false, error: 'Unknown suspect' };
    if (suspect.role === ROLE.SCIENTIST) return { ok: false, error: 'Cannot accuse the Forensic Scientist' };
    if (suspectId === actorId) return { ok: false, error: 'Cannot accuse yourself' };
    if (!suspect.hand.means.includes(meansId)) return { ok: false, error: 'That means is not in front of them' };
    if (!suspect.hand.clues.includes(clueId)) return { ok: false, error: 'That evidence is not in front of them' };

    me.badge = 'spent';
    const correct = suspectId === this.solution.murdererId &&
      meansId === this.solution.meansId &&
      clueId === this.solution.clueId;

    this.pendingAccusation = { byId: actorId, suspectId, meansId, clueId, correct, round: this.round };
    this._log('badge', `${me.name} throws a badge at ${suspect.name}.`, { byId: actorId, suspectId });
    return { ok: true };
  }

  // The Scientist confirms the verdict - the moment of truth.
  _resolveAccusation(actorId) {
    if (actorId !== this.scientistId) return { ok: false, error: 'Only the Forensic Scientist rules on a badge' };
    if (!this.pendingAccusation) return { ok: false, error: 'No accusation pending' };

    const acc = this.pendingAccusation;
    this.pendingAccusation = null;
    this.accusations.push(acc);
    const by = this.player(acc.byId);
    const suspect = this.player(acc.suspectId);

    if (acc.correct) {
      this._log('verdict', `${by.name} names ${suspect.name} - and the evidence agrees.`, { correct: true, ...acc });
      if (this.witnessId) {
        // The murderer's team gets one last swing: unmask the Witness.
        this.phase = PHASE.LAST_CHANCE;
        this._log('system', 'The murderer has one last card to play: name the witness.');
      } else {
        this._end('investigators', 'The badge landed. The case is closed.');
      }
      return { ok: true, correct: true };
    }

    this._log('verdict', `${by.name} names ${suspect.name} - the file says otherwise.`, { correct: false, ...acc });
    if (this._allBadgesSpent()) {
      this._end('murderer', 'Every badge spent, and no one saw it. The murderer walks.');
    }
    return { ok: true, correct: false };
  }

  _allBadgesSpent() {
    return this.players.filter(p => p.role !== ROLE.SCIENTIST).every(p => p.badge === 'spent');
  }

  // End of round: scientist swaps one scene tile for a fresh one. Twice a game.
  _beginReplacement(actorId) {
    if (actorId !== this.scientistId) return { ok: false, error: 'Only the Forensic Scientist' };
    if (this.phase !== PHASE.ROUND) return { ok: false, error: 'Not during a round' };
    if (this.pendingAccusation) return { ok: false, error: 'Resolve the badge on the table first' };
    if (this.replacementsUsed >= 2) return { ok: false, error: 'No replacements left' };
    if (!this.sceneDeck.length) return { ok: false, error: 'Scene deck exhausted' };
    this.phase = PHASE.REPLACING;
    this.replacingSlot = null;
    return { ok: true };
  }

  _replaceScene(actorId, { slot }) {
    if (actorId !== this.scientistId) return { ok: false, error: 'Only the Forensic Scientist' };
    if (this.phase !== PHASE.REPLACING) return { ok: false, error: 'Not replacing' };
    if (this.replacingSlot !== null) return { ok: false, error: 'A tile is already being replaced' };
    const s = this.tiles.scenes.find(x => x.slot === slot);
    if (!s) return { ok: false, error: 'No such scene slot' };

    const oldId = s.tileId;
    s.tileId = this.sceneDeck.shift();
    s.bullet = null;
    this.replacingSlot = slot;
    this._log('system', 'A new scene tile is laid on the table.', { slot, oldId, newId: s.tileId });
    return { ok: true };
  }

  // Scientist confirms the new tile's bullet, which rolls the game forward.
  confirmReplacement(actorId) {
    if (actorId !== this.scientistId) return { ok: false, error: 'Only the Forensic Scientist' };
    if (this.phase !== PHASE.REPLACING) return { ok: false, error: 'Not replacing' };
    if (this.replacingSlot === null) return { ok: false, error: 'Pick a tile to replace' };
    const s = this.tiles.scenes.find(x => x.slot === this.replacingSlot);
    if (s.bullet === null) return { ok: false, error: 'Mark the new tile before continuing' };

    this.replacementsUsed++;
    this.replacingSlot = null;
    this.round++;
    if (this.round > MAX_ROUNDS) {
      this._end('murderer', 'Three rounds gone. The trail is cold.');
    } else {
      this.phase = PHASE.ROUND;
      this._startTimer();
      this._log('system', `Round ${this.round} begins.`);
    }
    return { ok: true };
  }

  _guessWitness(actorId, { targetId }) {
    if (this.phase !== PHASE.LAST_CHANCE) return { ok: false, error: 'Not the last chance' };
    if (actorId !== this.murdererId && actorId !== this.accompliceId) {
      return { ok: false, error: 'Only the murderer or accomplice may guess' };
    }
    const target = this.player(targetId);
    if (!target) return { ok: false, error: 'Unknown target' };

    this.lastChanceGuess = { byId: actorId, targetId, correct: targetId === this.witnessId };
    if (targetId === this.witnessId) {
      this._end('murderer', 'The witness is named. The murderer walks free.');
    } else {
      this._end('investigators', 'The witness held their nerve. The case is closed.');
    }
    return { ok: true, correct: this.lastChanceGuess.correct };
  }

  _startTimer() {
    this.timerEndsAt = this.timerSeconds > 0 ? Date.now() + this.timerSeconds * 1000 : null;
  }

  _end(winner, reason) {
    this.timerEndsAt = null;
    this.phase = PHASE.OVER;
    this.winner = winner;
    this.winReason = reason;
    this._log('end', reason, { winner });
  }

  // ----------------------------------------------------------------- views ---
  // What a given player is allowed to see. The host never ships the full state
  // to anyone; each client receives only its own view.

  publicState() {
    return {
      phase: this.phase,
      round: this.round,
      maxRounds: MAX_ROUNDS,
      replacementsUsed: this.replacementsUsed,
      replacingSlot: this.replacingSlot ?? null,
      timerSeconds: this.timerSeconds,
      timerEndsAt: this.timerEndsAt,
      // Clients subtract this from their own clock to correct for skew, so
      // everyone's countdown reaches zero at the same real moment.
      now: Date.now(),
      sceneDeckLeft: this.sceneDeck.length,
      scientistId: this.scientistId,
      winner: this.winner,
      winReason: this.winReason,
      tiles: JSON.parse(JSON.stringify(this.tiles)),
      pendingAccusation: this.pendingAccusation ? { ...this.pendingAccusation, correct: undefined } : null,
      accusations: this.accusations.map(a => ({ ...a })),
      lastChanceGuess: this.lastChanceGuess,
      log: this.log.slice(-40),
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isScientist: p.role === ROLE.SCIENTIST,
        badge: p.badge,
        // Hands are face-up on the table for everyone - that is the whole game.
        hand: p.role === ROLE.SCIENTIST ? null : { means: [...p.hand.means], clues: [...p.hand.clues] }
      }))
    };
  }

  viewFor(playerId) {
    const me = this.player(playerId);
    if (!me) return null;
    const view = this.publicState();
    view.you = { id: me.id, name: me.name, role: me.role, badge: me.badge };
    view.secrets = this._secretsFor(me);
    return view;
  }

  _secretsFor(me) {
    const s = {};
    const nameOf = id => this.player(id)?.name || null;
    const over = this.phase === PHASE.OVER;

    if (me.role === ROLE.SCIENTIST || over) {
      s.murdererId = this.murdererId;
      s.murdererName = nameOf(this.murdererId);
      s.meansId = this.solution.meansId;
      s.clueId = this.solution.clueId;
      if (this.accompliceId) { s.accompliceId = this.accompliceId; s.accompliceName = nameOf(this.accompliceId); }
      if (this.witnessId) { s.witnessId = this.witnessId; s.witnessName = nameOf(this.witnessId); }
    }
    if (me.role === ROLE.MURDERER && !over) {
      s.meansId = this.solution.meansId;
      s.clueId = this.solution.clueId;
      if (this.accompliceId) { s.accompliceId = this.accompliceId; s.accompliceName = nameOf(this.accompliceId); }
    }
    if (me.role === ROLE.ACCOMPLICE && !over) {
      // The accomplice knows the murderer and exactly what they used.
      s.murdererId = this.murdererId;
      s.murdererName = nameOf(this.murdererId);
      s.meansId = this.solution.meansId;
      s.clueId = this.solution.clueId;
    }
    if (me.role === ROLE.WITNESS && !over) {
      // The witness saw two people move in the dark but not which was which.
      const pair = [this.murdererId, this.accompliceId].filter(Boolean);
      s.sawIds = shuffle(pair, makeRng(this.seed ^ 0x5EED)).slice();
      s.sawNames = s.sawIds.map(nameOf);
    }
    return s;
  }

  // The full reveal, only ever sent once the game is over.
  finalReveal() {
    return {
      murdererId: this.murdererId,
      murdererName: this.player(this.murdererId).name,
      accompliceId: this.accompliceId,
      witnessId: this.witnessId,
      meansId: this.solution.meansId,
      clueId: this.solution.clueId,
      roles: this.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
    };
  }
}
