// Host and Client room logic.
//
// The host is authoritative for everything: it owns the Game instance, validates
// every inbound action against the actor's real identity, and emits per-player
// views. A malicious client can ask for anything; it only ever receives what its
// own seat is entitled to see.

import { Emitter, MSG, makeRoomCode } from './net.js';
import { Game, PHASE, MIN_PLAYERS, MAX_PLAYERS } from '../game/rules.js';
import { randomSeed } from '../util/rng.js';

const MAX_NAME = 18;

function cleanName(raw, fallback) {
  const s = String(raw ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_NAME);
  return s.length ? s : fallback;
}

// ------------------------------------------------------------------ HOST ---

export class Host extends Emitter {
  constructor(transport, { hostName = 'Host' } = {}) {
    super();
    this.t = transport;
    this.code = null;
    this.game = null;
    this.settings = { scientistId: null, useAccompliceWitness: false };

    // seat.id is the stable player id; peerId is whatever connection currently
    // owns it, so a reconnecting player can reclaim their seat.
    this.seats = [];
    // Monotonic counter stamped on every state push. Clients drop anything
    // older than what they already hold, so a reordered or duplicated packet
    // can never roll a player's UI backwards.
    this.seq = 0;
    this.hostSeatId = 'seat-host';
    this.seats.push({
      id: this.hostSeatId, name: cleanName(hostName, 'Host'), peerId: null,
      isHost: true, connected: true, token: 'host-token'
    });

    this.t.on('peer:open', peerId => this._onPeerOpen(peerId));
    this.t.on('peer:data', (peerId, msg) => this._onPeerData(peerId, msg));
    this.t.on('peer:close', peerId => this._onPeerClose(peerId));
  }

  async open(code = makeRoomCode()) {
    this.code = await this.t.host(code);
    this.emit('open', this.code);
    this._pushLobby();
    return this.code;
  }

  get players() { return this.seats; }

  seatByPeer(peerId) { return this.seats.find(s => s.peerId === peerId) || null; }
  seat(id) { return this.seats.find(s => s.id === id) || null; }

  _onPeerOpen(peerId) { /* wait for HELLO before seating */ }

