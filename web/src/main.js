// Senko hanabi: one sparkler, seen through a macro lens at night.
//   (default)  hold it yourself: the pointer is your hand. Keep the fireball on until the last chrysanthemum.
//   ?film      the film, in real time        ?render   the film, frame by frame for recording (window.__renderAt)
import * as THREE from 'three';
import { Burn, ballState, stageAt, STAGES, BURN_END, PAPER_LEN, G, consumed } from './sim.js';
import { Sparks } from './sparks.js';
import { Ball } from './ball.js';
import { Paper } from './paper.js';
import { Smoke } from './smoke.js';
import { Flames } from './flame.js';
import { Backdrop } from './backdrop.js';
import { Post } from './post.js';
import { blackbody } from './color.js';
import { Film } from './film.js';
import { Game } from './game.js';
import { Sound } from './audio.js';

const Q = new URLSearchParams(location.search);
const RENDER = Q.has('render'), FILM = Q.has('film') || RENDER;
const W = 1600, H = 900;
const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const RS = Number(Q.get('rs') || 2); // recording scale (2 = 3200x1800)
const scale = RENDER ? RS : Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: RENDER });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
let vw = W, vh = H;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(13.7, W / H, 0.01, 20);
const sparks = new Sparks(), ball = new Ball(), paper = new Paper(), smoke = new Smoke(), backdrop = new Backdrop(), flames = new Flames();
scene.add(backdrop.mesh, paper.mesh, ball.mesh, smoke.mesh, sparks.mesh, flames.group);
const post = new Post(renderer, W * scale, H * scale);

// the look: one exposure for everything, in the same units
const LOOK = { ball: 0.95, spark: 2.0e5, paper: 2.4e-5, smoke: 2.4e-6, exposure: 1.0, bloom: 0.045, bg: 0.35 };

function fit() {
  if (RENDER) { vw = W; vh = H; stage.style.width = W + 'px'; stage.style.height = H + 'px'; stage.style.transform = 'translate(-50%, -50%)'; }
  else {
    vw = window.innerWidth; vh = window.innerHeight;
    stage.style.width = vw + 'px'; stage.style.height = vh + 'px'; stage.style.transform = 'translate(-50%, -50%)';
  }
  const s = scale;
  renderer.setSize(vw * s, vh * s, false);
  canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
  post.resize(vw * s, vh * s);
  camera.aspect = vw / vh; camera.updateProjectionMatrix();
  backdrop.mat.uniforms.uAspect.value = vw / vh;
}
fit();
if (!RENDER) window.addEventListener('resize', fit);

// lens: focal length (mm) on a full-frame sensor, f-number, focus distance (m)
const lens = { focal: 100, fstop: 4, focus: 0.4 };
function applyLens(L = lens, pos, target) {
  camera.position.set(pos[0], pos[1], pos[2]);
  camera.lookAt(target[0], target[1], target[2]);
  // keep a 16:9 frame as wide as the lens would see it; narrower screens see the middle
  const vfov = 2 * Math.atan(12 / L.focal) * 180 / Math.PI * Math.max(1, (16 / 9) / camera.aspect);
  camera.fov = vfov; camera.updateProjectionMatrix();
  // circle of confusion (radius, as a fraction of the frame height) = f^2 / (N (s - f)) / sensor height
  const f = L.focal / 1000, s = Math.max(L.focus, f * 1.5);
  sparks.mat.uniforms.uCoc.value = 0.5 * f * f / (L.fstop * (s - f)) / (0.024 * Math.max(1, (16 / 9) / camera.aspect));
  sparks.mat.uniforms.uFocus.value = s;
  camera.updateMatrixWorld();
}

const burn = new Burn({ seed: Number(Q.get('seed') || 7) });
const tmpC = new THREE.Color();

