# Murder In Broomfield

A browser-based social deduction game for four to six players, in the spirit of
*Deception: Murder in Hong Kong*. One player is the Forensic Scientist who knows
everything and may say nothing. One player is the Murderer, whose weapon and
evidence are already sitting face up on the table. Everybody else has to work it
out before the badges run out.

**[Play it here](https://sburrell23.github.io/Murder-In-Broomfield/)**

Peer-to-peer over WebRTC, no server, no build step, no framework. Voice chat is
deliberately out of scope — play on whatever you already use and let the app
track the evidence.

---

## Running it

Any static file server will do. It must be served over HTTP rather than opened
from the filesystem, because the code is ES modules.

```bash
npx http-server . -p 8734 -c-1
```

Then open `http://localhost:8734`.

## Playing

One player presses **Open A Case** and shares the four-character room code (the
code chip copies an invite link). Everyone else presses **Join A Case**. With
four to six players seated, the host begins.

The host can pin a specific player as Forensic Scientist or leave it to chance,
and at six players can enable the **Accomplice & Witness** pair.

### Roles

| Role | Knows | Wins with |
| --- | --- | --- |
| Forensic Scientist | Everything. Communicates only by placing bullets | Investigators |
| Murderer | Their own weapon and evidence | Murderer |
| Accomplice | The murderer, and exactly what they used | Murderer |
| Witness | Two people moved in the dark, but not which was which | Investigators |
| Investigator | Nothing | Investigators |

### The shape of a game

1. **Night.** The Murderer picks one Means of Murder and one piece of Key
   Evidence from their own face-up hand. Each player then reads a private
   dossier containing only what their role is entitled to know.
2. **Setup.** The Scientist places one bullet marker on the Cause of Death tile,
   one on the Location of Crime tile, and one on each of four Scene Tiles.
3. **Rounds.** The table argues. At the end of a round the Scientist swaps one
   Scene Tile for a fresh one and marks it. That happens twice, so three rounds.
4. **Badges.** Every player except the Scientist carries exactly one badge and
   may throw it at any moment — the Murderer included, and bluffing with it is
   often the right move. A badge names a suspect, a weapon and a piece of
   evidence, and all three must be right.
5. **Ending.** Investigators win the moment a badge lands. If every badge is
   spent or three rounds elapse, the Murderer walks. When a Witness is in play
   and a badge does land, the Murderer's side gets one last chance to win by
   naming the Witness.

---

## Card art

The game ships complete with **zero image files**. Every card renders as a
deterministic noir engraving generated in `js/art/procedural.js` — aged paper, a
single ink glyph chosen from the card's motif, a caption and a plate number.

Real photographs are strictly an upgrade layer, and swapping them in is a file
drop:

```
assets/images/means/butcher-knife.jpg     <- matches the `img` slug in js/data/means.js
assets/images/clues/pocket-watch.jpg      <- matches the `img` slug in js/data/clues.js
```

`.webp`, `.jpg`, `.jpeg` and `.png` all work. A card with no file, or whose file
fails to decode, silently falls back to its engraving — so a partial set is
fine, and you can mix photographs and engravings freely.

### Fetching photographs

`tools/fetch-images.mjs` populates the folders from Wikimedia Commons, accepting
only openly licensed files (public domain, CC0, CC BY, CC BY-SA) and recording
every author and licence in `assets/images/CREDITS.md`.

```bash
node tools/fetch-images.mjs                # everything still missing
node tools/fetch-images.mjs --only clues   # one deck
node tools/fetch-images.mjs --limit 20     # stop after 20
node tools/fetch-images.mjs --force        # re-fetch existing files
```

Automated image search is imprecise. Delete any result you dislike, drop in your
own file, then rebuild the lookup table:

```bash
node tools/build-manifest.mjs
```

The manifest lets the game request exactly the files that exist instead of
probing extensions. It is an optimisation, not a requirement — delete it and the
game probes instead, so hand-dropped images still work with no build step.

---

## Sound

Every sound effect is synthesized at runtime in the Web Audio API
(`js/audio/sfx.js`) — no sample files. Music is two looping tracks in
`assets/audio`. Music and effects run on separate gain buses, so the sound panel
adjusts them independently and the settings persist in `localStorage`.

To swap the music, replace `assets/audio/candlewick-case.mp3` (title and lobby)
or `assets/audio/main-game-music.mp3` (in game).

---

## How it fits together

```
index.html            screens, modals and the effect stage
css/                  main (theme, shell) · game (board) · animations
js/
  data/               means (100) · clues (100) · tiles (6 cause, 5 location, 20 scene)
  game/rules.js       authoritative rules engine — pure, no DOM, no network
  net/net.js          PeerJS transport, plus an in-process loopback for tests
  net/room.js         Host (authority) and Client (view consumer)
  art/procedural.js   the engraving generator
  audio/              synthesized effects · music buses
  ui/                 dom · cards · fx · game-ui
  main.js             title, lobby, session wiring, rain
tools/                image fetcher · manifest builder
tests/                headless rules and netcode suites
```

**The host is authoritative.** It owns the only `Game` instance, validates every
action against the identity of the connection it arrived on, and sends each
player a filtered view. A client never receives the solution unless its role
entitles it to — an Investigator's payload contains no secrets at all, and the
public player list carries no roles. Forging an `actorId` in a message achieves
nothing, because the host keys off the connection rather than the payload.

State messages carry a monotonic sequence number and clients drop anything
stale, so a reordered or duplicated packet cannot roll a player's UI backwards.

Players who drop keep their seat and can reclaim it with a stored token; the
`?room=CODE` deep link makes rejoining a single click.

## Tests

```bash
node tests/check-data.mjs   # deck integrity: counts, unique ids, 6 options per tile
node tests/sim.mjs          # 1200 randomised full games through the real engine
node tests/net-sim.mjs      # Host + Clients over a lossy, reordering transport
```

`sim.mjs` asserts role composition, hand disjointness, view scoping, badge
accounting, replacement limits, win conditions, and that illegal actions are
refused. `net-sim.mjs` runs the real `Host` and `Client` classes over a loopback
transport with latency and jitter, covering seating, per-seat view isolation,
forged actions, mid-game reconnect, room-full handling and complete games.

---

## Notes

This is an unofficial fan implementation, built for playing with friends. It is
not affiliated with or endorsed by the publishers of *Deception: Murder in Hong
Kong*. Signalling uses the public PeerJS broker; gameplay traffic is direct
peer-to-peer and never passes through it.
