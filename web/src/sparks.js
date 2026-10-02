// Draw the sparks the way a camera sees them: each droplet leaves a streak of light over the time the shutter is open.
// The streak carries the droplet's energy (power x time), spread over its length and width, so a fast droplet is a faint
// line and a droplet that has just burst is a bright point. Out-of-focus sparks widen into soft lines (circle of confusion).
import * as THREE from 'three';
import { blackbodyGLSL } from './color.js';

const MAXSEG = 200000;

export class Sparks {
  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    // corners: x along (0 = a, 1 = b), y across (-1, 1)
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new Float32Array(MAXSEG * 3); this.b = new Float32Array(MAXSEG * 3);
    this.e = new Float32Array(MAXSEG * 3); // energy, temperature (K), which ends are real ends (1 = a, 2 = b)
    g.setAttribute('ia', new THREE.InstancedBufferAttribute(this.a, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('ib', new THREE.InstancedBufferAttribute(this.b, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('ie', new THREE.InstancedBufferAttribute(this.e, 3).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      uniforms: {
        uRes: { value: new THREE.Vector2(1600, 900) },
        uFocus: { value: 0.4 }, uCoc: { value: 0.01 }, uGain: { value: 1 }, uCore: { value: 0.75 },
      },
      vertexShader: /* glsl */`
        attribute vec3 ia; attribute vec3 ib; attribute vec3 ie;
        uniform vec2 uRes; uniform float uFocus, uCoc, uCore;
        varying vec2 vP; varying vec2 vA; varying vec2 vB; varying vec2 vW; varying float vE; varying float vT; varying float vCap; varying float vL;
        // circle of confusion radius in pixels for a point at view depth z
        float coc(float z){ return uCoc * abs(z - uFocus) / z * uRes.y; }
        void main(){
          vec4 va = modelViewMatrix * vec4(ia, 1.0), vb = modelViewMatrix * vec4(ib, 1.0);
          vec4 ca = projectionMatrix * va, cb = projectionMatrix * vb;
          vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uRes, sb = (cb.xy / cb.w * 0.5 + 0.5) * uRes;
          float wa = max(uCore, coc(-va.z)), wb = max(uCore, coc(-vb.z));
          float w = max(wa, wb);
          vec2 d = sb - sa; float L = length(d);
          vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          float ext = 2.6 * w + 1.0;
          float we = 2.6 * mix(wa, wb, position.x) + 1.0;
          vec2 s = mix(sa - dir * ext, sb + dir * ext, position.x) + nrm * position.y * we;
          vec4 c = mix(ca, cb, position.x);
          gl_Position = vec4((s / uRes * 2.0 - 1.0) * c.w, c.z, c.w);
          vP = s; vA = sa; vB = sb; vW = vec2(wa, wb); vT = ie.y; vCap = ie.z; vL = L;
          vE = ie.x * uRes.y * uRes.y * 1e-6;
        }`,
      fragmentShader: /* glsl */`
        uniform float uGain;
        varying vec2 vP; varying vec2 vA; varying vec2 vB; varying vec2 vW; varying float vE; varying float vT; varying float vCap; varying float vL;
        ${blackbodyGLSL}
        void main(){
          vec2 ab = vB - vA; float l2 = dot(ab, ab);
          float hr = l2 > 1e-6 ? dot(vP - vA, ab) / l2 : 0.5;
          float h = clamp(hr, 0.0, 1.0);
          float wj = mix(vW.x, vW.y, h) + 0.5;
          // joints between pieces of one streak: the two pieces cross-fade over the joint, so the light is neither
          // doubled nor cut (a real end gets a round cap instead)
          float jw = 1.0;
          if (l2 > 1e-6) {
            float da = hr * vL, db = (hr - 1.0) * vL; // pixels past the start / the end
            if (mod(vCap, 2.0) < 0.5) jw *= clamp(0.5 + da / (2.0 * wj), 0.0, 1.0);
            if (vCap < 1.5) jw *= clamp(0.5 - db / (2.0 * wj), 0.0, 1.0);
          }
          float d = length(vP - (vA + ab * h));
          float w = mix(vW.x, vW.y, h);
          float x = d / w;
          // energy spread over the length and the width of the streak
          float caps = (mod(vCap, 2.0) > 0.5 ? 0.7 : 0.0) + (vCap > 1.5 ? 0.7 : 0.0);
          float e = vE / ((vL + caps * w + 0.3 * w) * 1.4 * w);
          // a sharp core with a little skirt (lens and sensor)
          float prof = exp(-x * x * 1.6) + 0.04 * exp(-x * 0.9) * smoothstep(2.5, 1.6, x);
          vec3 col = blackbody(vT) * e * prof * jw * uGain;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.tmp = new Float32Array(3 * 8);
    this.power = 0;
  }

  // fill the streaks for a frame at time t, shutter open for S seconds
  // tail > 0: weight the light toward the end of the exposure (a fading trail, used in the high-speed shot)
  update(burn, t, S, tail = 0) {
    const A = this.a, B = this.b, E = this.e, tmp = this.tmp;
    let n = 0, power = 0;
    const t0 = t - S;
    for (let i = 0; i < burn.n && n < MAXSEG - 8; i++) {
      const tb = burn.tb[i], td = burn.td[i];
      if (td <= t0 || tb >= t) continue;
      const s0 = Math.max(tb, t0), s1 = Math.min(td, t);
      const life = td - tb;
      const bursts = burn.burst[i] === 1, P = burn.P[i];
      // only the long, curving willow sparks need more than one straight piece
      const ns = tail > 0 ? 6 : s1 - s0 > 0.03 ? 6 : s1 - s0 > 0.018 ? 3 : 1;
      for (let k = 0; k <= ns; k++) burn.pos(i, s0 + (s1 - s0) * k / ns, tmp, k * 3);
      for (let k = 0; k < ns; k++) {
        const tm = s0 + (s1 - s0) * (k + 0.5) / ns;
        const a = (tm - tb) / life;
        // a droplet heats as it flies until it bursts (the first one leaves the ball dim); the last ones cool and fade
        const g = burn.gen[i];
        const h0 = g === 0 ? 0.15 : 0.45;
        const h = bursts ? h0 + (1 - h0) * Math.pow(a, 1.4) : Math.pow(1 - a, 1.6);
        const T = bursts ? 1215 + 60 * a : 1270 - 240 * a;
        const tw = tail > 0 ? Math.pow((tm - t0) / S, tail) * (tail + 1) : 1;
        const en = P * h * tw * (s1 - s0) / ns;
        A[n * 3] = tmp[k * 3]; A[n * 3 + 1] = tmp[k * 3 + 1]; A[n * 3 + 2] = tmp[k * 3 + 2];
        B[n * 3] = tmp[k * 3 + 3]; B[n * 3 + 1] = tmp[k * 3 + 4]; B[n * 3 + 2] = tmp[k * 3 + 5];
        E[n * 3] = en; E[n * 3 + 1] = T; E[n * 3 + 2] = (k === 0 ? 1 : 0) + (k === ns - 1 ? 2 : 0);
        power += en;
        n++;
      }
      // the flash of the burst itself
      if (bursts && td > t0 && td <= t) {
        burn.pos(i, td, tmp, 0);
        A[n * 3] = B[n * 3] = tmp[0]; A[n * 3 + 1] = B[n * 3 + 1] = tmp[1]; A[n * 3 + 2] = B[n * 3 + 2] = tmp[2];
        E[n * 3] = P * 0.0009; E[n * 3 + 1] = 1300; E[n * 3 + 2] = 3;
        power += P * 0.0009;
        n++;
      }
    }
    this.geo.instanceCount = n;
    for (const k of ['ia', 'ib', 'ie']) {
      const at = this.geo.getAttribute(k);
      at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n) * at.itemSize);
      at.needsUpdate = true;
    }
    this.count = n;
    this.power = power / Math.max(S, 1e-4); // average light the sparks give off during the frame
  }
}
