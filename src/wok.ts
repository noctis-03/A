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
  }

  private updateMatrix() {
    this.pos.copy(this.base).add(this.off);
    this.euler.set(this.pitch, 0, this.roll);
    this.quat.setFromEuler(this.euler);
    this.matrix.compose(this.pos, this.quat, this.one);
    this.inverse.copy(this.matrix).invert();
    this.group.matrix.copy(this.matrix);
  }

  private buildMesh() {
    const { R, H } = this;
    const tMax = Math.acos((R - H) / R);
    const pts: THREE.Vector2[] = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * tMax;
      pts.push(new THREE.Vector2(Math.max(0.0001, R * Math.sin(t)), R - R * Math.cos(t)));
    }
    const inner = new THREE.Mesh(
      new THREE.LatheGeometry(pts, 48),
      new THREE.MeshStandardMaterial({ color: 0x2b2c31, metalness: 0.85, roughness: 0.42, side: THREE.BackSide }),
    );
    const outerPts = pts.map((p) => new THREE.Vector2(p.x + 0.004, p.y - 0.004));
    const outer = new THREE.Mesh(
      new THREE.LatheGeometry(outerPts, 48),
      new THREE.MeshStandardMaterial({ color: 0x17171a, metalness: 0.7, roughness: 0.6, side: THREE.FrontSide }),
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(this.rimR + 0.002, 0.006, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0x55575e, metalness: 0.9, roughness: 0.3 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = H;

    // 손잡이 (플레이어 쪽, +z)
    const handle = new THREE.Group();
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.014, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a3b40, metalness: 0.8, roughness: 0.4 }),
    );
    neck.rotation.x = Math.PI / 2;
    neck.position.z = 0.04;
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.015, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.75 }),
    );
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.18;
    handle.add(neck, grip);
    handle.position.set(0, H - 0.005, this.rimR);
    handle.rotation.x = -0.22;

    this.group.add(inner, outer, rim, handle);
    toonify(this.group, 0.003);
  }
}
