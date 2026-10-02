// Hold it yourself. The pointer (or your finger) is the hand the paper hangs from.
// The fireball is held only by surface tension: move gently and it lasts to the last chrysanthemum, jerk and it falls.
// Hold Space (or the button) for the high-speed camera.
import { PAPER_LEN } from './sim.js';

const T = {
  en: {
    light: 'Click to light', lightTouch: 'Tap to light',
    hint: 'You are holding it. Move gently: if you jerk, the fireball falls.',
    slow: 'High-speed camera', fell: 'It fell', fellAt: (s, st) => `${s.toFixed(1)} s, during ${st}`,
    made: 'It burned to the end', madeAt: (s) => `${s.toFixed(1)} s. Not a spark wasted.`,
    again: 'Light another', none: 'before it bloomed',
  },
  ja: {
    light: 'クリックで火をつける', lightTouch: 'タップで火をつける',
    hint: '持っているのはあなたです。そっと。揺らすと火の玉が落ちます。',
    slow: 'ハイスピードカメラ', fell: '落ちた', fellAt: (s, st) => `${s.toFixed(1)} 秒、${st}で`,
    made: '最後まで燃えた', madeAt: (s) => `${s.toFixed(1)} 秒。`,
    again: 'もう一本', none: '咲く前に',
  },
};

export class Game {
  constructor(ctx) {
    this.ctx = ctx;
    const q = new URLSearchParams(location.search);
    this.lang = q.get('lang') === 'ja' || (!q.has('lang') && (navigator.language || '').startsWith('ja')) ? 'ja' : 'en';
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.state = 'idle';
    this.t = 0;
    this.hand = [0, PAPER_LEN, 0]; this.target = [0, PAPER_LEN, 0];
    this.slow = false; this.slowAmt = 0;
    this.buildHud();
    this.bindInput();
    this.ctx.burn.reset();
    this.ctx.smoke.reset();
  }

  tr() { return T[this.lang]; }

  buildHud() {
    const hud = document.getElementById('hud');
    hud.innerHTML = `
      <div class="title"><b>線香花火</b><i>Senko hanabi</i></div>
      <div class="cap"><b></b><i></i></div>
      <div class="msg"><b></b><i></i><button class="again"></button></div>
      <div class="hint"></div>
      <div class="ctl"><button class="slowb"></button><button class="lang"></button></div>
      <div class="timer"></div>`;
    this.el = {
      cap: hud.querySelector('.cap'), capB: hud.querySelector('.cap b'), capI: hud.querySelector('.cap i'),
      msg: hud.querySelector('.msg'), msgB: hud.querySelector('.msg b'), msgI: hud.querySelector('.msg i'),
      again: hud.querySelector('.again'), hint: hud.querySelector('.hint'), slowb: hud.querySelector('.slowb'),
      langb: hud.querySelector('.lang'), timer: hud.querySelector('.timer'),
    };
    this.el.cap.style.opacity = 0;
    this.texts();
  }

  texts() {
    const t = this.tr();
    this.el.slowb.textContent = t.slow + (this.touch ? '' : ' [Space]');
    this.el.langb.textContent = this.lang === 'ja' ? 'EN' : '日本語';
    this.el.again.textContent = t.again;
    this.el.hint.textContent = t.hint;
    this.showState();
  }

  showState() {
    const t = this.tr(), e = this.el;
    e.msg.classList.toggle('on', this.state !== 'burning');
    e.again.style.display = this.state === 'over' ? '' : 'none';
    e.hint.style.opacity = this.state === 'idle' ? 1 : 0;
    if (this.state === 'idle') { e.msgB.textContent = this.touch ? t.lightTouch : t.light; e.msgI.textContent = ''; }
    if (this.state === 'over') {
      const { STAGES } = this.ctx;
      if (this.result.made) { e.msgB.textContent = t.made; e.msgI.textContent = t.madeAt(this.result.t); }
      else {
        const st = this.result.stage >= 0 ? (this.lang === 'ja' ? STAGES[this.result.stage].ja : STAGES[this.result.stage].en.toLowerCase()) : t.none;
        e.msgB.textContent = t.fell; e.msgI.textContent = t.fellAt(this.result.t, st);
      }
    }
  }

