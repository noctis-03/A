import * as THREE from 'three';
import { INGREDIENTS, type IngDef, type IngId } from './ingredients';
import { ensureOutlineNormals, outlineMat, toonMat } from './look';
import { shapeGeometry } from './physics';

/**
 * 푸드트럭 조리대의 재료 통 10개 (재료마다 하나).
 * 통 안에는 웍에 넣는 조각과 같은 모양의 재료가 수북이 쌓여 있고,
 * 아직 안 열린 재료 통은 뚜껑이 덮여 있다 (해금하면 열린다).
 */

/** 통 자리: 왼쪽 6개(앞에서부터 밥 · 대파 · 계란 …), 오른쪽 4개 */
const SLOTS: Record<IngId, [number, number]> = {
  rice: [-0.62, -0.18],
  scallion: [-0.9, -0.18],
  egg: [-0.62, -0.42],
  kimchi: [-0.9, -0.42],
  ham: [-0.62, -0.66],
  onion: [-0.9, -0.66],
  carrot: [0.68, -0.3],
  shrimp: [0.94, -0.3],
  bacon: [0.68, -0.56],
  cheese: [0.94, -0.56],
};

/** 재료별로 섞어 넣을 다른 색 (계란 흰자, 김치 배추 줄기, 베이컨 비계 …): [색, 비율] */
const MIX: Partial<Record<IngId, [number, number]>> = {
  rice: [0xe9dcc0, 0.25],
  egg: [0xfff2d2, 0.3],
  kimchi: [0xf2d8a8, 0.3],
  bacon: [0xfbe6dc, 0.35],
  onion: [0xf0e6ff, 0.35],
  scallion: [0xe9f5d0, 0.3],
  shrimp: [0xffb4a0, 0.4],
};

const BIN_TOP = 0.99; // 통 윗면 높이
const BIN_R = 0.11;
const PILE_R = 0.094;

// 같은 씨앗이면 매번 같은 더미 (새로고침해도 모양이 그대로)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pile(def: IngDef, x: number, z: number, seed: number) {
  const r = rng(seed);
  const s = def.radius;
  // 조각 하나가 덮는 넓이로 한 층 개수를 잡고, 두 층 반 정도 쌓는다
  const per = Math.round((Math.PI * PILE_R * PILE_R) / (Math.PI * s * s * 1.6));
  const n = THREE.MathUtils.clamp(Math.round(per * 2.5), 24, 140);
  const geo = shapeGeometry(def.shape);
  ensureOutlineNormals(geo);
  const mesh = new THREE.InstancedMesh(geo, toonMat(0xffffff), n);
  const line = new THREE.InstancedMesh(geo, outlineMat(true, 0x2a160c), n);
  line.instanceMatrix = mesh.instanceMatrix;
  line.name = 'outline';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const base = new THREE.Color(def.raw);
  // 새우는 생물 회색이면 알아보기 어려워 살짝 익은 분홍빛으로
  if (def.id === 'shrimp') base.lerp(new THREE.Color(def.cooked), 0.55);
  // 밥은 너무 하얘서 빛 번짐에 한 덩어리로 뭉개진다 → 조금 낮추고 알마다 차이를 더 준다
  const bright = def.id === 'rice' ? [0.72, 0.2] : [0.88, 0.2];
  const mix = MIX[def.id];
  const mixC = mix ? new THREE.Color(mix[0]) : null;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // 원판 안에 고르게, 가운데가 볼록한 더미 표면 근처에
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (PILE_R - s * 0.6);
    const u = d / PILE_R;
    const surface = BIN_TOP - 0.006 + 0.03 * (1 - u * u);
    p.set(x + Math.cos(a) * d, surface - r() * r() * 0.03, z + Math.sin(a) * d);
    e.set(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2);
    q.setFromEuler(e);
    const k = s * (0.85 + r() * 0.3);
    sc.set(k, k, k);
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    // 조각마다 밝기를 살짝 다르게, 일부는 섞음 색
    c.copy(mixC && r() < mix![1] ? mixC : base).multiplyScalar(bright[0] + r() * bright[1]);
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  // 조각 사이 틈으로 바닥이 비치지 않게 받치는 어두운 밑더미
  const under = new THREE.Mesh(
    new THREE.SphereGeometry(PILE_R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    toonMat(base.clone().multiplyScalar(0.62)),
  );
  under.scale.y = 0.42;
  under.position.set(x, BIN_TOP - 0.03, z);
  const g = new THREE.Group();
  g.add(under, mesh, line);
  return g;
}

/** 국자 (밥통에 꽂아 둔 것) */
function ladle(steel: THREE.Material, x: number, z: number) {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  cup.rotation.x = Math.PI;
  cup.scale.y = 0.6;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 10), steel);
  handle.position.set(0, 0.1, 0);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 12), toonMat(0x2a2b30));
  grip.position.set(0, 0.2, 0);
  const handleGroup = new THREE.Group();
  handleGroup.add(handle, grip);
  handleGroup.rotation.z = -0.95;
  g.add(cup, handleGroup);
  g.position.set(x + 0.02, BIN_TOP + 0.012, z + 0.01);
  g.rotation.y = 0.6;
  return g;
}

export interface Bins {
  /** 해금된 재료 수 (INGREDIENTS 앞에서부터) → 그 재료 통만 열린다 */
  setUnlocked: (n: number) => void;
}

export function buildBins(parent: THREE.Object3D, steel: THREE.Material): Bins {
  const lids: THREE.Object3D[] = [];
  const piles: THREE.Object3D[] = [];
  // 뚜껑 없는 통이라 안쪽 벽도 보이게 양면
  const binMat = steel.clone();
  binMat.side = THREE.DoubleSide;
  const binGeo = new THREE.CylinderGeometry(BIN_R, 0.09, 0.09, 40, 1, true);
  const rimGeo = new THREE.TorusGeometry(BIN_R + 0.002, 0.005, 10, 48);
  const floorGeo = new THREE.CircleGeometry(0.09, 32);
  const lidGeo = new THREE.CylinderGeometry(BIN_R + 0.008, BIN_R + 0.008, 0.01, 40);
  const knobGeo = new THREE.SphereGeometry(0.016, 14, 8);
  // 표준 재질로 두면 toonify 가 카툰 재질 + 외곽선으로 바꿔 준다
  const lidMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.35, metalness: 0.7 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.6 });
  INGREDIENTS.forEach((def, i) => {
    const [x, z] = SLOTS[def.id];
    const bin = new THREE.Mesh(binGeo, binMat);
    bin.position.set(x, BIN_TOP - 0.045, z);
    const rim = new THREE.Mesh(rimGeo, steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, BIN_TOP, z);
    const floor = new THREE.Mesh(floorGeo, steel);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, BIN_TOP - 0.088, z);
    parent.add(bin, rim, floor);

    const content = pile(def, x, z, 1000 + i * 97);
    if (def.id === 'rice') content.add(ladle(steel, x, z));
    parent.add(content);
    piles.push(content);

    // 아직 안 열린 재료: 뚜껑 + 손잡이
    const lid = new THREE.Group();
    const top = new THREE.Mesh(lidGeo, lidMat);
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.scale.y = 0.6;
    knob.position.y = 0.01;
    lid.add(top, knob);
    lid.position.set(x, BIN_TOP + 0.006, z);
    parent.add(lid);
    lids.push(lid);
  });
  const setUnlocked = (n: number) => {
    INGREDIENTS.forEach((_, i) => {
      const open = i < n;
      piles[i].visible = open;
      lids[i].visible = !open;
    });
  };
  setUnlocked(INGREDIENTS.length);
  return { setUnlocked };
}
