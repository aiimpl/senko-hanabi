// The film: one sparkler from the match to the fall of the fireball, 8 shots, ~33 s (it opens on the peak).
// Each shot plays a stretch of the burn (the simulation runs forward; going back re-runs it from the start),
// through its own lens and shutter. Shot 5 is a high-speed camera at 1/150 speed.
// The burn is re-run from the start after the opening shot (same seed, so it burns the same way).

const SHOTS = [
  // cold open: the peak of the pine needles, so the first second already shows what this is
  { len: 2.4, b0: 16.6, b1: 19.0, cam: { d: 0.36, az: 0.25, el: 0.0, push: 0.03 }, fstop: 9, label: -1, open: true },
  // lighting: the lighter comes up under the tip, the paper catches, the powder flares, the melt becomes the ball.
  // The camera starts low on the tip (which hangs 1.8 cm lower before it burns) and rises with the burning front
  { len: 4.6, b0: 0.0, b1: 4.6, cam: { d: 0.26, az: 0.0, el: 0.02, push: 0.03, ty0: -0.02, ty: -0.002 }, fstop: 10, label: 0, labelAt: 3.0 },
  { len: 4.2, b0: 6.0, b1: 10.2, cam: { d: 0.36, az: -0.42, el: 0.06, push: 0.02 }, fstop: 8, label: 1, labelAt: 0.5 },
  { len: 5.0, b0: 13.5, b1: 18.5, cam: { d: 0.44, az: 0.25, el: -0.02, push: 0.03 }, fstop: 9, label: 2, labelAt: 0.5 },
  // high-speed camera: 1/150 speed; each droplet leaves a short fading trail so the splitting can be followed
  { len: 4.6, b0: 19.0, b1: 19.0 + 4.6 / 150, cam: { d: 0.23, az: 0.55, el: 0.04, push: 0.015 }, fstop: 22, shutter: 0.6, tail: 3, slow: 150, label: -1, note: 1 },
  { len: 4.4, b0: 29.0, b1: 33.4, cam: { d: 0.40, az: -0.2, el: 0.05, push: 0.02 }, fstop: 11, label: 3, labelAt: 0.5 },
  { len: 4.0, b0: 38.0, b1: 42.0, cam: { d: 0.28, az: 0.1, el: 0.0, push: 0.03 }, fstop: 8, label: 4, labelAt: 0.5 },
  // the end: the fireball lets go while it still glows. Its fall is shown at 1/20 speed, then the empty dark
  { len: 1.3, b0: 43.5, b1: 44.8, cam: { d: 0.46, az: 0.05, el: 0.03, push: 0.0, ty: -0.014 }, fstop: 8, label: -1, cont: 'out' },
  { len: 2.6, b0: 44.8, b1: 44.8 + 2.6 / 20, cam: { d: 0.46, az: 0.05, el: 0.03, push: 0.0, ty: -0.014 }, fstop: 8, shutter: 1 / 30, slow: 20, label: -1, note: 1, cont: 'both' },
  { len: 1.8, b0: 44.8 + 2.6 / 20, b1: 46.6, cam: { d: 0.46, az: 0.05, el: 0.03, push: 0.0, ty: -0.014 }, fstop: 8, label: -1, end: true, cont: 'in' },
];
const FADE = 0.12;

export class Film {
  constructor(ctx) {
    this.ctx = ctx;
    this.shots = SHOTS;
    let s = 0;
    for (const sh of SHOTS) { sh.start = s; s += sh.len; }
    this.length = s;
    this.burn = ctx.burn;
    this.burn.dropAt = 44.8;
    this.lastT = -1; this.lastFilm = -1;
    this.hud = document.getElementById('hud');
    this.hud.innerHTML = '<div class="cap"><b></b><i></i></div><div class="note"></div>';
    this.capB = this.hud.querySelector('.cap b'); this.capI = this.hud.querySelector('.cap i');
    this.cap = this.hud.querySelector('.cap'); this.note = this.hud.querySelector('.note');
    this.time = 0;
    this.events = [];
  }

  shotAt(ft) {
    for (const sh of SHOTS) if (ft < sh.start + sh.len) return sh;
    return SHOTS[SHOTS.length - 1];
  }

  // advance the burn to burn time T (only forward), with the hand's tremor and the smoke along the way
  advanceTo(T) {
    const { burn, handTremor, smoke } = this.ctx;
    if (T < this.lastT) { burn.reset(); smoke.reset(); this.lastT = 0; }
    const step = 1 / 240;
    let t = this.lastT < 0 ? 0 : this.lastT;
    while (t + step < T) {
      t += step;
      const a = handTremor(t); burn.setAnchor(a[0], a[1], a[2]);
      burn.advance(t);
    }
    const a = handTremor(T); burn.setAnchor(a[0], a[1], a[2]);
    burn.advance(T);
    this.lastT = T;
  }

