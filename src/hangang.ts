import * as THREE from 'three';
import { buildRiverBackdrop } from './riverPainting';

/**
 * 푸드트럭 바깥 풍경: 한강 둔치의 밤.
 *
 * 앞쪽(손님이 걷는 산책로 · 난간 · 가로등 · 벤치)만 3D 이고, 강 너머는 카메라에 맞춘 그림 배경
 * (riverPainting.ts)이다. 카메라가 웍을 내려다봐서 3D 로는 먼 풍경이 화면 위쪽에 몰려 볼품없었다.
 *
 * 앞에서부터: 자전거 산책로(손님이 걷는 길, z ≈ -1.7) → 화단 · 가로등 · 왼쪽 벤치 → 낮은 난간(z -3.9)
 * → (그림 배경) 강 · 유람선 · 조명 다리 · 강 건너 아파트 단지 · 언덕 위 전망탑 · 하늘과 달.
 * 트럭 조리대 선반이 z -3.7 보다 가까운 땅을 가리므로, 강은 그 바로 너머에서 시작한다.
 */

const GROUND = -0.25;
const WATER = -0.7;
/** 강가(축대) 위치: 트럭 창 아래 끝(조리대 선반)에 가려지는 바로 너머 */
const EDGE_Z = -3.9;

const std = (color: THREE.ColorRepresentation, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** HDR 색 (1보다 크면 블룸으로 빛난다) */
const glow = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

export interface Hangang {
  tick: (t: number, dt: number) => void;
}

export function buildHangang(parent: THREE.Object3D): Hangang {
  const g = new THREE.Group();
  parent.add(g);
  const noShadow = (o: THREE.Object3D) => {
    o.userData.noShadow = true;
    return o;
  };

  // ── 산책로 · 잔디 ──
  const path = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(90, 2.4), std(0x3a4252, 0.9)));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, GROUND + 0.005, -2.25);
  const lane = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(90, 0.06), new THREE.MeshBasicMaterial({ color: 0x6f5a24 })));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, GROUND + 0.01, -2.9);
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.07), new THREE.MeshBasicMaterial({ color: 0xe8c95a }), 60);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 60; i++) dashes.setMatrixAt(i, m.compose(new THREE.Vector3(-30 + i * 1.0, GROUND + 0.012, -2.3), q, one));
  noShadow(dashes);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(90, 0.06, 0.12), std(0x59606e, 0.8));
  curb.position.set(0, GROUND + 0.03, -3.45);
  // 산책로와 강 사이 좁은 화단
  const verge = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(90, 0.45), std(0x1d3a2e, 1)));
  verge.rotation.x = -Math.PI / 2;
  verge.position.set(0, GROUND, -3.68);
  g.add(path, lane, dashes, curb, verge);

  // ── 강가 축대와 낮은 난간 (트럭 창 아래 끝 바로 너머에서 강이 시작된다) ──
  const bank = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(90, -WATER + GROUND + 0.02), std(0x2a3240, 1)));
  bank.position.set(0, (GROUND + WATER) / 2, EDGE_Z);
  g.add(bank);
  const railM = std(0x9aa4b4, 0.4, 0.6);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(90, 0.04, 0.04), railM);
  rail.position.set(0, GROUND + 0.6, EDGE_Z + 0.05);
  g.add(rail);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), railM, 50);
  for (let i = 0; i < 50; i++) posts.setMatrixAt(i, m.makeTranslation(-30 + i * 1.2, GROUND + 0.3, EDGE_Z + 0.05));
  g.add(posts);

  // ── 가로등 (손님을 비추는 하얀 LED, 창 양옆) ──
  for (const x of [-4.4, 4.8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 12), std(0x2a313c, 0.5, 0.5));
    pole.position.set(x, GROUND + 1.6, -3.55);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.06), std(0x2a313c, 0.5, 0.5));
    arm.position.set(x - 0.22, GROUND + 3.18, -3.55);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.16), glow(2.6, 2.9, 3.2));
    head.position.set(x - 0.42, GROUND + 3.14, -3.55);
    const light = new THREE.PointLight(0xd8ecff, 2.2, 7.5, 1.5);
    light.position.set(x - 0.42, GROUND + 3.0, -3.55);
    g.add(pole, arm, head, light);
  }

  // ── 강가 벤치의 연인 (왼쪽, 강을 보고 앉아 등만 보인다) ──
  const ink = std(0x161b26, 0.9);
  const person = (x: number, z: number, h = 1) => {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.28, 6, 14), ink);
    body.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), ink);
    head.position.y = 0.86;
    p.add(body, head);
    p.scale.setScalar(h);
    p.position.set(x, GROUND, z);
    return p;
  };
  const bench = new THREE.Group();
  const wood = std(0x6b4a2e, 0.8);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.4), wood);
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.05), wood);
  back.position.set(0, 0.68, 0.2);
  bench.add(seat, back);
  for (const sx of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.36), std(0x2a313c, 0.5, 0.5));
    leg.position.set(sx, 0.21, 0);
    bench.add(leg);
  }
  bench.position.set(-6.2, GROUND, -3.55);
  const p1 = person(-6.45, -3.57, 0.95);
  const p2 = person(-6.02, -3.57, 0.88);
  p2.rotation.z = 0.12; // 기대어 앉음
  g.add(bench, p1, p2);

  // ── 강 너머 전부: 그림 배경 (riverPainting.ts) ──
  // 강 · 다리 · 강 건너 아파트 · 하늘을 카메라에 맞춘 그림판에 그리고, 조명 · 물결 · 유람선만 움직인다
  const backdrop = buildRiverBackdrop(g);
  const tick = (t: number, dt: number) => backdrop.tick(t, dt);
  return { tick };
}
