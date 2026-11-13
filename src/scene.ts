import * as THREE from 'three';
import { enableShadows, toonify } from './look';

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

  // 재료 통 (장식)
  const binColors = [0xf6f1e4, 0xffd84a, 0x58b54a, 0xff8a2a, 0xff9a7a, 0xe2452f, 0xf29a9a];
  binColors.forEach((c, i) => {
    const side = i < 4 ? -1 : 1;
    const k = i < 4 ? i : i - 4;
    const x = side * (0.62 + (k % 2) * 0.3);
    const z = -0.2 - Math.floor(k / 2) * 0.32;
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.09, 40, 1, true), steel);
    bin.material.side = THREE.DoubleSide;
    bin.position.set(x, 0.945, z);
    const fill = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(c, 0.85));
    fill.scale.y = 0.45;
    fill.position.set(x, 0.95, z);
    truck.add(bin, fill);
  });
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
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 16), poleM);
    pole.position.set(lx, 1.55, -3.9);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12), lampM);
    lamp.position.set(lx, 3.4, -3.9);
    const light = new THREE.PointLight(0xffc98a, 2, 7, 1.5);
    light.position.set(lx, 3.2, -3.9);
    truck.add(pole, lamp, light);
  }

  const trunkM = std(0x3a2a20, 1);
  const leafM = std(0x24453a, 1);
  for (const tx of [-5.5, -2.6, 2.9, 6.2]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.6, 14), trunkM);
    trunk.position.set(tx, 0.55, -4.0);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), leafM);
    leaf.position.set(tx, 1.9, -4.0);
    leaf.scale.y = 1.15;
    truck.add(trunk, leaf);
  }

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
  // 바깥 풍경(땅·건물)은 그림자 범위 밖이라 드리울 필요가 없다
  ground.userData.noShadow = true;
  enableShadows(scene);

  const setPlace = (p: Place) => {
    truck.visible = p === 'truck';
    home.visible = p === 'home';
    const bg = p === 'truck' ? 0x0b1026 : 0x1a1420;
    (scene.background as THREE.Color).setHex(bg);
    scene.fog!.color.setHex(bg);
  };
  setPlace('home');
  return { scene, setPlace, flames, fireLight, keyLight, keyBase: keyLight.intensity, plate, plateFood };
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
  box(g, 0.42, 0.025, 0.28, std(0xd9b27a, 0.8), 0.85, 0.91, -0.35);
  // 펜던트 조명
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 32, 1, true), std(0x2f4a3e, 0.6));
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
