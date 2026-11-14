import * as THREE from 'three';
import { toonMat } from './look';
import { faceGeometry, faceTexture, type Mood } from './faces';

/*
 * 트럭 바깥 풍경: 밤 먹자골목.
 *
 * 카메라는 웍을 내려다보기 때문에 창 너머로 보이는 범위가 좁다.
 *   - 아래: 서빙 선반에 가려 z -4.3 보다 가까운 땅은 안 보인다
 *   - 위: 차양 전구 줄에 가려 10m 앞에서 높이 2.5m 위는 안 보인다 (하늘 · 건물 위층 · 높은 간판은 화면 밖)
 * 그래서 풍경을 '땅에서 2.5m 까지의 띠' 안에 짠다: 가게 1층을 9.4m 앞까지 당기고,
 * 그 앞에 포장마차 천막 · 플라스틱 식탁 · 입간판 · 지나가는 사람을 겹겹이 두고,
 * 띠의 아래 절반을 차지하는 바닥은 젖은 길에 비친 가게 불빛으로 채운다.
 */

const G = -0.25; // 땅 높이
const SHOP_Z = -9.4; // 길 건너 가게 앞면
const FONT = '"Black Han Sans", "IBM Plex Sans KR", sans-serif';

/** 씨앗 고정 난수: 글꼴이 늦게 로드되어 다시 그려도 같은 그림이 나온다 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;
const repaint: (() => void)[] = [];

function paint(w: number, h: number, draw: (c: Ctx, w: number, h: number) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  // save/restore: 그리기 함수가 바꾼 합성 방식 · 그림자가 다시 그릴 때 남아 있으면 안 된다
  c.save();
  draw(c, w, h);
  c.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  repaint.push(() => {
    c.clearRect(0, 0, w, h);
    c.save();
    draw(c, w, h);
    c.restore();
    tex.needsUpdate = true;
  });
  return tex;
}

/** 스스로 빛나는(조명을 안 받는) 그림 재질. gain > 1 이면 밝은 곳이 번진다 */
const glowMat = (map: THREE.Texture | null, gain = 1, color = 0xffffff) =>
  new THREE.MeshBasicMaterial({ map, color: new THREE.Color(color).multiplyScalar(gain) });

