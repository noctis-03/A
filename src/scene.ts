import * as THREE from 'three';

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

export interface World {
  scene: THREE.Scene;
  flames: THREE.Mesh[];
  fireLight: THREE.PointLight;
  plate: THREE.Group;
  plateFood: THREE.Mesh;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4f5);
  scene.fog = new THREE.Fog(0xbfe3f7, 14, 42);

  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x54463a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d6, 1.5);
  sun.position.set(-3, 6, -5);
  scene.add(sun);
  const inside = new THREE.PointLight(0xffe2b8, 1.6, 6, 1.6);
  inside.position.set(0, 2.1, 0.1);
  scene.add(inside);

  // ── 트럭 내부 ──
  const steel = std(0xb9bec6, 0.35, 0.75);
  const wall = std(0xf3ead8, 0.9);
  const trim = std(0xd2452f, 0.6);
  const dark = std(0x2a2b30, 0.6, 0.4);

  box(scene, 3.2, 0.04, 2.6, std(0x55585f, 0.9), 0, -0.02, 0.2); // 바닥
  box(scene, 2.9, 0.86, 1.22, std(0x8d939c, 0.5, 0.6), 0, 0.43, -0.4); // 조리대 몸체
  box(scene, 2.96, 0.04, 1.28, steel, 0, 0.88, -0.4); // 조리대 상판
  // 벽
  box(scene, 0.08, 2.4, 2.8, wall, -1.5, 1.2, 0.2);
  box(scene, 0.08, 2.4, 2.8, wall, 1.5, 1.2, 0.2);
  box(scene, 3.1, 0.08, 2.8, wall, 0, 2.36, 0.2);
  // 앞 벽: 창문 위 띠, 양쪽 기둥, 창턱
  box(scene, 3.1, 0.34, 0.08, wall, 0, 2.2, -1.04);
  box(scene, 0.22, 1.2, 0.08, wall, -1.42, 1.5, -1.04);
  box(scene, 0.22, 1.2, 0.08, wall, 1.42, 1.5, -1.04);
  box(scene, 2.9, 0.05, 0.3, trim, 0, 0.925, -1.08); // 서빙 선반
  box(scene, 3.1, 1.2, 0.06, std(0xe9573f, 0.6), 0, 0.3, -1.06); // 트럭 외장 (아래)

  // 차양
  const awningTex = canvasTexture(256, 64, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fff6e6' : '#e9573f';
      c.fillRect(i * 32, 0, 32, 64);
    }
  });
  const awning = box(scene, 3.3, 0.04, 1.0, new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.9 }), 0, 2.2, -1.5);
  awning.rotation.x = -0.28;

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
        color: i % 2 ? 0x4fa8ff : 0xffa63d,
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
  const fireLight = new THREE.PointLight(0xff8a30, 0.8, 2.2, 2);
  fireLight.position.set(0, 1.0, -0.38);
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
    scene.add(bin, fill);
  });
  // 소스병
  [0x3a2416, 0xc93a2a].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 12), std(c, 0.3));
    b.position.set(1.2, 1.0, -0.75 + i * 0.12);
    scene.add(b);
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
    c.fillText('웍 트럭', 256, 110);
    c.font = '40px sans-serif';
    c.fillStyle = '#ffcf6b';
    c.fillText('불맛 볶음밥 전문', 256, 190);
  });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: menuTex }));
  menu.position.set(-1.455, 1.75, -0.35);
  menu.rotation.y = Math.PI / 2;
  scene.add(menu);

  // ── 바깥 풍경 ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), std(0x6f747a, 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.25, -28);
  scene.add(ground);
  box(scene, 80, 0.06, 3.2, std(0xcfc8ba, 1), 0, -0.23, -2.7); // 보도
  for (let i = -6; i <= 6; i++) box(scene, 1.6, 0.01, 0.16, std(0xf2f2f2, 1), i * 3.4, -0.24, -7.5); // 차선

  const winTex = canvasTexture(128, 256, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = Math.random() < 0.3 ? '#ffe9a8' : '#7fa6c4';
        c.fillRect(8 + x * 30, 10 + y * 30, 22, 20);
      }
  });
  const palette = [0xe8c9a0, 0xd9a58c, 0xb8cfd6, 0xe6dccb, 0xc9b7d9, 0xa9c7a5];
  let bx = -22;
  let k = 0;
  while (bx < 22) {
    const w = 3 + Math.random() * 3;
    const h = 4 + Math.random() * 8;
    const mat = new THREE.MeshStandardMaterial({ color: palette[k++ % palette.length], map: winTex, roughness: 0.9 });
    box(scene, w, h, 4, mat, bx + w / 2, h / 2 - 0.25, -14 - Math.random() * 2);
    bx += w + 0.3;
  }
  const trunkM = std(0x7a5a3c, 1);
  const leafM = std(0x5faa58, 1);
  for (const tx of [-5.5, -2.6, 2.9, 6.2]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.6, 8), trunkM);
    trunk.position.set(tx, 0.55, -4.0);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), leafM);
    leaf.position.set(tx, 1.9, -4.0);
    leaf.scale.y = 1.15;
    scene.add(trunk, leaf);
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

  return { scene, flames, fireLight, plate, plateFood };
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
