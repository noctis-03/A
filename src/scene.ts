import * as THREE from 'three';
import { toonify } from './look';

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

/** truck: 장사(트럭 안) · home: 연구(집 주방) · lobby: 로비(밤거리에서 본 트럭 외관) */
export type Place = 'truck' | 'home' | 'lobby';

export interface World {
  scene: THREE.Scene;
  setPlace: (p: Place) => void;
  flames: THREE.Mesh[];
  fireLight: THREE.PointLight;
  plate: THREE.Group;
  plateFood: THREE.Mesh;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  // 밤 골목: 남색 하늘, 따뜻한 백열등과 화구 불빛이 중심
  scene.background = new THREE.Color(0x0b1026);
  scene.fog = new THREE.Fog(0x0b1026, 9, 30);

  scene.add(new THREE.HemisphereLight(0x8090d0, 0x2a1e24, 0.75));
  // 장사(푸드트럭) 세트와 연구(집 주방) 세트. 화구·웍·접시는 둘이 함께 쓴다
  const truck = new THREE.Group();
  scene.add(truck);
  const moon = new THREE.DirectionalLight(0x9db4ff, 0.55);
  moon.position.set(4, 7, -6);
  truck.add(moon);
  const inside = new THREE.PointLight(0xffc27a, 1.3, 5, 1.4);
  inside.position.set(0, 2.05, 0.1);
  truck.add(inside);
  // 차양 아래 전구가 손님 쪽을 비춘다
  const outside = new THREE.PointLight(0xffb060, 1.5, 4.5, 1.6);
  outside.position.set(0, 2.0, -1.75);
  truck.add(outside);

  // ── 트럭 내부 ──
  const steel = std(0x9aa0aa, 0.35, 0.75);
  const wall = std(0xe8d6b8, 0.9);
  const trim = std(0xd2452f, 0.6);
  const dark = std(0x2a2b30, 0.6, 0.4);

  box(truck, 3.2, 0.04, 2.6, std(0x55585f, 0.9), 0, -0.02, 0.2); // 바닥
  box(truck, 2.9, 0.86, 1.22, std(0x8d939c, 0.5, 0.6), 0, 0.43, -0.4); // 조리대 몸체
  box(truck, 2.96, 0.04, 1.28, steel, 0, 0.88, -0.4); // 조리대 상판
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

