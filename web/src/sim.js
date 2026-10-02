// The burn of one senko hanabi (nagate-botan: 0.1 g of black powder twisted into washi), in metres and seconds.
// Fireball: molten potassium salts (K2S / K2CO3) hanging from the paper at about 880 C.
// Sparks: droplets thrown from the fireball surface. Each one heats up as it flies, gas forms inside it and it bursts
// into smaller droplets; a spark can split up to 8 times in a row (Inoue et al., Phys. Rev. Lett. 118, 074502, 2017).
// A droplet's path is closed form (gravity + linear air drag), so any moment can be drawn exactly at any shutter speed.
// The paper is a chain of points (Verlet) hanging from the hand, with the fireball as its heavy last point.

export const STAGES = [
  { key: 'tsubomi', ja: '蕾', en: 'Bud', t0: 2.6 },
  { key: 'botan', ja: '牡丹', en: 'Peony', t0: 6.0 },
  { key: 'matsuba', ja: '松葉', en: 'Pine needles', t0: 12.5 },
  { key: 'yanagi', ja: '柳', en: 'Willow', t0: 27.0 },
  { key: 'chirigiku', ja: '散り菊', en: 'Scattered chrysanthemum', t0: 36.0 },
];
export const BURN_END = 46.5;
export const G = 9.81;
export const BALL_R = 0.0023;
export const PAPER_LEN = 0.11;

