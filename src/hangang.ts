import * as THREE from 'three';

/**
 * 푸드트럭 바깥 풍경: 한강 둔치의 밤.
 *
 * 게임 카메라는 웍을 내려다보고 있어서 트럭 창 너머로 보이는 건 '수평선 아래'가 대부분이다.
 * 그래서 하늘 · 달 대신 강물에 비친 빛(다리 조명 · 도시 불빛 · 달빛 길)으로 야경을 보여 주고,
 * 다리와 강 건너 도시는 실제 거리보다 가깝게 당겨 화면 위쪽 띠에 들어오게 했다.
 *
 * 앞에서부터: 자전거 산책로(손님이 걷는 길, z ≈ -1.7) → 화단 · 가로등 · 왼쪽 벤치 → 낮은 난간(z -3.9)
 * → 강(유람선) → 다리(z -9) → 강 건너 도시(z -20 ~) · 언덕과 전망탑.
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

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 물결에 부서진 반사광: 가로로 짧은 금들이 흩어진 띠 (위아래로 흘려 일렁이게) */
function rippleTexture() {
  const t = canvasTexture(64, 256, (c) => {
    c.clearRect(0, 0, 64, 256);
    for (let i = 0; i < 110; i++) {
      const y = Math.random() * 256;
      const w = 8 + Math.random() * 40;
      const x = 32 - w / 2 + (Math.random() - 0.5) * 14;
      c.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
      c.fillRect(x, y, w, 1.5 + Math.random() * 2);
    }
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

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

  // ── 강 ──
  const water = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(200, 90), new THREE.MeshBasicMaterial({ color: 0x0b143a })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, WATER, EDGE_Z - 45);
  g.add(water);

  // 물에 비친 빛: 광원마다 강 위에 길게 누운 띠 (가산 혼합, 물결 무늬가 흐른다)
  const ripple = rippleTexture();
  const streaks: { mesh: THREE.Mesh; base: number; phase: number }[] = [];
  const streak = (x: number, zNear: number, zFar: number, width: number, color: THREE.Color, opacity: number) => {
    // 두 끝을 어느 순서로 주든 같은 띠 (길이가 음수면 면이 뒤집혀 안 보인다)
    const len = Math.abs(zNear - zFar);
    const mat = new THREE.MeshBasicMaterial({
      map: ripple,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, WATER + 0.01, (zNear + zFar) / 2);
    s.userData.noShadow = true;
    g.add(s);
    streaks.push({ mesh: s, base: opacity, phase: Math.random() * 6 });
    return s;
  };

  // ── 다리 (z -11): 상판 · 교각 · 납작한 아치 · 조명 ──
  const BRIDGE_Z = -9;
  const DECK_Y = 0.7;
  const bridgeM = std(0x262e5e, 0.7);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(160, 0.32, 1.3), bridgeM);
  deck.position.set(0, DECK_Y, BRIDGE_Z);
  noShadow(deck);
  g.add(deck);
  const span = 8;
  for (let i = -8; i <= 8; i++) {
    const x = i * span;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.7, DECK_Y - WATER, 0.9), bridgeM);
    pier.position.set(x, (DECK_Y + WATER) / 2, BRIDGE_Z);
    noShadow(pier);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 0.07, 6, 32, Math.PI), std(0x3a4580, 0.5, 0.4));
    arch.scale.y = 0.42;
    arch.position.set(x + span / 2, DECK_Y + 0.16, BRIDGE_Z - 0.55);
    noShadow(arch);
    g.add(pier, arch);
  }
  // 상판 조명 (금빛) · 아치 꼭대기 조명 (분홍)
  const n = 160;
  const deckLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), glow(3.2, 2.3, 1.0), n);
  for (let i = 0; i < n; i++) deckLights.setMatrixAt(i, m.makeTranslation(-80 + i, DECK_Y + 0.2, BRIDGE_Z + 0.67));
  const archLights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), glow(3.0, 1.2, 2.2), 17);
  for (let i = 0; i < 17; i++) archLights.setMatrixAt(i, m.makeTranslation((i - 8) * span + span / 2, DECK_Y + 0.16 + (span / 2) * 0.42, BRIDGE_Z - 0.55));
  g.add(deckLights, archLights);
  const gold = new THREE.Color(1.0, 0.75, 0.35);
  const pink = new THREE.Color(1.0, 0.45, 0.75);
  for (let x = -30; x <= 30; x += 2.5) streak(x + (Math.random() - 0.5), BRIDGE_Z + 0.8, EDGE_Z - 0.2, 1.1, gold, 0.9);
  for (let i = -4; i <= 4; i++) streak(i * span + span / 2, BRIDGE_Z + 0.8, EDGE_Z - 1.2, 0.9, pink, 0.65);

  // ── 강 건너 도시 (z -22 ~ -27) ──
  const farBank = noShadow(new THREE.Mesh(new THREE.BoxGeometry(200, 0.5, 6), std(0x10173a, 1)));
  farBank.position.set(0, WATER + 0.25, -21.5);
  g.add(farBank);
  const lit: boolean[] = [];
  for (let i = 0; i < 60; i++) lit.push(Math.random() < 0.4);
  const winTex = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 5; x++) {
        c.fillStyle = lit[(y * 5 + x) % 60] ? '#ffe0a0' : '#2a3560';
        c.fillRect(6 + x * 24, 6 + y * 21, 16, 13);
      }
  });
  const winGlow = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 5; x++) {
        if (!lit[(y * 5 + x) % 60]) continue;
        c.fillStyle = (x + y) % 4 ? '#ffd890' : '#bfe8ff';
        c.fillRect(6 + x * 24, 6 + y * 21, 16, 13);
      }
  });
  const palette = [0x1b2350, 0x22285a, 0x1a1f48, 0x262a5c, 0x1e2654];
  let bx = -60;
  let k = 0;
  while (bx < 60) {
    const w = 2.5 + Math.random() * 3.5;
    const h = 3 + Math.random() * 9;
    const tex = winTex.clone();
    tex.repeat.set(w / 4, h / 8);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    const em = winGlow.clone();
    em.repeat.copy(tex.repeat);
    em.wrapS = em.wrapT = THREE.RepeatWrapping;
    em.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color: palette[k++ % palette.length], map: tex, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1.1, roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), mat);
    const z = -20 - Math.random() * 2.5;
    b.position.set(bx + w / 2, WATER + 0.5 + h / 2, z);
    noShadow(b);
    g.add(b);
    // 도시 불빛이 강에 길게 비친다 (가끔)
    if (Math.random() < 0.55) {
      const warm = Math.random() < 0.7;
      streak(bx + w / 2, z + 1.5, BRIDGE_Z - 0.8, w * 0.5, warm ? new THREE.Color(1, 0.8, 0.45) : new THREE.Color(0.55, 0.85, 1), 0.5);
    }
    bx += w + 0.4 + Math.random() * 0.8;
  }

  // 언덕과 전망탑 (왼쪽 뒤)
  const hill = noShadow(new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x121a44, 1)));
  hill.scale.y = 0.45;
  hill.position.set(-26, WATER, -40);
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 12), std(0x2a3570, 0.6));
  shaft.position.y = 3.5;
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.8, 0.9, 16), std(0x33407a, 0.5));
  pod.position.y = 6.2;
  const podLights = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.12, 16, 1, true), glow(3, 2.4, 1.2));
  podLights.position.y = 6.2;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3, 8), std(0x2a3570, 0.6));
  antenna.position.y = 8.2;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow(4, 0.6, 0.5));
  beacon.position.y = 9.7;
  tower.add(shaft, pod, podLights, antenna, beacon);
  tower.position.set(-26, WATER + 5.2, -40);
  g.add(hill, tower);

  // 달빛 길 (달은 화면 위로 벗어나 있어도 강물엔 비친다)
  streak(7, EDGE_Z - 0.2, -60, 2.2, new THREE.Color(0.75, 0.85, 1), 0.55);

  // ── 유람선 (강 위를 천천히 오간다) ──
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.45, 1.1), std(0xe8ecff, 0.6));
  hull.position.y = 0.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.9), std(0xf6f2ff, 0.6));
  cabin.position.y = 0.65;
  const windows = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.18, 0.92), glow(1.6, 1.2, 0.6));
  windows.position.y = 0.68;
  const roofLights = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.04, 0.95), glow(1.3, 0.55, 1.1));
  roofLights.position.y = 0.9;
  boat.add(hull, cabin, windows, roofLights);
  boat.scale.setScalar(0.55);
  boat.position.set(-3, WATER, -6.4);
  boat.traverse((o) => (o.userData.noShadow = true));
  g.add(boat);
  const boatStreak = streak(0, EDGE_Z - 0.2, -6.6, 1.6, new THREE.Color(1, 0.8, 0.45), 0.85);

  const tick = (t: number, dt: number) => {
    // 물결 무늬가 천천히 흐르고 띠마다 밝기가 일렁인다
    ripple.offset.y = (t * 0.05) % 1;
    for (const s of streaks) {
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = s.base * (0.75 + 0.25 * Math.sin(t * 1.6 + s.phase));
    }
    boat.position.x += dt * 0.7;
    if (boat.position.x > 14) boat.position.x = -14;
    boatStreak.position.x = boat.position.x;
    beacon.visible = Math.sin(t * 3) > -0.2;
  };
  return { tick };
}