  // 화구
  box(scene, 0.86, 0.035, 0.8, dark, 0, 0.915, -0.38);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.01, 8, 32), std(0x18181b, 0.5, 0.6));
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

  // 재료 통 (장식)
  const binColors = [0xf6f1e4, 0xffd84a, 0x58b54a, 0xff8a2a, 0xff9a7a, 0xe2452f, 0xf29a9a];
  binColors.forEach((c, i) => {
    const side = i < 4 ? -1 : 1;
    const k = i < 4 ? i : i - 4;
    const x = side * (0.62 + (k % 2) * 0.3);
    const z = -0.2 - Math.floor(k / 2) * 0.32;
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.09, 20, 1, true), steel);
    bin.material.side = THREE.DoubleSide;
    bin.position.set(x, 0.945, z);
    const fill = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(c, 0.85));
    fill.scale.y = 0.45;
    fill.position.set(x, 0.95, z);
    truck.add(bin, fill);
  });
  // 소스병
  [0x3a2416, 0xc93a2a].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 12), std(c, 0.3));
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

  // ── 바깥 풍경 ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), std(0x2e3242, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.25, -28);
  truck.add(ground);
  box(truck, 80, 0.06, 3.2, std(0x5a5866, 1), 0, -0.23, -2.7); // 보도
  for (let i = -6; i <= 6; i++) box(truck, 1.6, 0.01, 0.16, std(0xb8b49a, 1), i * 3.4, -0.24, -7.5); // 차선

  // 건물: 꺼진 창은 어둡게, 켜진 창만 스스로 빛난다
  const lit: boolean[] = [];
  for (let i = 0; i < 32; i++) lit.push(Math.random() < 0.35);
  const winTex = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = lit[y * 4 + x] ? '#ffd890' : '#3a4560';
        c.fillRect(8 + x * 30, 10 + y * 30, 22, 20);
      }
  });
  const winGlow = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        if (!lit[y * 4 + x]) continue;
        c.fillStyle = x % 3 ? '#ffc870' : '#ffe2a8';
        c.fillRect(8 + x * 30, 10 + y * 30, 22, 20);
      }
  });
  const palette = [0x4a3f5c, 0x3b4a63, 0x5a4048, 0x34485a, 0x4d4a3e, 0x3f3550];
  let bx = -22;
  let k = 0;
  while (bx < 22) {
    const w = 3 + Math.random() * 3;
    const h = 4 + Math.random() * 8;
    const mat = new THREE.MeshStandardMaterial({
      color: palette[k++ % palette.length],
      map: winTex,
      emissive: 0xffffff,
      emissiveMap: winGlow,
      emissiveIntensity: 0.9,
      roughness: 0.9,
    });
    box(truck, w, h, 4, mat, bx + w / 2, h / 2 - 0.25, -14 - Math.random() * 2);
    bx += w + 0.3;
  }

  // 길 건너 네온 간판
  const neon = (text: string, color: string, w: number, h: number) => {
    const tex = canvasTexture(512, 192, (c) => {
      c.fillStyle = '#120b18';
      c.fillRect(0, 0, 512, 192);
      c.strokeStyle = color;
      c.lineWidth = 8;
      c.strokeRect(14, 14, 484, 164);
      c.font = 'bold 108px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffffff';
      c.shadowColor = color;
      c.shadowBlur = 24;
      c.fillText(text, 256, 100);
    });
    const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.2) });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  };
  const sign1 = neon('포장마차', '#ff4fa0', 3.2, 1.2);
  sign1.position.set(-5.5, 4.2, -11.9);
  const sign2 = neon('24시 국밥', '#46d6ff', 2.8, 1.05);
  sign2.position.set(6.5, 3.4, -11.9);
  truck.add(sign1, sign2);

  // 가로등
  const poleM = std(0x23252c, 0.6, 0.5);
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.3) });
  for (const lx of [-4.2, 4.6]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 8), poleM);
    pole.position.set(lx, 1.55, -3.9);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lampM);
    lamp.position.set(lx, 3.4, -3.9);
    const light = new THREE.PointLight(0xffc98a, 2, 7, 1.5);
    light.position.set(lx, 3.2, -3.9);
    truck.add(pole, lamp, light);
  }

  const trunkM = std(0x3a2a20, 1);
  const leafM = std(0x24453a, 1);
  // 가로수 (로비 카메라 바로 앞을 가리므로 로비에서는 숨긴다)
  const trees = new THREE.Group();
  truck.add(trees);
  for (const tx of [-5.5, -2.6, 2.9, 6.2]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.6, 8), trunkM);
    trunk.position.set(tx, 0.55, -4.0);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), leafM);
    leaf.position.set(tx, 1.9, -4.0);
    leaf.scale.y = 1.15;
    trees.add(trunk, leaf);
  }

  // ── 로비 전용: 밤거리에서 바라본 웍웍! 푸드트럭 외관 ──
  const exterior = new THREE.Group();
  scene.add(exterior);
  {
    const red = std(0xd9442c, 0.55);
    const redDark = std(0xa8321f, 0.6);
    const cream = std(0xfff1d6, 0.8);
    const tire = std(0x1c1d22, 0.9);
    const hub = std(0xb9bec6, 0.4, 0.6);
    // 차체: 양옆 · 지붕 · 아래 치마
    for (const sx of [-1, 1]) {
      box(exterior, 0.05, 2.5, 2.8, red, sx * 1.575, 1.12, 0.3);
      box(exterior, 0.06, 0.16, 2.8, cream, sx * 1.59, 0.62, 0.3); // 크림 띠
      box(exterior, 0.06, 0.06, 2.8, redDark, sx * 1.59, 0.5, 0.3);
    }
    box(exterior, 3.24, 0.1, 2.9, redDark, 0, 2.42, 0.3); // 지붕
    box(exterior, 3.0, 0.3, 2.6, std(0x24252b, 0.9), 0, -0.1, 0.35); // 아래
    box(exterior, 3.1, 0.12, 0.08, cream, 0, -0.05, -1.1); // 앞 범퍼
    // 바퀴
    for (const sx of [-1, 1]) {
      for (const z of [-0.5, 1.2]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 22), tire);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * 1.52, 0.07, z);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 16), hub);
        h.rotation.z = Math.PI / 2;
        h.position.copy(w.position);
        exterior.add(w, h);
      }
    }
    // 옆면 로고
    const drawLogo = (c: CanvasRenderingContext2D) => {
      c.clearRect(0, 0, 512, 192);
      c.font = 'bold 128px "Black Han Sans", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 18;
      c.strokeStyle = '#2b1a12';
      c.strokeText('웍웍!', 256, 100);
      c.fillStyle = '#fff4dc';
      c.fillText('웍웍!', 256, 100);
    };
    const logoTex = canvasTexture(512, 192, drawLogo);
    // 제목 글꼴이 늦게 로드되면 다시 그린다
    document.fonts?.ready.then(() => {
      drawLogo((logoTex.image as HTMLCanvasElement).getContext('2d')!);
      logoTex.needsUpdate = true;
    });
    for (const sx of [-1, 1]) {
      const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.56),
        new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, color: new THREE.Color(1.15, 1.15, 1.15) }),
      );
      logo.position.set(sx * 1.625, 1.32, 0.45);
      logo.rotation.y = (sx * Math.PI) / 2;
      exterior.add(logo);
    }
    // 지붕 위 네온 간판 (손님 쪽을 본다)
    const roofSign = neon('웍웍!', '#ffb547', 1.9, 0.72);
    roofSign.position.set(0, 2.9, -0.95);
    roofSign.rotation.y = Math.PI;
    (roofSign.material as THREE.MeshBasicMaterial).color.setScalar(1.45); // 빛 번짐에 글자가 묻히지 않게
    box(exterior, 2.0, 0.82, 0.08, std(0x1a1420, 0.8), 0, 2.9, -0.9);
    box(exterior, 0.06, 0.4, 0.06, std(0x23252c, 0.6, 0.5), -0.7, 2.6, -0.9);
    box(exterior, 0.06, 0.4, 0.06, std(0x23252c, 0.6, 0.5), 0.7, 2.6, -0.9);
    exterior.add(roofSign);
    // 입간판
    const boardTex = canvasTexture(256, 360, (c) => {
      c.fillStyle = '#1f2a24';
      c.fillRect(0, 0, 256, 360);
      c.strokeStyle = '#c9a66b';
      c.lineWidth = 12;
      c.strokeRect(6, 6, 244, 348);
      c.textAlign = 'center';
      c.fillStyle = '#ffcf6b';
      c.font = 'bold 44px sans-serif';
      c.fillText('오늘의', 128, 80);
      c.fillText('볶음밥', 128, 132);
      c.fillStyle = '#fff6dd';
      c.font = '30px sans-serif';
      c.fillText('불맛 가득', 128, 200);
      c.fillText('6,000원~', 128, 250);
      c.fillStyle = '#ff8a6b';
      c.fillText('★ ★ ★', 128, 310);
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.88), new THREE.MeshBasicMaterial({ map: boardTex }));
    board.position.set(2.05, 0.27, -2.35);
    board.rotation.set(-0.14, Math.PI - 0.45, 0);
    const boardBack = box(exterior, 0.7, 0.96, 0.04, std(0x6b4a2e, 0.8), 2.07, 0.26, -2.31);
    boardBack.rotation.set(-0.14, Math.PI - 0.45, 0);
    exterior.add(board);
    // 트럭 뒤로 보이는 거리 (바닥 · 건물 · 달)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 30), std(0x2e3242, 1));
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, -0.255, 15);
    exterior.add(back);
    let ex = -20;
    let ek = 3;
    while (ex < 20) {
      const w = 3 + Math.random() * 3;
      const h = 5 + Math.random() * 9;
      const mat = new THREE.MeshStandardMaterial({
        color: palette[ek++ % palette.length],
        map: winTex,
        emissive: 0xffffff,
        emissiveMap: winGlow,
        emissiveIntensity: 0.9,
        roughness: 0.9,
      });
      const b = box(exterior, w, h, 4, mat, ex + w / 2, h / 2 - 0.25, 11 + Math.random() * 2);
      b.rotation.y = Math.PI;
      ex += w + 0.3;
    }
    const moonBall = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.15) }));
    moonBall.position.set(-7, 13, 24);
    exterior.add(moonBall);
    // 트럭 옆을 비추는 등불
    const sideGlow = new THREE.PointLight(0xffb060, 1.4, 4, 1.6);
    sideGlow.position.set(-2.4, 1.8, -0.6);
    exterior.add(sideGlow);
  }

  // ── 접시 (서빙 연출) ──
  const plate = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.025, 28), std(0xfafafa, 0.35));
  const plateFood = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
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

  const setPlace = (p: Place) => {
    truck.visible = p === 'truck' || p === 'lobby';
    exterior.visible = p === 'lobby';
    trees.visible = p !== 'lobby';
    home.visible = p === 'home';
    const bg = p === 'home' ? 0x1a1420 : 0x0b1026;
    (scene.background as THREE.Color).setHex(bg);
    scene.fog!.color.setHex(bg);
  };
  setPlace('home');
  return { scene, setPlace, flames, fireLight, plate, plateFood };
}

