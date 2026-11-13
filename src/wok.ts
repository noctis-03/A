import * as THREE from 'three';
import { toonify } from './look';
import { T } from './tuning';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * 웍: 구의 일부(spherical cap) 모양 그릇. 플레이어 입력을 따라 움직이는 키네마틱 물체.
 * 로컬 좌표계에서 바닥 중심이 원점, 구의 중심은 (0, R, 0), 림은 y = H.
 */
export class Wok {
  readonly R = 0.3;
  readonly H = 0.13;
  readonly rimR = Math.sqrt(this.R * this.R - (this.R - this.H) * (this.R - this.H));

  readonly base = new THREE.Vector3(0, 0.955, -0.38);
  readonly off = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  pitch = 0;
  roll = 0;
  grabbed = false;


  readonly matrix = new THREE.Matrix4();
  readonly prevMatrix = new THREE.Matrix4();
  readonly inverse = new THREE.Matrix4();
  readonly group = new THREE.Group();
  private oilSheen = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({ color: 0xf7d97a, transparent: true, opacity: 0.28, depthWrite: false }),
  );

  /**
   * 기름 양(ml)만큼 웍 안에 기름이 고인다. 넣는 만큼 수면이 계속 올라가며 넓어진다
   * (림까지 차면 더 넓어지지 않음). 잘 보이도록 실제 부피보다 크게 그린다.
   */
  setOil(ml: number) {
    this.oilSheen.visible = ml > 0.05;
    if (!this.oilSheen.visible) return;
    const R = this.R;
    // 구 모양 그릇에 고인 액체 부피: V = π·y²·(3R − y)/3 → 수면 높이 y 를 이분법으로 구한다
    const V = ml * 1e-6 * 10;
    let lo = 0;
    let hi = this.H;
    for (let i = 0; i < 30; i++) {
      const y = (lo + hi) / 2;
      if ((Math.PI * y * y * (3 * R - y)) / 3 < V) lo = y;
      else hi = y;
    }
    const y = Math.max(0.004, lo);
    const r = Math.sqrt(Math.max(0, R * R - (R - y) * (R - y)));
    this.oilSheen.scale.setScalar(Math.max(0.03, r));
    this.oilSheen.position.y = y + 0.002;
  }

  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private one = new THREE.Vector3(1, 1, 1);

  constructor() {
    this.buildMesh();
    this.group.matrixAutoUpdate = false;
    this.updateMatrix();
    this.prevMatrix.copy(this.matrix);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** 포인터 이동량(m)만큼 목표 위치를 옮긴다 */
  nudge(dx: number, dz: number) {
    this.target.x = clamp(this.target.x + dx, -T.wokRangeX, T.wokRangeX);
    this.target.z = clamp(this.target.z + dz, -T.wokRangeBack, T.wokRangeFront);
  }

  release() {
    this.grabbed = false;
    this.target.set(0, 0, 0);
  }

  step(h: number) {
    this.prevMatrix.copy(this.matrix);
    const w = this.grabbed ? T.wokStiffness : T.wokReturnStiffness;
    const o = this.off;
    const v = this.vel;
    v.x += (w * w * (this.target.x - o.x) - 2 * w * v.x) * h;
    v.z += (w * w * (this.target.z - o.z) - 2 * w * v.z) * h;
    const sp = this.speed;
    // 빠르게 움직일수록 살짝 들어올린다
    const ty = this.grabbed ? Math.min(T.wokLiftMax, T.wokLiftBase + sp * T.wokLiftPerSpeed) : 0;
    const wy = 14;
    v.y += (wy * wy * (ty - o.y) - 2 * wy * v.y) * h;
    o.addScaledVector(v, h);

    // 진행 방향 반대쪽 림이 들리도록 기울인다 → 재료를 퍼 올려 뒤집는 "웍질"
    const pt = clamp(v.z * T.wokTiltGain, -T.wokTiltMax, T.wokTiltMax);
    const rt = clamp(-v.x * T.wokTiltGain, -T.wokTiltMax, T.wokTiltMax);
    const k = Math.min(1, 22 * h);
    this.pitch += (pt - this.pitch) * k;
    this.roll += (rt - this.roll) * k;
    this.updateMatrix();
    for (const { m, base } of this.metals) m.envMapIntensity = base * T.wokShine;
  }

  private updateMatrix() {
    this.pos.copy(this.base).add(this.off);
    this.euler.set(this.pitch, 0, this.roll);
    this.quat.setFromEuler(this.euler);
    this.matrix.compose(this.pos, this.quat, this.one);
    this.inverse.copy(this.matrix).invert();
    this.group.matrix.copy(this.matrix);
  }

  /** 반사(환경맵)를 받는 금속 재질들 */
  private metals: { m: THREE.MeshStandardMaterial; base: number }[] = [];

  /** 주방 환경맵을 금속 재질에 건다 */
  setEnvMap(tex: THREE.Texture) {
    for (const { m } of this.metals) {
      m.envMap = tex;
      m.needsUpdate = true;
    }
  }

  private metal(params: THREE.MeshStandardMaterialParameters, shine: number) {
    const m = new THREE.MeshStandardMaterial(params);
    m.userData.keepPbr = true;
    this.metals.push({ m, base: shine });
    return m;
  }

  private buildMesh() {
    const { R, H } = this;
    const tMax = Math.acos((R - H) / R);
    const pts: THREE.Vector2[] = [];
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tMax;
      pts.push(new THREE.Vector2(Math.max(0.0001, R * Math.sin(t)), R - R * Math.cos(t)));
    }
    const { color, rough } = wokTextures();
    // 안쪽: 길들인 탄소강. 바닥은 검게 그을리고 림 쪽으로 갈수록 강철색, 동심원 연마 자국
    const inner = new THREE.Mesh(
      new THREE.LatheGeometry(pts, 96),
      this.metal({ color: 0xffffff, map: color, roughnessMap: rough, metalness: 0.85, roughness: 1, side: THREE.BackSide }, 0.55),
    );
    const outerPts = pts.map((p) => new THREE.Vector2(p.x + 0.004, p.y - 0.004));
    const outer = new THREE.Mesh(
      new THREE.LatheGeometry(outerPts, 96),
      this.metal({ color: 0x1c1a1a, metalness: 0.75, roughness: 0.55, side: THREE.FrontSide }, 0.7),
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.rimR + 0.002, 0.006, 12, 128),
      this.metal({ color: 0x8a8d94, metalness: 1, roughness: 0.25 }, 1.2),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = H;

    // 손잡이 (플레이어 쪽, +z)
    const handle = new THREE.Group();
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.014, 0.08, 20),
      this.metal({ color: 0x6a6c72, metalness: 1, roughness: 0.3 }, 1),
    );
    neck.rotation.x = Math.PI / 2;
    neck.position.z = 0.04;
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.015, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.75 }),
    );
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.18;
    handle.add(neck, grip);
    handle.position.set(0, H - 0.005, this.rimR);
    handle.rotation.x = -0.22;

    this.group.add(inner, outer, rim, handle);
    toonify(this.group);

    // 웍 바닥에 고인 기름 (양에 따라 넓어진다)
    this.oilSheen.rotation.x = -Math.PI / 2;
    this.oilSheen.position.y = 0.006;
    this.oilSheen.visible = false;
    this.group.add(this.oilSheen);
  }
}