  frame(ft, frameNo) {
    const ctx = this.ctx;
    const sh = this.shotAt(ft);
    const u = Math.min(1, Math.max(0, (ft - sh.start) / sh.len));
    const T = sh.b0 + (sh.b1 - sh.b0) * u;
    const evFrom = this.burn.events.length;
    this.advanceTo(T);
    // camera on a tripod, a slow push-in; focused on where the ball hangs
    const c = sh.cam;
    const d = c.d - c.push * u;
    const ty = c.ty0 !== undefined ? c.ty0 + (c.ty - c.ty0) * Math.min(1, Math.max(0, (T - 0.4) / 2.6)) : (c.ty || 0);
    const tgt = [0, 0.003 + ty, 0];
    const pos = [tgt[0] + Math.sin(c.az) * Math.cos(c.el) * d, tgt[1] + Math.sin(c.el) * d, tgt[2] + Math.cos(c.az) * Math.cos(c.el) * d];
    const bp = this.burn.ball();
    const focus = Math.hypot(pos[0] - bp[0], pos[1] - bp[1], pos[2] - bp[2]);
    ctx.applyLens({ focal: 100, fstop: sh.fstop, focus: sh.end && this.burn.dropped ? focus : focus }, pos, tgt);
    const shutter = sh.shutter || 1 / 30;
    // fade in and out at the cuts (and to black at the end)
    const a = ft - sh.start, b = sh.start + sh.len - ft;
    // shots that continue the same camera ('cont') are joined without a dip
    const joinIn = sh.cont === 'in' || sh.cont === 'both', joinOut = sh.cont === 'out' || sh.cont === 'both';
    const fin = joinIn ? 1 : a / (sh.open ? 0.05 : sh === SHOTS[1] ? 0.5 : FADE);
    const fout = joinOut ? 1 : b / (sh.end ? 1.0 : sh.open ? 0.25 : FADE);
    const fade = Math.min(1, fin, fout);
    // a high-speed camera turns up its gain for the short shutter (the glowing ball is not a streak, so it stays)
    const gain = sh.slow ? Math.pow((1 / 30) / (shutter / sh.slow), 0.8) * 0.5 : 1;
    const r = ctx.draw(T, sh.slow ? shutter / sh.slow : shutter, { frame: frameNo, fade, sparkGain: gain, tail: sh.tail || 0 });
    this.caption(sh, a);
    // the sound needs to know about the bursts in this frame
    const win = (sh.b1 - sh.b0) / sh.len / 30; // burn time covered by one frame
    const evs = this.burn.events.slice(evFrom).filter((e) => e.t <= T && e.t > T - win).map((e) => ({ e: +e.e.toFixed(3), d: +(Math.hypot(e.x[0] - pos[0], e.x[1] - pos[1], e.x[2] - pos[2])).toFixed(3) }));
    return { shot: SHOTS.indexOf(sh), T: +T.toFixed(4), slow: sh.slow || 1, stage: r.stage, light: +r.light.toFixed(3), n: evs.length, ev: evs.slice(0, 60), dropped: this.burn.dropped, dropT: this.burn.dropped ? +this.burn.dropT.toFixed(3) : null };
  }

  caption(sh, a) {
    const { STAGES } = this.ctx;
    if (sh.label >= 0) {
      const s = STAGES[sh.label];
      this.capB.textContent = s.ja; this.capI.textContent = s.en;
      const o = Math.min(1, Math.max(0, (a - sh.labelAt) / 0.5)) * Math.min(1, Math.max(0, (sh.len - a - 0.25) / 0.4));
      this.cap.style.opacity = o.toFixed(3);
    } else this.cap.style.opacity = 0;
    if (sh.note) {
      this.note.textContent = `1/${sh.slow} speed`;
      this.note.style.opacity = (Math.min(1, Math.max(0, (a - 0.3) / 0.5)) * Math.min(1, Math.max(0, (sh.len - a - 0.25) / 0.4))).toFixed(3);
    } else this.note.style.opacity = 0;
  }

  renderAt(f, fps) { return this.frame(f / fps, f); }

  tick(dt) {
    this.time += dt;
    if (this.time >= this.length) { this.time = 0; }
    this.frame(this.time, this.time * 60);
  }
}
