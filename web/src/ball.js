// The fireball (hi-dama): a drop of molten potassium salts hanging from the paper, glowing at about 880 C.
// Its surface boils: gas bubbles rise and burst (that is where the sparks come from), so it shimmers and wobbles.
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
    const geo = new THREE.SphereGeometry(1, 96, 72);
    this.mat = new THREE.ShaderMaterial({
      extensions: { derivatives: true },
      uniforms: {
        uT: { value: 0 }, uHeat: { value: 1 }, uGain: { value: 1 }, uStretch: { value: 1 }, uSeed: { value: 0 },
        uNeck: { value: 0.3 }, uCool: { value: 0 }, uEnv: { value: 0 }, uBlob: { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform float uT, uStretch, uSeed, uNeck, uBlob; varying vec3 vL; varying vec3 vV; varying float vNeck;
        ${NOISE}
        void main(){
          vec3 p = position;
          // a drop hanging from the paper: the top of the sphere is drawn up into a neck around the paper (a meniscus)
          float phi = acos(clamp(p.y, -1.0, 1.0));
          const float PHI0 = 0.78;
          float s = clamp(1.0 - phi / PHI0, 0.0, 1.0);
          vec2 dir = length(p.xz) > 1e-5 ? normalize(p.xz) : vec2(1.0, 0.0);
          // blend from the sphere itself (same angle) toward the neck, starting with zero slope so there is no crease
          float k = s * s * s * (s * (s * 6.0 - 15.0) + 10.0);
          float rxz = mix(sin(phi), uNeck, k);
          float y = mix(cos(phi), 1.1, k);
          p = vec3(dir.x * rxz, y, dir.y * rxz);
          vNeck = s;
          // the surface of a boiling drop: slow wobble, small fast ripples; when it first forms it is a lumpy blob
          float w = noise(p * 2.0 + vec3(0.0, uT * 7.0, uSeed)) * 0.022 + noise(p * 5.0 + uT * 19.0) * 0.005;
          w += uBlob * (noise(p * 1.3 + vec3(uT * 1.5, 0.0, 3.0)) * 0.16 + noise(p * 2.6 - uT * 3.0) * 0.04);
          p *= 1.0 + w * (1.0 - s);
          p.y = p.y * uStretch - (uStretch - 1.0) * 0.6; // spindle-shaped late in the burn
          vL = position;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vV = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uT, uHeat, uGain, uCool, uEnv; varying vec3 vL; varying vec3 vV; varying float vNeck;
        ${blackbodyGLSL}
        ${NOISE}
        void main(){
          // normal from the surface itself (the drop is displaced, so the sphere's normal would be wrong)
          vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
          vec3 v = normalize(-vV);
          if (dot(n, v) < 0.0) n = -n;
          float mu = clamp(dot(n, v), 0.0, 1.0);
          // a glowing liquid you see into: through the middle you look deep into the hottest melt (pale yellow-white),
          // at the edge only through a thin skin, which shows as a ring of red-orange (as in photographs)
          float depth = 1.0 - exp(-5.0 * mu - 0.9);
          float churn = fbm(vL * 2.6 + vec3(0.0, -uT * 3.0, uT * 1.1));
          float cells = fbm(vL * 6.0 + vec3(uT * 2.0, uT * 5.0, 0.0));
          // hottest low in the drop, where the melt is thickest and the droplets leave; it drifts as it boils
          vec3 hotDir = normalize(vec3(0.25 * sin(uT * 1.3) - 0.2, -0.8, 0.5 + 0.2 * cos(uT * 0.9)));
          float hot = pow(max(dot(normalize(vL), hotDir), 0.0), 3.0);
          float core = smoothstep(0.25, 0.92, mu);
          float T = mix(880.0, 1240.0, core) + 70.0 * hot * core + 30.0 * churn + 15.0 * cells - uCool;
          T = mix(760.0, T, uHeat);
          float lum = depth * (0.8 + 0.9 * hot + 0.15 * churn) * pow(uHeat, 2.2);
          // the red rim stays bright: the skin is hot too, only seen through less melt
          lum = mix(lum, 0.55 * pow(uHeat, 2.2), (1.0 - core) * 0.6);
          // bubbles reach the surface and burst: tiny bright pits
          float pits = smoothstep(0.55, 0.78, noise(vL * 11.0 + uT * 37.0));
          lum *= 1.0 + pits * 0.6;
          // a skin of cooler slag where it hangs from the paper
          float neck = smoothstep(0.15, 0.9, vNeck);
          T -= neck * 240.0; lum *= 1.0 - 0.65 * neck;
          vec3 col = blackbody(T) * lum * pow(T / 1200.0, 4.0);
          // the wet, glassy surface reflects the light around it (Fresnel): sparks, and a bright highlight
          vec3 r = reflect(-v, n);
          float fres = 0.04 + 0.96 * pow(1.0 - mu, 5.0);
          float env = 0.3 + 0.7 * smoothstep(0.2, 0.9, fbm(r * 3.0 + uT * 6.0));
          col += blackbody(1350.0) * fres * env * uEnv;
          vec3 Ldir = normalize(vec3(0.45, 0.65, 0.6));
          float spec = pow(max(dot(r, Ldir), 0.0), 140.0) * 1.4 + pow(max(dot(r, Ldir), 0.0), 18.0) * 0.08;
          col += vec3(1.0, 0.92, 0.8) * spec * (0.3 + uEnv * 6.0) * pow(uHeat, 2.0);
          col *= uGain;
          gl_FragColor = vec4(any(isnan(col)) ? vec3(0.0) : min(col, vec3(2000.0)), 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
  }

  // fall: speed of the falling ball (m/s) and the shutter, so a falling ball is drawn as the streak it leaves
  update(pos, st, t, cam, dropped, fall = 0, S = 1 / 30) {
    const blur = fall * S;
    this.mesh.position.set(pos[0], pos[1] + blur * 0.5, pos[2]);
    this.mesh.scale.set(st.r, st.r + blur * 0.5, st.r);
    this.mat.uniforms.uT.value = t;
    this.mat.uniforms.uHeat.value = Math.max(0.0001, st.heat * Math.pow(st.r / (st.r + blur * 0.5), 0.45));
    this.mat.uniforms.uStretch.value = dropped ? 1 : st.stretch;
    this.mat.uniforms.uNeck.value = dropped ? 0.05 : Math.min(0.6, 0.00062 / Math.max(st.r, 1e-4));
    this.mat.uniforms.uBlob.value = st.blob || 0;
    this.mat.uniforms.uCool.value = st.cool || 0;
    this.mesh.visible = st.r > 0.0004;
  }
}
