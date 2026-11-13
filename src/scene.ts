import * as THREE from 'three';
import { enableShadows, toonify } from './look';
import { T } from './tuning';
import { buildBins } from './bins';
import { buildHangang } from './hangang';

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const std = (color: number, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


// ───────────────────────── 절차적 텍스처 ─────────────────────────
// 색(map)은 흰색 근처에서 살짝 어둡게만 그려 재질 color 가 색을 정하게 하고,
// 같은 캔버스를 범프맵으로도 써서 결·줄눈·무늬가 빛을 받게 한다.

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function surface(w: number, h: number, draw: Draw, repeat: [number, number] = [1, 1], srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  return tex;
}

/** 같은 이미지를 다른 반복으로 */
function rep(t: THREE.Texture, x: number, y: number) {
  const c = t.clone();
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, size: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    c.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    const s = rand(0.5, size);
    c.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

/** 헤어라인 스테인리스: 가로 결 + 잔 긁힘 + 얼룩 */
const brushed: Draw = (c, w, h) => {
  c.fillStyle = '#eceef1';
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random() < 0.5 ? 255 : 120;
    c.fillStyle = `rgba(${v},${v},${v + 6},${rand(0.03, 0.12)})`;
    c.fillRect(rand(-40, w), Math.random() * h, rand(30, 220), 1);
  }
  c.strokeStyle = 'rgba(90,92,100,0.18)';
  c.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = rand(-0.6, 0.6);
    const l = rand(10, 60);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(110,100,90,0.10)');
    g.addColorStop(1, 'rgba(110,100,90,0)');
    c.save();
    c.translate(Math.random() * w, Math.random() * h);
    c.scale(rand(20, 70), rand(12, 40));
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
  }
};

/** 줄무늬 체크판 (트럭 바닥) */
const diamondPlate: Draw = (c, w, h) => {
  c.fillStyle = '#b9bcc2';
  c.fillRect(0, 0, w, h);
  speckle(c, w, h, 1800, 2, 0.12);
  const step = 32;
  for (let y = 0; y < h + step; y += step)
    for (let x = 0; x < w + step; x += step) {
      const flip = ((x + y) / step) % 2 === 0;
      c.save();
      c.translate(x, y);
      c.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
      c.fillStyle = '#5c5f66';
      c.fillRect(-11, -2.6, 22, 5.2);
      c.fillStyle = '#ffffff';
      c.fillRect(-10, -2.2, 20, 2);
      c.restore();
    }
};

