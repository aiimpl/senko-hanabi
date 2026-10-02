// Sound, synthesized in the browser (no sound files): the crackle of each burst, the sizzle of the fireball,
// the hiss of the lit paper, and autumn insects in the garden.
export class Sound {
  constructor(burn) {
    this.burn = burn;
    this.ac = null;
    this.lastT = 0;
    this.budget = 0;
  }

  start() {
    if (this.ac) { this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = this.ac = new AC();
    const sr = ac.sampleRate;
    this.master = ac.createGain(); this.master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(ac.destination);
    // white noise, 2 s
    const nb = ac.createBuffer(1, sr * 2, sr), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // a click: a few ms of noise with a fast decay
    const cb = ac.createBuffer(1, Math.round(sr * 0.012), sr), c = cb.getChannelData(0);
    for (let i = 0; i < c.length; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0016));
    this.click = cb;
    this.crackBus = ac.createBiquadFilter(); this.crackBus.type = 'highpass'; this.crackBus.frequency.value = 900;
    this.crackLow = ac.createBiquadFilter(); this.crackLow.type = 'lowpass'; this.crackLow.frequency.value = 12000;
    this.crackBus.connect(this.crackLow); this.crackLow.connect(this.master);
    // sizzle of the ball
    const sz = ac.createBufferSource(); sz.buffer = nb; sz.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.7;
    this.sizzle = ac.createGain(); this.sizzle.gain.value = 0;
    sz.connect(bp); bp.connect(this.sizzle); this.sizzle.connect(this.master); sz.start();
    // flame hiss
    const fl = ac.createBufferSource(); fl.buffer = nb; fl.loop = true; fl.playbackRate.value = 0.7;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.flame = ac.createGain(); this.flame.gain.value = 0;
    fl.connect(lp); lp.connect(this.flame); this.flame.connect(this.master); fl.start();
    this.insects();
  }

  // suzumushi-like trills: a high tone switched on and off in quick pulses, a few insects at different pitches
  insects() {
    const ac = this.ac;
    const out = ac.createGain(); out.gain.value = 0.022; out.connect(this.master);
    [[4300, 0.0, 1.0], [4650, 0.35, 0.6], [3900, 0.7, 0.45]].forEach(([f, ph, g]) => {
      const o = ac.createOscillator(); o.frequency.value = f;
      const am = ac.createGain(); am.gain.value = 0;
      const lv = ac.createGain(); lv.gain.value = g;
      o.connect(am); am.connect(lv); lv.connect(out); o.start();
      const sched = (t0) => {
        // one trill: ~0.5 s of pulses at ~45 per second, then a rest
        const len = 0.35 + Math.random() * 0.35;
        for (let t = 0; t < len; t += 1 / 45) {
          am.gain.setValueAtTime(0, t0 + t);
          am.gain.linearRampToValueAtTime(1, t0 + t + 0.004);
          am.gain.linearRampToValueAtTime(0, t0 + t + 0.016);
        }
        const next = t0 + len + 0.4 + Math.random() * 0.9;
        setTimeout(() => sched(next), Math.max(0, (next - ac.currentTime - 0.3) * 1000));
      };
      sched(ac.currentTime + 0.4 + ph);
    });
  }

  ignite() {
    if (!this.ac) return;
    const ac = this.ac, t = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = this.noise;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(3500, t + 0.25);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.6);
    this.lastT = 0;
  }

  // called every frame: t = burn time (-1 when not burning), rate = how fast time runs (slow motion < 1)
  update(t, rate, r) {
    if (!this.ac) return;
    const ac = this.ac, now = ac.currentTime;
    const burning = t >= 0 && !this.burn.out;
    this.flame.gain.setTargetAtTime(burning && t < 2.8 ? 0.16 * Math.min(1, t / 0.3) : 0, now, 0.08);
    this.sizzle.gain.setTargetAtTime(burning && !this.burn.dropped && t > 2.4 ? 0.012 + 0.02 * Math.min(1, r.light / 4) : 0, now, 0.1);
    if (!burning) { this.lastT = t; return; }
    // the bursts since the last frame
    const ev = this.burn.events;
    let n = 0;
    this.budget = Math.min(8, this.budget + 1.6);
    for (let i = ev.length - 1; i >= 0 && ev[i].t > this.lastT; i--) n++;
    const take = Math.min(n, Math.floor(this.budget));
    const loud = Math.min(2.5, n / Math.max(1, take));
    for (let k = 0; k < take; k++) {
      const e = ev[ev.length - 1 - Math.floor(Math.random() * n)];
      const s = ac.createBufferSource(); s.buffer = this.click;
      s.playbackRate.value = (0.6 + Math.random() * 0.9) * (rate < 0.5 ? 0.25 : 1);
      const g = ac.createGain(); g.gain.value = 0.16 * Math.sqrt(e.e) * Math.sqrt(loud) * (0.4 + Math.random() * 0.6);
      const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
      s.connect(g);
      if (p) { p.pan.value = Math.max(-1, Math.min(1, e.x[0] * 12)); g.connect(p); p.connect(this.crackBus); } else g.connect(this.crackBus);
      s.start(now + Math.random() * 0.03);
      this.budget -= 1;
    }
    this.lastT = t;
  }
}
