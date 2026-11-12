import * as THREE from 'three';
import { INGREDIENTS, type Shape } from './ingredients';
import type { Wok } from './wok';
import { outlineMat, toonMat } from './look';
import { T } from './tuning';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const FREE = 0;
export const LIVE = 1; // 웍 안 / 공중에 있는, 아직 요리에 포함되는 조각
export const SPILLED = 2; // 조리대나 바닥에 떨어진 조각

// 물리·익힘 수치는 tuning.ts 의 T 에서 매 스텝 읽는다

/** 웍 밖 지형 높이: 조리대 / 트럭 바닥 / 트럭 밖 길 */
function groundHeight(x: number, z: number) {
  if (z < -1.02) return -0.25;
  if (z > 0.22 || Math.abs(x) > 1.4) return 0;
  return 0.9;
}

export interface TypeStat {
  n: number;
  avgCook: number;
  /** 같은 재료끼리 익힘 편차 */
  sdCook: number;
  burntFrac: number;
}

export interface DishStats {
  live: number;
  avgCook: number;
  sdCook: number;
  burntFrac: number;
  contacts: number;
}

export class Particles {
  readonly max = 520;
  count = 0;
  px = new Float32Array(this.max);
  py = new Float32Array(this.max);
  pz = new Float32Array(this.max);
  vx = new Float32Array(this.max);
  vy = new Float32Array(this.max);
  vz = new Float32Array(this.max);
  // 각속도 (시각 효과용)
  wx = new Float32Array(this.max);
  wy = new Float32Array(this.max);
  wz = new Float32Array(this.max);
  q = new Float32Array(this.max * 4);
  r = new Float32Array(this.max);
  cook = new Float32Array(this.max);
  burn = new Float32Array(this.max);
  /** 마지막으로 웍에서 떠난 순간의 높이 / 공중에서 도달한 최고 높이 (웍질 보너스용) */
  launchY = new Float32Array(this.max);
  peakY = new Float32Array(this.max);
  /** 마지막으로 웍에 닿은 뒤 지난 시간 */
  air = new Float32Array(this.max);
  age = new Float32Array(this.max);
  type = new Uint8Array(this.max);
  state = new Uint8Array(this.max);

  private speed = new Float32Array(INGREDIENTS.length);
  /** 적정 기름 대비 지금 기름 비율 (1 = 적정). 적으면 달라붙고 빨리 탄다 */
  oilRatio = 1;

  /** 이번 스텝에서 새로 흘린 조각 수 (게임 쪽에서 읽고 0으로 리셋) */
  newlySpilled = 0;
  /** 웍 안으로 무사히 다시 떨어진 조각들이 떠오른 높이(m)의 합 (게임 쪽에서 리셋) */
  tossSum = 0;
  /** 최근 착지한 조각 중 가장 높이 떠오른 높이(m) (게임 쪽에서 읽고 0으로 리셋) */
  tossPeak = 0;
  /** 지금 공중에 떠 있는 조각 중 가장 높이 오른 높이(m), 매 스텝 갱신 (불길 연출용) */
  airLift = 0;
  /** 지금 공중에 높이(5cm 이상) 떠 있는 조각 수 */
  airborne = 0;

  spawn(type: number, x: number, y: number, z: number, vy0 = 0): number {
    let i = -1;
    for (let k = 0; k < this.max; k++) {
      if (this.state[k] === FREE) {
        i = k;
        break;
      }
    }
    if (i < 0) return -1;
    if (i >= this.count) this.count = i + 1;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = (Math.random() - 0.5) * 0.1;
    this.vy[i] = vy0;
    this.vz[i] = (Math.random() - 0.5) * 0.1;
    this.wx[i] = (Math.random() - 0.5) * 8;
    this.wy[i] = (Math.random() - 0.5) * 8;
    this.wz[i] = (Math.random() - 0.5) * 8;
    const a = Math.random() * Math.PI * 2;
    this.q[i * 4] = Math.sin(a) * 0.5;
    this.q[i * 4 + 1] = Math.cos(a) * 0.5;
    this.q[i * 4 + 2] = 0.5;
    this.q[i * 4 + 3] = 0.5;
    this.r[i] = INGREDIENTS[type].radius * (0.9 + Math.random() * 0.2);
    this.cook[i] = 0;
    this.burn[i] = 0;
    this.launchY[i] = y;
    this.peakY[i] = y;
    this.air[i] = 1;
    this.age[i] = 0;
    this.type[i] = type;
    this.state[i] = LIVE;
    return i;
  }

  /** 요리에 포함된(LIVE) 조각을 모두 제거 */
  clearLive() {
    for (let i = 0; i < this.count; i++) if (this.state[i] === LIVE) this.state[i] = FREE;
  }

