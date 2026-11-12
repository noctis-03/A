import * as THREE from 'three';
import type { Recipe } from './ingredients';

const SKIN = [0xf6d2b0, 0xe8b88f, 0xc98f62, 0x9a6a45, 0xfbe0c8];
const SHIRT = [0x3b82c4, 0xd9534f, 0x4caf7a, 0xf0b23a, 0x8e62c9, 0x2f3a4a, 0xf08fb0, 0xffffff];
const HAIR = [0x1d1a18, 0x3a2a1c, 0x6b4a2b, 0xb8894e, 0x55555c];
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const GROUND = -0.25;
const STAND_Z = -1.72;

export type CustomerState = 'arriving' | 'waiting' | 'reacting' | 'leaving' | 'gone';

export class Customer {
  readonly group = new THREE.Group();
  readonly head = new THREE.Vector3();
  state: CustomerState = 'arriving';
  patience: number;
  /** 말풍선에 띄울 문장 */
  say = '';
  private t = 0;
  private dir: number;
  private standX: number;
  private body: THREE.Mesh;
  private headMesh: THREE.Group;
  private armR: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    readonly recipe: Recipe,
    readonly maxPatience: number,
  ) {
    this.patience = maxPatience;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.standX = 0.45 + Math.random() * 0.25;
    const scale = 0.94 + Math.random() * 0.12;

    const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRT), roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ color: pick(HAIR), roughness: 0.9 });

    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.75, 12), new THREE.MeshStandardMaterial({ color: 0x33384a, roughness: 0.9 }));
    legs.position.y = 0.375;
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 14), shirt);
    this.body.position.y = 1.05;

    this.headMesh = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 16), skin);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairCap.rotation.x = -0.25;
    this.headMesh.add(skull, hairCap);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x1b1b1f });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeM);
      eye.position.set(sx * 0.055, 0.015, 0.145);
      this.headMesh.add(eye);
    }
    if (Math.random() < 0.3) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.172, 0.12, 16), shirt);
      cap.position.y = 0.125;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.12), shirt);
      brim.position.set(0, 0.09, 0.2);
      this.headMesh.add(cap, brim);
    }
    this.headMesh.position.y = 1.52;

    const armGeo = new THREE.CapsuleGeometry(0.055, 0.34, 4, 8).translate(0, -0.2, 0);
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

  /** 음식을 받거나 포기하고 반응을 보인 뒤 떠난다 */
  react(text: string) {
    this.say = text;
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
        this.say = `${this.recipe.name} 주세요!`;
        this.t = 0;
      }
    } else if (this.state === 'waiting') {
      this.patience -= dt;
      const impatient = 1 - this.patienceFrac;
      // 기다릴수록 몸을 들썩인다
      this.body.rotation.z = Math.sin(this.t * (1.5 + impatient * 5)) * (0.02 + impatient * 0.05);
      this.headMesh.rotation.x = 0.25 + Math.sin(this.t * 1.3) * 0.05; // 웍을 내려다본다
      this.armR.rotation.x = 0;
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
    this.head.set(g.position.x, g.position.y + 1.78 * g.scale.y, g.position.z);
  }
}
