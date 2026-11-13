import * as THREE from 'three';
import type { Recipe } from './ingredients';
import { orderSpeech, type Order } from './requests';
import { faceGeometry, faceTexture, type Mood } from './faces';
import { toonMat } from './look';

/** 머리를 몸보다 키운 카툰 비율 */
const HEAD_SCALE = 1.18;
const HEAD_Y = 1.56;

const SKIN = [0xf6d2b0, 0xe8b88f, 0xc98f62, 0x9a6a45, 0xfbe0c8];
const SHIRT = [0x3b82c4, 0xd9534f, 0x4caf7a, 0xf0b23a, 0x8e62c9, 0x2f3a4a, 0xf08fb0, 0xffffff];
const HAIR = [0x1d1a18, 0x3a2a1c, 0x6b4a2b, 0xb8894e, 0x55555c];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const GROUND = -0.25;

/** 재료가 높이 떴을 때 손님 감탄 */
const WOW = ['오~!', '와, 불맛!', '우와!', '오오 멋져요!'];
const STAND_Z = -1.72;

export type CustomerState = 'arriving' | 'waiting' | 'reacting' | 'leaving' | 'gone';

export class Customer {
  readonly group = new THREE.Group();
  readonly head = new THREE.Vector3();
  state: CustomerState = 'arriving';
  patience: number;
  /** 말풍선에 띄울 문장 */
  say = '';
  /** 지금 바라볼 곳 (웍). 게임 쪽에서 매 프레임 넣어 준다 */
  readonly lookAt = new THREE.Vector3(0, 1, -0.38);
  /** 0~1: 웍질로 재료가 높이 뜰수록 커진다 → 감탄 표정 · '오~!' */
  excite = 0;
  /** 지금 표정 */
  mood: Mood = 'neutral';
  private reactMood: Mood = 'happy';
  private face!: THREE.Mesh;
  private faceMat!: THREE.MeshToonMaterial;
  private shownFace = '';
  private blinkIn = 1 + Math.random() * 3;
  private blinkT = 0;
  private wowCd = 0;
  private flashT = 0;
  private orderSay = '';
  private yaw = 0;
  private pitch = 0.25;

  /** 주문하고 기다린 시간 (초) */
  get waited() {
    return this.state === 'waiting' ? this.t : 0;
  }

