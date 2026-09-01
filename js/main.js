// Application shell: title screen, lobby, session wiring and the sound panel.

import { $, $$, el, clear, showScreen, toast, openModal, closeModal, wireModals } from './ui/dom.js';
import { PeerTransport, makeRoomCode } from './net/net.js';
import { Host, Client } from './net/room.js';
import { initGameUI, renderView, resetGameUI, playFx } from './ui/game-ui.js';
import { loadImageManifest } from './ui/cards.js';
import { audio } from './audio/sfx.js';
import { music } from './audio/music.js';

const MIN_PLAYERS = 4, MAX_PLAYERS = 6;

let session = null;   // { isHost, host?, client?, act, restart, leave }
let lobbyState = null;
let currentView = null;

// ============================================================== boot =====

function boot() {
  // Kicked off early so it is almost certainly resolved before the first card
  // is drawn; cards render correctly either way.
  loadImageManifest();
  wireModals();
  wireAudioPanel();
  wireTitle();
  wireLobby();
  startRain();
  restoreName();

  // Audio can only start after a gesture, so arm it on the first interaction.
  const unlock = () => {
    audio.init();
    audio.resume();
    if (!session || !session.inGame) music.play('lobby');
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Deep link: ?room=ABCD prefills the join box.
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    $('#join-row').hidden = false;
    $('#input-code').value = room.toUpperCase().slice(0, 4);
  }

  initGameUI({
    act: a => session && session.act(a),
    get isHost() { return !!(session && session.isHost); },
    restart: () => session && session.restart(),
    leave: () => leaveSession()
  });
}

// ============================================================= title =====

function restoreName() {
  try {
    const saved = localStorage.getItem('mib.name');
    if (saved) $('#input-name').value = saved;
  } catch { /* ignore */ }
}

function myName() {
  const v = $('#input-name').value.trim();
  const name = v || 'Detective';
  try { localStorage.setItem('mib.name', name); } catch { /* ignore */ }
  return name;
}

function wireTitle() {
  $('#btn-join-toggle').addEventListener('click', () => {
    audio.click();
    const row = $('#join-row');
    row.hidden = !row.hidden;
    if (!row.hidden) $('#input-code').focus();
  });

  $('#input-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  });

  $('#btn-host').addEventListener('click', () => { audio.click(); startHosting(); });
  $('#join-row').addEventListener('submit', e => { e.preventDefault(); audio.click(); startJoining(); });

  $$('.btn, .icon-btn').forEach(b => b.addEventListener('mouseenter', () => audio.hover()));
}

function titleStatus(msg, kind = '') {
  const n = $('#title-status');
  n.textContent = msg;
  n.className = 'net-status' + (kind ? ' is-' + kind : '');
}

// =========================================================== hosting =====

async function startHosting() {
  if (!window.Peer) { titleStatus('Networking library failed to load. Check your connection.', 'error'); return; }
  const btn = $('#btn-host');
  btn.disabled = true;
  titleStatus('Opening the case file...');

  // Room codes are short, so a collision is possible; retry a few times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const transport = new PeerTransport();
    const host = new Host(transport, { hostName: myName() });
    const code = makeRoomCode();
    try {
      await host.open(code);
      attachHost(host);
      btn.disabled = false;
      titleStatus('');
      return;
    } catch (err) {
      host.destroy();
      if (String(err.message) !== 'ROOM_TAKEN') {
        btn.disabled = false;
        titleStatus('Could not open a room. Try again in a moment.', 'error');
        audio.error();
        return;
      }
    }
  }
  btn.disabled = false;
  titleStatus('The switchboard is busy. Try again.', 'error');
  audio.error();
}

function attachHost(host) {
  session = {
    isHost: true,
    host,
    inGame: false,
    act: a => host.localAction(a),
    restart: () => { host.restart(); },
    leave: () => { host.destroy(); }
  };

  host.on('lobby', payload => { lobbyState = payload; renderLobby(); });
  host.on('view', view => { currentView = view; session.inGame = true; onView(view); });
  host.on('fx', f => playFx(f, currentView));
  host.on('error', msg => { toast(msg, 'error'); audio.error(); });
  host.on('join', seat => { audio.playerJoin(); toast(`${seat.name} arrives.`); });
  host.on('leave', seat => { audio.playerLeave(); toast(`${seat.name} has gone.`, 'error'); });
  host.on('rejoin', seat => { audio.playerJoin(); toast(`${seat.name} is back.`, 'good'); });
  host.on('restarted', () => {
    session.inGame = false;
    resetGameUI();
    currentView = null;
    music.play('lobby');
    showScreen('lobby');
  });

  lobbyState = host.lobbyPayload();
  renderLobby();
  showScreen('lobby');
  music.play('lobby');
}