// draw the sparkler at burn time t (the burn has been advanced to t), with the shutter open for S seconds
function draw(t, S, opt = {}) {
  const st = ballState(t);
  const bp = burn.ball();
  const dropped = burn.dropped;
  const gone = burn.out;
  const heat = dropped ? st.heat * Math.max(0, 1 - (t - burn.dropT) / 0.6) : st.heat;
  ball.update(bp, { ...st, heat }, t, camera, dropped, dropped ? G * (t - burn.dropT) : 0, S);
  ball.mesh.visible = ball.mesh.visible && !gone && !opt.unlit;
  ball.mat.uniforms.uGain.value = LOOK.ball * (opt.ballGain || 1);
  sparks.update(burn, t, S, opt.tail || 0);
  sparks.mat.uniforms.uGain.value = LOOK.spark * (opt.sparkGain || 1);
  ball.mat.uniforms.uEnv.value = 0.06 * Math.min(3, sparks.power * 0.9);
  sparks.mat.uniforms.uRes.value.set(vw * scale, vh * scale);
  // light from the fireball (its glow and its area) and from the sparks around it
  const ballLight = Math.pow(Math.max(heat, 0), 2.2) * (st.r / 0.0023) ** 2 * (gone ? 0 : 1);
  flames.update(t, opt.unlit ? { flame: 0, flare: 0, lighter: 0 } : st, bp, bp, camera);
  const flame = flames.light;
  const light = ballLight + Math.min(3, sparks.power * 0.9) + flame;
  const bb = blackbody(1180);
  tmpC.setRGB(bb[0], bb[1], bb[2]);
  paper.update(burn.chain(), burn.N, bp, st.r, dropped, !!opt.unlit || t < 0.3, opt.unlit ? 0 : st.char, opt.unlit ? 0.025 : Math.max(0, 0.025 - consumed(t)));
  paper.mat.uniforms.uBall.value.set(bp[0], bp[1], bp[2]);
  paper.mat.uniforms.uLight.value.copy(tmpC).multiplyScalar(LOOK.paper * light);
  paper.mat.uniforms.uChar.value = opt.unlit ? -1 : st.char;
  paper.mat.uniforms.uAmb.value = opt.amb ?? 0.0025;
  paper.mat.uniforms.uEmber.value = opt.unlit ? 0 : st.paper * (1 - 0.7 * Math.min(1, Math.max(0, (t - 1.8) / 0.5)));
  paper.mat.uniforms.uT.value = t;
  smoke.emit(t, bp, gone || opt.unlit ? 0 : (st.flame > 0.05 ? 2.5 : 0.4 + 0.8 * Math.min(1, sparks.power * 0.6)) * (dropped ? 0 : 1));
  smoke.update(t, bp, LOOK.smoke * light);
  smoke.mat.uniforms.uLight.value.copy(tmpC);
  smoke.mat.uniforms.uT.value = t;
  backdrop.mat.uniforms.uBgLight.value = light * LOOK.bg * (opt.bgLight ?? 1);
  post.final.uniforms.uExp.value = LOOK.exposure * (opt.exposure || 1);
  post.final.uniforms.uBloomAmt.value = LOOK.bloom;
  post.final.uniforms.uT.value = opt.frame ?? performance.now() / 1000;
  post.final.uniforms.uFade.value = opt.fade ?? 1;
  post.render(scene, camera);
  return { light, sparks: sparks.count, stage: stageAt(t) };
}

// hand: the paper hangs from fingers above the frame; a held hand is never quite still
function handTremor(t, amp = 1) {
  const a = 0.00055 * amp;
  return [
    a * (Math.sin(t * 2.1 + 0.3) * 0.6 + Math.sin(t * 5.3 + 1.1) * 0.25 + Math.sin(t * 0.7) * 0.9),
    PAPER_LEN + a * 0.4 * Math.sin(t * 3.7 + 2.0),
    a * (Math.sin(t * 1.7 + 2.2) * 0.5 + Math.sin(t * 4.1) * 0.2),
  ];
}

const ctx = { burn, draw, applyLens, camera, handTremor, lens, smoke, stageAt, STAGES, BURN_END, renderer, RENDER };

// ---- still frames for checking: window.__still(t, {pos, target, focal, fstop, focus, shutter})
window.__still = (t, o = {}) => {
  burn.reset(); smoke.reset();
  const step = 1 / 120;
  for (let s = 0; s <= t; s += step) {
    const a = handTremor(s, o.tremor ?? 1);
    burn.setAnchor(a[0], a[1], a[2]);
    burn.advance(s);
    smoke.emit(s, burn.ball(), 0.6);
  }
  burn.advance(t);
  const bp = burn.ball();
  applyLens({ focal: o.focal || 100, fstop: o.fstop || 4, focus: o.focus || 0.4 },
    o.pos || [bp[0], bp[1] + 0.004, bp[2] + 0.4], o.target || [bp[0], bp[1] + 0.004, bp[2]]);
  return draw(t, o.shutter ?? 1 / 30, { frame: t });
};

let mode;
if (FILM) mode = new Film(ctx);
else mode = new Game(ctx);
ctx.sound = new Sound(burn);

window.__burn = burn; window.__ball = ball; window.__direct = () => { renderer.setRenderTarget(null); renderer.render(scene, camera); };
window.__ready = true;
if (!RENDER) {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    mode.tick(dt, now / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else {
  window.__filmLen = mode.length;
  window.__renderAt = (f, fps) => mode.renderAt(f, fps);
  // keep the page's animation frames running while frames are captured
  const keep = () => requestAnimationFrame(keep); keep();
}
