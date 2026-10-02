// The fireball (hi-dama): a drop of molten potassium salts hanging from the paper, glowing at about 880 C.
// Its surface boils: gas bubbles rise and burst (that is where the sparks come from), so it shimmers and wobbles.
// Also the small flame of the paper and powder when it is first lit.
import * as THREE from 'three';
import { blackbodyGLSL } from './color.js';

const NOISE = /* glsl */`
  vec3 hash3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
  float noise(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z); }
  float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;
export { NOISE };

export class Ball {
  constructor() {
    const geo = new THREE.SphereGeometry(1, 64, 48);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uHeat: { value: 1 }, uGain: { value: 1 }, uStretch: { value: 1 }, uSeed: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float uT, uStretch, uSeed; varying vec3 vN; varying vec3 vL; varying vec3 vV;
        ${NOISE}
        void main(){
          vec3 p = position;
          // wobble: the surface of a boiling drop
          float w = noise(p * 2.2 + vec3(0.0, uT * 9.0, uSeed)) * 0.07 + noise(p * 5.0 + uT * 23.0) * 0.025;
          p *= 1.0 + w;
          p.y *= uStretch; p.y -= (uStretch - 1.0) * 0.6; // a spindle that hangs down
          vL = position;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * normal); vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uT, uHeat, uGain; varying vec3 vN; varying vec3 vL; varying vec3 vV;
        ${blackbodyGLSL}
        ${NOISE}
        void main(){
          vec3 n = normalize(vN), v = normalize(vV);
          float mu = clamp(dot(n, v), 0.0, 1.0);
          // cells of hotter and cooler melt that churn, and bright pits where bubbles burst
          float c = fbm(vL * 3.0 + vec3(0.0, -uT * 4.0, uT * 1.3));
          float pits = smoothstep(0.42, 0.62, noise(vL * 9.0 + uT * 31.0));
          float T = 1150.0 + c * 70.0 + pits * 90.0;
          T = mix(800.0, T, uHeat);
          float lum = (0.78 + 0.22 * mu) * (1.0 + c * 0.5 + pits * 0.9) * pow(uHeat, 2.2);
          // a thin skin of dark slag near the paper
          float crust = smoothstep(0.55, 0.95, vL.y) * 0.55;
          lum *= 1.0 - crust;
          gl_FragColor = vec4(blackbody(T) * lum * uGain, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;

    // flame of the paper when lit: a small teardrop of soot glow, blue at the root
    this.flameMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uAmt: { value: 0 }, uGain: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float uT, uAmt, uGain; varying vec2 vUv;
        ${blackbodyGLSL}
        ${NOISE}
        void main(){
          vec2 p = vUv * 2.0 - 1.0; // x across, y up (-1 bottom)
          float y = p.y * 0.5 + 0.5;
          // burning paper: a ragged, licking flame with several tongues, pulled up by its own heat
          vec2 q = vec2(p.x * 1.6, y * 2.2 - uT * 3.2);
          float turb = fbm(vec3(q * 2.3, uT * 1.7)) + 0.5 * fbm(vec3(q * 5.0 + 3.0, uT * 3.1));
          float wob = turb * 0.35 * y;
          float wdt = 0.62 * pow(max(0.0, 1.0 - y), 0.7) * (0.35 + 0.65 * smoothstep(0.0, 0.3, y));
          float d = abs(p.x - wob) / max(wdt, 1e-3);
          float body = smoothstep(1.0, 0.0, d + turb * 0.6 * y) * smoothstep(0.0, 0.1, y);
          body *= smoothstep(1.0, 0.45, y + 0.35 * turb);
          float T = 1250.0 + 380.0 * body * (1.0 - y);
          vec3 col = blackbody(T) * pow(body, 1.3) * 7.0;
          // the blue root where the gas first burns
          col += vec3(0.08, 0.16, 0.6) * smoothstep(0.22, 0.0, y) * smoothstep(1.0, 0.2, d) * 0.9;
          gl_FragColor = vec4(col * uAmt * uGain, 1.0);
        }`,
    });
    this.flame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flameMat);
    this.flame.renderOrder = 11;
  }

  // fall: speed of the falling ball (m/s) and the shutter, so a falling ball is drawn as the streak it leaves
  update(pos, st, t, cam, dropped, fall = 0, S = 1 / 30) {
    const blur = fall * S;
    this.mesh.position.set(pos[0], pos[1] + blur * 0.5, pos[2]);
    this.mesh.scale.set(st.r, st.r + blur * 0.5, st.r);
    this.mat.uniforms.uT.value = t;
    this.mat.uniforms.uHeat.value = Math.max(0.0001, st.heat * Math.pow(st.r / (st.r + blur * 0.5), 0.45));
    this.mat.uniforms.uStretch.value = dropped ? 1 : st.stretch;
    this.mesh.visible = st.r > 0.0004;
    this.flameMat.uniforms.uT.value = t;
    this.flameMat.uniforms.uAmt.value = st.flame;
    this.flame.visible = st.flame > 0.001;
    // the flame stands up from the tip of the paper, facing the camera
    const h = 0.013 * (0.5 + 0.5 * st.flame);
    this.flame.scale.set(h * 0.6, h, 1);
    this.flame.position.set(pos[0], pos[1] + h * 0.40 - 0.002, pos[2]);
    this.flame.quaternion.copy(cam.quaternion);
  }
}
