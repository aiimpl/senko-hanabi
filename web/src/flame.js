// Fire at the lighting: the lighter's flame, and the flame of the paper tip and the powder inside it.
// Each flame is a few soft, see-through layers (camera-facing quads at slightly different depths), each a field of
// rising, licking noise shaped into a flame. Additive: a flame is light, not paint.
import * as THREE from 'three';
import { blackbodyGLSL } from './color.js';
import { NOISE } from './ball.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// the paper and powder burning: ragged, flickering, yellow-orange, with a hot white core while the powder flares
const PAPER_FRAG = /* glsl */`
  uniform float uT, uAmt, uFlare, uGain, uSeed; varying vec2 vUv;
  ${blackbodyGLSL}
  ${NOISE}
  void main(){
    vec2 p = vUv * 2.0 - 1.0;            // x across, y up (-1 = the burning front)
    float y = p.y * 0.5 + 0.5;
    vec3 q = vec3(p.x * 2.2, y * 3.0 - uT * 4.2, uT * 0.9 + uSeed);
    float n1 = fbm(q * 1.4), n2 = fbm(q * 3.1 + 7.0);
    float wob = (n1 - 0.0) * 0.5 * y + sin(uT * 13.0 + uSeed) * 0.04 * y;
    float wdt = mix(0.62, 0.95, uFlare) * pow(max(0.0, 1.0 - y), 0.65) * (0.45 + 0.55 * smoothstep(0.0, 0.22, y));
    float d = abs(p.x - wob) / max(wdt, 1e-3);
    // tongues: the flame breaks up toward its tip
    float tongue = smoothstep(0.95, 0.35, y + 0.55 * n2 * y);
    // a rounded root just below the burning edge, not a cut
    float root = smoothstep(0.0, 0.16, y + 0.06 * (1.0 - p.x * p.x));
    float body = smoothstep(1.0, 0.15, d + 0.45 * n2) * tongue * root;
    float core = smoothstep(0.55, 0.0, d) * smoothstep(0.75, 0.05, y) * uFlare;
    float T = 1300.0 + 220.0 * body + 300.0 * core;
    // thin and see-through: you can see the paper inside it
    vec3 col = blackbody(T) * (pow(body, 1.8) * (1.0 + 1.3 * uFlare) + core * 3.0);
    // a faint blue where the gas first burns, at the root
    col += vec3(0.1, 0.2, 0.9) * smoothstep(0.18, 0.0, y) * smoothstep(1.0, 0.3, d) * 0.5 * (1.0 - uFlare);
    gl_FragColor = vec4(col * uAmt * uGain, 1.0);
  }`;

// a lighter: a clear blue skirt at the bottom, a dark inner cone, and the luminous yellow of glowing soot above
const LIGHTER_FRAG = /* glsl */`
  uniform float uT, uAmt, uGain; varying vec2 vUv;
  ${blackbodyGLSL}
  ${NOISE}
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float y = p.y * 0.5 + 0.5;
    float sway = (noise(vec3(y * 2.0 - uT * 3.0, uT * 1.3, 0.0))) * 0.12 * y * y;
    float x = p.x - sway;
    // teardrop: widest a third of the way up
    float wdt = 0.5 * sin(clamp(y, 0.0, 1.0) * 3.14159) * (1.0 - 0.35 * y) + 0.02;
    float d = abs(x) / wdt;
    float inside = smoothstep(1.0, 0.7, d) * smoothstep(0.0, 0.05, y) * smoothstep(1.0, 0.85, y + 0.06 * noise(vec3(x * 6.0, uT * 8.0, 2.0)));
    float yellow = inside * smoothstep(0.22, 0.42, y);
    float blue = smoothstep(1.0, 0.55, d) * smoothstep(0.0, 0.06, y) * smoothstep(0.42, 0.12, y);
    float innerCone = smoothstep(0.45, 0.0, d) * smoothstep(0.38, 0.12, y); // the dark unburnt gas inside
    vec3 col = blackbody(1450.0 + 250.0 * (1.0 - y)) * pow(yellow, 1.4) * 1.5 * (1.0 - 0.6 * innerCone);
    col += vec3(0.06, 0.14, 0.8) * blue * 0.9 * (1.0 - innerCone * 0.8);
    gl_FragColor = vec4(col * uAmt * uGain, 1.0);
  }`;

function layerMat(frag, seed) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uAmt: { value: 0 }, uFlare: { value: 0 }, uGain: { value: 1 }, uSeed: { value: seed } },
    vertexShader: VERT, fragmentShader: frag,
  });
}

export class Flames {
  constructor() {
    this.group = new THREE.Group();
    this.paper = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), layerMat(PAPER_FRAG, i * 3.7));
      m.renderOrder = 11; m.frustumCulled = false; this.group.add(m); return m;
    });
    this.lighter = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), layerMat(LIGHTER_FRAG, 0));
    this.lighter.renderOrder = 11; this.lighter.frustumCulled = false;
    this.group.add(this.lighter);
  }

  // front: where the paper is burning (the tip, or where the ball is forming); tip: the unburnt tip at lighting
  update(t, st, front, tip, cam) {
    const flame = st.flame, flare = st.flare;
    const h = 0.009 + 0.004 * flare;
    this.paper.forEach((m, i) => {
      m.visible = flame > 0.002;
      const u = m.material.uniforms;
      u.uT.value = t * (1 + i * 0.13); u.uAmt.value = flame * (i === 0 ? 0.55 : 0.3); u.uFlare.value = flare;
      m.quaternion.copy(cam.quaternion);
      // layers a little in front and behind, so the flame has some depth
      const off = new THREE.Vector3(0, 0, (i - 1) * 0.0015).applyQuaternion(cam.quaternion);
      m.scale.set(h * (0.55 + 0.1 * i), h, 1);
      m.position.set(front[0] + off.x, front[1] + h * 0.42 - 0.0015, front[2] + off.z);
    });
    // the lighter comes up under the tip and holds it in the top of its flame
    const L = st.lighter;
    this.lighter.visible = L > 0.002;
    const lh = 0.03;
    this.lighter.material.uniforms.uT.value = t;
    this.lighter.material.uniforms.uAmt.value = L;
    this.lighter.quaternion.copy(cam.quaternion);
    this.lighter.scale.set(lh * 0.42, lh, 1);
    // its yellow top (from 40% up) wraps the tip
    this.lighter.position.set(tip[0] + 0.0006, tip[1] - lh * 0.22 - (1 - L) * 0.02, tip[2] + 0.001);
    this.light = flame * (1.2 + 2.0 * flare) + L * 2.2;
  }
}