  bindInput() {
    const stage = document.getElementById('stage');
    // pointer position -> hand position, in metres at the sparkler's distance
    const toHand = (x, y) => {
      const r = stage.getBoundingClientRect();
      const u = (x - r.left) / r.width - 0.5, v = (y - r.top) / r.height - 0.5;
      const cam = this.ctx.camera;
      const h = 2 * Math.tan(cam.fov * Math.PI / 360) * 0.34;
      return [u * h * cam.aspect, PAPER_LEN - v * h * 0.9, 0];
    };
    this.origin = null;
    const move = (x, y) => {
      if (this.state !== 'burning' && this.state !== 'idle') return;
      const p = toHand(x, y);
      if (!this.origin) this.origin = { p, h: this.target.slice() };
      // relative: the hand moves by as much as the pointer does
      this.target[0] = Math.max(-0.06, Math.min(0.06, this.origin.h[0] + p[0] - this.origin.p[0]));
      this.target[1] = Math.max(PAPER_LEN - 0.03, Math.min(PAPER_LEN + 0.02, this.origin.h[1] + p[1] - this.origin.p[1]));
    };
    stage.addEventListener('pointermove', (ev) => move(ev.clientX, ev.clientY));
    stage.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      this.origin = null; move(ev.clientX, ev.clientY);
      if (this.state === 'idle') this.light();
    });
    stage.addEventListener('pointerup', () => { if (this.touch) this.origin = null; });
    this.el.again.addEventListener('click', () => this.reset());
    const sb = this.el.slowb;
    const on = (e) => { e.preventDefault(); this.slow = true; sb.classList.add('on'); };
    const off = () => { this.slow = false; sb.classList.remove('on'); };
    sb.addEventListener('pointerdown', on); sb.addEventListener('pointerup', off); sb.addEventListener('pointerleave', off);
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); this.slow = true; sb.classList.add('on'); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') off(); });
    this.el.langb.addEventListener('click', () => { this.lang = this.lang === 'ja' ? 'en' : 'ja'; this.texts(); });
  }

  light() {
    this.ctx.burn.reset(); this.ctx.smoke.reset();
    this.t = 0; this.state = 'burning';
    this.ctx.sound.start();
    this.ctx.sound.ignite();
    this.showState();
  }

  reset() {
    this.state = 'idle'; this.t = 0;
    this.ctx.burn.reset(); this.ctx.smoke.reset();
    this.target = [0, PAPER_LEN, 0]; this.hand = this.target.slice(); this.origin = null;
    this.showState();
  }

  tick(dt, now) {
    const { burn, draw, applyLens, handTremor, STAGES, BURN_END, sound } = this.ctx;
    this.slowAmt += ((this.slow ? 1 : 0) - this.slowAmt) * Math.min(1, dt * 8);
    const rate = 1 - this.slowAmt * (1 - 1 / 40);
    const step = 1 / 240;
    const dtb = this.state === 'burning' ? dt * rate : 0;
    // the hand follows the pointer through a little lag (a real hand), plus its own tremor
    const t0 = this.t, t1 = this.t + dtb;
    const h0 = this.hand.slice();
    const k = 1 - Math.exp(-dt * 30);
    for (let c = 0; c < 3; c++) this.hand[c] += (this.target[c] - this.hand[c]) * k;
    if (this.state === 'burning') {
      const n = Math.max(1, Math.ceil(dtb / step));
      for (let i = 1; i <= n; i++) {
        const u = i / n, tt = t0 + dtb * u;
        const tr = handTremor(tt, 0.6);
        burn.setAnchor(h0[0] + (this.hand[0] - h0[0]) * u + tr[0], h0[1] + (this.hand[1] - h0[1]) * u + tr[1] - PAPER_LEN, h0[2] + tr[2]);
        burn.advance(tt);
      }
      this.t = t1;
    } else if (this.state === 'idle') {
      // unlit, it still hangs and swings from the hand
      burn.setAnchor(this.hand[0], this.hand[1], this.hand[2]);
      const s = burn.t;
      burn.dropAt = 1e9;
      const save = burn.spawnPrimary; burn.spawnPrimary = () => {};
      burn.advance(s + dt);
      burn.spawnPrimary = save;
      burn.t = 0; // the burn has not started
      burn.dropAt = BURN_END + 0.6;
    }
    // camera: fixed on a tripod in front, following the hand a little
    const cx = this.hand[0] * 0.5;
    applyLens({ focal: 100, fstop: 7, focus: 0.34 }, [cx, 0.004, 0.34], [cx, 0.002, 0]);
    const shutter = 1 / 30 * (1 - this.slowAmt) + 1 / 2000 * this.slowAmt;
    const tb = this.state === 'idle' ? 0 : this.t;
    const r = draw(tb, shutter, { amb: this.state === 'idle' ? 0.05 : 0.003, sparkGain: Math.pow((1 / 30) / shutter, 0.8), unlit: this.state === 'idle' });
    sound.update(this.state === 'burning' ? this.t : -1, rate, r);
    // stage caption
    const st = r.stage;
    if (this.state === 'burning' && st >= 0) {
      const s = STAGES[st];
      if (this.el.capB.textContent !== (this.lang === 'ja' ? s.ja : s.ja)) this.el.capB.textContent = s.ja;
      this.el.capI.textContent = s.en;
      const into = this.t - s.t0;
      this.el.cap.style.opacity = Math.min(1, into / 0.6).toFixed(2);
    } else if (this.state !== 'burning') this.el.cap.style.opacity = 0;
    this.el.timer.textContent = this.state === 'burning' ? this.t.toFixed(1) + ' s' : '';
    // the end
    if (this.state === 'burning' && burn.dropped && burn.t - burn.dropT > 0.9) {
      const made = burn.dropCause === 'end' || burn.dropT > BURN_END - 1.5;
      this.result = { made, t: burn.dropT, stage: stageOf(STAGES, burn.dropT) };
      this.state = 'over';
      this.showState();
    }
  }
}

function stageOf(STAGES, t) {
  let s = -1;
  for (let i = 0; i < STAGES.length; i++) if (t >= STAGES[i].t0) s = i;
  return s;
}
