// The street outside: a canvas vignette for the title screen and lobby.
//
// A wet road, a single gas lamp, and a cloaked figure at the edge of the light
// smoking a cigarette. Deliberately underexposed - it should read as atmosphere
// you notice on the second look, never as competition for the title.
//
// The static plate (road, buildings, lamp post, figure) is drawn once to an
// offscreen canvas and blitted each frame. Only the live parts - the lamp
// flicker, the ember, the smoke - are redrawn, so this stays cheap.

const WARM = [255, 186, 94];      // lamp light
const EMBER = [255, 138, 62];

export class StreetScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.plate = document.createElement('canvas');
    this.pctx = this.plate.getContext('2d');
    this.raf = null;
    this.running = false;
    this.t = 0;
    this.smoke = [];
    this.nextDrag = 2200;
    this.dragUntil = 0;
    this._onResize = () => this.resize();
  }

  // --------------------------------------------------------------- layout ---

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h; this.dpr = dpr;

    for (const c of [this.canvas, this.plate]) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Scene anchors. The title block owns the middle of the screen, so the lamp
    // and figure live in the lower right where they can be seen without ever
    // sitting behind the type. On narrow screens they pull inward and shrink.
    const narrow = w < 760;
    this.ground = h * (narrow ? 0.955 : 0.94);
    this.scale = Math.min(1.0, Math.max(0.46, h / 1080)) * (narrow ? 0.78 : 1);
    this.lampX = narrow ? w * 0.80 : w * 0.845;
    this.figX = narrow ? w * 0.655 : w * 0.752;
    this.lampTop = this.ground - 300 * this.scale;

    this.drawPlate();
  }

  // ---------------------------------------------------------- static plate ---

  drawPlate() {
    const g = this.pctx;
    const { w, h, ground, scale } = this;
    g.clearRect(0, 0, w, h);

    this.drawBuildings(g);
    this.drawRoad(g);
    this.drawLampPost(g);
    this.drawFigure(g);
    // Reflections sit on top of the road but under the live light.
    this.drawReflections(g);
  }

  drawBuildings(g) {
    const { w, ground, scale } = this;
    // A far terrace, flat-filled. A vertical gradient across the whole run makes
    // tall buildings translucent at their tops and short ones solid, which
    // reads as random light and dark patches rather than a skyline. Silhouettes
    // want one value; the atmosphere comes from the lamp light on top.
    g.fillStyle = 'rgba(3,3,6,0.82)';

    let x = -40;
    const rnd = mulberry(20240701);
    g.beginPath();
    g.moveTo(-40, ground);
    while (x < w + 80) {
      const bw = (70 + rnd() * 120) * scale;
      const bh = (185 + rnd() * 145) * scale;
      g.lineTo(x, ground - bh);
      g.lineTo(x + bw, ground - bh);
      // The odd chimney or parapet.
      if (rnd() > 0.65) {
        g.lineTo(x + bw, ground - bh - 22 * scale);
        g.lineTo(x + bw + 12 * scale, ground - bh - 22 * scale);
        g.lineTo(x + bw + 12 * scale, ground - bh);
      }
      x += bw;   // butt the terrace together; gaps read as lit rectangles
    }
    g.lineTo(w + 80, ground);
    g.closePath();
    g.fill();

    // A couple of dim windows, so the street is not entirely dead.
    const rnd2 = mulberry(881);
    for (let i = 0; i < 14; i++) {
      const wx = rnd2() * w;
      const wy = ground - (120 + rnd2() * 240) * scale;
      const ww = 5 * scale, wh = 8 * scale;
      // Windows glow rather than sit as flat rectangles.
      const a = 0.010 + rnd2() * 0.022;
      const glow = g.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, ww * 2.2);
      glow.addColorStop(0, `rgba(255,196,120,${a.toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255,196,120,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(wx + ww / 2, wy + wh / 2, ww * 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawRoad(g) {
    const { w, h, ground } = this;
    const road = g.createLinearGradient(0, ground, 0, h);
    road.addColorStop(0, 'rgba(13,13,18,0.9)');
    road.addColorStop(1, 'rgba(6,6,10,0.96)');
    g.fillStyle = road;
    g.fillRect(0, ground, w, h - ground);

    // Kerb line.
    g.strokeStyle = 'rgba(150,155,175,0.05)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, ground + 0.5);
    g.lineTo(w, ground + 0.5);
    g.stroke();
  }

  drawLampPost(g) {
    const { ground, scale, lampX } = this;
    const top = this.lampTop;
    const ink = 'rgba(8,9,13,0.95)';
    g.fillStyle = ink;
    g.strokeStyle = ink;

    // Base and fluted post.
    g.beginPath();
    g.ellipse(lampX, ground, 13 * scale, 4 * scale, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(lampX - 6 * scale, ground - 16 * scale, 12 * scale, 16 * scale);
    g.fillRect(lampX - 3 * scale, top + 30 * scale, 6 * scale, ground - top - 44 * scale);

    // Collar.
    g.fillRect(lampX - 6 * scale, top + 26 * scale, 12 * scale, 7 * scale);

    // Lantern housing: a tapered glass box with a cap and finial.
    const lh = 34 * scale, lw = 17 * scale;
    const ly = top - 4 * scale;
    g.beginPath();
    g.moveTo(lampX - lw / 2, ly + lh);
    g.lineTo(lampX - lw / 2 + 2 * scale, ly);
    g.lineTo(lampX + lw / 2 - 2 * scale, ly);
    g.lineTo(lampX + lw / 2, ly + lh);
    g.closePath();
    g.fill();

    // Cap.
    g.beginPath();
    g.moveTo(lampX - lw * 0.7, ly);
    g.lineTo(lampX, ly - 13 * scale);
    g.lineTo(lampX + lw * 0.7, ly);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(lampX, ly - 17 * scale, 2.6 * scale, 0, Math.PI * 2);
    g.fill();

    this.lamp = { x: lampX, y: ly + lh * 0.45, r: lh * 0.5 };
  }

  // A cloaked figure: long coat, wide brim, one shoulder toward the light.
  drawFigure(g) {
    const { ground, scale, figX } = this;
    const s = scale * 1.0;
    const h = 176 * s;                 // total height
    const headR = 12.5 * s;
    const y = ground;                  // feet
    const headY = y - h + headR;

    g.save();
    g.fillStyle = 'rgba(5,5,9,0.97)';

    // Cloak: a bell that widens to the ground, with a slight lean.
    g.beginPath();
    g.moveTo(figX - 8 * s, headY + headR * 0.7);
    g.bezierCurveTo(figX - 30 * s, headY + 46 * s, figX - 38 * s, y - 54 * s, figX - 34 * s, y);
    g.lineTo(figX + 33 * s, y);
    g.bezierCurveTo(figX + 37 * s, y - 58 * s, figX + 28 * s, headY + 44 * s, figX + 9 * s, headY + headR * 0.7);
    g.closePath();
    g.fill();

    // A fold in the cloak, barely lighter, catching the lamp.
    g.strokeStyle = 'rgba(140,148,172,0.07)';
    g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(figX + 12 * s, headY + 34 * s);
    g.quadraticCurveTo(figX + 24 * s, y - 66 * s, figX + 22 * s, y - 6 * s);
    g.stroke();

    // Shoulders, so the cloak reads as a person rather than a bell.
    g.fillStyle = 'rgba(5,5,9,0.97)';
    g.beginPath();
    g.moveTo(figX - 20 * s, headY + 30 * s);
    g.quadraticCurveTo(figX, headY + 14 * s, figX + 20 * s, headY + 30 * s);
    g.lineTo(figX + 18 * s, headY + 40 * s);
    g.quadraticCurveTo(figX, headY + 26 * s, figX - 18 * s, headY + 40 * s);
    g.closePath();
    g.fill();

    // The forearm brought up to the mouth, holding the cigarette. This is what
    // actually sells the pose - without it the ember floats in mid-air.
    g.strokeStyle = 'rgba(5,5,9,0.97)';
    g.lineWidth = 6.5 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(figX + 19 * s, headY + 44 * s);   // elbow, low and out
    g.quadraticCurveTo(figX + 24 * s, headY + 22 * s, figX + 13 * s, headY + 9 * s);
    g.stroke();

    // Head and hat.
    g.fillStyle = 'rgba(5,5,9,0.97)';
    g.beginPath();
    g.arc(figX, headY, headR, 0, Math.PI * 2);
    g.fill();

    const brimY = headY - headR * 0.45;
    g.beginPath();
    g.ellipse(figX, brimY, 25 * s, 5.4 * s, -0.05, 0, Math.PI * 2);
    g.fill();
    g.beginPath();                       // crown
    g.moveTo(figX - 12 * s, brimY);
    g.quadraticCurveTo(figX - 11 * s, brimY - 20 * s, figX, brimY - 21 * s);
    g.quadraticCurveTo(figX + 11 * s, brimY - 20 * s, figX + 12 * s, brimY);
    g.closePath();
    g.fill();

    g.restore();

    // The cigarette sits at the fingertips, just off the mouth on the lit side.
    this.ember = { x: figX + 11 * s, y: headY + 6 * s, s };
  }

  // Wet-road reflections. Drawn through a soft elliptical mask, because a
  // straight gradient rectangle reads as a visible band on a dark page.
  drawReflections(g) {
    const { ground, h, scale, lampX, figX } = this;
    const smear = (x, width, height, rgb, alpha) => {
      const hh = Math.min(height * scale, Math.max(4, h - ground));
      if (hh <= 2) return;
      const rx = (width / 2) * scale;
      g.save();
      g.translate(x, ground);
      g.scale(1, hh / rx);          // stretch a soft circle into a smear
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, `rgba(${rgb},${alpha})`);
      grd.addColorStop(0.55, `rgba(${rgb},${alpha * 0.35})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, rx, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };

    // Only the lower half of each smear should show, so clip to the road.
    g.save();
    g.beginPath();
    g.rect(0, ground, this.w, h - ground);
    g.clip();
    smear(lampX, 70, 160, '255,186,94', 0.085);
    smear(figX, 78, 100, '8,8,14', 0.5);
    g.restore();
  }

  // ----------------------------------------------------------------- live ---

  frame(dt) {
    const c = this.ctx;
    const { w, h, scale } = this;
    c.clearRect(0, 0, w, h);

    this.t += dt;

    // Gas lamps breathe. Two detuned sines plus a rare deeper dip.
    const flick =
      0.86 +
      0.07 * Math.sin(this.t / 430) +
      0.05 * Math.sin(this.t / 137 + 1.3) +
      (Math.sin(this.t / 2600) > 0.985 ? -0.22 : 0);

    // Plate first, then every light on top. Glow from a lamp hangs in the air
    // between the viewer and the buildings, so drawing it underneath let the
    // silhouettes bite into it and exposed the halo's bounding box.
    c.drawImage(this.plate, 0, 0, w, h);
    this.drawLampGlow(c, flick);
    this.drawLightPool(c, flick);
    this.updateSmoke(dt);
    this.drawSmoke(c);
    this.drawEmber(c);
  }

  drawLampGlow(c, flick) {
    const { lamp, scale, ground } = this;
    if (!lamp) return;

    // The halo around the lantern itself, composited additively so it reads as
    // light rather than as paint. Filled through a circular path so no
    // rectangular bound can ever show at the edge of the gradient.
    const r = 155 * scale * flick;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, r);
    halo.addColorStop(0, `rgba(${WARM},${0.20 * flick})`);
    halo.addColorStop(0.2, `rgba(${WARM},${0.075 * flick})`);
    halo.addColorStop(0.55, `rgba(${WARM},${0.018 * flick})`);
    halo.addColorStop(1, `rgba(${WARM},0)`);
    c.fillStyle = halo;
    c.beginPath();
    c.arc(lamp.x, lamp.y, r, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // The shaft of light hanging in the drizzle. Built as a vertically
    // stretched radial glow rather than a blurred trapezoid: canvas `filter`
    // combined with 'lighter' leaves a visible bounding rectangle in Chrome,
    // and a crisp trapezoid reads as a graphic rather than as light.
    const midY = (lamp.y + ground) / 2;
    const shaftR = 96 * scale;
    const stretch = ((ground - lamp.y) * 0.62) / shaftR;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(lamp.x, midY);
    c.scale(1, stretch);
    const shaft = c.createRadialGradient(0, 0, 0, 0, 0, shaftR);
    shaft.addColorStop(0, `rgba(${WARM},${0.05 * flick})`);
    shaft.addColorStop(0.45, `rgba(${WARM},${0.022 * flick})`);
    shaft.addColorStop(1, `rgba(${WARM},0)`);
    c.fillStyle = shaft;
    c.beginPath();
    c.arc(0, 0, shaftR, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // The pool of light on the wet road. Squashing the context rather than
  // clipping an ellipse keeps the falloff soft in both axes - clipping a
  // circular gradient to a flat ellipse is what produced a hard-edged band.
  drawLightPool(c, flick) {
    const { lamp, ground, scale } = this;
    if (!lamp) return;
    const rx = 140 * scale, squash = 0.21;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(lamp.x, ground);
    c.scale(1, squash);
    const pool = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    pool.addColorStop(0, `rgba(${WARM},${0.13 * flick})`);
    pool.addColorStop(0.5, `rgba(${WARM},${0.04 * flick})`);
    pool.addColorStop(1, `rgba(${WARM},0)`);
    c.fillStyle = pool;
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // The cigarette: a low idle glow, brightening for a couple of seconds when
  // the figure takes a drag, and puffing extra smoke afterwards.
  drawEmber(c) {
    const e = this.ember;
    if (!e) return;

    const dragging = this.t < this.dragUntil;
    const idle = 0.5 + 0.12 * Math.sin(this.t / 620);
    const intensity = dragging
      ? 0.85 + 0.15 * Math.sin(this.t / 55)
      : idle;

    const r = (dragging ? 8.5 : 6) * e.s;
    const glow = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 2.6);
    glow.addColorStop(0, `rgba(${EMBER},${0.55 * intensity})`);
    glow.addColorStop(0.4, `rgba(${EMBER},${0.16 * intensity})`);
    glow.addColorStop(1, `rgba(${EMBER},0)`);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = glow;
    c.beginPath();
    c.arc(e.x, e.y, r * 2.6, 0, Math.PI * 2);
    c.fill();

    // The coal itself.
    c.fillStyle = `rgba(255,${dragging ? 190 : 150},${dragging ? 120 : 90},${0.75 * intensity})`;
    c.beginPath();
    c.arc(e.x, e.y, 1.5 * e.s, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  updateSmoke(dt) {
    const e = this.ember;
    if (!e) return;

    this.nextDrag -= dt;
    if (this.nextDrag <= 0) {
      this.dragUntil = this.t + 1600;
      this.nextDrag = 9000 + Math.random() * 8000;
      // A drag pushes out a denser plume a moment later.
      for (let i = 0; i < 5; i++) {
        this.smoke.push(this.newPuff(e, 0.55 + Math.random() * 0.5, i * 90));
      }
    }

    if (Math.random() < dt / 900) this.smoke.push(this.newPuff(e, 0.3));

    const rise = dt / 1000;
    for (const p of this.smoke) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= rise / p.span;
      p.y -= p.vy * rise * 60;
      p.x += (p.vx + Math.sin((this.t + p.seed) / 900) * 0.25) * rise * 60;
      p.r += 9 * rise;
    }
    this.smoke = this.smoke.filter(p => p.life > 0 && p.delay <= 0 || p.delay > 0);
    if (this.smoke.length > 34) this.smoke.splice(0, this.smoke.length - 34);
  }

  newPuff(e, strength, delay = 0) {
    return {
      x: e.x + (Math.random() - 0.5) * 3 * e.s,
      y: e.y - 2 * e.s,
      r: (2.5 + Math.random() * 2.5) * e.s,
      vy: 0.28 + Math.random() * 0.22,
      vx: 0.10 + Math.random() * 0.16,
      life: 1,
      span: 5 + Math.random() * 4,
      alpha: 0.055 * strength,
      seed: Math.random() * 6000,
      delay
    };
  }

  drawSmoke(c) {
    c.save();
    for (const p of this.smoke) {
      if (p.delay > 0 || p.life <= 0) continue;
      const a = p.alpha * Math.sin(Math.PI * Math.min(1, p.life));
      if (a <= 0.001) continue;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(196,200,215,${a})`);
      g.addColorStop(1, 'rgba(196,200,215,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- loop ---

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });

    let last = performance.now();
    const tick = now => {
      if (!this.running) return;
      const dt = Math.min(60, now - last);
      last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    window.removeEventListener('resize', this._onResize);
    if (this.ctx && this.w) this.ctx.clearRect(0, 0, this.w, this.h);
  }
}

// Small deterministic generator so the skyline is identical every load.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