// =========================================================== joining =====

async function startJoining() {
  if (!window.Peer) { titleStatus('Networking library failed to load. Check your connection.', 'error'); return; }
  const code = $('#input-code').value.trim().toUpperCase();
  if (code.length !== 4) { titleStatus('A room code is four characters.', 'error'); audio.error(); return; }

  const btn = $('#btn-join');
  btn.disabled = true;
  titleStatus('Knocking...');

  const transport = new PeerTransport();
  const client = new Client(transport, { name: myName() });
  try {
    await client.join(code);
    attachClient(client);
    titleStatus('');
  } catch (err) {
    client.destroy();
    const m = String(err.message);
    titleStatus(m === 'ROOM_NOT_FOUND' ? 'No case open under that code.' : 'Could not reach the room.', 'error');
    audio.error();
  } finally {
    btn.disabled = false;
  }
}

function attachClient(client) {
  session = {
    isHost: false,
    client,
    inGame: false,
    act: a => client.action(a),
    restart: () => {},
    leave: () => { client.destroy(); }
  };

  client.on('lobby', payload => {
    lobbyState = payload;
    if (!payload.inGame && session.inGame) {
      // Host opened a fresh case.
      session.inGame = false;
      resetGameUI();
      currentView = null;
      music.play('lobby');
      showScreen('lobby');
    }
    renderLobby();
    if (!session.inGame) showScreen('lobby');
  });
  client.on('view', view => { currentView = view; session.inGame = true; onView(view); });
  client.on('fx', f => playFx(f, currentView));
  client.on('error', msg => { toast(msg, 'error'); audio.error(); });
  client.on('kicked', () => { toast('You were removed from the room.', 'error'); leaveSession(); });
  client.on('disconnected', () => {
    toast('Lost the connection to the host.', 'error');
    audio.error();
  });
  client.on('neterror', e => { if (e && e.type !== 'peer-unavailable') toast('Network trouble.', 'error'); });

  showScreen('lobby');
  music.play('lobby');
}

function leaveSession() {
  if (session) { try { session.leave(); } catch { /* ignore */ } }
  session = null;
  lobbyState = null;
  currentView = null;
  resetGameUI();
  music.play('lobby');
  showScreen('title');
  titleStatus('');
}

// ============================================================= lobby =====

function wireLobby() {
  $('#code-chip').addEventListener('click', copyCode);
  $('#code-chip').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyCode(); }
  });

  $('#btn-start').addEventListener('click', () => {
    if (!session || !session.isHost) return;
    audio.click();
    const res = session.host.start();
    if (!res.ok) { toast(res.error, 'error'); audio.error(); }
  });

  $('#btn-leave').addEventListener('click', () => { audio.click(); leaveSession(); });

  $('#select-scientist').addEventListener('change', e => {
    if (session && session.isHost) session.host.setSettings({ scientistId: e.target.value || null });
  });
  $('#toggle-aw').addEventListener('change', e => {
    if (session && session.isHost) session.host.setSettings({ useAccompliceWitness: e.target.checked });
  });
}

function copyCode() {
  if (!lobbyState) return;
  const url = `${location.origin}${location.pathname}?room=${lobbyState.code}`;
  const write = navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject();
  write.then(() => toast('Invite link copied.', 'good'))
       .catch(() => toast(`Room code: ${lobbyState.code}`));
  audio.click();
}

