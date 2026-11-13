import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { QualityProfile } from './quality';
import { T } from './tuning';

// ───────────────────────── 카툰(셀) 셰이딩 ─────────────────────────

/**
 * 명암을 4단계로 끊는 그라디언트. 어두운 단계일수록 밤하늘 남보라로 물든다
 * (회색으로 탁해지는 대신 그림처럼 보이게). 색은 셰이더에서 rgb 그대로 쓴다.
 */
const GRAD_GRAY = [
  [62, 62, 62],
  [128, 128, 128],
  [198, 198, 198],
  [255, 255, 255],
];
const GRAD_TINT = [
  [54, 44, 96],
  [116, 104, 152],
  [196, 188, 208],
  [255, 252, 246],
];
export const toonGradient = (() => {
  const data = new Uint8Array(GRAD_GRAY.length * 4);
  const tex = new THREE.DataTexture(data, GRAD_GRAY.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
})();
let gradTint = -1;
function setShadowTint(k: number) {
  if (k === gradTint) return;
  gradTint = k;
  const d = toonGradient.image.data as Uint8Array;
  GRAD_GRAY.forEach((g, i) => {
    const t = GRAD_TINT[i];
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round(g[c] + (t[c] - g[c]) * k);
    d[i * 4 + 3] = 255;
  });
  toonGradient.needsUpdate = true;
}
setShadowTint(1);

/** 카툰 재질 공용 유니폼: 가장자리 림라이트 */
export const toonUniforms = {
  rimStrength: { value: 0.22 },
  rimColor: { value: new THREE.Color(1.0, 0.78, 0.55) },
};

const GRADIENT_RGB = THREE.ShaderChunk.gradientmap_pars_fragment.replace(
  'return vec3( texture2D( gradientMap, coord ).r );',
  'return texture2D( gradientMap, coord ).rgb;',
);

/**
 * rim: 림라이트를 받을지. 벽·땅처럼 큰 평면은 비스듬히 보이면 면 전체가
 * '가장자리'가 되어 하얗게 뜨므로, 작은 물체에만 켠다.
 */
function patchToon(m: THREE.MeshToonMaterial, rim: boolean) {
  const rimOn = { value: rim ? 1 : 0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimOn = rimOn;
    shader.uniforms.rimStrength = toonUniforms.rimStrength;
    shader.uniforms.rimColor = toonUniforms.rimColor;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', `${GRADIENT_RGB}\nuniform float rimStrength;\nuniform float rimOn;\nuniform vec3 rimColor;`)
      .replace(
        '#include <opaque_fragment>',
        `{
          // 프레넬 림라이트: 실루엣 가장자리에 따뜻한 역광이 돈다 (위를 향한 면일수록 조금 더)
          vec3 rv = normalize( vViewPosition );
          float fres = pow( 1.0 - clamp( dot( normal, -rv ), 0.0, 1.0 ), 3.0 );
          float rimBand = smoothstep( 0.45, 0.6, fres );
          outgoingLight += rimColor * rimBand * rimStrength * rimOn * ( 0.35 + 0.65 * diffuseColor.rgb );
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'toon-rim';
  return m;
}

export function toonMat(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}, rim = true) {
  return patchToon(new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra }), rim);
}

const converted = [new WeakMap<THREE.Material, THREE.Material>(), new WeakMap<THREE.Material, THREE.Material>()];

function toToon(m: THREE.Material, rim: boolean): THREE.Material {
  if (!(m instanceof THREE.MeshStandardMaterial)) return m;
  // 금속 웍처럼 반사가 중요한 재질은 PBR 로 남긴다
  if (m.userData.keepPbr) return m;
  const cache = converted[rim ? 1 : 0];
  let t = cache.get(m);
  if (!t) {
    const color = m.color.clone();
    t = toonMat(color, {
      map: m.map,
      normalMap: m.normalMap,
      bumpMap: m.bumpMap,
      bumpScale: m.bumpScale,
      emissive: m.emissive,
      emissiveMap: m.emissiveMap,
      emissiveIntensity: m.emissiveIntensity,
      side: m.side,
      transparent: m.transparent,
      opacity: m.opacity,
    }, rim);
    cache.set(m, t);
  }
  return t;
}

const OUTLINE_COLOR = 0x1a1210;

/**
 * 외곽선 두께는 화면 픽셀 단위로 고정한다 (가까워도 멀어도 같은 두께).
 * 값은 Post.render 에서 매 프레임 T 와 화면 크기로 갱신한다.
 */
export const outlineUniforms = {
  outlinePx: { value: 1.5 },
  outlinePxSmall: { value: 1.1 },
  outlineRes: { value: new THREE.Vector2(1280, 720) },
};

/**
 * 같은 위치의 꼭짓점 법선을 평균낸 'outlineNormal' 을 만든다.
 * 상자·원기둥처럼 각진 모서리에서 외곽선이 갈라지지 않게 한다.
 */
const smoothed = new WeakSet<THREE.BufferGeometry>();
export function ensureOutlineNormals(g: THREE.BufferGeometry) {
  if (smoothed.has(g)) return;
  smoothed.add(g);
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sum.get(k) ?? [0, 0, 0];
    v[0] += nor.getX(i);
    v[1] += nor.getY(i);
    v[2] += nor.getZ(i);
    sum.set(k, v);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sum.get(key(i))!;
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    out[i * 3] = v[0] / l;
    out[i * 3 + 1] = v[1] / l;
    out[i * 3 + 2] = v[2] / l;
  }
  g.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

/**
 * 뒷면을 화면 공간에서 법선 방향으로 일정 픽셀만큼 밀어낸 외곽선 재질.
 * InstancedMesh 에서도 동작한다. small: 작은 재료 조각용 (더 얇게)
 */
export function outlineMat(small = false, color: THREE.ColorRepresentation = OUTLINE_COLOR) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineW = small ? outlineUniforms.outlinePxSmall : outlineUniforms.outlinePx;
    shader.uniforms.outlineRes = outlineUniforms.outlineRes;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'uniform float outlineW;\nuniform vec2 outlineRes;\nattribute vec3 outlineNormal;\nvoid main() {',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec3 on = outlineNormal;
          #ifdef USE_INSTANCING
            on = mat3(instanceMatrix) * on;
          #endif
          vec3 vn = mat3(modelViewMatrix) * on;
          vec2 dir = (projectionMatrix * vec4(vn, 0.0)).xy;
          float l = length(dir);
          dir = l > 1e-5 ? dir / l : vec2(0.0);
          gl_Position.xy += dir * outlineW * 2.0 / outlineRes * gl_Position.w;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'outline-px';
  return m;
}

/** mesh 에 외곽선 자식을 붙인다 */
export function addOutline(mesh: THREE.Mesh, small = false) {
  ensureOutlineNormals(mesh.geometry);
  const o = new THREE.Mesh(mesh.geometry, outlineMat(small));
  o.name = 'outline';
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

const NO_OUTLINE = new Set(['PlaneGeometry', 'CircleGeometry']);

/**
 * 하위의 모든 MeshStandardMaterial 을 카툰 재질로 바꾸고,
 * 너무 크지 않은 물체에는 외곽선을 붙인다.
 */
export function toonify(root: THREE.Object3D, outline = true) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name !== 'outline') meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const orig = mesh.material as THREE.Material;
    mesh.geometry.computeBoundingSphere();
    const r = (mesh.geometry.boundingSphere?.radius ?? 0) * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    const rim = r < 0.5 && !NO_OUTLINE.has(mesh.geometry.type) && mesh.geometry.type !== 'BoxGeometry';
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => toToon(x, rim)) : toToon(orig, rim);
    if (!outline || !(orig instanceof THREE.MeshStandardMaterial) || orig.transparent) continue;
    if (orig.userData.noOutline) continue;
    if (NO_OUTLINE.has(mesh.geometry.type) || (mesh as THREE.InstancedMesh).isInstancedMesh) continue;
    mesh.geometry.computeBoundingSphere();
    if ((mesh.geometry.boundingSphere?.radius ?? 0) > 1.2) continue;
    addOutline(mesh);
  }
}

// ───────────────────────── 반사 환경맵 ─────────────────────────

/**
 * 금속(웍)이 비출 주방 환경. 어두운 방에 머리 위 백열등, 옆 창의 푸른 밤빛,
 * 아래 화구의 주황 불빛을 HDR 판으로 두고 PMREM 으로 굽는다.
 */
export function makeKitchenEnv(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.05, 0.07), side: THREE.BackSide }),
  );
  env.add(room);
  const panel = (w: number, h: number, c: THREE.Color, pos: THREE.Vector3Tuple, look: THREE.Vector3Tuple) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(3.2, 3.2, new THREE.Color(7, 5, 3.2), [0, 4.9, 0], [0, 0, 0]); // 천장 백열등
  panel(2.2, 1.2, new THREE.Color(1.6, 1.3, 1.0), [-1.5, 3.8, 2.5], [0, 0, 0]); // 앞쪽 보조등
  panel(3.5, 2, new THREE.Color(0.35, 0.5, 1.2), [-4.9, 1.5, -1], [0, 1.5, -1]); // 옆 창 (밤빛)
  panel(4.5, 1.2, new THREE.Color(1.1, 0.95, 0.8), [0, 1.2, -4.9], [0, 1.2, 0]); // 뒷벽 반사
  panel(1.6, 1.6, new THREE.Color(5, 1.8, 0.4), [0, -4.9, 0], [0, 0, 0]); // 화구 불빛
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return tex;
}

// ───────────────────────── 그림자 ─────────────────────────

/** 빛을 받는 불투명 물체인지 (외곽선 · 발광 · 투명 재질 제외) */
function isSolid(o: THREE.Object3D): o is THREE.Mesh {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || o.name === 'outline' || o.userData.noShadow) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.every((m) => m.visible && !m.transparent && !(m instanceof THREE.MeshBasicMaterial));
}

/** 하위의 불투명 물체가 그림자를 드리우고 받게 한다 */
export function enableShadows(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!isSolid(o)) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
}

// ───────────────────────── 앰비언트 오클루전 ─────────────────────────

/**
 * GTAO: 물체가 맞닿는 구석·틈을 어둡게 해서 입체감을 준다.
 * 노멀/깊이 패스에서 외곽선 · 반투명 · 스프라이트(불길·김)는 빼야
 * 그 주위에 얼룩이 생기지 않는다.
 */
class SceneAOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Sprite).isSprite || o.name === 'outline' || (m && !Array.isArray(m) && (m.transparent || !m.visible))) o.visible = false;
    });
  }
}

// ───────────────────────── 색보정 · 비네팅 ─────────────────────────

/**
 * 톤매핑 뒤(sRGB)에서 거는 마무리 보정: 대비 · 채도, 어두운 곳은 남색 · 밝은 곳은
 * 등불 주황으로 물들이는 스플릿 톤, 가장자리 비네팅, 아주 옅은 필름 그레인.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    contrast: { value: 1.06 },
    saturation: { value: 1.08 },
    split: { value: 1 },
    vignette: { value: 0.35 },
    grain: { value: 0.018 },
    aspect: { value: 16 / 9 },
    time: { value: 0 },
  },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
    uniform float contrast, saturation, split, vignette, grain, aspect, time;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec4 tex = texture2D( tDiffuse, vUv );
      vec3 c = tex.rgb;
      c = ( c - 0.5 ) * contrast + 0.5;
      float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
      c = mix( vec3( l ), c, saturation );
      float sh = 1.0 - smoothstep( 0.0, 0.45, l );
      float hi = smoothstep( 0.55, 1.0, l );
      c += split * ( vec3( -0.01, 0.0, 0.045 ) * sh + vec3( 0.04, 0.018, -0.02 ) * hi );
      vec2 d = vUv - 0.5;
      d.x *= aspect;
      float v = smoothstep( 0.95, 0.3, length( d ) );
      c *= mix( 1.0 - vignette, 1.0, v );
      c += ( hash( vUv * 1024.0 + fract( time ) * 97.0 ) - 0.5 ) * grain;
      gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), tex.a );
    }`,
};

// ───────────────────────── 블룸 ─────────────────────────

export class Post {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly ao: SceneAOPass;
  readonly grade: ShaderPass;
  readonly smaa: SMAAPass;
  private size = new THREE.Vector2();
  private aoKey = '';
  private quality: QualityProfile | null = null;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    // 후처리 렌더 타깃에도 MSAA 를 걸어 외곽선·모서리의 계단 현상을 줄인다
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new SceneAOPass(scene, camera, 1, 1);
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    // MSAA 가 못 잡는 셰이딩 경계(카툰 단계 · 림 · AO)의 계단은 SMAA 로 한 번 더 다듬는다
    this.smaa = new SMAAPass(1, 1);
    this.composer.addPass(this.smaa);
  }

  /** 품질 단계 적용: MSAA 샘플 수 · AO · SMAA */
  setQuality(q: QualityProfile) {
    const prev = this.quality;
    this.quality = q;
    if (!prev || prev.msaa !== q.msaa) {
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        rt.samples = q.msaa;
        rt.dispose();
      }
    }
  }

  setSize(w: number, h: number, ratio: number) {
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    // 블룸은 절반 해상도로 충분하다
    this.bloom.resolution.set(w / 2, h / 2);
    // AO 도 절반 해상도로 계산하고 디노이즈로 부드럽게 편다
    this.ao.setSize(Math.round((w * ratio) / 2), Math.round((h * ratio) / 2));
  }

  render() {
    const size = this.renderer.getDrawingBufferSize(this.size);
    const dpr = this.renderer.getPixelRatio();
    outlineUniforms.outlineRes.value.copy(size);
    outlineUniforms.outlinePx.value = T.outlinePx * dpr;
    outlineUniforms.outlinePxSmall.value = T.outlinePxSmall * dpr;
    this.renderer.toneMappingExposure = T.exposure;
    this.bloom.strength = T.bloomStrength;
    this.bloom.radius = T.bloomRadius;
    this.bloom.threshold = T.bloomThreshold;
    const q = this.quality;
    this.ao.enabled = !!q?.ao && T.aoStrength > 0.001;
    this.smaa.enabled = q ? q.smaa : true;
    setShadowTint(T.shadowTint);
    toonUniforms.rimStrength.value = T.rimStrength;
    const g = this.grade.uniforms;
    g.contrast.value = T.gradeContrast;
    g.saturation.value = T.gradeSaturation;
    g.split.value = T.gradeSplit;
    g.vignette.value = T.vignette;
    g.grain.value = T.grain;
    g.aspect.value = size.x / Math.max(1, size.y);
    g.time.value = performance.now() / 1000;
    this.ao.blendIntensity = T.aoStrength;
    const key = `${T.aoRadius}`;
    if (key !== this.aoKey) {
      this.aoKey = key;
      this.ao.updateGtaoMaterial({ radius: T.aoRadius, distanceExponent: 1.5, thickness: T.aoRadius * 0.6, scale: 1, samples: 12 });
    }
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
      p.size = (0.04 + 0.07 * strength * (0.6 + Math.random() * 0.6)) * T.flameSize;
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