// ───────────────────────── 집 주방 (레시피 연구) ─────────────────────────

function buildHome(): THREE.Group {
  const g = new THREE.Group();
  // 따뜻한 저녁 주방: 타일 벽, 나무 상판, 레인지 후드, 창밖 저녁 하늘
  const lamp = new THREE.PointLight(0xffd29a, 1.4, 6, 1.3);
  lamp.position.set(0, 2.15, -0.2);
  const hoodLight = new THREE.PointLight(0xfff0d0, 0.8, 1.6, 1.5);
  hoodLight.position.set(0, 1.6, -0.6);
  g.add(lamp, hoodLight);

  const tileTex = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#d9e4e0';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#b4c3be';
    c.lineWidth = 4;
    for (let i = 0; i <= 256; i += 32) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 256);
      c.moveTo(0, i);
      c.lineTo(256, i);
      c.stroke();
    }
  });
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(3, 1.2);
  const wallM = std(0xf0e2c8, 0.95);
  const wood = std(0xb07a4a, 0.8);
  const woodDark = std(0x7a4f2e, 0.8);
  const cabinet = std(0x6f8f7a, 0.8);
  const knob = std(0xd8c48a, 0.4, 0.6);

  box(g, 4, 0.04, 3, std(0x8a6a4c, 0.9), 0, -0.02, 0.2); // 마루
  box(g, 2.9, 0.86, 1.22, cabinet, 0, 0.43, -0.4); // 하부장
  box(g, 2.96, 0.05, 1.28, wood, 0, 0.875, -0.4); // 나무 상판
  for (const x of [-1.05, -0.35, 0.35, 1.05]) box(g, 0.08, 0.03, 0.02, knob, x, 0.72, 0.22); // 손잡이
  // 뒷벽 (타일) + 창문
  const back = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.6 });
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
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 12), std(c, 0.4));
    j.position.set(-1.25 + i * 0.1, 0.955, -0.85);
    g.add(j);
  });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.14, 20), std(0x9a3b2e, 0.5, 0.3));
  pot.position.set(-0.8, 0.97, -0.62);
  g.add(pot);
  const potLid = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 6, 0, Math.PI * 2, 0, Math.PI / 4), std(0x7a2a20, 0.5, 0.3));
  potLid.position.set(-0.8, 0.99, -0.62);
  g.add(potLid);
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), std(0x4f9a5a, 1));
  plant.position.set(1.2, 1.42, -0.92);
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 12), std(0xc66a3c, 0.8));
  planter.position.set(1.2, 1.36, -0.92);
  g.add(plant, planter);
  // 도마
  box(g, 0.42, 0.025, 0.28, std(0xd9b27a, 0.8), 0.85, 0.91, -0.35);
  // 펜던트 조명
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 16, 1, true), std(0x2f4a3e, 0.6));
  shade.position.set(0, 2.32, -0.2);
  (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.4) }));
  bulb.position.set(0, 2.27, -0.2);
  g.add(shade, bulb);
  return g;
}

// ───────────────────────── 김 / 연기 ─────────────────────────

export class Steam {
  private sprites: THREE.Sprite[] = [];
  private life: number[] = [];
  private acc = 0;

  constructor(scene: THREE.Scene) {
    const tex = canvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.sprites.push(s);
      this.life.push(0);
    }
  }

  /** rate: 초당 생성 수, smoke: 0(흰 김)~1(검은 연기) */
  update(dt: number, rate: number, center: THREE.Vector3, smoke: number) {
    this.acc += rate * dt;
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      if (this.life[i] > 0) {
        this.life[i] -= dt / 1.6;
        const l = this.life[i];
        s.position.y += dt * 0.28;
        s.position.x += dt * 0.03;
        const sc = 0.07 + (1 - l) * 0.22;
        s.scale.set(sc, sc, sc);
        s.material.opacity = Math.max(0, Math.sin(l * Math.PI)) * (0.22 + smoke * 0.3);
        if (l <= 0) s.visible = false;
      } else if (this.acc >= 1) {
        this.acc -= 1;
        this.life[i] = 1;
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