function renderLobby() {
  if (!lobbyState) return;
  const isHost = !!(session && session.isHost);
  const youId = isHost ? session.host.hostSeatId : (session && session.client ? session.client.youId : null);

  $('#code-value').textContent = lobbyState.code || '----';

  const list = $('#seat-list');
  clear(list);
  lobbyState.players.forEach((p, i) => {
    const tags = el('span.seat-flags');
    if (p.isHost) tags.append(el('span.seat-tag.tag-host', { text: 'Host' }));
    if (p.id === youId) tags.append(el('span.seat-tag.tag-you', { text: 'You' }));
    if (lobbyState.settings.scientistId === p.id) tags.append(el('span.seat-tag.tag-sci', { text: 'Forensics' }));

    const row = el('li.seat', {
      class: [p.id === youId ? 'is-you' : '', p.isHost ? 'is-host' : '', p.connected ? '' : 'is-off'].filter(Boolean).join(' ')
    },
      el('span.seat-num', { text: String(i + 1).padStart(2, '0') }),
      el('span.seat-name', { text: p.name }),
      tags,
      (isHost && !p.isHost)
        ? el('button.seat-kick', { title: `Remove ${p.name}`, 'aria-label': `Remove ${p.name}`, html: '&times;',
            onclick: () => { audio.click(); session.host.kick(p.id); } })
        : null);
    list.append(row);
  });

  // Empty seats, so the table reads as unfinished rather than merely short.
  for (let i = lobbyState.players.length; i < MIN_PLAYERS; i++) {
    list.append(el('li.seat.is-off', null,
      el('span.seat-num', { text: String(i + 1).padStart(2, '0') }),
      el('span.seat-name', { style: { fontStyle: 'italic', color: 'var(--text-faint)' }, text: 'Empty chair' })));
  }

  const n = lobbyState.players.length;
  $('#lobby-hint').textContent = n < MIN_PLAYERS
    ? `${MIN_PLAYERS - n} more ${MIN_PLAYERS - n === 1 ? 'detective' : 'detectives'} needed. Share the room code.`
    : `${n} at the table. ${n < MAX_PLAYERS ? 'Room for ' + (MAX_PLAYERS - n) + ' more.' : 'The table is full.'}`;

  const settings = $('#lobby-settings');
  settings.hidden = !isHost;
  if (isHost) {
    const sel = $('#select-scientist');
    const prev = lobbyState.settings.scientistId || '';
    clear(sel);
    sel.append(el('option', { value: '', text: 'Chosen at random' }));
    lobbyState.players.forEach(p => sel.append(el('option', { value: p.id, text: p.name })));
    sel.value = prev;

    const aw = $('#toggle-aw');
    aw.checked = !!lobbyState.settings.useAccompliceWitness;
    aw.disabled = n < 6;

    const start = $('#btn-start');
    start.disabled = !session.host.canStart();
    start.textContent = n < MIN_PLAYERS ? `Need ${MIN_PLAYERS} Players` : 'Begin The Case';
  } else {
    $('#btn-start').disabled = true;
    $('#btn-start').textContent = 'Waiting For The Host';
  }

  $('#lobby-status').textContent = isHost ? '' : 'Only the host can begin the case.';
}

// ============================================================== view =====

function onView(view) {
  const wasLobbyMusic = music.current === 'lobby';
  if (wasLobbyMusic) music.play('game');
  renderView(view);
}

// ============================================================ audio ======

function wireAudioPanel() {
  $('#btn-sound').addEventListener('click', () => { audio.init(); audio.click(); openModal('modal-sound'); });
  $('#btn-rules').addEventListener('click', () => { audio.click(); openModal('modal-rules'); });

  const bind = (slider, out, key) => {
    const s = $(slider), o = $(out);
    s.value = Math.round(audio.get(key) * 100);
    o.textContent = s.value;
    s.addEventListener('input', () => {
      o.textContent = s.value;
      audio.init();
      audio.set(key, Number(s.value) / 100);
    });
  };
  bind('#vol-master', '#out-master', 'master');
  bind('#vol-music', '#out-music', 'music');
  bind('#vol-sfx', '#out-sfx', 'sfx');

  const mute = $('#toggle-mute');
  mute.checked = !!audio.get('muted');
  mute.addEventListener('change', () => { audio.init(); audio.set('muted', mute.checked); });

  $('#btn-test-sfx').addEventListener('click', () => { audio.init(); audio.resume(); audio.bulletPlace(); });
}

// ============================================================== rain =====

// A light rain layer on the canvas behind everything. Cheap, and it sells the
// weather more than a static image would.
function startRain() {
  const canvas = $('#rain');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, drops = [];

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.floor(innerWidth * dpr);
    h = canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    const count = Math.min(220, Math.floor(innerWidth / 8));
    drops = Array.from({ length: count }, () => newDrop(true));
  };
  const newDrop = anywhere => ({
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : -20,
    len: (8 + Math.random() * 22),
    sp: (3.2 + Math.random() * 5.5),
    a: 0.08 + Math.random() * 0.22
  });

  let raf = null;
  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const d of drops) {
      ctx.strokeStyle = `rgba(190,205,225,${d.a})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.16, d.y + d.len);
      ctx.stroke();
      d.y += d.sp * 2.4;
      d.x -= d.sp * 0.38;
      if (d.y > h + 30) Object.assign(d, newDrop(false));
    }
    raf = requestAnimationFrame(frame);
  };

  addEventListener('resize', resize, { passive: true });
  resize();
  frame();

  // Stop drawing when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
    else if (!raf) frame();
  });
}

boot();
