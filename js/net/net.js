// P2P transport over PeerJS.
//
// Topology is a star: the host is the authority and the only peer everyone
// connects to. Clients never talk to each other, and clients never hold the
// full game state - the host ships each one a filtered view.
//
// The transport is injected, so the identical Host/Client logic in room.js can
// run over an in-process loopback for headless multiplayer tests.

export const MSG = {
  HELLO: 'hello',
  WELCOME: 'welcome',
  LOBBY: 'lobby',
  VIEW: 'view',
  ERROR: 'error',
  FX: 'fx',
  ACTION: 'action',
  LOBBY_SET: 'lobbySet',
  START: 'start',
  RESTART: 'restart',
  KICK: 'kick',
  BYE: 'bye',
  PING: 'ping',
  PONG: 'pong'
};

// A closed browser tab does not reliably produce a WebRTC 'close' event - the
// channel can sit half-open for tens of seconds. Clients therefore announce
// themselves on an interval and the host retires anyone who goes quiet.
export const HEARTBEAT_MS = 3000;
export const SILENCE_MS = 10000;

const PEER_PREFIX = 'murder-in-broomfield-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function makeRoomCode(len = 4) {
  let out = '';
  const buf = new Uint32Array(len);
  (globalThis.crypto || { getRandomValues: a => a.forEach((_, i) => { a[i] = Math.random() * 2 ** 32; }) })
    .getRandomValues(buf);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

export function peerIdForRoom(code) {
  return PEER_PREFIX + code.toUpperCase();
}

// Minimal event emitter.
export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) { this._h.get(ev)?.delete(fn); }
  emit(ev, ...args) {
    this._h.get(ev)?.forEach(fn => {
      try { fn(...args); } catch (e) { console.error(`[emitter] ${ev}`, e); }
    });
  }
}

/**
 * PeerJS-backed transport.
 *
 * Host side  : listens for inbound connections, emits 'peer:open' / 'peer:data' / 'peer:close'.
 * Client side: dials the host, emits 'open' / 'data' / 'close' / 'error'.
 */
export class PeerTransport extends Emitter {
  constructor({ Peer = globalThis.Peer } = {}) {
    super();
    this.Peer = Peer;
    this.peer = null;
    this.conns = new Map(); // peerId -> DataConnection (host side)
    this.hostConn = null;   // client side
    this.isHost = false;
    this.destroyed = false;
  }

  _mkPeer(id) {
    // The public PeerJS broker handles signalling only; media never touches it.
    const peer = id ? new this.Peer(id, { debug: 0 }) : new this.Peer({ debug: 0 });
    peer.on('error', err => {
      const type = err && err.type ? err.type : 'unknown';
      this.emit('error', { type, message: String(err && err.message || err) });
    });
    peer.on('disconnected', () => {
      // Broker link dropped; existing data channels survive. Try to get back.
      if (!this.destroyed) { try { peer.reconnect(); } catch { /* ignore */ } }
    });
    return peer;
  }

  async host(code) {
    this.isHost = true;
    const id = peerIdForRoom(code);
    return new Promise((resolve, reject) => {
      this.peer = this._mkPeer(id);
      const onErr = err => {
        if (err && err.type === 'unavailable-id') reject(new Error('ROOM_TAKEN'));
        else reject(new Error(String(err && err.type || err)));
      };
      this.peer.once('error', onErr);
      this.peer.on('open', () => {
        this.peer.off('error', onErr);
        this.peer.on('connection', conn => this._acceptConn(conn));
        resolve(code);
      });
    });
  }

  _acceptConn(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      this.emit('peer:open', conn.peer);
    });
    conn.on('data', data => this.emit('peer:data', conn.peer, data));
    conn.on('close', () => {
      this.conns.delete(conn.peer);
      this.emit('peer:close', conn.peer);
    });
    conn.on('error', () => {
      this.conns.delete(conn.peer);
      this.emit('peer:close', conn.peer);
    });
  }

  async join(code, { timeout = 15000 } = {}) {
    this.isHost = false;
    const hostId = peerIdForRoom(code);
    return new Promise((resolve, reject) => {
      this.peer = this._mkPeer(null);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('ROOM_NOT_FOUND')); }
      }, timeout);

      this.peer.on('error', err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(err && err.type === 'peer-unavailable' ? 'ROOM_NOT_FOUND' : String(err && err.type || err)));
      });

      this.peer.on('open', () => {
        const conn = this.peer.connect(hostId, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.emit('open');
          resolve();
        });
        conn.on('data', data => this.emit('data', data));
        conn.on('close', () => this.emit('close'));
        conn.on('error', e => this.emit('error', { type: 'conn', message: String(e) }));
      });
    });
  }

  sendTo(peerId, msg) {
    const c = this.conns.get(peerId);
    if (c && c.open) { try { c.send(msg); } catch (e) { console.warn('send failed', e); } }
  }

  broadcast(msg) {
    for (const c of this.conns.values()) {
      if (c.open) { try { c.send(msg); } catch (e) { console.warn('broadcast failed', e); } }
    }
  }

  sendToHost(msg) {
    if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch (e) { console.warn('send failed', e); }
    }
  }

  destroy() {
    this.destroyed = true;
    try { this.peer && this.peer.destroy(); } catch { /* ignore */ }
    this.conns.clear();
    this.hostConn = null;
  }
}

/**
 * In-process transport used by the headless multiplayer harness. Same surface
 * as PeerTransport, so Host/Client code cannot tell the difference. Delivery is
 * async and can be given latency and drop rates to shake out ordering bugs.
 */
export class LoopbackHub {
  constructor({ latency = 0, jitter = 0 } = {}) {
    this.rooms = new Map();
    this.latency = latency;
    this.jitter = jitter;
  }
  _deliver(fn) {
    const d = this.latency + Math.random() * this.jitter;
    if (d <= 0) queueMicrotask(fn); else setTimeout(fn, d);
  }
}

export class LoopbackTransport extends Emitter {
  constructor(hub, id = null) {
    super();
    this.hub = hub;
    this.id = id || 'peer-' + Math.random().toString(36).slice(2, 9);
    this.isHost = false;
    this.code = null;
    this.conns = new Map();
  }

  async host(code) {
    this.isHost = true;
    this.code = code;
    if (this.hub.rooms.has(code)) throw new Error('ROOM_TAKEN');
    this.hub.rooms.set(code, this);
    return code;
  }

  async join(code) {
    this.isHost = false;
    this.code = code;
    const host = this.hub.rooms.get(code);
    if (!host) throw new Error('ROOM_NOT_FOUND');
    this.hostTransport = host;
    host.conns.set(this.id, this);
    this.hub._deliver(() => {
      host.emit('peer:open', this.id);
      this.emit('open');
    });
  }

  sendTo(peerId, msg) {
    const t = this.conns.get(peerId);
    if (!t) return;
    const copy = JSON.parse(JSON.stringify(msg)); // mimic serialization
    this.hub._deliver(() => t.emit('data', copy));
  }

  broadcast(msg) {
    for (const id of this.conns.keys()) this.sendTo(id, msg);
  }

  sendToHost(msg) {
    if (!this.hostTransport) return;
    const copy = JSON.parse(JSON.stringify(msg));
    this.hub._deliver(() => this.hostTransport.emit('peer:data', this.id, copy));
  }

  destroy() {
    if (this.isHost) this.hub.rooms.delete(this.code);
    if (this.hostTransport) {
      this.hostTransport.conns.delete(this.id);
      const ht = this.hostTransport;
      this.hub._deliver(() => ht.emit('peer:close', this.id));
    }
  }
}
