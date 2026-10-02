// The twisted washi (koyori) the fireball hangs from: a thin tube (~1.3 mm) that follows the paper chain, with the
// seam of the rolled paper spiralling round it. Near the ball the paper has burnt to ash; above it, scorched
// paper, pale washi, and far up the dyed bands of the handle. Lit only by the fireball and the sparks (inverse square), with a little
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
        uChar: { value: 0.01 }, uEmber: { value: 0 }, uAmb: { value: 0.0 }, uT: { value: 0 }, uGain: { value: 1 }, uPowder: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute float s; varying float vS; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        void main(){ vS = s; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uBall; uniform vec3 uLight; uniform float uChar, uEmber, uAmb, uT, uGain, uPowder;
        varying float vS; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        ${NOISE}
        void main(){
          float th = vUv.x * 6.2832;
          float tw = vS / 0.0034 * 6.2832;
          float seam = pow(max(cos(th - tw), 0.0), 40.0); // the edge of the rolled paper
          float f = fbm(vec3(vS * 3000.0, th * 1.2, 0.0)) * 0.5 + 0.5;            // washi fibres along the twist
          float fine = noise(vec3(vS * 12000.0, th * 5.0, 2.0)) * 0.5 + 0.5;
          // pale washi
          vec3 alb = vec3(0.80, 0.76, 0.68) * (0.86 + 0.2 * f) * (0.94 + 0.1 * fine);
          alb *= 1.0 - 0.18 * seam;
          // the powder shows grey through the paper at the unlit tip
          alb = mix(alb, vec3(0.42, 0.41, 0.4) * (0.9 + 0.2 * f), smoothstep(uPowder, uPowder - 0.003, vS));
          // dyed bands of the handle, far up
          float dyed = smoothstep(0.075, 0.08, vS);
          vec3 dye = mix(vec3(0.85, 0.18, 0.45), vec3(0.95, 0.75, 0.15), step(0.5, fract(vS * 14.0)));
          alb = mix(alb, dye, dyed);
          // scorched just above the ash, then black ash where the paper has burnt
          float sc = smoothstep(uChar + 0.005, uChar, vS);
          alb = mix(alb, vec3(0.30, 0.17, 0.07) * (0.7 + 0.5 * f), sc);
          float ash = smoothstep(uChar + 0.0008, uChar - 0.0008, vS);
          alb = mix(alb, vec3(0.03, 0.028, 0.026) * (0.6 + 0.9 * f), ash);
          vec3 n = normalize(vN);
          vec3 L = uBall - vW; float d2 = dot(L, L); vec3 l = L * inversesqrt(d2);
          float ndl = dot(n, l);
          // thin washi lets light through: the side away from the ball still glows a little
          float diff = max(ndl, 0.0) + 0.3 * max(-ndl, 0.0) * (1.0 - ash);
          vec3 col = alb * uLight * diff / (d2 + 1e-5);
          // soft light of the night (a house window behind), from above
          col += alb * uAmb * (0.55 + 0.45 * n.y) * vec3(0.8, 0.85, 1.0);
          // embers at the burning edge while it is lit
          float edge = exp(-pow(vS / 0.0016, 2.0)); // the burning edge, right at the front
          float flick = 0.6 + 0.6 * noise(vec3(th * 2.0, vS * 900.0, uT * 6.0));
          col += vec3(1.0, 0.32, 0.06) * edge * flick * uEmber * 3.0;
          gl_FragColor = vec4(col * uGain, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.curve = new THREE.CatmullRomCurve3([], false, 'centripetal');
  }

  update(chain, N, ballPos, ballR, dropped, unlit = false, char = 0, powderLen = 0) {
    this.unlit = unlit; this.char = char; this.powderLen = powderLen;
    this.mat.uniforms.uPowder.value = powderLen;
    // points from the ball up to the hand; when the ball has dropped the paper ends in a stub of ash
    const pts = [];
    for (let i = N - 1; i >= 0; i--) pts.push(new THREE.Vector3(chain[i * 3], chain[i * 3 + 1], chain[i * 3 + 2]));
    if (!dropped && !unlit && ballR > 0.0004) pts[0].set(ballPos[0], ballPos[1] + ballR * 0.2, ballPos[2]);
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
      // radius: a koyori of thin washi about 1.3 mm across. Unlit, the last 2.5 cm hold the powder (a little
      // fatter, tapering to a point); once lit that part has become the fireball.
      let r = 0.00064;
      const pl = this.powderLen;
      if (s < pl) {
        // the powder-filled part: a little fatter; unlit it tapers to a point at the very tip
        r = 0.00078;
        if (this.unlit) r = 0.00025 + 0.00053 * Math.sin(Math.min(1, s / 0.006) * Math.PI * 0.5);
      }
      if (!this.unlit && s < this.char) r *= 0.8 + 0.2 * s / Math.max(this.char, 1e-4); // ash shrinks
      const tw = s / 0.0034 * Math.PI * 2; // the seam of the twisted paper goes round every 3.4 mm
      for (let j = 0; j < NR; j++) {
        const th = j / NR * Math.PI * 2;
        // nearly round, with the overlapping edge of the paper standing a little proud along the seam
        const sd = Math.cos(th - tw);
        const e = 1 + 0.07 * Math.pow(Math.max(sd, 0), 6) + 0.015 * Math.cos(3 * th + tw * 0.5);
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
