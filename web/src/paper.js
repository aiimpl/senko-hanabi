// The twisted washi (koyori) the fireball hangs from: a tube that follows the paper chain, its cross-section an
// ellipse that turns along the length (the twist). Near the ball the paper has burnt to ash; above it, scorched
// paper, then the dyed bands of the handle. Lit only by the fireball and the sparks (inverse square), with a little
// light coming through the thin paper.
import * as THREE from 'three';
import { NOISE } from './ball.js';

const NA = 140, NR = 14;

export class Paper {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(NA * NR * 3);
    this.nrm = new Float32Array(NA * NR * 3);
    const uv = new Float32Array(NA * NR * 2);
    const idx = [];
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
      uv[(i * NR + j) * 2] = j / NR; uv[(i * NR + j) * 2 + 1] = i;
      if (i < NA - 1) {
        const a = i * NR + j, b = i * NR + (j + 1) % NR, c = a + NR, d = b + NR;
        idx.push(a, c, b, b, c, d);
      }
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.sAttr = new Float32Array(NA * NR);
    g.setAttribute('s', new THREE.BufferAttribute(this.sAttr, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uBall: { value: new THREE.Vector3() }, uLight: { value: new THREE.Color(1, 0.5, 0.2) },
        uChar: { value: 0.01 }, uEmber: { value: 0 }, uAmb: { value: 0.0 }, uT: { value: 0 }, uGain: { value: 1 },
      },
      vertexShader: /* glsl */`
        attribute float s; varying float vS; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        void main(){ vS = s; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uBall; uniform vec3 uLight; uniform float uChar, uEmber, uAmb, uT, uGain;
        varying float vS; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        ${NOISE}
        void main(){
          float th = vUv.x * 6.2832;
          float tw = vS / 0.0055 * 6.2832; // one turn every 5.5 mm
          float helix = fract((th - tw) / 6.2832 * 2.0);
          vec3 fib = vec3(vS * 2600.0, th * 1.3, 0.0);
          float f = fbm(fib) * 0.5 + 0.5;
          float fine = noise(vec3(vS * 9000.0, th * 4.0, 2.0)) * 0.5 + 0.5;
          // washi: warm off-white with fibres
          vec3 alb = vec3(0.74, 0.66, 0.52) * (0.8 + 0.3 * f) * (0.9 + 0.15 * fine);
          // dyed handle: bands of colour twisted in
          float dyed = smoothstep(0.034, 0.040, vS);
          vec3 dye = mix(vec3(0.78, 0.16, 0.3), vec3(0.42, 0.18, 0.6), step(0.5, fract(helix + vS * 18.0)));
          dye = mix(dye, vec3(0.2, 0.5, 0.42), step(0.82, fract(vS * 31.0 + helix * 0.5)));
          alb = mix(alb, dye * (0.85 + 0.2 * f), dyed);
          // scorched just above the ash
          float sc = smoothstep(uChar + 0.008, uChar, vS);
          alb = mix(alb, vec3(0.16, 0.08, 0.03) * (0.6 + 0.6 * f), sc);
          // ash
          float ash = smoothstep(uChar + 0.001, uChar - 0.001, vS);
          alb = mix(alb, vec3(0.035, 0.032, 0.03) * (0.6 + 0.9 * f), ash);
          // twist grooves are a bit darker
          alb *= 0.82 + 0.18 * smoothstep(0.0, 0.35, abs(helix - 0.5));
          vec3 n = normalize(vN);
          vec3 L = uBall - vW; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
          float ndl = dot(n, l);
          float diff = max(ndl, 0.0) + 0.35 * max(-ndl, 0.0) * (1.0 - ash); // light through the thin paper
          vec3 col = alb * uLight * diff / (d2 + 1e-5) + alb * uAmb;
          // embers at the burning edge while it is lit
          float edge = exp(-pow((vS - uChar) / 0.0012, 2.0));
          float flick = 0.6 + 0.6 * noise(vec3(th * 2.0, vS * 900.0, uT * 6.0));
          col += vec3(1.0, 0.32, 0.06) * edge * flick * uEmber * 3.0;
          gl_FragColor = vec4(col * uGain, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.curve = new THREE.CatmullRomCurve3([], false, 'centripetal');
  }

  update(chain, N, ballPos, ballR, dropped) {
    // points from the ball up to the hand; when the ball has dropped the paper ends in a stub of ash
    const pts = [];
    for (let i = N - 1; i >= 0; i--) pts.push(new THREE.Vector3(chain[i * 3], chain[i * 3 + 1], chain[i * 3 + 2]));
    if (!dropped) pts[0].set(ballPos[0], ballPos[1] + ballR * 0.2, ballPos[2]);
    this.curve.points = pts;
    const L = this.curve.getLength();
    const P = new THREE.Vector3(), T = new THREE.Vector3(), Nn = new THREE.Vector3(1, 0, 0), B = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let prevT = null;
    for (let i = 0; i < NA; i++) {
      // denser near the ball
      const u = Math.pow(i / (NA - 1), 1.6);
      this.curve.getPointAt(u, P);
      this.curve.getTangentAt(u, T);
      if (prevT) { // parallel transport of the frame
        const ax = tmp.crossVectors(prevT, T);
        const sn = ax.length();
        if (sn > 1e-6) { ax.divideScalar(sn); Nn.applyAxisAngle(ax, Math.asin(Math.min(1, sn))); }
      } else { Nn.set(1, 0, 0); Nn.addScaledVector(T, -Nn.dot(T)).normalize(); }
      prevT = T.clone();
      B.crossVectors(T, Nn);
      const s = u * L;
      // radius: ash is thin, the powder-filled part fatter, then the twisted handle
      let r = s < 0.03 ? 0.00085 + 0.00035 * Math.sin(Math.min(1, s / 0.03) * Math.PI * 0.5) : 0.0012 - 0.0003 * Math.min(1, (s - 0.03) / 0.03);
      if (s < 0.006) r *= 0.75;
      const tw = s / 0.0055 * Math.PI * 2;
      for (let j = 0; j < NR; j++) {
        const th = j / NR * Math.PI * 2;
        // ellipse that turns with the twist, with a ridge
        const e = 1 + 0.22 * Math.cos(2 * (th - tw)) + 0.05 * Math.cos(5 * th + tw);
        const cx = Math.cos(th) * r * e, cy = Math.sin(th) * r * e;
        const k = (i * NR + j) * 3;
        this.pos[k] = P.x + Nn.x * cx + B.x * cy;
        this.pos[k + 1] = P.y + Nn.y * cx + B.y * cy;
        this.pos[k + 2] = P.z + Nn.z * cx + B.z * cy;
        this.sAttr[i * NR + j] = s;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.s.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