function add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number) {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

// ───────────────────────── 가게 앞면 ─────────────────────────

interface Shop {
  name: string;
  w: number;
  wall: string;
  /** 간판 바탕 · 글자 */
  sign: string;
  ink: string;
  /** 가게 안 불빛 */
  glow: string;
  kind: 'diner' | 'mart' | 'bar';
  awning?: string;
  /** 돌출 간판 글자 */
  side?: string;
}

const SHOPS: (Shop | { alley: number })[] = [
  { name: '사진관', w: 3.4, wall: '#3a3448', sign: '#f4ead8', ink: '#3a2a4a', glow: '#ffe6c0', kind: 'mart' },
  { name: '호프', w: 3.6, wall: '#4a3328', sign: '#2a1a12', ink: '#ffb347', glow: '#ffb060', kind: 'bar', side: '맥주' },
  { name: '분식', w: 3.8, wall: '#5a3a36', sign: '#ffd23f', ink: '#c8321e', glow: '#ffd9a0', kind: 'diner', awning: '#d2452f' },
  { name: '만화방', w: 3.0, wall: '#2f3d54', sign: '#1b2233', ink: '#7de0ff', glow: '#bfe4ff', kind: 'mart', side: '만화' },
  { alley: 2.3 },
  { name: '국밥', w: 3.9, wall: '#4a4036', sign: '#f6efe0', ink: '#7a1f14', glow: '#ffcf8a', kind: 'diner', side: '24시' },
  { name: '편의점', w: 4.2, wall: '#39424e', sign: '#2f9e6a', ink: '#ffffff', glow: '#e8f6ff', kind: 'mart' },
  { name: '치킨', w: 3.6, wall: '#56392a', sign: '#ff8a2a', ink: '#3a1408', glow: '#ffc070', kind: 'bar', awning: '#f0b23a', side: '치맥' },
  { name: '노래방', w: 3.4, wall: '#3a2f4e', sign: '#1a1024', ink: '#ff5fb0', glow: '#e9a0ff', kind: 'bar' },
  { name: '약국', w: 3.2, wall: '#36463f', sign: '#f2f6f0', ink: '#1f8a4c', glow: '#eaffea', kind: 'mart' },
];

const PX = 128; // 1m = 128px
const FH = 3.0; // 앞면 높이 (m)

function drawShop(c: Ctx, s: Shop, seed: number) {
  const r = rng(seed);
  const W = s.w * PX;
  const H = FH * PX;
  const y = (m: number) => H - m * PX; // 땅에서 m 미터 높이의 픽셀
  // 벽: 밤이라 위로 갈수록 어둡다
  c.fillStyle = s.wall;
  c.fillRect(0, 0, W, H);
  const dim = c.createLinearGradient(0, 0, 0, H);
  dim.addColorStop(0, 'rgba(8,8,24,0.72)');
  dim.addColorStop(0.45, 'rgba(8,8,24,0.42)');
  dim.addColorStop(1, 'rgba(8,8,24,0.5)');
  c.fillStyle = dim;
  c.fillRect(0, 0, W, H);
  // 벽돌 · 타일 줄눈
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let yy = 0; yy < H; yy += 16) c.fillRect(0, yy, W, 1.5);
  // 건물 사이 기둥
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, 0, 7, H);
  c.fillRect(W - 7, 0, 7, H);

  // 창과 문
  const doorW = 0.95 * PX;
  const doorLeft = r() < 0.5;
  const m = 26;
  const dx = doorLeft ? m : W - m - doorW;
  const wx = doorLeft ? m + doorW + 14 : m;
  const ww = W - 2 * m - doorW - 14;
  const wTop = y(1.68);
  const wBot = y(s.kind === 'mart' ? 0.28 : 0.62);
  const dTop = y(1.7);

  const inside = (x: number, top: number, w: number, bot: number) => {
    const g = c.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, s.glow);
    g.addColorStop(1, s.glow);
    c.fillStyle = g;
    c.fillRect(x, top, w, bot - top);
    // 안쪽 깊이감: 위 · 가장자리가 살짝 어둡다
    const v = c.createLinearGradient(0, top, 0, bot);
    v.addColorStop(0, 'rgba(60,30,10,0.34)');
    v.addColorStop(0.3, 'rgba(60,30,10,0)');
    v.addColorStop(1, 'rgba(60,30,10,0.26)');
    c.fillStyle = v;
    c.fillRect(x, top, w, bot - top);
  };
  inside(wx, wTop, ww, wBot);
  inside(dx, dTop, doorW, y(0.02));

  c.save();
  c.beginPath();
  c.rect(wx, wTop, ww, wBot - wTop);
  c.clip();
  if (s.kind === 'mart') {
    // 진열대: 선반마다 알록달록한 물건
    const cols = ['#e2503c', '#f0b23a', '#3b82c4', '#4caf7a', '#f08fb0', '#ffffff', '#8e62c9'];
    for (let row = 0; row < 4; row++) {
      const sy = wTop + 34 + row * 44;
      c.fillStyle = 'rgba(70,60,70,0.55)';
      c.fillRect(wx, sy + 26, ww, 5);
      for (let x = wx + 6; x < wx + ww - 10; ) {
        const bw = 8 + r() * 12;
        const bh = 14 + r() * 12;
        c.fillStyle = cols[Math.floor(r() * cols.length)];
        c.globalAlpha = 0.8;
        c.fillRect(x, sy + 26 - bh, bw, bh);
        c.globalAlpha = 1;
        x += bw + 2 + r() * 5;
      }
    }
  } else {
    // 식당 · 술집: 식탁에 앉은 사람 그림자, 걸린 등
    const n = Math.max(2, Math.round(ww / 96));
    for (let i = 0; i < n; i++) {
      const px = wx + ((i + 0.5) / n) * ww + (r() - 0.5) * 22;
      const base = wBot + 4;
      const hh = 78 + r() * 22;
      c.fillStyle = s.kind === 'bar' ? 'rgba(44,22,22,0.82)' : 'rgba(58,34,26,0.74)';
      rr(c, px - 24, base - hh + 26, 48, hh, 20);
      c.fill();
      c.beginPath();
      c.arc(px + (r() - 0.5) * 8, base - hh + 12, 16, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < n; i++) {
      const lx = wx + ((i + 0.5) / n) * ww;
      c.strokeStyle = 'rgba(50,30,20,0.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(lx, wTop);
      c.lineTo(lx, wTop + 22);
      c.stroke();
      c.fillStyle = '#fff8e0';
      c.beginPath();
      c.arc(lx, wTop + 28, 8, 0, Math.PI * 2);
      c.fill();
    }
    if (s.kind === 'diner') {
      // 창에 붙인 차림표 종이
      for (let i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(255,250,235,0.9)';
        c.fillRect(wx + 14 + i * 34, wTop + 48, 26, 58);
        c.fillStyle = 'rgba(180,50,30,0.8)';
        for (let k = 0; k < 4; k++) c.fillRect(wx + 19 + i * 34, wTop + 56 + k * 12, 16, 4);
      }
    }
  }
  c.restore();

  // 창틀 · 문틀
  c.strokeStyle = '#17131c';
  c.lineWidth = 7;
  c.strokeRect(wx, wTop, ww, wBot - wTop);
  c.strokeRect(dx, dTop, doorW, y(0.02) - dTop);
  c.lineWidth = 4;
  const panes = Math.max(2, Math.round(ww / 150));
  for (let i = 1; i < panes; i++) {
    c.beginPath();
    c.moveTo(wx + (i / panes) * ww, wTop);
    c.lineTo(wx + (i / panes) * ww, wBot);
    c.stroke();
  }
  // 문 손잡이, 문에 붙은 '영업중'
  c.fillStyle = '#17131c';
  c.fillRect(doorLeft ? dx + doorW - 20 : dx + 12, y(1.05), 8, 44);
  c.fillStyle = 'rgba(210,60,40,0.9)';
  rr(c, dx + doorW / 2 - 30, y(1.52), 60, 26, 4);
  c.fill();
  c.fillStyle = '#fff6e0';
  c.font = `18px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('영업중', dx + doorW / 2, y(1.52) + 14);

  // 간판: 안에서 불이 들어오는 상자 간판
  const sTop = y(2.36);
  const sH = 0.56 * PX;
  c.shadowColor = s.sign === '#1a1024' || s.sign === '#1b2233' || s.sign === '#2a1a12' ? s.ink : s.sign;
  c.shadowBlur = 18;
  c.fillStyle = s.sign;
  rr(c, 16, sTop, W - 32, sH, 8);
  c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 3;
  rr(c, 16, sTop, W - 32, sH, 8);
  c.stroke();
  c.fillStyle = s.ink;
  c.shadowColor = s.ink;
  c.shadowBlur = 14;
  c.font = `56px ${FONT}`;
  c.fillText(s.name, W / 2, sTop + sH / 2 + 4);
  c.shadowBlur = 0;
  // 간판 아래 벽에 번지는 불빛
  const spill = c.createLinearGradient(0, sTop + sH, 0, sTop + sH + 40);
  spill.addColorStop(0, 'rgba(255,230,190,0.2)');
  spill.addColorStop(1, 'rgba(255,230,190,0)');
  c.fillStyle = spill;
  c.fillRect(16, sTop + sH, W - 32, 40);
}

/** 위층: 대부분 화면 밖. 불 켜진 창 몇 개만 */
function upperTex(seed: number) {
  return paint(128, 256, (c) => {
    const r = rng(seed);
    c.fillStyle = '#1b1a2c';
    c.fillRect(0, 0, 128, 256);
    for (let yy = 0; yy < 8; yy++)
      for (let x = 0; x < 4; x++) {
        const on = r() < 0.3;
        c.fillStyle = on ? (r() < 0.3 ? '#bcd8ff' : '#ffd08a') : '#262a42';
        c.fillRect(10 + x * 30, 10 + yy * 31, 20, 19);
      }
  });
}

// ───────────────────────── 사람 ─────────────────────────

const SKIN = [0xf6d2b0, 0xe8b88f, 0xc98f62, 0xfbe0c8];
const SHIRT = [0x3b82c4, 0xd9534f, 0x4caf7a, 0xf0b23a, 0x8e62c9, 0xf08fb0, 0xf2efe6, 0x4a5a78];
const HAIR = [0x1d1a18, 0x3a2a1c, 0x6b4a2b, 0x55555c];

/** 손님과 같은 생김새의 간단한 사람 (서 있거나 앉아 있거나) */
function person(r: () => number, mood: Mood, seated = false) {
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRT), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: pick(HAIR), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick([0x33384a, 0x2a2d3a, 0x4a4238, 0x3a4a5c]), roughness: 0.9 });
  const up = new THREE.Group(); // 윗몸 (앉으면 낮아진다)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 16), shirt);
  body.position.y = 1.05;
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 14), skin);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
  cap.rotation.x = -0.35;
  const face = new THREE.Mesh(faceGeometry(0.155), toonMat(0xffffff, { map: faceTexture(mood), alphaTest: 0.5 }));
  head.add(skull, cap, face);
  head.position.y = 1.56;
  head.scale.setScalar(1.18);
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.34, 4, 10).translate(0, -0.2, 0);
  const armL = add(up, new THREE.Mesh(armGeo, shirt), -0.26, 1.28, 0);
  const armR = add(up, new THREE.Mesh(armGeo, shirt), 0.26, 1.28, 0);
  armL.rotation.z = -0.12;
  armR.rotation.z = 0.12;
  up.add(body, head);
  g.add(up);
  if (seated) {
    // 등받이 없는 의자에 앉아 식탁 쪽으로 팔을 올린다
    up.position.y = -0.4;
    const lap = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.26, 4, 10), pants);
    lap.rotation.x = Math.PI / 2;
    lap.position.set(0, 0.5, 0.2);
    g.add(lap);
    armL.rotation.x = armR.rotation.x = -1.1;
  } else {
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.75, 14), pants);
    legs.position.y = 0.375;
    g.add(legs);
  }
  g.scale.setScalar(0.94 + r() * 0.1);
  return { g, up, head, armL, armR };
}

// ───────────────────────── 거리 ─────────────────────────

export interface Street {
  tick: (t: number) => void;
  /** 그림자 범위 밖이라 그림자를 드리우지 않는 큰 바닥 */
  ground: THREE.Mesh;
}

export function buildStreet(
  parent: THREE.Object3D,
  groundMat: THREE.Material,
  walkMat: THREE.Material,
): Street {
  const st = new THREE.Group();
  parent.add(st);
  const r = rng(20240611);

  // ── 바닥 ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  add(st, ground, 0, G, -28);
  // 트럭 쪽 보도 (선반에 가려 거의 안 보인다)
  add(st, new THREE.Mesh(new THREE.BoxGeometry(80, 0.06, 3.2), walkMat), 0, G + 0.02, -2.7);
  // 가게 앞 턱
  add(st, new THREE.Mesh(new THREE.BoxGeometry(80, 0.05, 1.0), walkMat), 0, G + 0.02, SHOP_Z + 0.5);

  // 젖은 길에 비친 불빛: 가게에서 카메라 쪽으로 길게 늘어지고, 가로로 잘게 끊긴다
  const streakTex = paint(64, 256, (c, w, h) => {
    const q = rng(7);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // 양옆은 부드럽게 사라진다
    c.globalCompositeOperation = 'destination-in';
    const e = c.createLinearGradient(0, 0, w, 0);
    e.addColorStop(0, 'rgba(0,0,0,0)');
    e.addColorStop(0.3, 'rgba(0,0,0,1)');
    e.addColorStop(0.7, 'rgba(0,0,0,1)');
    e.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = e;
    c.fillRect(0, 0, w, h);
    // 물결에 끊긴 자리
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 46; i++) {
      c.fillStyle = `rgba(0,0,0,${0.25 + q() * 0.6})`;
      c.fillRect(q() * w - 12, q() * h, 14 + q() * 40, 1 + q() * 3.5);
    }
  });
  const streaks: { m: THREE.MeshBasicMaterial; ph: number }[] = [];
  const streak = (x: number, z0: number, w: number, len: number, color: string, k = 0.5) => {
    const m = new THREE.MeshBasicMaterial({
      map: streakTex,
      color: new THREE.Color(color).multiplyScalar(k),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, len), m);
    p.rotation.x = -Math.PI / 2; // 그림 위쪽(밝은 쪽)이 -z = 가게 쪽
    p.renderOrder = 1;
    add(st, p, x, G + 0.06, z0 + len / 2);
    streaks.push({ m, ph: r() * 10 });
    return p;
  };
  // 둥근 불빛 웅덩이 (가로등 · 천막 아래)
  const poolTex = paint(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const pool = (x: number, z: number, rx: number, rz: number, color: number, k: number) => {
    const m = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: new THREE.Color(color).multiplyScalar(k),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), m);
    p.rotation.x = -Math.PI / 2;
    p.renderOrder = 1;
    return add(st, p, x, G + 0.065, z);
  };

  // ── 길 건너 가게들 ──
  const bodyM = glowMat(null, 1, 0x15131f);
  const uppers = [upperTex(11), upperTex(23), upperTex(37)];
  const total = SHOPS.reduce((a, s) => a + ('alley' in s ? s.alley : s.w), 0);
  // 골목 입구가 화면 왼쪽(x -2 근처)에 오도록 줄 전체를 민다
  let x = -total / 2 + 0.35;
  let alleyX = 0;
  let alleyW = 0;
  let flicker: THREE.MeshBasicMaterial | null = null;
  SHOPS.forEach((s, i) => {
    if ('alley' in s) {
      alleyX = x + s.alley / 2;
      alleyW = s.alley;
      x += s.alley;
      return;
    }
    const cx = x + s.w / 2;
    // 몸체 (골목에서 옆면이 보인다)
    add(st, new THREE.Mesh(new THREE.BoxGeometry(s.w, FH, 6), bodyM), cx, G + FH / 2, SHOP_Z - 3);
    const front = glowMat(paint(Math.round(s.w * PX), FH * PX, (c) => drawShop(c, s, 100 + i * 17)), 0.82);
    add(st, new THREE.Mesh(new THREE.PlaneGeometry(s.w, FH), front), cx, G + FH / 2, SHOP_Z + 0.01);
    if (s.name === '노래방') flicker = front;
    // 위층
    const uh = 3 + r() * 5;
    const ut = uppers[i % uppers.length].clone();
    ut.repeat.set(Math.max(1, Math.round(s.w / 2.2)), Math.max(1, Math.round(uh / 4)));
    ut.wrapS = ut.wrapT = THREE.RepeatWrapping;
    add(st, new THREE.Mesh(new THREE.BoxGeometry(s.w, uh, 6), glowMat(ut, 0.9)), cx, G + FH + uh / 2, SHOP_Z - 3);
    // 차양
    if (s.awning) {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.5, 0.04, 0.8), glowMat(null, 0.55, new THREE.Color(s.awning).getHex()));
      aw.rotation.x = 0.35;
      add(st, aw, cx, G + 1.74, SHOP_Z + 0.4);
    }
    // 돌출 간판: 벽에서 길 쪽으로 튀어나온 세로 간판
    if (s.side) {
      const txt = s.side;
      const tex = paint(96, 224, (c, w, h) => {
        c.fillStyle = s.sign;
        c.fillRect(0, 0, w, h);
        c.strokeStyle = s.ink;
        c.lineWidth = 6;
        c.strokeRect(6, 6, w - 12, h - 12);
        c.fillStyle = s.ink;
        c.shadowColor = s.ink;
        c.shadowBlur = 10;
        c.font = `54px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        [...txt].forEach((ch, k) => c.fillText(ch, w / 2, h / 2 + (k - (txt.length - 1) / 2) * 62 + 3));
      });
      const side = glowMat(tex, 0.95);
      const edge = glowMat(null, 1, 0x17131c);
      const sg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.98, 0.42), [side, side, edge, edge, edge, edge]);
      add(st, sg, x + 0.12, G + 1.5, SHOP_Z + 0.36);
    }
    // 창 불빛이 젖은 길에 비친다
    streak(cx, SHOP_Z + 0.15, s.w * 0.72, 4.4, s.glow, 0.7);
    x += s.w;
  });

  // ── 골목: 가게 사이로 깊숙이 이어지는 먹자골목 ──
  {
    const far = paint(512, 384, (c, w, h) => {
      const q = rng(99);
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#141a3c');
      sky.addColorStop(1, '#3a2848');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      // 겹겹이 선 건물과 창 불빛
      for (let layer = 0; layer < 3; layer++) {
        for (let bx = -20; bx < w; ) {
          const bw = 50 + q() * 70;
          const bh = 150 + q() * 170 - layer * 50;
          c.fillStyle = ['#1a1d3a', '#221c38', '#2a1e36'][layer];
          c.fillRect(bx, h - bh, bw, bh);
          for (let wy = h - bh + 10; wy < h - 30; wy += 16)
            for (let wx = bx + 6; wx < bx + bw - 10; wx += 14)
              if (q() < 0.3) {
                c.fillStyle = q() < 0.25 ? '#a8ccff' : q() < 0.5 ? '#ffb070' : '#ffd890';
                c.fillRect(wx, wy, 7, 8);
              }
          bx += bw + q() * 8;
        }
      }
      // 멀리 번지는 간판 불빛
      for (let i = 0; i < 16; i++) {
        const col = ['255,90,160', '90,210,255', '255,190,80', '255,120,60', '170,255,150'][Math.floor(q() * 5)];
        const gx = q() * w;
        const gy = h - 30 - q() * 150;
        const gr = 16 + q() * 30;
        const g = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, `rgba(${col},0.9)`);
        g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g;
        c.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }
      const haze = c.createLinearGradient(0, h * 0.5, 0, h);
      haze.addColorStop(0, 'rgba(255,170,110,0)');
      haze.addColorStop(1, 'rgba(255,170,110,0.4)');
      c.fillStyle = haze;
      c.fillRect(0, 0, w, h);
    });
    add(st, new THREE.Mesh(new THREE.PlaneGeometry(9, 6.75), glowMat(far, 1.5)), alleyX, G + 2.2, SHOP_Z - 7.5);
    // 골목 양쪽 벽에 붙은 작은 간판들
    const cols = [0xff5fa0, 0x46d6ff, 0xffc04a, 0x7dff9a, 0xff8a3a, 0xc79bff];
    for (let i = 0; i < 6; i++) {
      const left = i % 2 === 0;
      const z = SHOP_Z - 0.9 - i * 1.05;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34 + r() * 0.3, 0.5 + r() * 0.3), glowMat(null, 1.1, cols[i]));
      add(st, m, alleyX + (left ? -1 : 1) * (alleyW / 2 - 0.05), G + 1.2 + r() * 0.9, z);
    }
    // 골목 위를 가로지르는 등 줄 (멀어질수록 화면에서 내려와 겹쳐 보인다)
    const bulbGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const warm = glowMat(null, 1, 0xffffff);
    warm.color.setRGB(2.2, 1.5, 0.7);
    const red = glowMat(null, 1, 0xffffff);
    red.color.setRGB(2.2, 0.5, 0.4);
    for (let row = 0; row < 5; row++) {
      const z = SHOP_Z - 0.4 - row * 1.5;
      for (let k = 0; k < 5; k++) {
        const u = (k + 0.5) / 5;
        const b = new THREE.Mesh(bulbGeo, (k + row) % 2 ? warm : red);
        add(st, b, alleyX + (u - 0.5) * alleyW, G + 2.1 - Math.sin(u * Math.PI) * 0.16, z);
      }
    }
    pool(alleyX, SHOP_Z - 3, alleyW * 0.7, 4, 0xffa060, 0.5);
    streak(alleyX, SHOP_Z - 0.4, alleyW * 0.8, 4.6, '#ffb070', 0.7);
  }

  // ── 포장마차 천막 (길 한가운데 왼쪽) ──
  const tentTex = (front: boolean) =>
    paint(512, 256, (c, w, h) => {
      const q = rng(front ? 5 : 6);
      // 주황 비닐 천막: 안의 전구 때문에 가운데가 밝다
      for (let i = 0; i < 16; i++) {
        c.fillStyle = i % 2 ? '#ff9a3a' : '#f26a22';
        c.fillRect(i * 32, 0, 32, h);
      }
      const glow = c.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, w * 0.55);
      glow.addColorStop(0, 'rgba(255,236,170,0.95)');
      glow.addColorStop(0.45, 'rgba(255,190,100,0.45)');
      glow.addColorStop(1, 'rgba(120,30,10,0.55)');
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      // 천막에 비친 사람 그림자
      const n = front ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const px = ((i + 0.5) / n) * w + (q() - 0.5) * 40;
        const hh = 120 + q() * 30;
        c.fillStyle = 'rgba(110,40,14,0.5)';
        rr(c, px - 34, h - hh + 30, 68, hh, 28);
        c.fill();
        c.beginPath();
        c.arc(px + (q() - 0.5) * 10, h - hh + 12, 23, 0, Math.PI * 2);
        c.fill();
      }
      if (front) {
        c.fillStyle = '#fff3d0';
        c.shadowColor = '#fff3d0';
        c.shadowBlur = 8;
        c.font = `46px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('우동 · 오뎅 · 소주', w / 2, 62);
        c.shadowBlur = 0;
      }
      // 아랫단 · 지퍼 선
      c.fillStyle = 'rgba(90,24,8,0.55)';
      c.fillRect(0, h - 14, w, 14);
      c.fillRect(w / 2 - 2, 96, 4, h);
    });
  const tent = new THREE.Group();
  add(st, tent, -5.0, G, -6.3);
  const tFront = glowMat(tentTex(true), 0.8);
  const tSide = glowMat(tentTex(false), 0.62);
  const tRoof = glowMat(null, 0.32, 0xe0601c);
  add(tent, new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.85, 2.2), [tSide, tSide, tRoof, tRoof, tFront, tFront]), 0, 0.925, 0);
  // 지붕: 낮은 맞배
  for (const s of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.04, 1.25), tRoof);
    roof.rotation.x = s * 0.22;
    add(tent, roof, 0, 1.98, s * 0.58);
  }
  pool(-5.0, -5.0, 2.8, 1.5, 0xff9a40, 0.45);
  streak(-5.0, -5.15, 2.9, 1.0, '#ffa850', 0.6).rotation.z = Math.PI; // 천막 앞: 밝은 쪽이 천막 쪽
  // 천막 연통에서 오르는 김
  const puffTex = paint(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: puffTex, color: 0xffd9b0, transparent: true, opacity: 0, depthWrite: false }),
    );
    st.add(s);
    puffs.push(s);
  }

  // ── 플라스틱 식탁과 손님들 (오른쪽) ──
  const tableM = new THREE.MeshStandardMaterial({ color: 0xd9382c, roughness: 0.6 });
  const stoolM = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.6 });
  const legM = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.5 });
  const bottleM = new THREE.MeshStandardMaterial({ color: 0x3fae62, roughness: 0.3 });
  const bowlM = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.5 });
  const diners: { up: THREE.Group; head: THREE.Group; armR: THREE.Mesh; ph: number }[] = [];
  const tableSet = (tx: number, tz: number, seats: [number, Mood][]) => {
    const g = new THREE.Group();
    add(st, g, tx, G, tz);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.035, 28), tableM), 0, 0.7, 0);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), legM), 0, 0.35, 0);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 10), bottleM), 0.1, 0.82, -0.08);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 10), bottleM), -0.02, 0.82, -0.2);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.07, 18), bowlM), -0.14, 0.755, 0.12);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.06, 18), bowlM), 0.2, 0.75, 0.16);
    for (const [a, mood] of seats) {
      const sx = Math.sin(a) * 0.78;
      const sz = Math.cos(a) * 0.78;
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.42, 14), stoolM), sx, 0.21, sz);
      const p = person(r, mood, true);
      p.g.rotation.y = a + Math.PI; // 식탁을 바라본다
      add(g, p.g, sx, 0, sz);
      diners.push({ up: p.up, head: p.head, armR: p.armR, ph: r() * 10 });
    }
    // 빈 의자
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.42, 14), stoolM), 0.95, 0.21, 0.5);
  };
  // 카메라 쪽 자리는 비워 얼굴이 보이게 한다
  tableSet(3.7, -6.1, [[Math.PI * 0.72, 'happy'], [-Math.PI * 0.62, 'delight'], [Math.PI * 1.02, 'neutral']]);
  tableSet(6.3, -5.4, [[Math.PI * 0.8, 'wow'], [-Math.PI * 0.75, 'happy']]);

  // 낮은 가로등: 등이 창 띠 안에 들어오게 2m 높이
  const poleM = new THREE.MeshStandardMaterial({ color: 0x23252c, roughness: 0.6, metalness: 0.5 });
  const lampM = glowMat(null, 1);
  lampM.color.setRGB(2.2, 1.7, 1.0);
  for (const [lx, lz] of [[4.9, -6.9], [-3.05, -8.6]] as const) {
    add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.0, 10), poleM), lx, G + 1.0, lz);
    add(st, new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), lampM), lx, G + 2.08, lz);
    const light = new THREE.PointLight(0xffc98a, 1.0, 7, 1.5);
    add(st, light, lx, G + 2.3, lz + 0.3);
    pool(lx, lz + 0.4, 2.2, 1.7, 0xffb870, 0.38);
  }

  // ── 입간판 (불 들어오는 기둥 간판) ──
  const pillar = (px: number, pz: number, text: string, bg: string, ink: string) => {
    const tex = paint(256, 256, (c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = ink;
      c.font = `58px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // 둘레에 두 번 반복 → 어느 쪽에서 봐도 글자가 보인다
      for (const cx of [w * 0.25, w * 0.75])
        [...text].forEach((ch, k) => c.fillText(ch, cx, h / 2 + (k - (text.length - 1) / 2) * 64 + 3));
      c.fillStyle = ink;
      c.fillRect(0, 0, w, 10);
      c.fillRect(0, h - 10, w, 10);
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.35, 20, 1, true), glowMat(tex, 0.9));
    m.rotation.y = Math.PI / 2;
    add(st, m, px, G + 0.9, pz);
    add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.22, 16), poleM), px, G + 0.11, pz);
    add(st, new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 16), poleM), px, G + 1.59, pz);
    streak(px, pz + 0.2, 0.7, 1.8, bg, 0.7);
    return m;
  };
  const spin = [
    pillar(-0.55, -8.5, '떡볶이', '#ffd23f', '#c8321e'),
    pillar(-8.3, -8.3, '생맥주', '#ffb347', '#3a1a08'),
    pillar(8.9, -8.2, '야식', '#7de0ff', '#12324a'),
  ];

  // 자판기 (가게 사이 벽 앞)
  {
    const tex = paint(128, 256, (c, w, h) => {
      const q = rng(3);
      c.fillStyle = '#d8342c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#f4fbff';
      c.fillRect(10, 14, w - 20, 132);
      const cols = ['#e2503c', '#f0b23a', '#3b82c4', '#4caf7a', '#7a4a2a', '#ffffff'];
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 6; k++) {
          c.fillStyle = cols[Math.floor(q() * cols.length)];
          c.fillRect(16 + k * 17, 22 + row * 42, 11, 28);
          c.fillStyle = '#9ad0ff';
          c.fillRect(16 + k * 17, 53 + row * 42, 11, 4);
        }
      c.fillStyle = '#2a1414';
      c.fillRect(22, 196, w - 44, 30);
      c.fillStyle = '#ffe9a0';
      c.fillRect(w - 34, 158, 18, 26);
    });
    const dark = glowMat(null, 1, 0x4a1512);
    add(st, new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.75, 0.6), [dark, dark, dark, dark, glowMat(tex, 0.8), dark]), 3.05, G + 0.9, SHOP_Z + 0.42);
    streak(3.05, SHOP_Z + 0.75, 0.9, 2.0, '#eaf6ff', 0.6);
  }

  // 화분 (트럭 쪽 보도 끝, 앞쪽 겹)
  const potM = new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.9 });
  const bushM = new THREE.MeshStandardMaterial({ color: 0x2f6a4a, roughness: 1 });
  for (const bx of [-3.5, 3.3]) {
    add(st, new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.4), potM), bx, G + 0.22, -4.15);
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24 + r() * 0.06, 1), bushM);
      add(st, b, bx - 0.36 + k * 0.36, G + 0.55 + r() * 0.05, -4.15);
    }
  }

  // ── 지나가는 사람들 ──
  const walkers: { g: THREE.Group; z: number; v: number; ph: number; x: number }[] = [];
  const lanes: [number, number, number][] = [
    [-4.9, 1.0, -9],
    [-5.5, -0.8, 6],
    [-8.3, 0.7, 2],
    [-7.9, -1.1, -4],
    [-5.2, 1.25, 10],
  ];
  for (const [z, v, x0] of lanes) {
    const p = person(r, r() < 0.5 ? 'neutral' : 'happy');
    p.g.rotation.y = (Math.sign(v) * Math.PI) / 2;
    add(st, p.g, x0, G, z);
    walkers.push({ g: p.g, z, v, ph: r() * 10, x: x0 });
  }
  // 둘이 나란히 걷는 일행
  {
    const lead = walkers[0];
    const p = person(r, 'happy');
    p.g.rotation.y = Math.PI / 2;
    add(st, p.g, lead.x - 0.2, G, lead.z - 0.5);
    walkers.push({ g: p.g, z: lead.z - 0.5, v: lead.v, ph: 1.3, x: lead.x - 0.2 });
  }

  // 바깥 풍경은 그림자 범위 밖
  st.traverse((o) => {
    o.userData.noShadow = true;
  });

  // 글꼴이 늦게 도착하면 간판 글자를 다시 그린다
  document.fonts?.load(`60px ${FONT}`, '분식').then(() => repaint.forEach((f) => f())).catch(() => {});

  const SPAN = 12.5;
  let last = -1;
  const tick = (t: number) => {
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    for (const w of walkers) {
      w.x += w.v * dt;
      if (w.x > SPAN) w.x -= SPAN * 2;
      if (w.x < -SPAN) w.x += SPAN * 2;
      w.g.position.x = w.x;
      w.g.position.y = G + Math.abs(Math.sin(t * 7.5 * Math.abs(w.v) + w.ph)) * 0.035;
    }
    // 앉은 손님: 얘기하며 끄덕이고, 가끔 잔을 든다
    for (const d of diners) {
      d.up.rotation.z = Math.sin(t * 0.9 + d.ph) * 0.05;
      d.head.rotation.y = Math.sin(t * 0.6 + d.ph * 2) * 0.45;
      d.head.rotation.x = Math.sin(t * 2.2 + d.ph) * 0.08;
      const sip = Math.max(0, Math.sin(t * 0.5 + d.ph));
      d.armR.rotation.x = -1.1 - sip * sip * 0.9;
    }
    for (const [i, s] of spin.entries()) s.rotation.y = t * 0.5 * (i % 2 ? -1 : 1);
    // 젖은 길 반사가 살짝 일렁인다
    for (const s of streaks) s.m.opacity = 0.86 + 0.14 * Math.sin(t * 1.7 + s.ph);
    // 노래방 네온 깜빡임
    if (flicker) {
      const f = Math.sin(t * 2.3) > 0.93 || Math.sin(t * 13.1) > 0.985 ? 0.4 : 0.82;
      flicker.color.setScalar(f);
    }
    // 천막 김
    for (const [i, s] of puffs.entries()) {
      const l = (t * 0.22 + i / puffs.length) % 1;
      s.position.set(-3.5 + Math.sin(l * 4 + i) * 0.12 + l * 0.35, G + 1.9 + l * 1.1, -6.6);
      const sc = 0.25 + l * 0.7;
      s.scale.set(sc, sc, sc);
      s.material.opacity = Math.sin(l * Math.PI) * 0.35;
    }
  };
  return { tick, ground };
}
