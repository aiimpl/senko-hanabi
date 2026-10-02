// Camera: the scene is drawn in linear HDR, then bloom (a chain of half-size blurs), exposure, a filmic shoulder,
// lens halation (a red skirt around the brightest points), vignette and sensor grain.
import * as THREE from 'three';
import { NOISE } from './ball.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function rt(w, h, samples = 0) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: samples > 0,
  });
}

export class Post {
  constructor(renderer, w, h, levels = 7) {
    this.r = renderer; this.levels = levels;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.down = new THREE.ShaderMaterial({
      vertexShader: VERT, depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;
        vec3 tap(vec2 o){ return min(texture2D(uTex, vUv + o * uTexel).rgb, vec3(400.0)); }
        void main(){
          vec3 c = tap(vec2(0.0)) * 4.0 + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
    });
    this.up = new THREE.ShaderMaterial({
      vertexShader: VERT, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uW: { value: 1 } },
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec2 uTexel; uniform float uW; varying vec2 vUv;
        void main(){
          vec3 c = vec3(0.0);
          c += texture2D(uTex, vUv + vec2(-2.0, 0.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(2.0, 0.0) * uTexel).rgb;
          c += texture2D(uTex, vUv + vec2(0.0, -2.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(0.0, 2.0) * uTexel).rgb;
          c += (texture2D(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(1.0, -1.0) * uTexel).rgb
              + texture2D(uTex, vUv + vec2(-1.0, 1.0) * uTexel).rgb + texture2D(uTex, vUv + vec2(1.0, 1.0) * uTexel).rgb) * 2.0;
          gl_FragColor = vec4(c / 12.0 * uW, 1.0);
        }`,
    });
    this.final = new THREE.ShaderMaterial({
      vertexShader: VERT, depthTest: false, depthWrite: false,
      uniforms: {
        uTex: { value: null }, uBloom: { value: null }, uExp: { value: 1 }, uBloomAmt: { value: 0.08 },
        uT: { value: 0 }, uGrain: { value: 0.012 }, uFade: { value: 1 }, uAspect: { value: 16 / 9 },
      },
      fragmentShader: /* glsl */`
        uniform sampler2D uTex, uBloom; uniform float uExp, uBloomAmt, uT, uGrain, uFade, uAspect; varying vec2 vUv;
        ${NOISE}
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // a hint of lateral colour toward the corners
          vec2 cc = uv - 0.5; float ca = dot(cc, cc) * 0.0018;
          vec4 s = texture2D(uTex, uv);
          vec3 col = vec3(texture2D(uTex, uv + cc * ca).r, s.g, texture2D(uTex, uv - cc * ca).b);
          vec3 bl = texture2D(uBloom, uv).rgb;
          // halation: the bloom leans red, as in film and many sensors
          col += bl * uBloomAmt * vec3(1.15, 0.9, 0.75);
          col *= uExp;
          float vig = 1.0 - 0.38 * dot(cc * vec2(uAspect * 0.62, 1.0), cc * vec2(uAspect * 0.62, 1.0)) * 2.0;
          col *= vig;
          col = aces(col);
          col = pow(col, vec3(1.0 / 2.2));
          float g = h12(uv * 1000.0 + fract(uT * 7.13) * 91.0) - 0.5;
          col += g * uGrain * (0.4 + 0.6 * (1.0 - col));
          col *= uFade;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    if (this.scene) { this.scene.dispose(); this.chain.forEach((t) => t.dispose()); }
    this.scene = rt(w, h, 4);
    this.chain = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
      this.chain.push(rt(cw, ch));
    }
    this.final.uniforms.uAspect.value = w / h;
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qs, this.cam);
  }

  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    // bloom
    let src = this.scene.texture, sw = this.w, sh = this.h;
    for (let i = 0; i < this.levels; i++) {
      this.down.uniforms.uTex.value = src;
      this.down.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      this.pass(this.down, this.chain[i]);
      src = this.chain[i].texture; sw = this.chain[i].width; sh = this.chain[i].height;
    }
    for (let i = this.levels - 1; i > 0; i--) {
      this.up.uniforms.uTex.value = this.chain[i].texture;
      this.up.uniforms.uTexel.value.set(1 / this.chain[i].width, 1 / this.chain[i].height);
      this.up.uniforms.uW.value = i > 3 ? 0.55 : 0.85;
      r.autoClear = false;
      this.pass(this.up, this.chain[i - 1]);
      r.autoClear = true;
    }
    this.final.uniforms.uTex.value = this.scene.texture;
    this.final.uniforms.uBloom.value = this.chain[0].texture;
    this.pass(this.final, null);
  }
}