/** 트럭 벽 패널: 세로 이음매 + 리벳 + 아래쪽 때 */
const truckPanel: Draw = (c, w, h) => {
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  speckle(c, w, h, 900, 2, 0.06);
  for (const x of [0, w / 2]) {
    c.fillStyle = 'rgba(70,55,40,0.35)';
    c.fillRect(x, 0, 3, h);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fillRect(x + 3, 0, 2, h);
    for (let y = 10; y < h; y += 24) {
      c.fillStyle = 'rgba(80,65,50,0.45)';
      c.beginPath();
      c.arc(x + 12, y, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  const g = c.createLinearGradient(0, h * 0.7, 0, h);
  g.addColorStop(0, 'rgba(90,70,50,0)');
  g.addColorStop(1, 'rgba(90,70,50,0.22)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
};

/** 나뭇결 (가로) */
const woodGrain: Draw = (c, w, h) => {
  c.fillStyle = '#f4e7d8';
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y0 = Math.random() * h;
    const amp = rand(1, 5);
    const f = rand(0.004, 0.02);
    const ph = Math.random() * 6;
    c.strokeStyle = `rgba(${Math.random() < 0.7 ? '120,72,36' : '255,240,220'},${rand(0.08, 0.28)})`;
    c.lineWidth = rand(0.6, 2.4);
    c.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3;
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  // 옹이
  for (let i = 0; i < 2; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    for (let r = 2; r < 14; r += 3) {
      c.strokeStyle = `rgba(110,62,30,${0.35 - r * 0.02})`;
      c.beginPath();
      c.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
};

/** 마루: 널빤지 줄 + 결 */
const planks: Draw = (c, w, h) => {
  woodGrain(c, w, h);
  const rows = 6;
  const ph = h / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * ph;
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,245,230' : '100,60,30'},${rand(0.03, 0.12)})`;
    c.fillRect(0, y, w, ph);
    c.fillStyle = 'rgba(60,35,18,0.55)';
    c.fillRect(0, y, w, 2);
    const off = Math.random() * w;
    c.fillRect(off, y, 2, ph);
  }
};

/** 회벽 */
const plaster: Draw = (c, w, h) => {
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  speckle(c, w, h, 2500, 2.5, 0.07);
  for (let i = 0; i < 14; i++) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(150,130,110,0.06)');
    g.addColorStop(1, 'rgba(150,130,110,0)');
    c.save();
    c.translate(Math.random() * w, Math.random() * h);
    c.scale(rand(30, 90), rand(30, 90));
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
  }
};

/** 법랑 화구 상판: 잔 반점 + 기름 얼룩 */
const enamel: Draw = (c, w, h) => {
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  speckle(c, w, h, 3000, 1.6, 0.18);
  for (let i = 0; i < 16; i++) {
    c.fillStyle = `rgba(40,30,20,${rand(0.05, 0.15)})`;
    c.beginPath();
    c.ellipse(Math.random() * w, Math.random() * h, rand(4, 18), rand(3, 12), Math.random() * 3, 0, Math.PI * 2);
    c.fill();
  }
};

/** 범프용 재질 묶음 */
function textured(color: number, tex: THREE.Texture, roughness = 0.8, metalness = 0, bump = 0.6) {
  return new THREE.MeshStandardMaterial({ color, map: tex, bumpMap: tex, bumpScale: bump, roughness, metalness });
}

// ───────────────────────── 빛줄기 · 먼지 ─────────────────────────

/** 펜던트 조명 아래로 퍼지는 빛기둥 (가산 혼합, 가장자리·아래로 갈수록 옅어짐) */
function lightShaft(top: number, bottom: number, height: number, color: THREE.Color) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, 40, 1, true).translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: color }, strength: { value: 1 } },
    vertexShader: `varying float vV; varying vec3 vN; varying vec3 vView;
      void main() {
        vV = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying float vV; varying vec3 vN; varying vec3 vView;
      void main() {
        // MSAA 에서는 삼각형 가장자리 픽셀의 varying 이 범위 밖으로 외삽될 수 있다.
        // pow(음수) 는 GPU 에서 NaN 이 되고, 가산 혼합 + 블룸으로 화면 전체가 검게 번지므로 꼭 0~1 로 묶는다
        float edge = clamp(abs(dot(normalize(vN), normalize(vView))), 0.0, 1.0);
        float v = clamp(vV, 0.0, 1.0);
        float a = max(0.0, pow(edge, 3.0) * pow(v, 2.2) * 0.035 * strength);
        gl_FragColor = vec4(color * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.userData.noShadow = true;
  return m;
}

/** 빛기둥 안을 천천히 떠도는 먼지 */
class Dust {
  readonly points: THREE.Points;
  private base: Float32Array;
  private seed: Float32Array;
  constructor(n: number, center: THREE.Vector3, radius: number, height: number) {
    const pos = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const t = Math.random();
      const r = Math.sqrt(Math.random()) * radius * (0.35 + 0.65 * t);
      this.base.set([center.x + Math.cos(a) * r, center.y - t * height, center.z + Math.sin(a) * r], i * 3);
      this.seed[i] = Math.random() * 100;
    }
    pos.set(this.base);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = canvasTexture(32, 32, (c) => {
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 32);
    });
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: dot,
        color: new THREE.Color(1.6, 1.3, 0.9),
        size: 0.012,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
  }
  update(t: number, strength: number) {
    const p = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < this.seed.length; i++) {
      const s = this.seed[i];
      a[i * 3] = this.base[i * 3] + Math.sin(t * 0.21 + s) * 0.05;
      a[i * 3 + 1] = this.base[i * 3 + 1] + Math.sin(t * 0.13 + s * 1.7) * 0.06;
      a[i * 3 + 2] = this.base[i * 3 + 2] + Math.cos(t * 0.17 + s * 0.6) * 0.05;
    }
    p.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.5 * Math.min(1, strength);
  }
}

export type Place = 'truck' | 'home';

export interface World {
  scene: THREE.Scene;
  setPlace: (p: Place) => void;
  flames: THREE.Mesh[];
  fireLight: THREE.PointLight;
  /** 그림자를 드리우는 주 조명 (조리대 위 비스듬히) */
  keyLight: THREE.SpotLight;
  keyBase: number;
  plate: THREE.Group;
  plateFood: THREE.Mesh;
  /** 매 프레임: 빛줄기 · 먼지 */
  tick: (t: number) => void;
  /** 해금된 재료 수 → 트럭 재료 통 뚜껑 */
  setUnlocked: (n: number) => void;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  // 밤 골목: 남색 하늘, 따뜻한 백열등과 화구 불빛이 중심
  scene.background = new THREE.Color(0x0b1026);
  scene.fog = new THREE.Fog(0x0b1026, 9, 30);

  scene.add(new THREE.HemisphereLight(0x8090d0, 0x2a1e24, 0.5));

  // 그림자 조명: 왼쪽 위에서 조리대를 비스듬히 비춰 웍·병·그릇 그림자가 오른쪽으로 떨어진다
  const keyLight = new THREE.SpotLight(0xffe2b8, 7.5, 0, 0.55, 0.45, 2);
  keyLight.position.set(-1.15, 2.3, -0.05);
  keyLight.target.position.set(0.15, 0.9, -0.35);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.6;
  keyLight.shadow.camera.far = 4.5;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.012;
  keyLight.shadow.radius = 3;
  scene.add(keyLight, keyLight.target);
  // 장사(푸드트럭) 세트와 연구(집 주방) 세트. 화구·웍·접시는 둘이 함께 쓴다
  const truck = new THREE.Group();
  scene.add(truck);
  const moon = new THREE.DirectionalLight(0x9db4ff, 0.55);
  moon.position.set(4, 7, -6);
  truck.add(moon);
  const inside = new THREE.PointLight(0xffc27a, 0.9, 5, 1.4);
  inside.position.set(0, 2.05, 0.1);
  truck.add(inside);
  // 차양 아래 전구가 손님 쪽을 비춘다
  const outside = new THREE.PointLight(0xffb060, 1.5, 4.5, 1.6);
  outside.position.set(0, 2.0, -1.75);
  truck.add(outside);

  // ── 트럭 내부 ──
  const brushedTex = surface(512, 512, brushed);
  const steel = textured(0xa4aab4, brushedTex, 0.35, 0.75, 0.25);
  const wall = textured(0xe8d6b8, surface(256, 256, truckPanel), 0.9, 0, 0.8);
  const trim = std(0xd2452f, 0.6);
  const dark = std(0x2a2b30, 0.6, 0.4);

  box(truck, 3.2, 0.04, 2.6, textured(0x6a6d74, surface(256, 256, diamondPlate, [5, 4]), 0.6, 0.5, 1.2), 0, -0.02, 0.2); // 바닥 (줄무늬 체크판)
  box(truck, 2.9, 0.86, 1.22, textured(0x8d939c, rep(brushedTex, 2, 1), 0.5, 0.6, 0.2), 0, 0.43, -0.4); // 조리대 몸체
  box(truck, 2.96, 0.04, 1.28, textured(0xa4aab4, rep(brushedTex, 2.5, 1.1), 0.35, 0.75, 0.25), 0, 0.88, -0.4); // 조리대 상판
  // 벽
  box(truck, 0.08, 2.4, 2.8, wall, -1.5, 1.2, 0.2);
  box(truck, 0.08, 2.4, 2.8, wall, 1.5, 1.2, 0.2);
  box(truck, 3.1, 0.08, 2.8, wall, 0, 2.36, 0.2);
  // 앞 벽: 창문 위 띠, 양쪽 기둥, 창턱
  box(truck, 3.1, 0.34, 0.08, wall, 0, 2.2, -1.04);
  box(truck, 0.22, 1.2, 0.08, wall, -1.42, 1.5, -1.04);
  box(truck, 0.22, 1.2, 0.08, wall, 1.42, 1.5, -1.04);
  box(truck, 2.9, 0.05, 0.3, trim, 0, 0.925, -1.08); // 서빙 선반
  box(truck, 3.1, 1.2, 0.06, std(0xe9573f, 0.6), 0, 0.3, -1.06); // 트럭 외장 (아래)

  // 차양
  const awningTex = canvasTexture(256, 64, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff6e6' : '#e9573f';
      c.fillRect(i * 32, 0, 32, 64);
    }
  });
  const awning = box(truck, 3.3, 0.04, 1.0, new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.9 }), 0, 2.2, -1.5);
  awning.rotation.x = -0.28;

  // 전구 줄 (차양 끝)
  const bulbGeo = new THREE.SphereGeometry(0.028, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.1, 0.9) });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x14100e });
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 3.2, 4), wireMat);
  wire.rotation.z = Math.PI / 2;
  wire.position.set(0, 1.98, -1.96);
  truck.add(wire);
  for (let i = 0; i < 11; i++) {
    const x = -1.5 + i * 0.3;
    const b = new THREE.Mesh(bulbGeo, bulbMat);
    b.position.set(x, 1.93 - Math.sin((i / 10) * Math.PI) * 0.06, -1.96);
    truck.add(b);
  }

  // 화구 (법랑 상판)
  box(scene, 0.86, 0.035, 0.8, textured(0x2a2b30, surface(256, 256, enamel), 0.55, 0.3, 0.3), 0, 0.915, -0.38);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.01, 12, 64), std(0x18181b, 0.5, 0.6));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.945, -0.38);
  scene.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = box(scene, 0.02, 0.025, 0.12, dark, Math.cos(a) * 0.15, 0.945, -0.38 + Math.sin(a) * 0.15);
    leg.rotation.y = -a + Math.PI / 2;
  }
  // 불꽃
  const flames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.018, 0.045, 6).translate(0, 0.0225, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const f = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({
        color: i % 2 ? new THREE.Color(0.6, 1.4, 3.2) : new THREE.Color(3.0, 1.5, 0.4),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    f.position.set(Math.cos(a) * 0.145, 0.935, -0.38 + Math.sin(a) * 0.145);
    scene.add(f);
    flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff8a30, 0.5, 1.4, 0);
  fireLight.position.set(0, 0.9, -0.12);
  scene.add(fireLight);

  // 재료 통: 재료마다 하나, 안에 실제 조각이 쌓여 있고 안 열린 재료는 뚜껑이 덮여 있다
  const bins = buildBins(truck, steel);
  // 소스병
  [0x3a2416, 0xc93a2a].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 24), std(c, 0.3));
    b.position.set(1.2, 1.0, -0.75 + i * 0.12);
    truck.add(b);
  });

  // 메뉴판
  const menuTex = canvasTexture(512, 256, (c) => {
    c.fillStyle = '#25352c';
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#c9a66b';
    c.lineWidth = 10;
    c.strokeRect(5, 5, 502, 246);
    c.fillStyle = '#fff6dd';
    c.textAlign = 'center';
    c.font = 'bold 76px sans-serif';
    c.fillText('웍웍!', 256, 110);
    c.font = '40px sans-serif';
    c.fillStyle = '#ffcf6b';
    c.fillText('불맛 볶음밥 전문', 256, 190);
  });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: menuTex }));
  menu.position.set(-1.455, 1.75, -0.35);
  menu.rotation.y = Math.PI / 2;
  truck.add(menu);

  // ── 바깥 풍경: 한강 둔치의 밤 (hangang.ts) ──
  const river = buildHangang(truck);

  // ── 접시 (서빙 연출) ──
  const plate = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.025, 56), std(0xfafafa, 0.35));
  const plateFood = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    std(0xe2b566, 0.9),
  );
  plateFood.scale.y = 0.6;
  plateFood.position.y = 0.01;
  plate.add(dish, plateFood);
  plate.visible = false;
  scene.add(plate);

  const home = buildHome();
  scene.add(home);
  toonify(scene);
  enableShadows(scene);

  const setPlace = (p: Place) => {
    truck.visible = p === 'truck';
    home.visible = p === 'home';
    // 한강: 강 건너 도시가 보이도록 안개를 멀리, 수평선 쪽 남보라로
    const bg = p === 'truck' ? 0x1a2150 : 0x1a1420;
    (scene.background as THREE.Color).setHex(bg);
    const fog = scene.fog as THREE.Fog;
    fog.color.setHex(bg);
    fog.near = p === 'truck' ? 16 : 9;
    fog.far = p === 'truck' ? 75 : 30;
  };
  setPlace('home');
  let lastT = 0;
  const tick = (t: number) => {
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    home.userData.tick(t, T.lightShaft);
    if (truck.visible) river.tick(t, dt);
  };
  return { scene, setPlace, flames, fireLight, keyLight, keyBase: keyLight.intensity, plate, plateFood, tick, setUnlocked: bins.setUnlocked };
}

// ───────────────────────── 집 주방 (레시피 연구) ─────────────────────────

function buildHome(): THREE.Group {
  const g = new THREE.Group();
  // 따뜻한 저녁 주방: 타일 벽, 나무 상판, 레인지 후드, 창밖 저녁 하늘
  const lamp = new THREE.PointLight(0xffd29a, 1.0, 6, 1.3);
  lamp.position.set(0, 2.15, -0.2);
  const hoodLight = new THREE.PointLight(0xfff0d0, 0.8, 1.6, 1.5);
  hoodLight.position.set(0, 1.6, -0.6);
  g.add(lamp, hoodLight);

  // 타일: 한 장씩 색이 조금씩 다르고, 줄눈은 범프로 파인다
  const tileTex = surface(256, 256, (c) => {
    c.fillStyle = '#b4c3be';
    c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32)
      for (let x = 0; x < 256; x += 32) {
        const k = rand(-8, 8);
        c.fillStyle = `rgb(${217 + k},${228 + k},${224 + k})`;
        c.fillRect(x + 2, y + 2, 28, 28);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(x + 4, y + 4, 10, 3);
      }
    speckle(c, 256, 256, 400, 1.5, 0.08);
  }, [3, 1.2]);
  const plasterTex = surface(256, 256, plaster);
  const wallM = textured(0xf0e2c8, plasterTex, 0.95, 0, 0.4);
  const woodTex = surface(512, 128, woodGrain);
  const wood = textured(0xb07a4a, rep(woodTex, 1.5, 1), 0.7, 0, 0.5);
  const woodDark = textured(0x7a4f2e, woodTex, 0.8, 0, 0.5);
  const cabinet = textured(0x6f8f7a, surface(256, 256, plaster), 0.8, 0, 0.3);
  const knob = std(0xd8c48a, 0.4, 0.6);

  box(g, 4, 0.04, 3, textured(0x8a6a4c, surface(512, 512, planks, [2, 2]), 0.85, 0, 0.6), 0, -0.02, 0.2); // 마루
  box(g, 2.9, 0.86, 1.22, cabinet, 0, 0.43, -0.4); // 하부장
  box(g, 2.96, 0.05, 1.28, wood, 0, 0.875, -0.4); // 나무 상판
  for (const x of [-1.05, -0.35, 0.35, 1.05]) box(g, 0.08, 0.03, 0.02, knob, x, 0.72, 0.22); // 손잡이
  // 뒷벽 (타일) + 창문
  const back = new THREE.MeshStandardMaterial({ map: tileTex, bumpMap: tileTex, bumpScale: 1.2, roughness: 0.6 });
  box(g, 3.4, 1.5, 0.06, back, 0, 1.65, -1.05);
  box(g, 3.4, 0.9, 0.06, wallM, 0, 0.45, -1.07);
  // 창 (저녁 하늘)
  const skyTex = canvasTexture(128, 128, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#2b2a5c');
    gr.addColorStop(0.6, '#c2607a');
    gr.addColorStop(1, '#f4a361');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#1c1830';
    for (let i = 0; i < 9; i++) {
      const w = 8 + Math.random() * 14;
      const h = 20 + Math.random() * 40;
      c.fillRect(i * 15, 128 - h, w, h);
    }
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: skyTex }));
  win.position.set(0.95, 1.62, -1.015);
  g.add(win);
  box(g, 1.0, 0.04, 0.05, woodDark, 0.95, 1.94, -1.0);
  box(g, 1.0, 0.04, 0.08, woodDark, 0.95, 1.3, -0.99);
  box(g, 0.04, 0.64, 0.05, woodDark, 0.47, 1.62, -1.0);
  box(g, 0.04, 0.64, 0.05, woodDark, 1.43, 1.62, -1.0);
  box(g, 0.03, 0.6, 0.04, woodDark, 0.95, 1.62, -1.0);
  // 레인지 후드
  const hoodM = std(0xc9ccd1, 0.4, 0.7);
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.26, 4, 1), hoodM);
  hood.rotation.y = Math.PI / 4;
  hood.position.set(0, 2.12, -0.86);
  g.add(hood);
  box(g, 0.24, 0.4, 0.24, hoodM, 0, 2.45, -0.9);
  // 상부장
  box(g, 0.9, 0.55, 0.36, cabinet, -1.1, 2.0, -0.86);
  box(g, 0.5, 0.55, 0.36, cabinet, 1.55, 2.0, -0.86);
  // 옆벽
  box(g, 0.08, 2.6, 3, wallM, -1.7, 1.3, 0.2);
  box(g, 0.08, 2.6, 3, wallM, 1.7, 1.3, 0.2);
  box(g, 3.5, 0.08, 3, wallM, 0, 2.6, 0.2);
  // 선반 위 소품: 양념통, 냄비, 화분
  const jars = [0xc93a2a, 0x3a2416, 0xe8d9a8, 0x5a8a3a];
  jars.forEach((c, i) => {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 24), std(c, 0.4));
    j.position.set(-1.25 + i * 0.1, 0.955, -0.85);
    g.add(j);
  });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.14, 40), std(0x9a3b2e, 0.5, 0.3));
  pot.position.set(-0.8, 0.97, -0.62);
  g.add(pot);
  const potLid = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 8, 0, Math.PI * 2, 0, Math.PI / 4), std(0x7a2a20, 0.5, 0.3));
  potLid.position.set(-0.8, 0.99, -0.62);
  g.add(potLid);
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 2), std(0x4f9a5a, 1));
  plant.position.set(1.2, 1.42, -0.92);
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 24), std(0xc66a3c, 0.8));
  planter.position.set(1.2, 1.36, -0.92);
  g.add(plant, planter);
  // 도마
  box(g, 0.42, 0.025, 0.28, textured(0xd9b27a, woodTex, 0.8, 0, 0.4), 0.85, 0.91, -0.35);
  // 펜던트 조명
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 32, 1, true), std(0x2f4a3e, 0.6));
  shade.position.set(0, 2.32, -0.2);
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.4) }));
  bulb.position.set(0, 2.27, -0.2);
  g.add(shade, bulb);

  // 펜던트 조명 아래 빛기둥과 그 안을 떠도는 먼지
  const shaft = lightShaft(0.13, 0.62, 1.32, new THREE.Color(1.0, 0.82, 0.55));
  shaft.position.set(0, 2.27, -0.2);
  const dust = new Dust(90, new THREE.Vector3(0, 2.2, -0.2), 0.55, 1.25);
  g.add(shaft, dust.points);
  g.userData.tick = (t: number, k: number) => {
    (shaft.material as THREE.ShaderMaterial).uniforms.strength.value = k;
    shaft.visible = k > 0.001;
    dust.points.visible = k > 0.001;
    dust.update(t, k);
  };
  return g;
}

// ───────────────────────── 김 / 연기 ─────────────────────────

export class Steam {
  private sprites: THREE.Sprite[] = [];
  private life: number[] = [];
  private spin: number[] = [];
  private drift: number[] = [];
  private acc = 0;

  constructor(scene: THREE.Scene) {
    // 뭉게뭉게한 김: 부드러운 원 여러 개를 겹쳐 덩어리 모양을 만든다
    const tex = canvasTexture(128, 128, (c) => {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 26;
        const x = 64 + Math.cos(a) * r;
        const y = 64 + Math.sin(a) * r;
        const s = 22 + Math.random() * 20;
        const g = c.createRadialGradient(x, y, 0, x, y, s);
        g.addColorStop(0, 'rgba(255,255,255,0.42)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      }
    });
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.sprites.push(s);
      this.life.push(0);
      this.spin.push(0);
      this.drift.push(0);
    }
  }

  /** rate: 초당 생성 수, smoke: 0(흰 김)~1(검은 연기) */
  update(dt: number, rate: number, center: THREE.Vector3, smoke: number) {
    this.acc += rate * dt;
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      if (this.life[i] > 0) {
        this.life[i] -= dt / 1.9;
        const l = this.life[i];
        // 올라가며 느려지고, 옆으로 흔들리며 퍼진다
        s.position.y += dt * (0.12 + l * 0.26);
        s.position.x += dt * (0.03 + Math.sin((1 - l) * 5 + this.drift[i]) * 0.05);
        s.material.rotation += this.spin[i] * dt;
        const sc = 0.08 + (1 - l) * (0.3 + this.drift[i] * 0.02);
        s.scale.set(sc, sc, sc);
        s.material.opacity = Math.max(0, Math.sin(l * Math.PI)) * (0.22 + smoke * 0.3);
        if (l <= 0) s.visible = false;
      } else if (this.acc >= 1) {
        this.acc -= 1;
        this.life[i] = 1;
        this.spin[i] = (Math.random() - 0.5) * 1.2;
        this.drift[i] = Math.random() * 6;
        s.material.rotation = Math.random() * Math.PI * 2;
        s.visible = true;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.15;
        s.position.set(center.x + Math.cos(a) * r, center.y + 0.06, center.z + Math.sin(a) * r);
        const g = 1 - smoke * 0.8;
        s.material.color.setRGB(g, g, g);
      }
    }
    if (this.acc > 2) this.acc = 2;
  }
}
