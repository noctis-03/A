import * as THREE from 'three';
import { addOutline, toonMat } from './look';
import { T } from './tuning';
import type { Wok } from './wok';

const G = 9.8;
const MAX_DROPS = 260;

/**
 * 기름통. 꾹 누른 채 끌면 손에 들리고(붓는 자세로 기울어짐),
 * 들고 흔들면 흔드는 세기만큼 기름방울이 떨어진다.
 * 웍 안에 떨어진 방울만 기름으로 쳐 준다.
 */
export class OilBottle {
  readonly group = new THREE.Group();
  /** 눌렀는지 판정할 투명한 큰 몸통 */
  private hit: THREE.Mesh;
  private body = new THREE.Group();
  readonly home = new THREE.Vector3(0.48, 0.895, -0.09);
  held = false;
  private target = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private tilt = 0;
  /** 흔드는 세기 (포인터 속도, 화면 높이/초) */
  private shake = 0;
  private emitAcc = 0;
  private spout = new THREE.Vector3(0, 0.27, 0);
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  /** 조준면: 웍 림 높이. 포인터가 가리키는 곳에 기름이 떨어지게 */
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.09);
  private ray = new THREE.Raycaster();

  // 기름방울
  private drops: THREE.InstancedMesh;
  private dp = new Float32Array(MAX_DROPS * 3);
  private dv = new Float32Array(MAX_DROPS * 3);
  /** 0: 없음, 1: 병에서 나온 방울 (기름 양에 셈), 2: 떨어지며 튄 작은 방울 (안 셈) */
  private alive = new Uint8Array(MAX_DROPS);
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private local = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  /** 이번 프레임에 웍에 들어간 기름 (ml), 게임 쪽에서 읽고 0으로 */
  landed = 0;
  /** 웍 밖으로 흘린 방울 수 */
  wasted = 0;

  constructor(scene: THREE.Scene) {
    // 몸통: 노란 기름이 비치는 병 + 라벨 + 빨간 뚜껑
    const glass = toonMat(0xf5d570, { transparent: true, opacity: 0.55, depthWrite: false });
    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.19, 32), glass);
    bodyMesh.position.y = 0.095;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.045, 0.05, 32), glass);
    shoulder.position.y = 0.215;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0505, 0.0515, 0.07, 32), toonMat(0x2f7a46));
    label.position.y = 0.08;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.035, 24), toonMat(0xd2402e));
    cap.position.y = 0.255;
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 16), toonMat(0xd2402e));
    nozzle.position.y = 0.285;
    // 투명한 병 몸통에는 외곽선을 달지 않는다 (안쪽 선이 비쳐 보여서)
    for (const mesh of [label, cap]) {
      addOutline(mesh);
    }
    this.body.add(bodyMesh, shoulder, label, cap, nozzle);
    this.group.add(this.body);

    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.15;
    this.group.add(this.hit);
    this.group.position.copy(this.home);
    this.target.copy(this.home);
    scene.add(this.group);

    // 매끈한 호박색 기름방울. 웍과 같은 주방 환경맵을 비춰 반짝인다
    this.dropMat = new THREE.MeshStandardMaterial({
      color: 0xf0b23a,
      emissive: 0x3a2200,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      envMapIntensity: 1.4,
    });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 12, 8), this.dropMat, MAX_DROPS);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    scene.add(this.drops);
  }

  private dropMat: THREE.MeshStandardMaterial;

  setEnvMap(tex: THREE.Texture) {
    this.dropMat.envMap = tex;
    this.dropMat.needsUpdate = true;
  }

  /** 화면 좌표(NDC)로 병을 눌렀는지 */
  hitTest(ndc: THREE.Vector2, camera: THREE.Camera) {
    this.ray.setFromCamera(ndc, camera);
    return this.ray.intersectObject(this.hit, false).length > 0;
  }

  grab() {
    this.held = true;
  }

  /** 포인터 위치(NDC)를 따라 병을 옮긴다. speed: 포인터 속도 (화면 높이/초) */
  drag(ndc: THREE.Vector2, camera: THREE.Camera, speed: number) {
    this.ray.setFromCamera(ndc, camera);
    if (this.ray.ray.intersectPlane(this.plane, this.tmp)) {
      this.target.set(
        // 기울인 병의 주둥이가 포인터가 가리키는 곳 바로 위에 오도록 병 몸통을 오른쪽으로 비켜 둔다
        THREE.MathUtils.clamp(this.tmp.x + 0.23, -0.4, 0.9),
        1.32,
        THREE.MathUtils.clamp(this.tmp.z, -0.8, 0.15),
      );
    }
    this.shake = Math.max(this.shake, speed);
  }

  release() {
    this.held = false;
    this.target.copy(this.home);
  }

  reset() {
    this.release();
    this.group.position.copy(this.home);
    this.vel.set(0, 0, 0);
    this.tilt = 0;
    this.alive.fill(0);
    this.drops.count = 0;
  }

  update(dt: number, wok: Wok) {
    // 병 이동 (부드럽게 따라감)
    const k = Math.min(1, dt * 18);
    const prev = this.tmp2.copy(this.group.position);
    this.group.position.lerp(this.target, k);
    this.vel.subVectors(this.group.position, prev).divideScalar(Math.max(dt, 1e-4));
    // 들고 있으면 웍 쪽(왼쪽 아래)으로 기울여 붓는 자세, 흔들면 더 흔들림
    const tiltTarget = this.held ? 2.1 : 0;
    this.tilt += (tiltTarget - this.tilt) * Math.min(1, dt * 10);
    const wobble = this.held ? Math.sin(performance.now() * 0.03) * Math.min(0.25, this.shake * 0.08) : 0;
    this.body.rotation.set(0, 0, this.tilt + wobble - this.vel.x * 0.15);

    // 흔드는 세기만큼 방울이 나온다
    this.shake *= Math.exp(-dt * 4);
    if (this.held && this.tilt > 1.4) {
      const over = Math.max(0, this.shake - T.oilShakeMin);
      const rate = Math.min(T.oilFlow, over * T.oilFlow * 0.6);
      this.emitAcc += rate * dt;
      const sp = this.body.localToWorld(this.tmp.copy(this.spout));
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        this.emit(sp);
      }
    } else {
      this.emitAcc = 0;
    }

    // 방울 물리: 웍 안쪽 면에 닿으면 기름으로 흡수, 바닥/조리대에 닿으면 사라짐
    const mi = wok.inverse.elements;
    const R = wok.R;
    let n = 0;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.alive[i]) continue;
      const o = i * 3;
      this.dv[o + 1] -= G * dt;
      this.dp[o] += this.dv[o] * dt;
      this.dp[o + 1] += this.dv[o + 1] * dt;
      this.dp[o + 2] += this.dv[o + 2] * dt;
      const x = this.dp[o];
      const y = this.dp[o + 1];
      const z = this.dp[o + 2];
      const lx = mi[0] * x + mi[4] * y + mi[8] * z + mi[12];
      const ly = mi[1] * x + mi[5] * y + mi[9] * z + mi[13];
      const lz = mi[2] * x + mi[6] * y + mi[10] * z + mi[14];
      const inside = ly < wok.H && lx * lx + lz * lz < wok.rimR * wok.rimR;
      const d = Math.sqrt(lx * lx + (ly - R) * (ly - R) + lz * lz);
      const kind = this.alive[i];
      if (inside && d > R - 0.008) {
        this.alive[i] = 0;
        this.local.set(lx, ly, lz);
        if (kind === 1) {
          this.landed += T.oilDrop;
          wok.oil.splash(this.local, 1);
          // 떨어진 자리에서 작은 방울이 튀어 오른다
          const v = Math.abs(this.dv[o + 1]);
          if (v > 1.2 && Math.random() < 0.55) this.splashOut(x, y, z, v);
        } else {
          wok.oil.splash(this.local, 0.35);
        }
        continue;
      }
      if (y < 0.9 && !inside) {
        this.alive[i] = 0;
        if (kind === 1) this.wasted++;
        continue;
      }
      if (y < -1) {
        this.alive[i] = 0;
        continue;
      }
      // 속도 방향으로 늘어난 물방울 (빠를수록 길쭉, 부피는 그대로)
      const vx = this.dv[o];
      const vy = this.dv[o + 1];
      const vz = this.dv[o + 2];
      const sp = Math.hypot(vx, vy, vz);
      const stretch = 1 + Math.min(2.6, sp * 0.75);
      const base = kind === 2 ? 0.55 : 1;
      const side = base / Math.sqrt(stretch);
      if (sp > 1e-4) this.q.setFromUnitVectors(this.yAxis, this.dir.set(vx / sp, vy / sp, vz / sp));
      else this.q.identity();
      this.s.set(side, base * stretch, side);
      this.m.compose(this.local.set(x, y, z), this.q, this.s);
      this.drops.setMatrixAt(n++, this.m);
    }
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
  }

  /** 착지한 방울에서 튀는 작은 방울 1~2개 */
  private splashOut(x: number, y: number, z: number, v: number) {
    const k = 1 + Math.round(Math.random());
    for (let j = 0; j < k; j++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_DROPS;
      const o = i * 3;
      this.alive[i] = 2;
      this.dp[o] = x;
      this.dp[o + 1] = y + 0.004;
      this.dp[o + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const h = 0.08 + Math.random() * 0.1;
      this.dv[o] = Math.cos(a) * h;
      this.dv[o + 1] = Math.min(0.7, v * (0.12 + Math.random() * 0.12));
      this.dv[o + 2] = Math.sin(a) * h;
    }
  }

  private emit(at: THREE.Vector3) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_DROPS;
    const o = i * 3;
    this.alive[i] = 1;
    this.dp[o] = at.x + (Math.random() - 0.5) * 0.006;
    this.dp[o + 1] = at.y;
    this.dp[o + 2] = at.z + (Math.random() - 0.5) * 0.006;
    // 병 움직임 일부 + 주둥이 방향으로 살짝
    this.dv[o] = this.vel.x * 0.3 - 0.25 + (Math.random() - 0.5) * 0.15;
    this.dv[o + 1] = this.vel.y * 0.3 - 0.2;
    this.dv[o + 2] = this.vel.z * 0.3 + (Math.random() - 0.5) * 0.15;
  }
}