  _onPeerData(peerId, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case MSG.HELLO:   return this._hello(peerId, msg);
      case MSG.ACTION:  return this._action(peerId, msg);
      default:
        // Lobby settings and start/restart are host-UI only; a client asking
        // for them is ignored rather than trusted.
        return;
    }
  }

  _hello(peerId, msg) {
    // Reconnect path: a returning player presents the token for their seat.
    if (msg.token) {
      const seat = this.seats.find(s => s.token === msg.token);
      if (seat) {
        seat.peerId = peerId;
        seat.connected = true;
        this._welcome(peerId, seat);
        this._pushLobby();
        this._pushViews();
        this.emit('rejoin', seat);
        return;
      }
    }

    if (this.game) { this._err(peerId, 'The case is already underway.'); return; }
    if (this.seats.length >= MAX_PLAYERS) { this._err(peerId, 'This room is full.'); return; }
    if (this.seatByPeer(peerId)) return; // duplicate HELLO

    const base = cleanName(msg.name, 'Detective');
    const name = this._uniqueName(base);
    const seat = {
      id: 'seat-' + Math.random().toString(36).slice(2, 10),
      name, peerId, isHost: false, connected: true,
      token: 'tok-' + Math.random().toString(36).slice(2, 12)
    };
    this.seats.push(seat);
    this._welcome(peerId, seat);
    this._pushLobby();
    this.emit('join', seat);
  }

  _uniqueName(base) {
    const taken = new Set(this.seats.map(s => s.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 50; i++) {
      const c = `${base} ${i}`;
      if (!taken.has(c.toLowerCase())) return c;
    }
    return base + ' ' + Math.floor(Math.random() * 999);
  }

  _welcome(peerId, seat) {
    this.t.sendTo(peerId, { t: MSG.WELCOME, youId: seat.id, token: seat.token, code: this.code });
  }

  _err(peerId, message) {
    this.t.sendTo(peerId, { t: MSG.ERROR, message });
  }

  _onPeerClose(peerId) {
    const seat = this.seatByPeer(peerId);
    if (!seat) return;
    seat.connected = false;
    seat.peerId = null;
    if (!this.game) {
      // Nothing has been dealt yet, so free the seat entirely.
      this.seats = this.seats.filter(s => s.id !== seat.id);
      if (this.settings.scientistId === seat.id) this.settings.scientistId = null;
    }
    this._pushLobby();
    this.emit('leave', seat);
  }

  // ---------------------------------------------------------- lobby / host ---

  setName(seatId, name) {
    const seat = this.seat(seatId);
    if (!seat || this.game) return;
    seat.name = this._uniqueName(cleanName(name, seat.name));
    this._pushLobby();
  }

  setSettings(patch) {
    if (this.game) return;
    Object.assign(this.settings, patch);
    if (this.settings.scientistId && !this.seat(this.settings.scientistId)) {
      this.settings.scientistId = null;
    }
    this._pushLobby();
  }

  kick(seatId) {
    if (this.game) return;
    const seat = this.seat(seatId);
    if (!seat || seat.isHost) return;
    if (seat.peerId) this.t.sendTo(seat.peerId, { t: MSG.KICK });
    this.seats = this.seats.filter(s => s.id !== seatId);
    if (this.settings.scientistId === seatId) this.settings.scientistId = null;
    this._pushLobby();
  }

  canStart() {
    const n = this.seats.length;
    return n >= MIN_PLAYERS && n <= MAX_PLAYERS && this.seats.every(s => s.connected);
  }

  start() {
    if (!this.canStart()) return { ok: false, error: `Need ${MIN_PLAYERS}-${MAX_PLAYERS} connected players.` };
    const seed = randomSeed();
    this.game = new Game({
      players: this.seats.map(s => ({ id: s.id, name: s.name })),
      seed,
      scientistId: this.settings.scientistId,
      useAccompliceWitness: this.settings.useAccompliceWitness
    });
    this.emit('started', this.game);
    this._pushViews();
    return { ok: true };
  }

  restart() {
    this.game = null;
    this.seats.forEach(s => { /* seats persist across cases */ });
    this._pushLobby();
    this.emit('restarted');
  }

  // ------------------------------------------------------------- gameplay ---

  // Actions from the host's own UI take this path too, so there is exactly one
  // code path for validation.
  localAction(action) { return this._applyAction(this.hostSeatId, action); }

  _action(peerId, msg) {
    const seat = this.seatByPeer(peerId);
    if (!seat) return;
    this._applyAction(seat.id, msg.action);
  }

  _applyAction(seatId, action) {
    if (!this.game || !action || typeof action.type !== 'string') return { ok: false, error: 'No game' };

    const before = this.game.phase;
    const res = this.game.dispatch(seatId, action);

    if (!res.ok) {
      const seat = this.seat(seatId);
      if (seat && seat.peerId) this._err(seat.peerId, res.error);
      if (seat && seat.isHost) this.emit('error', res.error);
      return res;
    }

    // Effects are broadcast so every client animates the same beat.
    this._emitFx(seatId, action, res, before);
    this._pushViews();
    return res;
  }

  _emitFx(seatId, action, res, prevPhase) {
    const fx = [];
    switch (action.type) {
      case 'placeBullet':
        fx.push({ kind: 'bullet', target: action.target, slot: action.slot ?? null, index: action.index });
        break;
      case 'throwBadge': {
        const a = this.game.pendingAccusation;
        if (a) fx.push({ kind: 'badge', byId: a.byId, suspectId: a.suspectId, meansId: a.meansId, clueId: a.clueId });
        break;
      }
      case 'resolveAccusation': {
        const last = this.game.accusations[this.game.accusations.length - 1];
        if (last) fx.push({ kind: 'verdict', correct: last.correct, byId: last.byId, suspectId: last.suspectId });
        break;
      }
      case 'confirmReplacement':
        fx.push({ kind: 'round', round: this.game.round });
        break;
      case 'confirmSetup':
        fx.push({ kind: 'begin' });
        break;
      case 'guessWitness':
        fx.push({ kind: 'witnessGuess', correct: this.game.lastChanceGuess?.correct, targetId: action.targetId });
        break;
    }
    if (this.game.phase === PHASE.OVER && prevPhase !== PHASE.OVER) {
      fx.push({ kind: 'gameOver', winner: this.game.winner });
    }
    for (const f of fx) {
      this.t.broadcast({ t: MSG.FX, fx: f });
      this.emit('fx', f);
    }
  }

  // ---------------------------------------------------------------- push ---

  lobbyPayload() {
    return {
      t: MSG.LOBBY,
      seq: ++this.seq,
      code: this.code,
      settings: { ...this.settings },
      inGame: !!this.game,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      players: this.seats.map(s => ({ id: s.id, name: s.name, isHost: s.isHost, connected: s.connected }))
    };
  }

  _pushLobby() {
    const payload = this.lobbyPayload();
    this.t.broadcast(payload);
    this.emit('lobby', payload);
  }

  _pushViews() {
    if (!this.game) return;
    const seq = ++this.seq;
    for (const seat of this.seats) {
      const view = this.game.viewFor(seat.id);
      if (!view) continue;
      if (seat.isHost) this.emit('view', view);
      else if (seat.peerId) this.t.sendTo(seat.peerId, { t: MSG.VIEW, seq, view });
    }
  }

  destroy() { this.t.destroy(); }
}

