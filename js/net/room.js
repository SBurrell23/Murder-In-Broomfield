// Host and Client room logic.
//
// The host is authoritative for everything: it owns the Game instance, validates
// every inbound action against the actor's real identity, and emits per-player
// views. A malicious client can ask for anything; it only ever receives what its
// own seat is entitled to see.

import { Emitter, MSG, makeRoomCode, HEARTBEAT_MS, SILENCE_MS } from './net.js';
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
    this.settings = { scientistId: null, useAccompliceWitness: false, timerMinutes: 3 };

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

  _ping(peerId) {
    const seat = this.seatByPeer(peerId);
    if (!seat) return;
    seat.lastSeen = Date.now();
    if (!seat.connected) {
      // They were written off but are evidently still here.
      seat.connected = true;
      this._pushLobby();
      if (this.game) this._pushViews();
    }
    this.t.sendTo(peerId, { t: MSG.PONG });
  }

  // Retire seats that have stopped announcing themselves.
  _sweep() {
    const now = Date.now();
    let changed = false;
    for (const seat of this.seats) {
      if (seat.isHost || !seat.connected || !seat.peerId) continue;
      if (seat.lastSeen && now - seat.lastSeen > SILENCE_MS) {
        seat.connected = false;
        seat.peerId = null;
        changed = true;
        this.emit('leave', seat);
      }
    }
    if (!changed) return;
    if (!this.game) {
      this.seats = this.seats.filter(s => s.connected || s.isHost);
      if (this.settings.scientistId && !this.seat(this.settings.scientistId)) {
        this.settings.scientistId = null;
      }
    }
    this._pushLobby();
    if (this.game) this._pushViews();
  }

  async open(code = makeRoomCode()) {
    this._sweepTimer = setInterval(() => this._sweep(), 2000);
    this._sweepTimer.unref?.();
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
      case MSG.PING:    return this._ping(peerId);
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
        seat.lastSeen = Date.now();
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
      lastSeen: Date.now(),
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
    // Mid-game the seat is held rather than freed, so the remaining players
    // still need a fresh view to see that someone has dropped.
    if (this.game) this._pushViews();
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
      useAccompliceWitness: this.settings.useAccompliceWitness,
      timerSeconds: Math.max(0, Number(this.settings.timerMinutes) || 0) * 60
    });
    this.emit('started', this.game);
    this._pushViews();
    return { ok: true };
  }

  restart() {
    clearTimeout(this._concludeTimer);
    this._concludeTimer = null;
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
    this._scheduleConclusion();
    return res;
  }

  // The engine can decide an ending before it announces one, so the verdict
  // has a beat to land before the game screen is replaced. The host owns the
  // timer so every client changes screen together.
  _scheduleConclusion() {
    if (!this.game || !this.game.pendingConclusion || this._concludeTimer) return;
    this._concludeTimer = setTimeout(() => {
      this._concludeTimer = null;
      if (!this.game || !this.game.concludeNow()) return;
      const fx = { kind: 'gameOver', winner: this.game.winner };
      this.t.broadcast({ t: MSG.FX, fx });
      this.emit('fx', fx);
      this._pushViews();
    }, 3200);
    this._concludeTimer.unref?.();
  }

  _emitFx(seatId, action, res, prevPhase) {
    const fx = [];
    switch (action.type) {
      case 'placeBullet':
        fx.push({ kind: 'bullet', target: action.target, slot: action.slot ?? null, index: action.index });
        // The last bullet opens the case or starts the next round, so those
        // beats are detected from the phase change rather than an action name.
        if (prevPhase === PHASE.SCIENTIST_SETUP && this.game.phase === PHASE.ROUND) {
          fx.push({ kind: 'begin' });
        } else if (prevPhase === PHASE.REPLACING && this.game.phase !== PHASE.REPLACING) {
          fx.push({ kind: 'round', round: this.game.round });
        }
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
      this._annotateConnections(view);
      if (seat.isHost) this.emit('view', view);
      else if (seat.peerId) this.t.sendTo(seat.peerId, { t: MSG.VIEW, seq, view });
    }
  }

  // Whether a player is still on the line is a transport fact, not a rules
  // fact, so the host stamps it on the way out. The table needs to see who
  // dropped - a silent player and an absent one are very different things.
  _annotateConnections(view) {
    for (const p of view.players) {
      const seat = this.seat(p.id);
      p.connected = seat ? seat.connected : false;
    }
  }

  destroy() {
    clearInterval(this._hbTimer);
    this.t.destroy();
  }
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
    this.lastHostMsg = Date.now();
    this._alive = true;

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
    this._startHeartbeat();
  }

  _sayHello() {
    if (this._greeted) return;
    this._greeted = true;
    this.t.sendToHost({ t: MSG.HELLO, name: this.name, token: this.token || undefined });
  }

  // Announce ourselves so the host can tell a closed tab from a quiet player,
  // and watch for the host going silent in the other direction.
  _startHeartbeat() {
    clearInterval(this._hbTimer);
    this.lastHostMsg = Date.now();
    this._hbTimer = setInterval(() => {
      this.t.sendToHost({ t: MSG.PING });
      if (this._alive && Date.now() - this.lastHostMsg > SILENCE_MS + HEARTBEAT_MS) {
        this._alive = false;
        this.emit('disconnected');
      }
    }, HEARTBEAT_MS);
    this._hbTimer.unref?.();   // no-op in browsers; lets the test runner exit
  }

  _onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    // Any inbound traffic proves the host is still there.
    this.lastHostMsg = Date.now();
    if (!this._alive) { this._alive = true; this.emit('reconnected'); }
    if (msg.t === MSG.PONG) return;
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

  destroy() {
    clearInterval(this._hbTimer);
    this.t.destroy();
  }
}
