// Smoke: a thin plume of potassium salts rising from the fireball, seen only where the fireball lights it.
// Each puff's path is a function of its age (buoyant rise + a slow wander), so any frame can be drawn on its own.
import * as THREE from 'three';
import { NOISE } from './ball.js';

const MAX = 600;
const LIFE = 3.6;

export class Smoke {
  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.c = new Float32Array(MAX * 4); // centre, size
    this.d = new Float32Array(MAX * 3); // id, opacity, light
    g.setAttribute('ic', new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('id', new THREE.InstancedBufferAttribute(this.d, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uLight: { value: new THREE.Color() }, uT: { value: 0 }, uGain: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec4 ic; attribute vec3 id; varying vec2 vQ; varying vec3 vD;
        void main(){
          vQ = position.xy; vD = id;
          vec4 mv = viewMatrix * vec4(ic.xyz, 1.0);
          mv.xy += position.xy * ic.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLight; uniform float uT, uGain; varying vec2 vQ; varying vec3 vD;
        ${NOISE}
        void main(){
          float r = length(vQ);
          float n = fbm(vec3(vQ * 1.7 + vD.x * 7.31, vD.x * 3.1 + uT * 0.3));
          float m = smoothstep(1.0, 0.15, r + n * 0.55) * (0.6 + 0.8 * n);
          m = max(m, 0.0);
          gl_FragColor = vec4(uLight * m * vD.y * vD.z * uGain, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.births = []; // {t, x, y, z, a}
    this.lastEmit = 0;
    this.rate = 26;
  }
  reset() { this.births = []; this.lastEmit = 0; }

  // emit puffs from the ball for times up to t
  emit(t, ball, amount) {
    while (this.lastEmit + 1 / this.rate <= t) {
      this.lastEmit += 1 / this.rate;
      if (amount > 0.01) this.births.push({ t: this.lastEmit, x: ball[0], y: ball[1] + 0.002, z: ball[2], a: amount });
    }
    while (this.births.length && this.births[0].t < t - LIFE) this.births.shift();
    if (this.births.length > MAX) this.births.splice(0, this.births.length - MAX);
  }

  update(t, ball, lightI) {
    let n = 0;
    for (let k = 0; k < this.births.length; k++) {
      const b = this.births[k];
      const a = t - b.t;
      if (a < 0 || a > LIFE) continue;
      const id = (b.t * 26.0) % 97;
      const w = 0.004 * a + 0.006 * a * a;
      const x = b.x + Math.sin(a * 1.3 + id) * w + Math.sin(a * 3.1 + id * 2.3) * w * 0.4;
      const z = b.z + Math.cos(a * 1.1 + id * 1.7) * w;
      const y = b.y + 0.03 * a + 0.018 * a * a;
      const size = 0.0018 + 0.004 * a + 0.002 * a * a;
      const op = Math.min(1, a / 0.25) * Math.pow(1 - a / LIFE, 1.5) * b.a / (1 + a * 2.2);
      const dx = x - ball[0], dy = y - ball[1], dz = z - ball[2];
      const L = 1 / (dx * dx + dy * dy + dz * dz + 0.00004);
      this.c[n * 4] = x; this.c[n * 4 + 1] = y; this.c[n * 4 + 2] = z; this.c[n * 4 + 3] = size;
      this.d[n * 3] = id; this.d[n * 3 + 1] = op; this.d[n * 3 + 2] = L * lightI;
      n++;
    }
    this.geo.instanceCount = n;
    this.geo.attributes.ic.needsUpdate = true;
    this.geo.attributes.id.needsUpdate = true;
  }
}