  get recipe(): Recipe {
    return this.order.recipe;
  }
  private t = 0;
  private dir: number;
  private standX: number;
  private body: THREE.Mesh;
  private headMesh: THREE.Group;
  private armR: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    /** 요청사항이 반영된 주문 */
    readonly order: Order,
    readonly maxPatience: number,
  ) {
    this.patience = maxPatience;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.standX = 0.45 + Math.random() * 0.25;
    const scale = 0.94 + Math.random() * 0.12;

    const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRT), roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: pick(HAIR), roughness: 0.9 });

    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.75, 24), new THREE.MeshStandardMaterial({ color: 0x33384a, roughness: 0.9 }));
    legs.position.y = 0.375;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 8, 28), shirt);
    this.body.position.y = 1.05;

    this.headMesh = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 36, 24), skin);
    // 앞머리 선을 눈썹 위(약 70°)까지 올려 얼굴이 보이게, 뒤로는 길게 덮는다
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 36, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    hairCap.rotation.x = -0.35;
    // 얼굴: 표정을 그린 텍스처를 머리 앞쪽 곡면에 붙인다
    this.faceMat = toonMat(0xffffff, { map: faceTexture('neutral'), alphaTest: 0.5 });
    this.face = new THREE.Mesh(faceGeometry(0.155), this.faceMat);
    this.face.userData.noShadow = true;
    this.headMesh.add(skull, hairCap, this.face);
    if (Math.random() < 0.3) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.172, 0.12, 32), shirt);
      cap.position.y = 0.125;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.12), shirt);
      brim.position.set(0, 0.09, 0.2);
      this.headMesh.add(cap, brim);
    }
    this.headMesh.position.y = HEAD_Y;
    this.headMesh.scale.setScalar(HEAD_SCALE);
    this.headMesh.rotation.order = 'YXZ';

    const armGeo = new THREE.CapsuleGeometry(0.055, 0.34, 6, 16).translate(0, -0.2, 0);
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(-0.26, 1.28, 0);
    armL.rotation.z = -0.12;
    this.armR = new THREE.Mesh(armGeo, shirt);
    this.armR.position.set(0.26, 1.28, 0);
    this.armR.rotation.z = 0.12;

    this.group.add(legs, this.body, this.headMesh, armL, this.armR);
    this.group.scale.setScalar(scale);
    this.group.position.set(-this.dir * 4.5, GROUND, STAND_Z);
    this.group.rotation.y = (this.dir * Math.PI) / 2;
    scene.add(this.group);
  }

  get patienceFrac() {
    return Math.max(0, this.patience / this.maxPatience);
  }

  /** 음식을 받거나 포기하고 반응을 보인 뒤 떠난다. mood: 반응 표정 */
  react(text: string, mood: Mood = 'happy') {
    this.say = text;
    this.reactMood = mood;
    this.flashT = 0;
    this.state = 'reacting';
    this.t = 0;
  }

  update(dt: number, scene: THREE.Scene) {
    const g = this.group;
    this.t += dt;
    const walk = 1.9;
    if (this.state === 'arriving') {
      g.position.x += this.dir * walk * dt;
      g.position.y = GROUND + Math.abs(Math.sin(this.t * 9)) * 0.03;
      if ((g.position.x - this.standX) * this.dir >= 0) {
        g.position.x = this.standX;
        g.position.y = GROUND;
        g.rotation.y = 0;
        this.state = 'waiting';
        this.say = this.orderSay = orderSpeech(this.order);
        this.t = 0;
      }
    } else if (this.state === 'waiting') {
      this.patience -= dt;
      const impatient = 1 - this.patienceFrac;
      // 기다릴수록 몸을 들썩인다
      this.body.rotation.z = Math.sin(this.t * (1.5 + impatient * 5)) * (0.02 + impatient * 0.05);
      this.armR.rotation.x = 0;
      // 재료가 높이 뜨면 신나서 들썩이고, 가끔 '오~!'
      g.position.y = GROUND + Math.abs(Math.sin(this.t * 13)) * 0.025 * this.excite;
      this.wowCd -= dt;
      if (this.excite > 0.75 && this.wowCd <= 0) {
        this.wowCd = 7;
        this.flashT = 1.4;
        this.say = WOW[Math.floor(Math.random() * WOW.length)];
      }
      if (this.flashT > 0) {
        this.flashT -= dt;
        if (this.flashT <= 0) this.say = this.orderSay;
      }
    } else if (this.state === 'reacting') {
      this.headMesh.rotation.x = 0;
      this.armR.rotation.x = -1.2;
      if (this.t > 1.6) {
        this.state = 'leaving';
        this.say = '';
        g.rotation.y = (this.dir * Math.PI) / 2;
      }
    } else if (this.state === 'leaving') {
      g.position.x += this.dir * walk * 1.15 * dt;
      g.position.y = GROUND + Math.abs(Math.sin(this.t * 9)) * 0.03;
      if (Math.abs(g.position.x) > 5.5) {
        this.state = 'gone';
        scene.remove(g);
      }
    }
    this.updateFace(dt);
    this.head.set(g.position.x, g.position.y + 1.84 * g.scale.y, g.position.z);
  }

  /** 시선 · 숨쉬기 · 표정 · 깜빡임 */
  private updateFace(dt: number) {
    const g = this.group;
    const k = 1 - Math.exp(-dt * 6);
    // 시선: 기다리는 동안 웍(과 떠오른 재료)을 따라본다
    let ty = 0;
    let tp = 0.1;
    if (this.state === 'waiting') {
      const s = g.scale.y;
      const dx = this.lookAt.x - g.position.x;
      const dz = this.lookAt.z - g.position.z;
      const dy = g.position.y + HEAD_Y * s - this.lookAt.y;
      ty = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.7, 0.7) + Math.sin(this.t * 0.9) * 0.04;
      tp = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.35, 0.65);
    }
    this.yaw += (ty - this.yaw) * k;
    this.pitch += (tp - this.pitch) * k;
    this.headMesh.rotation.set(this.pitch, this.yaw, 0);
    // 숨쉬기
    this.body.scale.set(1, 1 + Math.sin(this.t * 2.3) * 0.012, 1);

    // 표정
    if (this.state === 'waiting') {
      const f = this.patienceFrac;
      this.mood = this.excite > 0.55 ? 'wow' : f < 0.25 ? 'angry' : f < 0.5 ? 'worried' : this.t < 4 ? 'happy' : 'neutral';
    } else if (this.state === 'reacting' || this.state === 'leaving') this.mood = this.reactMood;
    else this.mood = 'neutral';
    // 깜빡임 (3~6초마다 0.12초)
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkIn = 2.8 + Math.random() * 3;
      this.blinkT = 0.12;
    }
    this.blinkT -= dt;
    const closed = this.blinkT > 0 && this.mood !== 'delight' && this.mood !== 'shock';
    const key = `${this.mood}${closed}`;
    if (key !== this.shownFace) {
      this.shownFace = key;
      this.faceMat.map = faceTexture(this.mood, closed);
    }
  }
}