  clearAll() {
    this.state.fill(FREE);
    this.count = 0;
  }

  /** 재료 종류별 조각 수 · 평균 익힘 · 탄 비율 (웍 안에 있는 조각만) */
  typeStats(): TypeStat[] {
    const out: TypeStat[] = INGREDIENTS.map(() => ({ n: 0, avgCook: 0, sdCook: 0, burntFrac: 0 }));
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] !== LIVE) continue;
      const o = out[this.type[i]];
      o.n++;
      o.avgCook += this.cook[i];
      o.sdCook += this.cook[i] * this.cook[i];
      if (this.burn[i] > 0.5) o.burntFrac++;
    }
    for (const o of out) {
      if (!o.n) continue;
      o.avgCook /= o.n;
      o.sdCook = Math.sqrt(Math.max(0, o.sdCook / o.n - o.avgCook * o.avgCook));
      o.burntFrac /= o.n;
    }
    return out;
  }

  stats(): DishStats {
    let n = 0;
    let sum = 0;
    let sum2 = 0;
    let burnt = 0;
    let contacts = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] !== LIVE) continue;
      n++;
      const c = this.cook[i];
      sum += c;
      sum2 += c * c;
      if (this.burn[i] > 0.5) burnt++;
      if (this.air[i] < 0.05) contacts++;
    }
    if (n === 0) return { live: 0, avgCook: 0, sdCook: 0, burntFrac: 0, contacts: 0 };
    const avg = sum / n;
    return {
      live: n,
      avgCook: avg,
      sdCook: Math.sqrt(Math.max(0, sum2 / n - avg * avg)),
      burntFrac: burnt / n,
      contacts,
    };
  }

  step(h: number, wok: Wok, heat: number) {
    const { px, py, pz, vx, vy, vz, r, state } = this;
    const n = this.count;
    const drag = 1 - T.airDrag * h;
    const G = T.gravity;
    const RESTITUTION = T.restitution;
    // 기름이 모자랄수록 마찰이 커지고 더 빨리 탄다
    const dry = clamp01(1 - this.oilRatio);
    const FRICTION = T.friction * (1 + T.oilDryFriction * dry) * (this.oilRatio > 1 ? Math.max(0.6, 1 - (this.oilRatio - 1) * 0.3) : 1);
    const burnStart = T.burnStart - T.oilDryBurn * dry;
    const STICK = T.stickiness;
    const COOK_RATE = T.cookRate;
    const TOSS_MIN = T.tossMin;
    const SPILL_LIFE = T.spillLife;
    // 재료별 익는 속도
    const speed = this.speed;
    for (let t = 0; t < INGREDIENTS.length; t++) speed[t] = T[INGREDIENTS[t].speedKey];

    for (let i = 0; i < n; i++) {
      if (state[i] === FREE) continue;
      vy[i] -= G * h;
      vx[i] *= drag;
      vy[i] *= drag;
      vz[i] *= drag;
      px[i] += vx[i] * h;
      py[i] += vy[i] * h;
      pz[i] += vz[i] * h;
    }

    // 조각끼리 충돌 (위치 보정 + 접근 속도 제거)
    for (let i = 0; i < n; i++) {
      if (state[i] === FREE) continue;
      const xi = px[i];
      const yi = py[i];
      const zi = pz[i];
      const ri = r[i];
      for (let j = i + 1; j < n; j++) {
        if (state[j] === FREE) continue;
        const dx = px[j] - xi;
        const rr = ri + r[j];
        if (dx > rr || dx < -rr) continue;
        const dy = py[j] - yi;
        if (dy > rr || dy < -rr) continue;
        const dz = pz[j] - zi;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        const pen = (rr - d) * 0.5;
        px[i] -= nx * pen;
        py[i] -= ny * pen;
        pz[i] -= nz * pen;
        px[j] += nx * pen;
        py[j] += ny * pen;
        pz[j] += nz * pen;
        const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz;
        if (rv < 0) {
          const imp = rv * 0.5 * (1 + RESTITUTION);
          vx[i] += nx * imp;
          vy[i] += ny * imp;
          vz[i] += nz * imp;
          vx[j] -= nx * imp;
          vy[j] -= ny * imp;
          vz[j] -= nz * imp;
        }
      }
    }

    const m = wok.matrix.elements;
    const mi = wok.inverse.elements;
    const mp = wok.prevMatrix.elements;
    const R = wok.R;
    const H = wok.H;
    const rim = wok.rimR;
    this.airLift = 0;
    this.airborne = 0;

    for (let i = 0; i < n; i++) {
      const st = state[i];
      if (st === FREE) continue;
      const x = px[i];
      const y = py[i];
      const z = pz[i];
      const ri = r[i];
      let touched = false;

      if (st === LIVE) {
        // 웍 로컬 좌표
        let lx = mi[0] * x + mi[4] * y + mi[8] * z + mi[12];
        let ly = mi[1] * x + mi[5] * y + mi[9] * z + mi[13];
        let lz = mi[2] * x + mi[6] * y + mi[10] * z + mi[14];
        const dx = lx;
        const dy = ly - R;
        const dz = lz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const inside = ly < H + 0.06 && dx * dx + dz * dz < rim * rim;

        if (ly < H && dist > R - ri && dist < R + 0.035) {
          touched = true;
          const s = (R - ri) / dist;
          lx = dx * s;
          ly = R + dy * s;
          lz = dz * s;
          // 안쪽을 향하는 법선 (로컬 → 월드)
          const nlx = -dx / dist;
          const nly = -dy / dist;
          const nlz = -dz / dist;
          const nx = m[0] * nlx + m[4] * nly + m[8] * nlz;
          const ny = m[1] * nlx + m[5] * nly + m[9] * nlz;
          const nz = m[2] * nlx + m[6] * nly + m[10] * nlz;
          const X = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
          const Y = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
          const Z = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
          // 접촉점에서의 웍 표면 속도 (이전 프레임 변환과의 차분)
          const sx = (X - (mp[0] * lx + mp[4] * ly + mp[8] * lz + mp[12])) / h;
          const sy = (Y - (mp[1] * lx + mp[5] * ly + mp[9] * lz + mp[13])) / h;
          const sz = (Z - (mp[2] * lx + mp[6] * ly + mp[10] * lz + mp[14])) / h;
          px[i] = X;
          py[i] = Y;
          pz[i] = Z;
          let rx = vx[i] - sx;
          let ry = vy[i] - sy;
          let rz = vz[i] - sz;
          const vn = rx * nx + ry * ny + rz * nz;
          if (vn < 0) {
            const jn = -vn * (1 + RESTITUTION);
            rx += nx * jn;
            ry += ny * jn;
            rz += nz * jn;
            // 쿨롱 마찰 + 약간의 점성 (눌어붙는 느낌)
            const tn = rx * nx + ry * ny + rz * nz;
            const tx = rx - nx * tn;
            const ty = ry - ny * tn;
            const tz = rz - nz * tn;
            const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
            if (tl > 1e-6) {
              const f = Math.min(tl, FRICTION * jn + tl * STICK * h) / tl;
              rx -= tx * f;
              ry -= ty * f;
              rz -= tz * f;
            }
            // 구르는 회전
            const inv = 1 / ri;
            this.wx[i] = (ny * rz - nz * ry) * inv;
            this.wy[i] = (nz * rx - nx * rz) * inv;
            this.wz[i] = (nx * ry - ny * rx) * inv;
          }
          vx[i] = sx + rx;
          vy[i] = sy + ry;
          vz[i] = sz + rz;

          // 가열: 바닥 쪽일수록 뜨겁다
          const hot = ly < 0.075 ? 1 : T.cookSideFactor;
          this.cook[i] += COOK_RATE * speed[this.type[i]] * hot * heat * h;
          // 웍질: 공중에 떴다가 웍 안으로 다시 떨어지면 떠오른 높이만큼 점수
          if (this.air[i] > 0.08) {
            const lift = this.peakY[i] - this.launchY[i];
            if (lift > TOSS_MIN) {
              this.tossSum += lift;
              if (lift > this.tossPeak) this.tossPeak = lift;
            }
          }
          this.air[i] = 0;
          this.launchY[i] = py[i];
          this.peakY[i] = py[i];
        } else if (inside) {
          // 다른 재료 위에 얹혀 있음 → 천천히 익는다
          this.cook[i] += COOK_RATE * speed[this.type[i]] * T.cookPileFactor * heat * h;
        }
        if (this.cook[i] > burnStart) this.burn[i] += T.burnRate * h * heat;
      }

      if (!touched) {
        this.air[i] += h;
        if (py[i] > this.peakY[i]) this.peakY[i] = py[i];
        if (st === LIVE && this.air[i] > 0.03) {
          const lift = py[i] - this.launchY[i];
          if (lift > this.airLift) this.airLift = lift;
          if (lift > TOSS_MIN) this.airborne++;
        }
        const gy = groundHeight(px[i], pz[i]);
        if (py[i] - ri < gy) {
          // 웍 바로 아래로 파고든 경우는 무시할 수 없으므로 그대로 바닥 처리
          py[i] = gy + ri;
          if (vy[i] < 0) vy[i] = -vy[i] * 0.25;
          const f = Math.max(0, 1 - 9 * h);
          vx[i] *= f;
          vz[i] *= f;
          this.wx[i] *= f;
          this.wy[i] *= f;
          this.wz[i] *= f;
          if (st === LIVE) {
            state[i] = SPILLED;
            this.age[i] = 0;
            this.newlySpilled++;
          }
        }
      }

      if (state[i] === SPILLED) {
        this.age[i] += h;
        if (this.age[i] > SPILL_LIFE || py[i] < -5) state[i] = FREE;
      }
    }
  }
}

