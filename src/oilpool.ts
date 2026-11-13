import * as THREE from 'three';

const G = 9.8;
const MAX_RIPPLES = 8;

/**
 * 웍 안에 고인 기름.
 *
 * 웍은 구의 일부(구 중심 C = (0, R, 0))라서, 액체 수면을 평면으로 보면
 * 고인 부피는 '구 중심에서 수면까지의 거리 d' 하나로만 정해진다.
 * 그래서 수면이 어느 쪽으로 기울어도 d 를 그대로 두면 부피가 보존된다.
 *
 * 수면의 법선은 겉보기 중력(중력 − 웍 가속도) 반대 방향을 감쇠 스프링으로 따라간다.
 * → 웍을 기울이면 낮은 쪽으로 흐르고, 세게 흔들면 늦게 따라오며 출렁인다.
 *
 * 수면의 잔물결(방울이 떨어진 자리의 동심원, 출렁임 물결, 열 아지랑이)은
 * 셰이더에서 높이 함수를 만들어 법선만 흔든다 (반사가 일렁이며 액체처럼 보인다).
 */
export class OilPool {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  /** 0~1: 화구 열. 아지랑이처럼 잔물결이 인다 */
  heat = 0.4;

  private depth = 0;
  /** 월드 기준 수면 기울기 (법선 = normalize(sx, 1, sz)) 와 그 속도 */
  private sx = 0;
  private sz = 0;
  private vx = 0;
  private vz = 0;
  private time = 0;
  private rippleNext = 0;
  /** 이번 수면 원판의 중심 · 방향 · 반지름 (웍 로컬) */
  private center = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private quatInv = new THREE.Quaternion();
  private radius = 0;

  private u = {
    uTime: { value: 0 },
    uRadius: { value: 0.05 },
    uHeat: { value: 0.4 },
    uSlosh: { value: 0 },
    uSloshDir: { value: new THREE.Vector2(1, 0) },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };

  private n = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);
  private tmp = new THREE.Vector3();

  constructor(
    private R: number,
    private H: number,
  ) {
    this.material = new THREE.MeshStandardMaterial({
      // 기름은 거의 투명하고 반사가 주인공: 바탕은 어두운 호박색으로 웍을 살짝 물들이고,
      // 위에 비친 조명·창이 일렁이며 '젖은' 느낌을 낸다
      color: 0x8a5a12,
      roughness: 0.035,
      metalness: 0,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      envMapIntensity: 2.6,
    });
    this.material.userData.keepPbr = true;
    this.material.onBeforeCompile = (shader) => this.patch(shader);
    this.material.customProgramCacheKey = () => 'oil-pool';
    // 원판은 XY 평면, +Z 가 수면 위쪽. 고리 분할로 가장자리까지 매끈하게
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.0001, 1, 72, 6), this.material);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    this.mesh.userData.noShadow = true;
  }

  /** 고인 기름의 깊이(웍 바닥에서 수평일 때 수면 높이, m) */
  setDepth(y: number) {
    this.depth = y;
    this.mesh.visible = y > 0.0005;
  }

  /**
   * 물리 한 스텝.
   * accel: 웍의 월드 가속도, wokInverse: 웍 월드→로컬 행렬
   */
  step(h: number, accel: THREE.Vector3, wokInverse: THREE.Matrix4) {
    this.time += h;
    // 목표 기울기: 겉보기 중력 반대 방향 (a + g↑)
    const gy = Math.max(2, G + accel.y);
    const tx = THREE.MathUtils.clamp(accel.x / gy, -1.2, 1.2);
    const tz = THREE.MathUtils.clamp(accel.z / gy, -1.2, 1.2);
    // 한 번 출렁이는 데 약 1초, 기름이라 조금 끈적하게 감쇠
    const w = 6.2;
    const zeta = 0.16;
    this.vx += (w * w * (tx - this.sx) - 2 * zeta * w * this.vx) * h;
    this.vz += (w * w * (tz - this.sz) - 2 * zeta * w * this.vz) * h;
    this.sx += this.vx * h;
    this.sz += this.vz * h;
    if (!this.mesh.visible) return;

    // 월드 법선 → 웍 로컬
    const nL = this.n.set(this.sx, 1, this.sz).normalize().transformDirection(wokInverse);
    const R = this.R;
    const d = R - this.depth;
    // 원판이 림을 넘지 않을 만큼만 기울인다 (넘치면 림까지 차오른 모양으로 멈춤)
    const top = (n: THREE.Vector3) => {
      const r = Math.sqrt(Math.max(0, R * R - d * d));
      return R - n.y * d + r * Math.sqrt(Math.max(0, 1 - n.y * n.y));
    };
    const limit = this.H - 0.006;
    if (top(nL) > limit) {
      let lo = 0;
      let hi = 1;
      const n0 = this.tmp.copy(nL);
      for (let i = 0; i < 10; i++) {
        const k = (lo + hi) / 2;
        nL.copy(n0).lerp(this.up, k).normalize();
        if (top(nL) > limit) lo = k;
        else hi = k;
      }
      nL.copy(n0).lerp(this.up, hi).normalize();
    }
    const r = Math.sqrt(Math.max(0, R * R - d * d));
    this.radius = r;
    // 수면 원판: 구 중심에서 법선 반대로 d 만큼
    this.center.set(-nL.x * d, R - nL.y * d, -nL.z * d);
    this.quat.setFromUnitVectors(this.zAxis, nL);
    this.quatInv.copy(this.quat).invert();
    this.mesh.position.copy(this.center).addScaledVector(nL, 0.0008);
    this.mesh.quaternion.copy(this.quat);
    // 웍 벽 면이 각져 있어 가장자리가 살짝 삐져나오지 않게 아주 조금 줄인다
    this.mesh.scale.setScalar(Math.max(0.001, r * 0.985));
  }

  /** 프레임마다: 셰이더 유니폼 */
  update() {
    const u = this.u;
    u.uTime.value = this.time;
    u.uRadius.value = Math.max(0.001, this.radius);
    u.uHeat.value = this.heat;
    const sp = Math.hypot(this.vx, this.vz);
    u.uSlosh.value = Math.min(1.5, sp * 0.9);
    if (sp > 1e-4) {
      // 출렁임 방향을 원판 평면 좌표로
      const dir = this.tmp.set(this.vx, 0, this.vz).normalize().applyQuaternion(this.quatInv);
      u.uSloshDir.value.set(dir.x, dir.y).normalize();
    }
  }

  /** 기름방울이 웍 로컬 좌표 p 에 떨어졌다 → 그 자리에서 동심원 물결 */
  splash(local: THREE.Vector3, strength = 1) {
    if (!this.mesh.visible) return;
    const p = this.tmp.copy(local).sub(this.center).applyQuaternion(this.quatInv);
    const rr = Math.hypot(p.x, p.y);
    // 수면 밖(마른 벽)에 떨어지면 벽을 타고 흘러내려 가장자리에서 물결이 인다
    if (rr > this.radius * 0.95) {
      const k = (this.radius * 0.9) / Math.max(rr, 1e-5);
      p.x *= k;
      p.y *= k;
      strength *= 0.6;
    }
    const slot = this.u.uRipples.value[this.rippleNext];
    this.rippleNext = (this.rippleNext + 1) % MAX_RIPPLES;
    slot.set(p.x, p.y, this.time, strength);
  }

  private patch(shader: THREE.WebGLProgramParametersWithUniforms) {
    Object.assign(shader.uniforms, this.u);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `varying vec2 vDiscP;
        varying vec3 vTanX;
        varying vec3 vTanY;
        void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDiscP = position.xy;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vTanX = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );
        vTanY = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vDiscP;
        varying vec3 vTanX;
        varying vec3 vTanY;
        uniform float uTime;
        uniform float uRadius;
        uniform float uHeat;
        uniform float uSlosh;
        uniform vec2 uSloshDir;
        uniform vec4 uRipples[ ${MAX_RIPPLES} ];

        // 수면 높이 (m). p 는 원판 위 좌표 (m)
        float oilH( vec2 p ) {
          float h = 0.0;
          // 열 아지랑이: 잘게 흐르는 잔물결
          h += uHeat * 0.00010 * ( sin( p.x * 310.0 + uTime * 9.0 ) * sin( p.y * 270.0 - uTime * 7.0 )
            + 0.6 * sin( ( p.x + p.y ) * 520.0 + uTime * 13.0 ) );
          // 출렁임 물결
          vec2 sp = vec2( dot( p, uSloshDir ), dot( p, vec2( -uSloshDir.y, uSloshDir.x ) ) );
          h += uSlosh * 0.00045 * ( 0.6 * sin( sp.x * 150.0 - uTime * 11.0 + 0.8 * sin( sp.y * 70.0 ) )
            + 0.4 * sin( sp.x * 90.0 + sp.y * 120.0 - uTime * 8.0 ) );
          // 방울 자리의 동심원
          for ( int i = 0; i < ${MAX_RIPPLES}; i ++ ) {
            vec4 r = uRipples[ i ];
            float age = uTime - r.z;
            if ( age < 0.0 || age > 1.8 ) continue;
            float dist = length( p - r.xy );
            float front = age * 0.085;
            float x = ( dist - front ) / 0.014;
            float env = exp( -age * 2.4 ) * exp( -x * x );
            h += r.w * 0.0007 * env * sin( ( dist - front ) * 480.0 );
          }
          return h;
        }`,
      )
      .replace(
        '#include <alphamap_fragment>',
        `#include <alphamap_fragment>
        {
          float rr = length( vDiscP );
          // 가장자리는 얇은 막이라 투명하게 사라지고, 가운데는 두꺼워 진한 호박색
          diffuseColor.a *= smoothstep( 1.0, 0.8, rr );
          // 얇은 가장자리는 빛이 비쳐 금색, 두꺼운 가운데는 진한 호박색
          diffuseColor.rgb *= mix( 0.8, 1.25, smoothstep( 0.5, 0.95, rr ) );
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 pp = vDiscP * uRadius;
          float e = 0.0006;
          float h0 = oilH( pp );
          float gx = ( oilH( pp + vec2( e, 0.0 ) ) - h0 ) / e;
          float gy = ( oilH( pp + vec2( 0.0, e ) ) - h0 ) / e;
          normal = normalize( normal - vTanX * gx - vTanY * gy );
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // 비스듬히 볼수록 반사가 강해져 더 진하게 보인다
          float fr = pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
          diffuseColor.a = mix( diffuseColor.a, min( 1.0, diffuseColor.a * 1.5 ), fr );
        }
        #include <opaque_fragment>`,
      );
  }
}
