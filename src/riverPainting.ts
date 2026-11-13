import * as THREE from 'three';

/**
 * 한강 야경 '그림 배경' (매트 페인팅).
 *
 * 그림판을 트럭 카메라(가로 화면 기준)가 보는 방향에 수직으로 세워서, 캔버스가 화면에
 * 거의 1:1 로 투영되게 한다. 그래서 원근에 묶이지 않고 '창 너머로 보이는 띠' 안에
 * 아파트 불빛 · 다리 · 강 반사를 직접 구도 잡아 그릴 수 있다.
 *
 * 캔버스(2048×1792) ↔ 가로 화면(1280×720) 대응: screenY ≈ (v − 532)·1.015, screenX ≈ (u − 1024)·1.015 + 640.
 * 가로 화면에서 창으로 보이는 건 대략 v 532 ~ 842 (그 아래는 조리대에 가려짐).
 * 세로 화면은 시야가 넓어 위쪽 하늘 · 달 · 전망탑까지 보인다.
 *
 * 층: 바탕 그림(불투명) → 조명(가산 · HDR · 반짝임) → 물결 반사(가산 · 셰이더) → 유람선.
 */

const PW = 2048;
const PH = 1792;
/** 그림판이 덮는 시야 (카메라 정면 기준 tan 값) */
const TX = 1.6;
const TY = 1.4;
/** 카메라에서 그림판까지 거리 (앞쪽 3D 물체보다 멀리) */
const D = 10;

// 트럭 카메라 (main.ts 의 가로 화면 위치 · 바라보는 곳과 같게)
const CAM = new THREE.Vector3(0, 1.74, 0.78);
const LOOK = new THREE.Vector3(0, 1.08, -0.6);

// ── 구도 (캔버스 v 좌표) ──
const SKY_END = 640; // 하늘이 끝나고 강 건너편이 시작되는 높이
const BANK_TOP = 660; // 강 건너 축대 윗면
const FAR_WATER = 674; // 강 건너편 물가
const DECK = 690; // 다리 상판 윗면
const PIER_BOTTOM = 770; // 다리 교각이 물에 닿는 곳
const BOAT_LINE = 772; // 유람선 물에 닿는 선

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w = PW, h = PH) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, c: cv.getContext('2d')! };
}

function glowDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, core = '#ffffff') {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, core);
  g.addColorStop(0.18, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

interface Light {
  x: number;
  y: number;
  r: number;
  color: string;
}

/** 다리 · 건물 배치는 바탕 · 조명 · 반사 그림이 함께 쓰도록 한 번만 정한다 */
function layout() {
  const r = rng(7);
  // 먼 스카이라인 (작고 흐릿함)
  const far: { x: number; w: number; h: number }[] = [];
  for (let x = 0; x < PW; ) {
    const w = 30 + r() * 60;
    far.push({ x, w, h: 40 + r() * 110 });
    x += w + r() * 6;
  }
  // 강 건너 아파트 단지 (동 번호가 있는 판상형 아파트)
  const apts: { x: number; w: number; h: number; no: number; tone: number }[] = [];
  let no = 101;
  for (let x = -20; x < PW + 20; ) {
    const w = 120 + r() * 90;
    apts.push({ x, w, h: 90 + r() * 120, no: no++, tone: r() });
    x += w + 24 + r() * 40;
  }
  // 다리: 교각 간격 260px, 아치 높이 90px
  const piers: number[] = [];
  for (let x = -100; x < PW + 300; x += 260) piers.push(x);
  return { far, apts, piers, r };
}

const L = layout();

/** 아치 위 한 점 (교각 a 와 다음 교각 사이, t 0~1) */
function archPoint(a: number, t: number): [number, number] {
  return [a + 260 * t, DECK - 4 - 90 * 4 * t * (1 - t)];
}

// ───────────── 바탕 그림 ─────────────

function paintBase(): HTMLCanvasElement {
  const { cv, c } = canvas();
  const r = rng(11);

  // 하늘: 위는 짙은 남색, 강 건너 도시 불빛에 물든 아래쪽은 보랏빛
  const sky = c.createLinearGradient(0, 0, 0, SKY_END);
  sky.addColorStop(0, '#040820');
  sky.addColorStop(0.45, '#101a4e');
  sky.addColorStop(0.8, '#2c2f6e');
  sky.addColorStop(1, '#4b3f80');
  c.fillStyle = sky;
  c.fillRect(0, 0, PW, SKY_END + 4);
  for (let i = 0; i < 220; i++) {
    c.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
    const s = r() < 0.1 ? 2 : 1.2;
    c.fillRect(r() * PW, r() * (SKY_END - 200), s, s);
  }
  // 달 (세로 화면에서 보인다)
  const moonX = 1560;
  const moonY = 300;
  glowDot(c, moonX, moonY, 160, 'rgba(200,210,255,0.35)', 'rgba(255,250,230,0.6)');
  c.fillStyle = '#fff6dc';
  c.beginPath();
  c.arc(moonX, moonY, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(220,210,180,0.5)';
  c.beginPath();
  c.arc(moonX - 10, moonY - 8, 7, 0, Math.PI * 2);
  c.arc(moonX + 12, moonY + 10, 5, 0, Math.PI * 2);
  c.fill();
  // 도시 불빛에 물든 지평선 안개
  const haze = c.createLinearGradient(0, SKY_END - 220, 0, SKY_END);
  haze.addColorStop(0, 'rgba(120,90,170,0)');
  haze.addColorStop(1, 'rgba(150,110,180,0.35)');
  c.fillStyle = haze;
  c.fillRect(0, SKY_END - 220, PW, 220);

  // 언덕과 전망탑 (왼쪽)
  c.fillStyle = '#121845';
  c.beginPath();
  c.moveTo(220, SKY_END);
  c.bezierCurveTo(420, 470, 700, 470, 920, SKY_END);
  c.closePath();
  c.fill();
  c.fillStyle = '#1a2258';
  c.fillRect(566, 330, 10, 180); // 탑 기둥
  c.fillRect(548, 380, 46, 22); // 전망대
  c.fillRect(569, 270, 4, 62); // 안테나

  // 먼 스카이라인
  c.fillStyle = '#18204e';
  for (const b of L.far) c.fillRect(b.x, SKY_END - b.h, b.w, b.h + 10);
  for (const b of L.far)
    for (let y = SKY_END - b.h + 8; y < SKY_END - 4; y += 9)
      for (let x = b.x + 5; x < b.x + b.w - 5; x += 8)
        if (r() < 0.22) {
          c.fillStyle = r() < 0.75 ? 'rgba(255,214,140,0.55)' : 'rgba(170,220,255,0.5)';
          c.fillRect(x, y, 2.5, 3);
        }

  // 강 건너 아파트 단지
  for (const a of L.apts) {
    const top = BANK_TOP - a.h;
    const face = c.createLinearGradient(0, top, 0, BANK_TOP);
    face.addColorStop(0, a.tone < 0.5 ? '#262d63' : '#2b2a5e');
    face.addColorStop(1, '#1a2050');
    c.fillStyle = face;
    c.fillRect(a.x, top, a.w, a.h);
    // 옥상 구조물
    c.fillStyle = '#1e2456';
    c.fillRect(a.x + a.w * 0.15, top - 10, a.w * 0.22, 10);
    c.fillRect(a.x + a.w * 0.6, top - 7, a.w * 0.18, 7);
    // 동 번호 (옥상 아래 벽에)
    c.fillStyle = 'rgba(230,236,255,0.75)';
    c.font = 'bold 15px "IBM Plex Sans KR", sans-serif';
    c.textAlign = 'center';
    c.fillText(`${a.no}`, a.x + a.w / 2, top + 18);
    // 창 (층마다 한 줄, 집마다 불 켜짐이 다르다)
    for (let y = top + 28; y < BANK_TOP - 6; y += 10)
      for (let x = a.x + 6; x < a.x + a.w - 8; x += 11) {
        const lit = r();
        c.fillStyle =
          lit < 0.28 ? `rgba(255,${196 + Math.floor(r() * 40)},140,0.78)` : lit < 0.34 ? 'rgba(180,225,255,0.7)' : 'rgba(38,46,96,0.95)';
        c.fillRect(x, y, 7, 5);
      }
    // 복도 쪽 세로 줄 (계단실)
    c.fillStyle = 'rgba(255,240,200,0.35)';
    c.fillRect(a.x + a.w * 0.5 - 2, top + 26, 4, a.h - 32);
  }

  // 강 건너 축대 · 강변 도로
  c.fillStyle = '#141a3e';
  c.fillRect(0, BANK_TOP, PW, FAR_WATER - BANK_TOP);
  c.fillStyle = '#232a58';
  c.fillRect(0, BANK_TOP, PW, 2);

  // 강물: 강 건너 불빛을 받아 위쪽이 밝고 가까울수록 어둡다
  const water = c.createLinearGradient(0, FAR_WATER, 0, PH);
  water.addColorStop(0, '#2d2e68');
  water.addColorStop(0.06, '#1c2256');
  water.addColorStop(0.18, '#111a48');
  water.addColorStop(0.5, '#0a1236');
  water.addColorStop(1, '#050a20');
  c.fillStyle = water;
  c.fillRect(0, FAR_WATER, PW, PH - FAR_WATER);
  // 잔물결 결 (가까울수록 굵고 성기게)
  for (let i = 0; i < 900; i++) {
    const t = r();
    const y = FAR_WATER + 4 + t * t * (PH - FAR_WATER);
    const len = 20 + t * 160 + r() * 60;
    c.fillStyle = `rgba(150,170,255,${0.03 + r() * 0.05})`;
    c.fillRect(r() * PW, y, len, 1 + t * 2.5);
  }
  // 아파트 · 강변 불빛의 은은한 반사 (강 건너편 물가)
  for (const a of L.apts) {
    const g = c.createLinearGradient(0, FAR_WATER, 0, FAR_WATER + 40);
    g.addColorStop(0, 'rgba(255,200,130,0.22)');
    g.addColorStop(1, 'rgba(255,200,130,0)');
    c.fillStyle = g;
    c.fillRect(a.x + 4, FAR_WATER, a.w - 8, 40);
  }

  // 다리 교각 (물에 닿는 쪽이 어둡다)
  for (const p of L.piers) {
    const g = c.createLinearGradient(0, DECK, 0, PIER_BOTTOM);
    g.addColorStop(0, '#2a3268');
    g.addColorStop(1, '#141a40');
    c.fillStyle = g;
    c.fillRect(p - 13, DECK + 10, 26, PIER_BOTTOM - DECK - 10);
    // 교각 반사
    const rg = c.createLinearGradient(0, PIER_BOTTOM, 0, PIER_BOTTOM + 50);
    rg.addColorStop(0, 'rgba(10,14,40,0.8)');
    rg.addColorStop(1, 'rgba(10,14,40,0)');
    c.fillStyle = rg;
    c.fillRect(p - 13, PIER_BOTTOM, 26, 50);
  }
  // 아치
  c.strokeStyle = '#3a4486';
  c.lineWidth = 7;
  for (const p of L.piers) {
    c.beginPath();
    for (let i = 0; i <= 24; i++) {
      const [x, y] = archPoint(p, i / 24);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // 아치와 상판을 잇는 행어
    c.strokeStyle = 'rgba(90,100,170,0.6)';
    c.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const [x, y] = archPoint(p, i / 10);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, DECK);
      c.stroke();
    }
    c.strokeStyle = '#3a4486';
    c.lineWidth = 7;
  }
  // 상판
  c.fillStyle = '#232b62';
  c.fillRect(0, DECK, PW, 14);
  c.fillStyle = '#3a4486';
  c.fillRect(0, DECK - 3, PW, 3);
  c.fillStyle = '#0f1438';
  c.fillRect(0, DECK + 14, PW, 4);

  return cv;
}

// ───────────── 조명 층 (검은 바탕에 빛만, 가산 혼합) ─────────────

function lights(): Light[] {
  const r = rng(23);
  const out: Light[] = [];
  // 다리 상판 금빛 등 · 아치 분홍 등 · 교각 조명
  for (let x = 6; x < PW; x += 15) out.push({ x, y: DECK - 6, r: 9, color: 'rgba(255,200,110,0.8)' });
  for (const p of L.piers) {
    for (let i = 1; i < 12; i++) {
      const [x, y] = archPoint(p, i / 12);
      out.push({ x, y, r: 8, color: 'rgba(255,120,200,0.75)' });
    }
    out.push({ x: p, y: DECK + 24, r: 18, color: 'rgba(170,210,255,0.35)' });
  }
  // 강 건너 강변 가로등
  for (let x = 10; x < PW; x += 38) out.push({ x: x + r() * 6, y: BANK_TOP - 6, r: 10, color: 'rgba(255,210,140,0.85)' });
  // 아파트 창 몇 개는 더 밝게
  for (const a of L.apts)
    for (let k = 0; k < 6; k++) out.push({ x: a.x + 10 + r() * (a.w - 20), y: BANK_TOP - 10 - r() * (a.h - 30), r: 6, color: 'rgba(255,220,150,0.55)' });
  // 전망탑 꼭대기 · 전망대
  out.push({ x: 571, y: 272, r: 18, color: 'rgba(255,70,60,0.9)' });
  out.push({ x: 571, y: 391, r: 30, color: 'rgba(255,200,120,0.6)' });
  return out;
}

function paintLights(ls: Light[]): HTMLCanvasElement {
  const { cv, c } = canvas();
  c.fillStyle = '#000';
  c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'lighter';
  for (const l of ls) glowDot(c, l.x, l.y, l.r, l.color);
  // 강변 도로 자동차 불빛 (빨강 미등 · 흰 전조등 줄)
  for (let x = 0; x < PW; x += 6 + (x % 13)) {
    c.fillStyle = 'rgba(255,60,50,0.8)';
    c.fillRect(x, BANK_TOP + 4, 4, 2);
    c.fillStyle = 'rgba(255,250,230,0.8)';
    c.fillRect(x + 3, BANK_TOP + 9, 4, 2);
  }
  return cv;
}

// ───────────── 반사 마스크 (물결 셰이더가 일렁이게 할 자리) ─────────────

function paintReflections(): HTMLCanvasElement {
  const { cv, c } = canvas();
  c.fillStyle = '#000';
  c.fillRect(0, 0, PW, PH);
  c.globalCompositeOperation = 'lighter';
  const column = (x: number, top: number, bottom: number, w: number, rgb: string, a: number) => {
    const g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    // 가운데가 진하고 옆으로 퍼지는 기둥
    c.fillRect(x - w / 2, top, w, bottom - top);
    c.fillRect(x - w, top, w * 2, (bottom - top) * 0.6);
  };
  // 다리 금빛 등 → 다리 아래 강물에 긴 기둥
  for (let x = 6; x < PW; x += 15) column(x, DECK + 20, 880 + (x % 7) * 12, 5, '255,190,100', 0.4);
  // 아치 분홍 등
  for (const p of L.piers) column(p + 130, DECK + 20, 860, 30, '255,110,190', 0.35);
  // 교각 조명
  for (const p of L.piers) column(p, PIER_BOTTOM, 880, 22, '170,210,255', 0.3);
  // 강 건너 불빛 (다리 위쪽 좁은 물)
  for (const a of L.apts) column(a.x + a.w / 2, FAR_WATER, DECK, a.w * 0.6, '255,210,140', 0.4);
  // 달빛 길 (세로 화면에서 보임)
  column(1560, FAR_WATER, 1400, 70, '200,215,255', 0.45);
  return cv;
}

// ───────────── 유람선 ─────────────

function paintBoat(): HTMLCanvasElement {
  const { cv, c } = canvas(512, 220);
  // 선체
  c.fillStyle = '#e9edff';
  c.beginPath();
  c.moveTo(20, 120);
  c.lineTo(492, 120);
  c.lineTo(462, 150);
  c.lineTo(52, 150);
  c.closePath();
  c.fill();
  c.fillStyle = '#c3c9e8';
  c.fillRect(52, 142, 410, 8);
  // 선실 두 층
  c.fillStyle = '#f6f3ff';
  c.fillRect(70, 78, 360, 42);
  c.fillRect(130, 48, 230, 30);
  // 창 불빛
  for (let x = 82; x < 420; x += 26) {
    c.fillStyle = '#ffd98a';
    c.fillRect(x, 88, 18, 16);
  }
  for (let x = 142; x < 352; x += 26) {
    c.fillStyle = '#ffe9b0';
    c.fillRect(x, 56, 18, 14);
  }
  // 지붕 장식등
  for (let x = 74; x < 430; x += 16) glowDot(c, x, 76, 7, 'rgba(255,130,210,0.9)');
  for (let x = 134; x < 360; x += 16) glowDot(c, x, 46, 6, 'rgba(255,200,120,0.9)');
  // 물에 비친 배 (뒤집혀 흐릿하게)
  const g = c.createLinearGradient(0, 152, 0, 220);
  g.addColorStop(0, 'rgba(255,210,140,0.45)');
  g.addColorStop(1, 'rgba(255,210,140,0)');
  c.fillStyle = g;
  for (let y = 154; y < 220; y += 5) c.fillRect(60 + ((y * 7) % 23), y, 380 - ((y * 5) % 40), 2);
  return cv;
}

const rippleShader = {
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tMask; uniform float uTime; uniform float uGain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 m = texture2D(tMask, vUv).rgb;
      if (m.r + m.g + m.b < 0.003) discard;
      vec2 px = vec2(vUv.x * ${PW}.0, (1.0 - vUv.y) * ${PH}.0);
      // 가까울수록(아래로 갈수록) 물결이 굵고 느리다
      float near = clamp((px.y - ${FAR_WATER}.0) / 500.0, 0.0, 1.0);
      float freq = mix(0.9, 0.22, near);
      float band = sin(px.y * freq + sin(px.x * 0.018 + uTime * 0.6) * 2.5 - uTime * 2.2);
      float cell = hash(floor(vec2(px.x / mix(6.0, 22.0, near), px.y * freq / 3.14159)));
      float lit = smoothstep(0.35, 1.0, band) * step(0.3, cell);
      gl_FragColor = vec4(m * lit * uGain, 1.0);
    }`,
};

export interface RiverBackdrop {
  tick: (t: number, dt: number) => void;
}

/** 그림판 · 조명 · 물결 · 유람선을 parent 에 붙인다 */
export function buildRiverBackdrop(parent: THREE.Object3D): RiverBackdrop {
  const f = LOOK.clone().sub(CAM).normalize();
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, f).normalize();
  const W = 2 * D * TX;
  const H = 2 * D * TY;

  const group = new THREE.Group();
  group.position.copy(CAM).addScaledVector(f, D);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, f.clone().negate()));
  parent.add(group);

  const tex = (cv: HTMLCanvasElement, srgb = true) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const geo = new THREE.PlaneGeometry(W, H);

  // 1) 바탕 그림
  const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex(paintBase()), fog: false }));
  base.renderOrder = -10;
  base.userData.noShadow = true;

  // 2) 조명: 가산 · HDR (블룸이 걸리게), 전체가 아주 살짝 일렁인다
  const lightMat = new THREE.MeshBasicMaterial({
    map: tex(paintLights(lights())),
    color: new THREE.Color(1.4, 1.4, 1.4),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const lightLayer = new THREE.Mesh(geo, lightMat);
  lightLayer.position.z = 0.01;
  lightLayer.renderOrder = -9;
  lightLayer.userData.noShadow = true;

  // 3) 물결 반사: 반사 마스크에 흐르는 물결 무늬를 씌운다
  const rippleMat = new THREE.ShaderMaterial({
    uniforms: { tMask: { value: tex(paintReflections()) }, uTime: { value: 0 }, uGain: { value: 1.0 } },
    vertexShader: rippleShader.vertexShader,
    fragmentShader: rippleShader.fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const ripple = new THREE.Mesh(geo, rippleMat);
  ripple.position.z = 0.02;
  ripple.renderOrder = -8;
  ripple.userData.noShadow = true;

  // 4) 유람선 (그림판 위를 천천히 가로지른다)
  const boatW = (260 / PW) * W;
  const boatH = boatW * (220 / 512);
  const boat = new THREE.Mesh(
    new THREE.PlaneGeometry(boatW, boatH),
    new THREE.MeshBasicMaterial({ map: tex(paintBoat()), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(0.9, 0.9, 0.95) }),
  );
  boat.renderOrder = -7;
  boat.userData.noShadow = true;
  // 텍스처의 물에 닿는 선(150/220)이 BOAT_LINE 에 오도록
  const lineY = (0.5 - BOAT_LINE / PH) * H;
  boat.position.set(-W / 2, lineY + boatH * (0.5 - 150 / 220), 0.03);

  group.add(base, lightLayer, ripple, boat);

  const span = W * 0.7;
  const tick = (t: number, dt: number) => {
    rippleMat.uniforms.uTime.value = t;
    const tw = 1.35 + 0.1 * Math.sin(t * 1.3) + 0.05 * Math.sin(t * 3.7);
    lightMat.color.setRGB(tw, tw, tw);
    boat.position.x += dt * 0.55;
    if (boat.position.x > span / 2) boat.position.x = -span / 2;
  };
  boat.position.x = -span * 0.1;
  return { tick };
}
