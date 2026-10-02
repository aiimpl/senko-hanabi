// Background: a night garden far out of focus behind the sparkler: a faint pool of warm light on the ground below
// (lit by the fireball) and a slightly lighter sky.
import * as THREE from 'three';
import { NOISE } from './ball.js';

export class Backdrop {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uAspect: { value: 16 / 9 }, uBgLight: { value: 0 }, uBgShift: { value: new THREE.Vector2() }, uGain: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uAspect, uBgLight, uGain; uniform vec2 uBgShift; varying vec2 vUv;
        ${NOISE}
        vec3 background(vec2 uv){
          vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) + uBgShift;
          vec3 c = vec3(0.0018, 0.0016, 0.0019);
          float ground = smoothstep(0.15, -0.5, p.y) * (0.6 + 0.4 * fbm(vec3(p * 2.0, 3.0)));
          c += vec3(1.0, 0.45, 0.16) * ground * uBgLight * 0.03;
          c += vec3(0.0010, 0.0013, 0.0016) * smoothstep(-0.1, 0.5, p.y) * (0.6 + 0.5 * fbm(vec3(p * 1.5, 1.0)));
          return c;
        }
        void main(){ gl_FragColor = vec4(background(vUv) * uGain, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
}