// ───────────────────────── 렌더링 ─────────────────────────

function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'grain':
      return new THREE.SphereGeometry(1, 7, 5).scale(1.45, 0.85, 0.9);
    case 'chunk':
      return new THREE.DodecahedronGeometry(1.1, 0).scale(1.25, 0.65, 1);
    case 'ring':
      return new THREE.CylinderGeometry(0.85, 0.85, 0.8, 9);
    case 'cube':
      return new THREE.BoxGeometry(1.4, 1.4, 1.4);
    case 'curl':
      return new THREE.TorusGeometry(0.72, 0.36, 6, 10, Math.PI * 1.35);
    case 'leaf':
      return new THREE.BoxGeometry(2, 0.45, 1.5);
    case 'petal':
      return new THREE.TorusGeometry(0.9, 0.24, 5, 10, Math.PI * 0.9).scale(1, 1, 0.8);
    case 'strip':
      return new THREE.BoxGeometry(2.4, 0.35, 0.95);
    case 'slab':
      return new THREE.BoxGeometry(1.6, 0.8, 1.6);
  }
}

const BURNT = new THREE.Color(0x15110e);
const DARK = new THREE.Color(0x6b4420);

export class ParticleRenderer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private outlines: THREE.InstancedMesh[] = [];
  private raw: THREE.Color[] = [];
  private cooked: THREE.Color[] = [];
  private used: number[] = [];
  private mat = new THREE.Matrix4();
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scl = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(private p: Particles) {
    for (const def of INGREDIENTS) {
      const mesh = new THREE.InstancedMesh(
        shapeGeometry(def.shape),
        toonMat(0xffffff),
        def.count * 8,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.col.set(def.raw));
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.raw.push(new THREE.Color(def.raw));
      this.cooked.push(new THREE.Color(def.cooked));
      this.used.push(0);
      // 외곽선: 같은 인스턴스 행렬을 공유하는 뒷면 메시
      const line = new THREE.InstancedMesh(mesh.geometry, outlineMat(0.16, 0x2a160c), def.count * 8);
      line.instanceMatrix = mesh.instanceMatrix;
      line.count = 0;
      line.frustumCulled = false;
      this.outlines.push(line);
      this.group.add(mesh, line);
    }
  }

  update(dt: number) {
    const p = this.p;
    this.used.fill(0);
    for (let i = 0; i < p.count; i++) {
      if (p.state[i] === FREE) continue;
      const t = p.type[i];
      const mesh = this.meshes[t];
      const k = this.used[t];
      if (k >= mesh.instanceMatrix.count) continue;
      this.used[t] = k + 1;

      // 회전 적분
      const q = p.q;
      const o = i * 4;
      const hx = p.wx[i] * dt * 0.5;
      const hy = p.wy[i] * dt * 0.5;
      const hz = p.wz[i] * dt * 0.5;
      const qx = q[o];
      const qy = q[o + 1];
      const qz = q[o + 2];
      const qw = q[o + 3];
      let nx = qx + hx * qw + hy * qz - hz * qy;
      let ny = qy - hx * qz + hy * qw + hz * qx;
      let nz = qz + hx * qy - hy * qx + hz * qw;
      let nw = qw - hx * qx - hy * qy - hz * qz;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
      nx *= l;
      ny *= l;
      nz *= l;
      nw *= l;
      q[o] = nx;
      q[o + 1] = ny;
      q[o + 2] = nz;
      q[o + 3] = nw;

      let s = p.r[i];
      if (p.state[i] === SPILLED && p.age[i] > T.spillLife - 1) s *= Math.max(0, T.spillLife - p.age[i]);
      this.pos.set(p.px[i], p.py[i], p.pz[i]);
      this.quat.set(nx, ny, nz, nw);
      this.scl.set(s, s, s);
      this.mat.compose(this.pos, this.quat, this.scl);
      mesh.setMatrixAt(k, this.mat);

      const c = p.cook[i];
      this.col.copy(this.raw[t]);
      if (c <= 1) this.col.lerp(this.cooked[t], c);
      else this.col.copy(this.cooked[t]).lerp(DARK, Math.min(1, (c - 1) / 0.9));
      if (p.burn[i] > 0) this.col.lerp(BURNT, Math.min(1, p.burn[i]));
      mesh.setColorAt(k, this.col);
    }
    for (let t = 0; t < this.meshes.length; t++) {
      const mesh = this.meshes[t];
      mesh.count = this.used[t];
      this.outlines[t].count = this.used[t];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
