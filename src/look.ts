import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ───────────────────────── 카툰(셀) 셰이딩 ─────────────────────────

/** 명암을 3단계로 끊는 그라디언트 */
export const toonGradient = (() => {
  const steps = [70, 160, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

export function toonMat(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra });
}

const converted = new WeakMap<THREE.Material, THREE.Material>();

function toToon(m: THREE.Material): THREE.Material {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m;
  let t = converted.get(m);
  if (!t) {
    const color = m.color.clone();
    t = toonMat(color, {
      map: m.map,
      emissive: m.emissive,
      emissiveMap: m.emissiveMap,
      emissiveIntensity: m.emissiveIntensity,
      side: m.side,
      transparent: m.transparent,
      opacity: m.opacity,
    });
    converted.set(m, t);
  }
  return t;
}

const OUTLINE_COLOR = 0x1a1210;

/** 뒷면을 법선 방향으로 부풀린 외곽선 재질 (InstancedMesh 에서도 동작) */
export function outlineMat(thickness: number, color: THREE.ColorRepresentation = OUTLINE_COLOR) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineW = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float outlineW;\nvoid main() {')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * outlineW;');
  };
  m.customProgramCacheKey = () => 'outline';
  return m;
}

function addOutline(mesh: THREE.Mesh, thickness: number) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat(thickness));
  o.name = 'outline';
  o.raycast = () => {};
  mesh.add(o);
}

const NO_OUTLINE = new Set(['BoxGeometry', 'PlaneGeometry']);

/**
 * 하위의 모든 MeshStandardMaterial 을 카툰 재질로 바꾸고,
 * 작은 둥근 물체에는 외곽선을 붙인다.
 */
export function toonify(root: THREE.Object3D, outline = 0.006) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'outline') meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const orig = mesh.material as THREE.Material;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toToon) : toToon(orig);
    if (outline <= 0 || !(orig instanceof THREE.MeshStandardMaterial) || orig.transparent) continue;
    if (NO_OUTLINE.has(mesh.geometry.type) || (mesh as THREE.InstancedMesh).isInstancedMesh) continue;
    mesh.geometry.computeBoundingSphere();
    if ((mesh.geometry.boundingSphere?.radius ?? 0) > 1.2) continue;
    addOutline(mesh, outline);
  }
}

// ───────────────────────── 블룸 ─────────────────────────

export class Post {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, ratio: number) {
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    // 블룸은 절반 해상도로 충분하다
    this.bloom.resolution.set(w / 2, h / 2);
  }

  render() {
    this.composer.render();
  }
}

// ───────────────────────── 불길 / 불티 ─────────────────────────

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,220,150,0.9)');
  g.addColorStop(0.6, 'rgba(255,120,40,0.35)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Fx {
  s: THREE.Sprite;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  grav: number;
}

/** 웍질할 때 림에서 솟는 불길(웍 헤이)과 튀는 불티 */
export class FireFx {
  private pool: Fx[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 120) {
    const tex = glowTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.1, grav: 0 });
    }
  }

  private take() {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    return p;
  }

  /** 림 둘레에서 불길이 솟는다. strength 0~1.5 */
  flare(center: THREE.Vector3, rimR: number, strength: number) {
    const n = Math.round(2 + strength * 6);
    for (let i = 0; i < n; i++) {
      const p = this.take();
      const a = Math.random() * Math.PI * 2;
      const r = rimR * (0.7 + Math.random() * 0.4);
      p.s.position.set(center.x + Math.cos(a) * r, center.y + 0.1, center.z + Math.sin(a) * r);
      p.vx = Math.cos(a) * 0.25;
      p.vz = Math.sin(a) * 0.25;
      p.vy = 0.4 + Math.random() * 0.6 * strength;
      p.max = p.life = 0.3 + Math.random() * 0.3;
      p.size = 0.04 + 0.07 * strength * (0.6 + Math.random() * 0.6);
      p.grav = -0.6;
      p.s.material.color.setRGB(1.8, 0.65 + Math.random() * 0.3, 0.18);
      p.s.visible = true;
    }
  }

  /** 작은 불티. 위로 튀었다가 떨어진다 */
  sparks(center: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.take();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.15;
      p.s.position.set(center.x + Math.cos(a) * r, center.y + 0.1, center.z + Math.sin(a) * r);
      const sp = 0.4 + Math.random() * 0.7;
      p.vx = Math.cos(a) * sp * 0.6;
      p.vz = Math.sin(a) * sp * 0.6;
      p.vy = 0.9 + Math.random() * 1.4;
      p.max = p.life = 0.5 + Math.random() * 0.5;
      p.size = 0.012 + Math.random() * 0.01;
      p.grav = 4;
      p.s.material.color.setRGB(4, 2.2, 0.6);
      p.s.visible = true;
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      p.vy -= p.grav * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const k = p.life / p.max;
      const sc = p.grav < 0 ? p.size * (0.5 + (1 - k) * 0.9) : p.size;
      p.s.scale.set(sc, sc * (p.grav < 0 ? 1.5 : 1), sc);
      p.s.material.opacity = Math.min(1, k * 1.6) * (p.grav < 0 ? 0.75 : 1);
    }
  }
}