// ---------------------------------------------------------------- CLIENT ---

export class Client extends Emitter {
  constructor(transport, { name = 'Detective', token = null } = {}) {
    super();
    this.t = transport;
    this.name = name;
    this.youId = null;
    // An explicit token reclaims a specific seat. Left null, the client falls
    // back to whatever this tab last stored for the room.
    this.token = token;
    this._explicitToken = !!token;
    this.code = null;
    this.lobby = null;
    this.view = null;
    this.seq = 0;   // highest state sequence applied so far

    this.t.on('open', () => this._sayHello());
    this.t.on('data', msg => this._onData(msg));
    this.t.on('close', () => this.emit('disconnected'));
    this.t.on('error', e => this.emit('neterror', e));
  }

  async join(code) {
    this.code = code;
    // Reclaim a seat if this browser was previously in this room.
    if (!this._explicitToken) {
      try { this.token = sessionStorage.getItem('mib.token.' + code) || null; } catch { this.token = null; }
    }
    await this.t.join(code);
    // LoopbackTransport emits 'open' asynchronously; PeerTransport already has.
    this._sayHello();
  }

  _sayHello() {
    if (this._greeted) return;
    this._greeted = true;
    this.t.sendToHost({ t: MSG.HELLO, name: this.name, token: this.token || undefined });
  }

  _onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case MSG.WELCOME:
        this.youId = msg.youId;
        this.token = msg.token;
        this.code = msg.code;
        if (!this._explicitToken) {
          try { sessionStorage.setItem('mib.token.' + this.code, this.token); } catch { /* ignore */ }
        }
        this.emit('welcome', msg);
        break;
      case MSG.LOBBY:
        if (!this._fresh(msg)) return;
        this.lobby = msg;
        this.emit('lobby', msg);
        break;
      case MSG.VIEW:
        if (!this._fresh(msg)) return;
        this.view = msg.view;
        this.emit('view', msg.view);
        break;
      case MSG.FX:
        this.emit('fx', msg.fx);
        break;
      case MSG.ERROR:
        this.emit('error', msg.message);
        break;
      case MSG.KICK:
        this.emit('kicked');
        break;
    }
  }

  // State messages carry a monotonic seq; anything at or below what we have
  // already applied is a stale or duplicated packet and gets dropped.
  _fresh(msg) {
    if (typeof msg.seq !== 'number') return true;   // tolerate unsequenced hosts
    if (msg.seq <= this.seq) return false;
    this.seq = msg.seq;
    return true;
  }

  action(action) {
    this.t.sendToHost({ t: MSG.ACTION, action });
  }

  destroy() { this.t.destroy(); }
}