/**
 * 웍 안쪽 텍스처. LatheGeometry 의 v 는 바닥(0) → 림(1) 이라
 * 세로 방향 그라디언트 = 동심원 무늬가 된다.
 */
function wokTextures() {
  const H = 512;
  const mk = (draw: (c: CanvasRenderingContext2D) => void, srgb: boolean) => {
    const cv = document.createElement('canvas');
    cv.width = 4;
    cv.height = H;
    draw(cv.getContext('2d')!);
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  // 캔버스 y=0 이 텍스처 v=1(림) 쪽이다
  const color = mk((c) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6c6e74'); // 림: 밝은 강철
    g.addColorStop(0.25, '#4a4c52');
    g.addColorStop(0.5, '#3a3436'); // 열에 그을린 갈색 띠
    g.addColorStop(0.68, '#2c2a32'); // 푸르스름한 열변색
    g.addColorStop(1, '#151416'); // 바닥: 검게 길들인 부분
    c.fillStyle = g;
    c.fillRect(0, 0, 4, H);
    // 가는 동심원 결
    for (let y = 0; y < H; y += 2) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`;
      c.fillRect(0, y, 4, 1 + Math.round(Math.random()));
    }
  }, true);
  const rough = mk((c) => {
    // 거칠기는 G 채널을 쓴다. 바닥은 기름막으로 매끈, 림 쪽은 연마 자국으로 조금 거칠다
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgb(0,150,0)');
    g.addColorStop(0.6, 'rgb(0,125,0)');
    g.addColorStop(1, 'rgb(0,100,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 4, H);
    for (let y = 0; y < H; y += 3) {
      const v = Math.round(Math.random() * 60);
      c.fillStyle = `rgba(0,${Math.random() < 0.5 ? 255 : 0},0,${v / 255})`;
      c.fillRect(0, y, 4, 1);
    }
  }, false);
  return { color, rough };
}