export function stageAt(t) {
  let s = -1;
  for (let i = 0; i < STAGES.length; i++) if (t >= STAGES[i].t0) s = i;
  return s;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Burn profile: keyframes of how many sparks leave the fireball (per second) and how they split
//  rate  primaries per second      gmax  how many times a spark may split (fractional = probability)
//  v0    launch speed (m/s)        life  seconds a primary flies before it bursts
//  vk    speed the children fly off at a burst (m/s)
//  kids  children per burst        k     air drag (1/s); low drag + long life = the drooping willow
const KEYS = [
  { t: 0.0, rate: 0, gmax: 0, v0: 0.5, vk: 0.6, life: 0.016, kids: 2, k: 30 },
  { t: 2.5, rate: 0, gmax: 0, v0: 0.5, vk: 0.6, life: 0.016, kids: 2, k: 30 },
  { t: 3.2, rate: 4, gmax: 0.6, v0: 0.7, vk: 0.8, life: 0.020, kids: 2.5, k: 28 },
  { t: 6.0, rate: 9, gmax: 2.2, v0: 1.0, vk: 1.3, life: 0.026, kids: 3.2, k: 24 },
  { t: 9.0, rate: 26, gmax: 3.2, v0: 1.2, vk: 1.6, life: 0.024, kids: 4.0, k: 21 },
  { t: 12.5, rate: 300, gmax: 6.0, v0: 1.3, vk: 1.8, life: 0.022, kids: 5.0, k: 19 },
  { t: 20.0, rate: 560, gmax: 8.0, v0: 1.35, vk: 1.9, life: 0.022, kids: 5.4, k: 18 },
  { t: 25.5, rate: 260, gmax: 6.0, v0: 1.25, vk: 1.7, life: 0.024, kids: 4.6, k: 16 },
  { t: 28.0, rate: 55, gmax: 1.6, v0: 1.15, vk: 0.9, life: 0.080, kids: 2.6, k: 6.5 },
  { t: 34.0, rate: 28, gmax: 1.0, v0: 1.0, vk: 0.8, life: 0.070, kids: 2.4, k: 7.5 },
  { t: 37.0, rate: 70, gmax: 1.3, v0: 0.65, vk: 0.8, life: 0.016, kids: 3.6, k: 30 },
  { t: 43.0, rate: 30, gmax: 1.0, v0: 0.5, vk: 0.7, life: 0.013, kids: 3, k: 34 },
  { t: 45.5, rate: 6, gmax: 0.6, v0: 0.45, vk: 0.6, life: 0.011, kids: 3, k: 38 },
  { t: 46.5, rate: 0, gmax: 0, v0: 0.4, vk: 0.5, life: 0.010, kids: 2, k: 40 },
];
const FIELDS = ['rate', 'gmax', 'v0', 'vk', 'life', 'kids', 'k'];
export function profile(t) {
  const o = {};
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  let u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  u = u * u * (3 - 2 * u);
  for (const f of FIELDS) o[f] = a[f] + (b[f] - a[f]) * u;
  // the peony pulses: the ball gathers itself, then throws a handful at once
  if (t > 4 && t < 13) o.rate *= 0.45 + 1.1 * Math.pow(0.5 + 0.5 * Math.sin(t * 7.3 + Math.sin(t * 2.1) * 2), 3);
  return o;
}

// fireball size and brightness over the burn
export function ballState(t) {
  const grow = Math.min(1, Math.max(0, (t - 1.3) / 1.4));
  const g = grow * grow * (3 - 2 * grow);
  const late = Math.min(1, Math.max(0, (t - 36) / 10));
  const r = BALL_R * (0.25 + 0.75 * g) * (1 - 0.18 * late);
  const flame = t < 2.8 ? Math.min(1, t / 0.25) * Math.min(1, Math.max(0, (2.8 - t) / 0.8)) : 0;
  // glow: 880 C through the sparking stages, cooling at the very end
  const end = Math.min(1, Math.max(0, (t - (BURN_END - 2.5)) / 2.5));
  const heat = g * (1 - 0.75 * end * end);
  const stretch = 1 + 0.16 * Math.min(1, Math.max(0, (t - 14) / 10)) - 0.1 * late; // spindle-shaped later on
  return { r, flame, heat, stretch, char: 0.004 + 0.018 * Math.min(1, t / 2.6) };
}

const MAXD = 60000;
export class Burn {
  constructor({ seed = 7, dropAt = BURN_END + 0.6 } = {}) {
    this.seed = seed;
    this.dropAt = dropAt;
    this.reset();
  }
  reset() {
    this.R = rng(this.seed);
    this.t = 0;
    this.dt = 1 / 1200;
    // droplets, struct of arrays
    this.n = 0;
    this.x0 = new Float32Array(MAXD * 3); this.v0 = new Float32Array(MAXD * 3);
    this.tb = new Float64Array(MAXD); this.td = new Float64Array(MAXD);
    this.k = new Float32Array(MAXD); this.P = new Float32Array(MAXD);
    this.burst = new Uint8Array(MAXD); this.gen = new Uint8Array(MAXD);
    this.events = []; // bursts for the sound: {t, e, x}
    this.acc = 0;
    // paper chain
    const N = 22;
    this.N = N;
    this.rest = PAPER_LEN / (N - 1);
    this.p = new Float64Array(N * 3); this.q = new Float64Array(N * 3);
    this.anchor = [0, PAPER_LEN, 0];
    this.anchorPrev = [0, PAPER_LEN, 0];
    for (let i = 0; i < N; i++) {
      const y = PAPER_LEN - i * this.rest;
      this.p[i * 3 + 1] = y; this.q[i * 3 + 1] = y;
      // the paper is never quite straight
      const x = 0.0016 * Math.sin(i * 0.37) * (i / N);
      this.p[i * 3] = x; this.q[i * 3] = x;
    }
    this.dropped = false;
    this.dropT = 0; this.dropP = [0, 0, 0]; this.dropV = [0, 0, 0];
    this.strain = 0;
    this.out = false; // the ball has gone (fallen or burnt out)
    this.ballVel = [0, 0, 0];
  }
  setAnchor(x, y, z) { this.anchor[0] = x; this.anchor[1] = y; this.anchor[2] = z; }

  ball() {
    if (this.dropped) {
      const tau = this.t - this.dropT;
      return [this.dropP[0] + this.dropV[0] * tau, this.dropP[1] + this.dropV[1] * tau - 0.5 * G * tau * tau, this.dropP[2] + this.dropV[2] * tau];
    }
    const i = (this.N - 1) * 3;
    return [this.p[i], this.p[i + 1], this.p[i + 2]];
  }

  // advance to time T
  advance(T) {
    while (this.t + this.dt <= T + 1e-9) this.step();
  }

  step() {
    const dt = this.dt, N = this.N, p = this.p, q = this.q;
    const t = this.t;
    // anchor moves kinematically, interpolated within the step
    p[0] = this.anchor[0]; p[1] = this.anchor[1]; p[2] = this.anchor[2];
    const bs = ballState(t);
    const mb = 0.06e-3 + 0.05e-3 * (bs.r / BALL_R) ** 3; // kg: the molten ball (~0.1 g of powder, minus the gas)
    const mp = 0.004e-3; // per segment of paper
    const damp = 0.9993;
    const ballI = (N - 1) * 3;
    for (let i = 1; i < N; i++) {
      const j = i * 3;
      for (let c = 0; c < 3; c++) {
        const cur = p[j + c];
        let a = c === 1 ? -G : 0;
        p[j + c] = cur + (cur - q[j + c]) * damp + a * dt * dt;
        q[j + c] = cur;
      }
    }
    if (this.dropped) { p[ballI] = q[ballI]; }
    // constraints: length, then a gentle bend stiffness (twisted paper)
    let maxCorr = 0;
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < N - 1; i++) {
        if (this.dropped && i === N - 2) continue;
        const a = i * 3, b = a + 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        const wa = i === 0 ? 0 : 1 / mp, wb = (i + 1 === N - 1) ? 1 / mb : 1 / mp;
        const s = (d - this.rest) / d / (wa + wb);
        if (i === N - 2 && it === 9) maxCorr = (d - this.rest);
        p[a] += dx * s * wa; p[a + 1] += dy * s * wa; p[a + 2] += dz * s * wa;
        p[b] -= dx * s * wb; p[b + 1] -= dy * s * wb; p[b + 2] -= dz * s * wb;
      }
      for (let i = 0; i < N - 2; i++) {
        const a = i * 3, b = a + 6, m = a + 3;
        // pull the middle point toward the line between its neighbours
        const k = 0.012;
        for (let c = 0; c < 3; c++) {
          const mid = 0.5 * (p[a + c] + p[b + c]);
          if (i + 1 !== 0) p[m + c] += (mid - p[m + c]) * k;
        }
      }
      p[0] = this.anchor[0]; p[1] = this.anchor[1]; p[2] = this.anchor[2];
    }
    // ball velocity, and how hard the paper is pulling on it (in g)
    const bv = [(p[ballI] - q[ballI]) / dt, (p[ballI + 1] - q[ballI + 1]) / dt, (p[ballI + 2] - q[ballI + 2]) / dt];
    const pv = this.ballVel;
    const acc = Math.hypot(bv[0] - pv[0], bv[1] - pv[1] + G * dt, bv[2] - pv[2]) / dt / G;
    this.strain = this.strain * 0.97 + acc * 0.03;
    this.ballVel = bv;
    // the ball lets go: at the end of the burn, or when shaken
    if (!this.dropped && (t >= this.dropAt || (bs.r > 0.6 * BALL_R && this.strain > this.shakeLimit(t)))) {
      this.dropped = true; this.dropT = t;
      this.dropP = [p[ballI], p[ballI + 1], p[ballI + 2]];
      this.dropV = bv.slice();
      this.dropCause = t >= this.dropAt ? 'end' : 'shake';
    }
    if (this.dropped && t - this.dropT > 0.5) this.out = true;
    // sparks
    if (!this.dropped) {
      const pr = profile(t);
      this.acc += pr.rate * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.spawnPrimary(t + this.R() * dt, pr, bs);
      }
    }
    this.t += dt;
    // forget droplets long gone (compact every so often)
    if (this.n > MAXD - 2000 || (Math.round(this.t * 1200) % 240 === 0)) this.compact(this.t - 0.25);
  }
  // the ball is held by surface tension on the paper: later it is heavier and lets go more easily
  shakeLimit(t) {
    return 2.6 - 1.1 * Math.min(1, Math.max(0, (t - 20) / 22));
  }

  spawnPrimary(t, pr, bs) {
    const R = this.R;
    const b = this.ball();
    // a random direction on the sphere
    const u = R() * 2 - 1, ph = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    let dx = s * Math.cos(ph), dy = u, dz = s * Math.sin(ph);
    if (pr.k < 10) { dy = dy * 0.5 - 0.15; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; } // willow: outward and down
    const r = bs.r * bs.stretch;
    const x = [b[0] + dx * r, b[1] + dy * r * bs.stretch, b[2] + dz * r];
    const sp = pr.v0 * (0.55 + 0.9 * R());
    const v = [dx * sp + this.ballVel[0], dy * sp + this.ballVel[1], dz * sp + this.ballVel[2]];
    this.tree(x, v, t, 0, pr, 1, { left: 420 });
  }

  tree(x, v, t, g, pr, size, budget) {
    if (this.n >= MAXD || budget.left-- <= 0) return;
    const R = this.R;
    const k = pr.k * Math.pow(1.32, g);
    let life = pr.life * Math.pow(0.5, g) * (0.5 + R());
    const pBurst = Math.max(0, Math.min(1, pr.gmax - g)) * Math.pow(0.86, g) * (g === 0 ? 1 : 0.95);
    const willBurst = g < 8 && R() < pBurst;
    if (!willBurst) life *= g === 0 ? 0.9 : 1.7; // cools and fades instead
    const i = this.n++;
    this.x0.set(x, i * 3); this.v0.set(v, i * 3);
    this.tb[i] = t; this.td[i] = t + life; this.k[i] = k;
    this.P[i] = size * size; this.burst[i] = willBurst ? 1 : 0; this.gen[i] = g;
    if (!willBurst) return;
    // burst: position and velocity at the moment it splits
    const e = Math.exp(-k * life), vt = -G / k;
    const xe = [x[0] + v[0] * (1 - e) / k, x[1] + vt * life + (v[1] - vt) * (1 - e) / k, x[2] + v[2] * (1 - e) / k];
    const ve = [v[0] * e, vt + (v[1] - vt) * e, v[2] * e];
    if (g === 0 || R() < 0.15) this.events.push({ t: t + life, e: size, x: xe });
    const nk = Math.max(2, Math.round((pr.kids + 2.2 - g * 0.7) * (0.6 + 0.8 * R())));
    const cs = size * 0.62;
    for (let c = 0; c < nk; c++) {
      const u = R() * 2 - 1, ph = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const sp = pr.vk * (0.5 + 0.7 * R()) * Math.pow(0.9, g);
      const cv = [ve[0] * 0.3 + s * Math.cos(ph) * sp, ve[1] * 0.3 + u * sp, ve[2] * 0.3 + s * Math.sin(ph) * sp];
      this.tree(xe, cv, t + life, g + 1, pr, cs, budget);
    }
  }

  compact(before) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.td[i] < before) continue;
      if (w !== i) {
        this.x0.copyWithin(w * 3, i * 3, i * 3 + 3); this.v0.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.tb[w] = this.tb[i]; this.td[w] = this.td[i]; this.k[w] = this.k[i];
        this.P[w] = this.P[i]; this.burst[w] = this.burst[i]; this.gen[w] = this.gen[i];
      }
      w++;
    }
    this.n = w;
    if (this.events.length > 4000) this.events.splice(0, this.events.length - 2000);
  }

  // position of droplet i at time t
  pos(i, t, out, o = 0) {
    const tau = t - this.tb[i], k = this.k[i];
    const e = (1 - Math.exp(-k * tau)) / k, vt = -G / k;
    const j = i * 3;
    out[o] = this.x0[j] + this.v0[j] * e;
    out[o + 1] = this.x0[j + 1] + vt * tau + (this.v0[j + 1] - vt) * e;
    out[o + 2] = this.x0[j + 2] + this.v0[j + 2] * e;
  }

  // the paper's points (top to ball)
  chain() { return this.p; }
}
