import * as THREE from 'three';
import { Sfx } from './audio';
import { Customer } from './customers';
import {
  AMOUNT_LABEL,
  INGREDIENTS,
  ING_INDEX,
  MAX_PORTIONS,
  RECIPES,
  START_UNLOCKED,
  ingDef,
  matchRecipe,
  recipeIngs,
  type IngId,
  type Recipe,
} from './ingredients';
import { ParticleRenderer, Particles, type DishStats, type TypeStat } from './physics';
import { buildWorld, Steam } from './scene';
import { Wok } from './wok';
import { enableShadows, FireFx, makeKitchenEnv, Post, toonify } from './look';
import { FIXED_LEVELS, loadQuality, QUALITY_LABEL, QUALITY_LEVELS, resolveQuality, saveQuality, type QualityLevel, type QualityProfile } from './quality';
import { T, loadTuning } from './tuning';
import { DebugPanel, isTyping } from './debug';
import { OilBottle } from './oil';
import { Wipe, type WipeInfo } from './transition';
import { tutorialView, type TutTarget } from './tutorial';
import { installIcons, svgIcon, type UiIcon } from './icons';

// 디버그 패널에서 바꿔 둔 수치를 먼저 불러온다
loadTuning();
installIcons();

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const won = (n: number) => n.toLocaleString('ko-KR');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const SUBSTEP = 1 / 240;
/** 한 프레임 최대 0.1초 분량 */
const MAX_SUBSTEPS = 24;
const GAUGE_MAX = 1.6;
const SAVE_KEY = 'woktruck.save.v1';
const TUTORIAL_RECIPE = 'scallion-egg';

type Phase = 'research' | 'selling';
type State = 'lobby' | Phase | 'result';

interface Save {
  v: 1;
  round: number;
  phase: Phase;
  money: number;
  found: string[];
  best: number;
}

interface Verdict {
  quality: number;
  stars: number;
  pay: number;
  tip: number;
  toss: number;
  tossPay: number;
  comment: string;
}

function readSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Save;
    if (s.v !== 1 || typeof s.round !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}

function writeSave(s: Save | null) {
  try {
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 저장 불가 환경 */
  }
}

/** 재료 이모지 + 이름 */
const ingLabel = (id: IngId) => ingDef(id).name;
/** 재료 아이콘 (스티커형 SVG) */
const tok = (id: IngId, cls = '') => `<span class="tok ${cls}">${svgIcon(`ic-${id}`)}</span>`;
const ICON = (name: string, cls = 'ic') => `<svg class="${cls}"><use href="#i-${name}" /></svg>`;

class Game {
  state: State = 'lobby';
  /** 회차 (= 장사 일차) */
  round = 1;
  money = 0;
  found = new Set<string>();
  best = 0;

  timeLeft = T.dayLength;
  dayMoney = 0;
  dayToss = 0;
  private bookFilter: 'all' | 'found' | 'open' = 'all';
  served = 0;
  lost = 0;
  starsSum = 0;
  starsN = 0;

  customer: Customer | null = null;
  private leaving: Customer[] = [];
  private nextCustomerIn = 1.5;
  /** 지금 웍에 넣은 재료별 횟수 (한 줌 단위) */
  private counts = new Map<IngId, number>();
  /** 재료를 처음 넣은 순서 */
  private order: IngId[] = [];
  private dishTotal = 0;
  private tossPopupCd = 0;
  private stats: DishStats = { live: 0, avgCook: 0, sdCook: 0, burntFrac: 0, contacts: 0 };
  private types: TypeStat[] = [];
  private plateT = -1;
  private plateFrom = new THREE.Vector3();
  private plateTo = new THREE.Vector3(0.45, 0.965, -1.05);
  private plateOwner: Customer | null = null;
  private hinted = false;
  private acc = 0;
  private time = 0;

  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 80);
  readonly world = buildWorld();
  readonly wok = new Wok();
  readonly particles = new Particles();
  readonly particleView = new ParticleRenderer(this.particles);
  readonly steam = new Steam(this.world.scene);
  readonly fire = new FireFx(this.world.scene);
  readonly oil = new OilBottle(this.world.scene);
  readonly wipe = new Wipe();
  /** 지금 웍에 든 기름 (ml) */
  private oilMl = 0;
  readonly debug = new DebugPanel();
  readonly post: Post;
  private camBase = new THREE.Vector3();
  /** 세로 화면 구도: 현재 / 목표 확대(k = 1/tan(fov/2))와 세로 이동(px) */
  private fit = { k: 0, s: 0, x: 0, tk: 0, ts: 0, tx: 0, measureIn: 0, on: false };
  private fitTmp = new THREE.Vector3();
  private shake = 0;
  private flareCd = 0;
  readonly sfx = new Sfx();
  private canvas = $<HTMLCanvasElement>('game');
  private ingButtons = new Map<IngId, HTMLButtonElement>();
  private tmp = new THREE.Vector3();
  private qualityLevel: QualityLevel = loadQuality();
  private quality: QualityProfile = resolveQuality(this.qualityLevel).profile;
  /** 자동 품질: 실측 프레임이 낮아 내려간 상한과 추가 해상도 배율 (이번 접속 동안만) */
  private autoCap: Exclude<QualityLevel, 'auto'> | null = null;
  private renderScale = 1;
  private perf = { t: 0, frames: 0, settle: 3 };
  /** 튜토리얼에서 지금 강조 중인 요소들 */
  private pulsing: HTMLElement[] = [];

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const env = makeKitchenEnv(this.renderer);
    this.wok.setEnvMap(env);
    this.oil.setEnvMap(env);
    this.post = new Post(this.renderer, this.world.scene, this.camera);
    this.applyQuality();
    this.world.scene.add(this.wok.group, this.particleView.group);
    enableShadows(this.wok.group);
    enableShadows(this.oil.group);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.buildUi();
    this.debug.setInfo(() => this.debugInfo());
    this.showLobby();
    this.renderer.setAnimationLoop(() => this.frame());
    // 개발 서버에서만: 콘솔 · 자동 테스트용 핸들 (배포 빌드에서는 빠진다)
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
    // 첫 로딩: 덮인 상태에서 시작해 로비가 드러난다
    this.wipe.run({ kind: 'lobby', icon: 'logo', kicker: 'WOK WOK!', title: '웍웍!', sub: '불맛 볶음밥 푸드트럭' }, () => {}, { covered: true, hold: 1100 });
  }

  private get active() {
    return this.state === 'research' || this.state === 'selling';
  }

  private get unlocked() {
    return Math.min(INGREDIENTS.length, START_UNLOCKED + this.round - 1);
  }

  private isUnlocked(id: IngId) {
    return ING_INDEX[id] < this.unlocked;
  }

  private get tutorial() {
    return this.round === 1 && !this.found.has(TUTORIAL_RECIPE);
  }

  // ───────────── 입력 ─────────────

  private bindInput() {
    const cv = this.canvas;
    let lastX = 0;
    let lastY = 0;
    let pid = -1;
    /** 기름통 흔들기 속도: 최근 0.1초 동안의 포인터 이동 (이벤트 빈도와 무관하게) */
    const trail: { t: number; x: number; y: number }[] = [];
    let holdingOil = false;
    const ndc = new THREE.Vector2();
    const toNdc = (e: PointerEvent) => ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active || pid !== -1 || this.modalOpen()) return;
      pid = e.pointerId;
      cv.setPointerCapture(pid);
      lastX = e.clientX;
      lastY = e.clientY;
      trail.length = 0;
      trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      // 기름통을 누르면 기름통을 들고, 아니면 웍을 잡는다
      holdingOil = this.oil.hitTest(toNdc(e), this.camera);
      if (holdingOil) {
        this.oil.grab();
        this.oil.drag(ndc, this.camera, 0);
      } else {
        this.wok.grabbed = true;
      }
      cv.classList.add('grabbing');
      if (!this.hinted) {
        this.hinted = true;
        $('hint').classList.add('off');
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      if (holdingOil) {
        // 흔들기 세기 = 기름통이 게임 속에서 움직인 속도 (m/s).
        // 화면 픽셀 속도를 '그 자리에서 1px 이 몇 m 인지'로 바꿔서, 화면 크기 · 확대와 상관없이 같은 손놀림이면 같은 양이 나온다
        trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        while (trail.length > 2 && e.timeStamp - trail[1].t > 100) trail.shift();
        let path = 0;
        for (let i = 1; i < trail.length; i++) path += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
        const span = Math.max(30, e.timeStamp - trail[0].t) / 1000;
        const speed = (path / span) * this.metersPerPx(this.aimPoint);
        this.oil.drag(toNdc(e), this.camera, speed);
        return;
      }
      // 손가락이 화면 속 웍을 같은 비율로 끌도록: 웍 자리에서 1px 이 몇 m 인지로 환산
      const s = T.dragGain * this.metersPerPx(this.tmp.copy(this.wok.base).add(this.wok.off));
      this.wok.nudge((e.clientX - lastX) * s, (e.clientY - lastY) * s);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      if (holdingOil) this.oil.release();
      else this.wok.release();
      holdingOil = false;
      cv.classList.remove('grabbing');
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || isTyping(e.target) || this.modalOpen()) return;
      if (this.state === 'selling') {
        e.preventDefault();
        this.serve();
      } else if (this.state === 'research') {
        e.preventDefault();
        this.taste();
      }
    });
  }

  private modalOpen() {
    return ['book', 'taste', 'confirm'].some((id) => !$(id).classList.contains('hidden'));
  }

  private buildUi() {
    const wrap = $('ings');
    for (const def of INGREDIENTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="cnt"></span>${tok(def.id)}<em>${def.name}</em>`;
      b.addEventListener('click', () => this.addIngredient(def.id));
      wrap.appendChild(b);
      this.ingButtons.set(def.id, b);
    }
    $('serve').addEventListener('click', () => this.serve());
    $('taste-btn').addEventListener('click', () => this.taste());
    $('go-sell').addEventListener('click', () => {
      if (this.tutorial) this.startSelling();
      else this.go(this.sellInfo(), () => this.startSelling());
    });
    $('trash').addEventListener('click', () => this.trash());
    $('book-btn').addEventListener('click', () => this.openBook());
    $('lobby-book').addEventListener('click', () => this.openBook());
    $('book-close').addEventListener('click', () => $('book').classList.add('hidden'));
    $('taste-close').addEventListener('click', () => this.closeTaste());
    $('continue').addEventListener('click', () => {
      this.sfx.init();
      const s = readSave();
      if (!s) return;
      this.go(s.phase === 'selling' ? this.sellInfo(s.round) : this.researchInfo(s.round), () => this.continueGame());
    });
    $('newgame').addEventListener('click', () => {
      this.sfx.init();
      if (readSave()) $('confirm').classList.remove('hidden');
      else this.go(this.researchInfo(1), () => this.newGame());
    });
    $('confirm-no').addEventListener('click', () => $('confirm').classList.add('hidden'));
    $('confirm-yes').addEventListener('click', () => {
      $('confirm').classList.add('hidden');
      this.go(this.researchInfo(1), () => this.newGame());
    });
    $('next').addEventListener('click', () => {
      this.go(this.researchInfo(this.round), () => {
        $('dayend').classList.add('hidden');
        this.startResearch();
      });
    });
    $('home-btn').addEventListener('click', () =>
      this.go({ kind: 'lobby', icon: 'home', kicker: 'LOBBY', title: '로비', sub: '진행 상황은 저장돼요' }, () => this.showLobby()),
    );
    const mute = () => {
      const muted = this.sfx.toggleMute();
      for (const id of ['mute', 'lobby-mute']) $(id).innerHTML = ICON(muted ? 'mute' : 'sound');
    };
    $('mute').addEventListener('click', mute);
    $('quality').addEventListener('click', () => this.cycleQuality());
    $('lobby-quality').addEventListener('click', () => this.cycleQuality());
    $('lobby-mute').addEventListener('click', () => {
      this.sfx.init();
      mute();
    });
    for (const b of $('book-tabs').querySelectorAll<HTMLButtonElement>('button')) {
      b.addEventListener('click', () => {
        this.bookFilter = b.dataset.f as 'all' | 'found' | 'open';
        this.openBook();
      });
    }
  }

  /** 품질 단계를 렌더러 · 그림자 · 후처리에 반영하고 버튼 글자를 바꾼다 */
  private applyQuality() {
    const { level, profile } = resolveQuality(this.qualityLevel, this.autoCap);
    this.quality = profile;
    const scale = this.qualityLevel === 'auto' ? this.renderScale : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.maxPixelRatio) * scale);
    const key = this.world.keyLight;
    if (key.shadow.mapSize.x !== profile.shadowSize) {
      key.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    this.post.setQuality(profile);
    const label = this.qualityLevel === 'auto' ? `자동 · ${QUALITY_LABEL[level]}` : QUALITY_LABEL[level];
    for (const id of ['quality', 'lobby-quality']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.querySelector('b')!.textContent = QUALITY_LABEL[this.qualityLevel];
      b.title = `그래픽 품질: ${label}`;
      b.setAttribute('aria-label', `그래픽 품질 바꾸기 (지금 ${label})`);
    }
  }

  private cycleQuality() {
    const i = QUALITY_LEVELS.indexOf(this.qualityLevel);
    this.qualityLevel = QUALITY_LEVELS[(i + 1) % QUALITY_LEVELS.length];
    saveQuality(this.qualityLevel);
    // 자동으로 돌아오면 다시 재기 시작
    this.autoCap = null;
    this.renderScale = 1;
    this.perf.settle = 3;
    this.applyQuality();
    this.resize();
    const { level } = resolveQuality(this.qualityLevel, this.autoCap);
    this.toast(`그래픽 품질: ${QUALITY_LABEL[this.qualityLevel]}${this.qualityLevel === 'auto' ? ` (${QUALITY_LABEL[level]})` : ''}`, '', '');
  }

  private readonly aimPoint = new THREE.Vector3(0, 1.09, -0.38);
  private mppA = new THREE.Vector3();
  private mppB = new THREE.Vector3();

  /** 월드 지점 p 근처에서 화면 1px 이 몇 m 인지 (가로 기준, 지금 카메라 확대 · 화면 크기 반영) */
  private metersPerPx(p: THREE.Vector3) {
    const a = this.mppA.copy(p).project(this.camera);
    const b = this.mppB.copy(p).setX(p.x + 0.1).project(this.camera);
    const px = Math.hypot((b.x - a.x) * window.innerWidth, (b.y - a.y) * window.innerHeight) / 2;
    return 0.1 / Math.max(1e-3, px);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 세로 화면에서는 시야를 넓혀 웍과 손님이 모두 보이게
    const portrait = w / h < 1;
    this.camera.fov = portrait ? 74 : 58;
    this.camera.position.set(0, portrait ? 1.86 : 1.74, portrait ? 0.92 : 0.78);
    this.camera.lookAt(0, 1.08, -0.6);
    this.camBase.copy(this.camera.position);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // 세로 화면, 그리고 가로로 눕힌 휴대폰(높이 520 이하: style.css 의 휴대폰 가로 배치와 같은 기준)
    this.fit.on = portrait || h <= 520;
    this.fit.k = 0;
    this.fit.measureIn = 0;
  }

  /**
   * 세로 화면(휴대폰)에서는 위 상태줄 · 주문서와 아래 재료 패널 · 게이지가 화면을 많이 덮어
   * 웍이 패널 뒤로 숨는다. 패널 사이의 빈 띠를 재서, 웍 앞 림이 띠 아래쪽에,
   * 위쪽 관심 영역(연구: 들고 있는 기름통, 장사: 손님 얼굴)이 띠 위쪽에 오도록
   * 카메라 위치·방향은 그대로 두고 확대(fov)와 화면 세로 이동(view offset)만 맞춘다.
   */
  /**
   * 자동 품질: 게임 중 3초마다 평균 fps 를 재서 40 아래면 한 단계씩 낮춘다
   * (높음 → 중간 → 낮음 → 낮음에서 해상도 80%씩, 최소 60%). 올리지는 않는다 (오르내림 반복 방지).
   */
  private watchPerf(raw: number) {
    const p = this.perf;
    if (this.qualityLevel !== 'auto' || !this.active || document.hidden || raw > 0.5) {
      p.t = 0;
      p.frames = 0;
      return;
    }
    if (p.settle > 0) {
      p.settle -= raw;
      return;
    }
    p.t += raw;
    p.frames++;
    if (p.t < 3) return;
    const fps = p.frames / p.t;
    p.t = 0;
    p.frames = 0;
    if (fps >= 40) return;
    const cur = resolveQuality('auto', this.autoCap).level;
    const i = FIXED_LEVELS.indexOf(cur);
    if (i > 0) this.autoCap = FIXED_LEVELS[i - 1];
    else if (this.renderScale > 0.61) this.renderScale = Math.max(0.6, this.renderScale * 0.8);
    else return;
    p.settle = 2;
    this.applyQuality();
    this.resize();
    const now = resolveQuality('auto', this.autoCap).level;
    this.toast(`기기 성능에 맞춰 그래픽을 낮췄어요`, `자동 · ${QUALITY_LABEL[now]}${this.renderScale < 1 ? ` · 해상도 ${Math.round(this.renderScale * 100)}%` : ''}`, '');
  }

  private updateFraming(dt: number) {
    const f = this.fit;
    if (!f.on) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    f.measureIn -= dt;
    if (f.measureIn <= 0) {
      f.measureIn = 0.3;
      const rect = (id: string) => {
        const el = document.getElementById(id);
        if (!el || el.classList.contains('hidden')) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' ? r : null;
      };
      let top = 0;
      let bottom = H;
      let left = 0;
      let right = W;
      if (W < H) {
        // 세로: 위(상태줄 · 주문서 · 튜토리얼)와 아래(게이지 · 재료 · 안내) 사이
        for (const id of ['top', 'ticket', 'guide']) {
          const r = rect(id);
          if (r && r.top < H * 0.5) top = Math.max(top, r.bottom);
        }
        for (const id of ['gauge', 'bottom', 'hint']) {
          const r = rect(id);
          if (r && r.bottom > H * 0.5 && (id !== 'hint' || r.height < 60)) bottom = Math.min(bottom, r.top);
        }
      } else {
        // 가로 휴대폰: 위 상태줄 · 주문서 · 튜토리얼 띠, 오른쪽 재료 단, 아래 게이지 · 안내
        for (const id of ['top', 'ticket', 'guide']) {
          const r = rect(id);
          if (r && r.top < H * 0.5) top = Math.max(top, r.bottom);
        }
        const tray = rect('bottom');
        if (tray) right = tray.left;
        for (const id of ['gauge', 'hint']) {
          const r = rect(id);
          if (r && r.bottom > H * 0.5 && (id !== 'hint' || r.height < 60)) bottom = Math.min(bottom, r.top);
        }
        left += 8;
        right -= 8;
      }
      top += 10;
      bottom -= 14;
      // 띠가 너무 좁으면(튜토리얼 카드 등) 위쪽 가림은 일부 감수한다
      const minBand = Math.min(220, H * 0.5);
      if (bottom - top < minBand) top = Math.max(0, bottom - minBand);

      // 카메라 공간 기울기 t = y/(-z), u = x/(-z): fov 와 무관
      const cam = this.camera;
      const view = cam.matrixWorldInverse;
      const slope = (x: number, y: number, z: number) => {
        const p = this.fitTmp.set(x, y, z).applyMatrix4(view);
        return { t: p.y / -p.z, u: Math.abs(p.x) / -p.z };
      };
      const A = slope(0, 1.04, 0.0); // 웍 앞 림과 손잡이 시작 부분
      const B = this.state === 'selling' ? slope(0, -0.25 + 1.78, -1.72) : slope(0, 1.42, -0.62);
      const sides = [slope(0.56, 0.95, -0.09), slope(-0.3, 1.08, -0.38), slope(0.3, 1.08, -0.38)];
      // 세로로 A~B 가 띠에 꼭 맞는 확대
      let k = (bottom - top) / ((B.t - A.t) * (H / 2));
      // 가로로 기름통 · 웍 림이 빈 곳 밖으로 나가지 않게 (화면 중심에서 u·k·H/2 px)
      const halfW = (right - left) / 2;
      for (const sd of sides) k = Math.min(k, (0.92 * halfW) / (Math.max(1e-3, sd.u) * (H / 2)));
      // fov 45° ~ 100°
      k = THREE.MathUtils.clamp(k, 1 / Math.tan(THREE.MathUtils.degToRad(50)), 1 / Math.tan(THREE.MathUtils.degToRad(22.5)));
      // 띠 가운데에 A~B 의 가운데가 오게
      const mid = (top + bottom) / 2;
      const s = mid - (H / 2) * (1 - (k * (A.t + B.t)) / 2);
      f.tk = k;
      f.ts = s;
      f.tx = (left + right) / 2 - W / 2;
      if (f.k === 0) {
        f.k = k;
        f.s = s;
        f.x = f.tx;
      }
    }
    const a = 1 - Math.exp(-dt * 5);
    f.k += (f.tk - f.k) * a;
    f.s += (f.ts - f.s) * a;
    f.x += (f.tx - f.x) * a;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(1 / f.k));
    const v = this.camera.view;
    if (Math.abs(fov - this.camera.fov) > 1e-3 || v?.offsetY !== -f.s || v?.offsetX !== -f.x) {
      this.camera.fov = fov;
      this.camera.setViewOffset(W, H, -f.x, -f.s, W, H);
    }
  }

  // ───────────── 저장 / 로비 ─────────────

  private save() {
    const phase: Phase = this.state === 'selling' ? 'selling' : 'research';
    writeSave({
      v: 1,
      round: this.round,
      phase,
      money: this.money,
      found: [...this.found],
      best: this.best,
    });
  }

  // ───────────── 화면 전환 ─────────────

  /** 전환 로딩창을 띄우고, 화면이 덮였을 때 mid 를 실행한다 */
  private go(info: WipeInfo, mid: () => void) {
    if (this.wipe.busy) return;
    this.wok.release();
    this.oil.release();
    void this.wipe.run(info, mid, { onSweep: () => this.sfx.play('whoosh', 0.45) });
  }

  private researchInfo(round: number): WipeInfo {
    return {
      kind: 'research',
      icon: 'research',
      kicker: `ROUND ${round}`,
      title: '레시피 연구',
      sub: round === 1 ? '집 주방 · 첫 레시피를 찾아요' : `집 주방 · ${round}회차`,
    };
  }

  private sellInfo(round = this.round): WipeInfo {
    return { kind: 'selling', icon: 'truck', kicker: `DAY ${round}`, title: '장사 시작', sub: '푸드트럭 오픈!' };
  }

  private showLobby() {
    // 장사 중에 나가면 그날은 처음부터 다시 한다 (돈은 그날 시작 시점으로)
    this.clearStage();
    this.state = 'lobby';
    this.world.setPlace('truck');
    $('hud').classList.add('hidden');
    $('dayend').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    const s = readSave();
    const cont = $<HTMLButtonElement>('continue');
    cont.disabled = !s;
    $('save-info').textContent = s ? `${s.round}회차 · ${s.phase === 'research' ? '레시피 연구' : '장사'} 중` : '저장된 게임이 없어요';
    $('lobby-book').classList.toggle('hidden', !s);
    $('lb-save').classList.toggle('hidden', !s);
    if (s) {
      const unlocked = Math.min(INGREDIENTS.length, START_UNLOCKED + s.round - 1);
      $('lb-best').textContent = s.best ? `하루 최고 ${won(s.best)}원` : '';
      $('lb-round').textContent = String(s.round);
      $('lb-recipes').innerHTML = `${s.found.length}<small> / ${RECIPES.length}</small>`;
      $('lb-money').innerHTML = `${won(s.money)}<small>원</small>`;
      $('lb-ing-label').textContent = `재료 ${unlocked} / ${INGREDIENTS.length}`;
      $('lb-ings').innerHTML = INGREDIENTS.map((d, i) => tok(d.id, i < unlocked ? '' : 'off')).join('');
    }
    if (s) {
      this.found = new Set(s.found);
      this.round = s.round;
    }
  }

  private clearStage() {
    if (this.customer) {
      this.world.scene.remove(this.customer.group);
      this.customer = null;
    }
    for (const c of this.leaving) this.world.scene.remove(c.group);
    this.leaving = [];
    this.world.plate.visible = false;
    this.plateT = -1;
    this.wok.release();
    this.oil.reset();
    this.particles.clearAll();
    this.resetDish();
  }

  private newGame() {
    const best = readSave()?.best ?? 0;
    this.round = 1;
    this.money = 0;
    this.found = new Set();
    this.best = best;
    this.startResearch();
  }

  private continueGame() {
    const s = readSave();
    if (!s) return;
    this.round = s.round;
    this.money = s.money;
    this.found = new Set(s.found);
    this.best = s.best ?? 0;
    if (s.phase === 'selling') this.startSelling();
    else this.startResearch();
  }

  // ───────────── 레시피 연구 ─────────────

  private startResearch() {
    $('lobby').classList.add('hidden');
    this.clearStage();
    this.state = 'research';
    this.world.setPlace('home');
    this.setHudMode();
    this.save();
    if (this.tutorial) {
      const r = RECIPES.find((x) => x.id === TUTORIAL_RECIPE)!;
      $('guide-steps').innerHTML = this.stepsHtml(r);
      $('guide').classList.remove('hidden');
    } else {
      $('guide').classList.add('hidden');
    }
  }

  private startSelling() {
    if (this.tutorial) {
      this.toast('먼저 파 계란 볶음밥을 찾아 보세요', '', 'bad');
      return;
    }
    $('lobby').classList.add('hidden');
    $('guide').classList.add('hidden');
    this.clearStage();
    this.state = 'selling';
    this.world.setPlace('truck');
    this.timeLeft = T.dayLength;
    this.dayMoney = 0;
    this.dayToss = 0;
    this.served = 0;
    this.lost = 0;
    this.starsSum = 0;
    this.starsN = 0;
    this.nextCustomerIn = 1.2;
    this.setHudMode();
    this.save();
  }

  private setHudMode() {
    const research = this.state === 'research';
    $('hud').classList.remove('hidden');
    $('hud').dataset.mode = this.state;
    // 연구/장사 전용 요소는 CSS 가 data-mode 로 보이고 숨긴다
    $('ticket').classList.add('hidden');
    $('hint').textContent = research
      ? '기름통을 꾹 눌러 웍 위로 끌고 가서 흔들면 기름이 나와요 · 재료를 넣고 볶은 뒤 맛보기'
      : '웍을 누른 채로 끌어서 흔드세요 · 높이 띄울수록 보너스!';
  }

  /** 맛보기: 익힘이 맞아야 맛볼 수 있고, 회차당 횟수가 정해져 있다 */
  taste() {
    if (this.state !== 'research' || this.modalOpen()) return;
    if (this.stats.live < 8) {
      this.toast('재료를 넣고 볶아 주세요', '', 'bad');
      return;
    }
    // 익힘 확인
    const under: IngId[] = [];
    const over: IngId[] = [];
    let burnt = 0;
    let live = 0;
    for (const [id] of this.counts) {
      const t = this.types[ING_INDEX[id]];
      if (!t || !t.n) continue;
      live += t.n;
      burnt += t.burntFrac * t.n;
      if (t.avgCook < T.cookMin) under.push(id);
      else if (t.avgCook > T.cookMax) over.push(id);
    }
    if (live && burnt / live > T.tasteBurntLimit) {
      this.toast('탄 맛이 나서 맛볼 수 없어요', '버리고 다시 볶아 보세요', 'bad');
      this.sfx.play('fail', 0.4);
      return;
    }
    if (over.length) {
      this.toast(`너무 익었어요: ${over.map(ingLabel).join(', ')}`, '맛볼 수 없어요 · 빨리 익는 재료는 나중에 넣어 보세요', 'bad');
      this.sfx.play('fail', 0.4);
      return;
    }
    if (under.length) {
      this.toast(`아직 덜 익었어요: ${under.map(ingLabel).join(', ')}`, '조금 더 볶은 뒤 맛보세요', 'bad');
      return;
    }

    const oil = this.oilRatio();
    if (oil < T.oilMin) {
      this.toast(this.oilMl < 0.05 ? '기름을 안 넣었어요' : '기름이 너무 적어요', '맛볼 수 없어요 · 기름통을 꾹 눌러 웍 위로 끌고 가서 흔드세요', 'bad');
      return;
    }
    if (oil > T.oilMax) {
      this.toast('기름이 너무 많아요', '맛볼 수 없어요 · 버리고 다시 해 보세요', 'bad');
      return;
    }

    const set = new Set(this.counts.keys());
    const hit = matchRecipe(set);
    if (hit && this.found.has(hit.id)) {
      this.showTaste('known', '이미 아는 맛이에요', `<b>${esc(hit.name)}</b>이에요.`);
      return;
    }
    if (hit) {
      this.found.add(hit.id);
      this.save();
      this.sfx.play('ding', 0.7);
      this.showTaste(
        'found',
        `새 레시피 발견! ${hit.name}`,
        `${hit.id === TUTORIAL_RECIPE && this.round === 1 ? '<p><b>튜토리얼 완료!</b> 이제 <b>장사하러 가기</b>를 눌러 첫 장사를 시작해 봐요.</p>' : ''}
         <p>레시피 북에 기록했어요. 장사할 때 손님이 주문해요.</p>
         <div class="steps">${this.stepsHtml(hit)}</div>
         <p class="small">정석 순서와 양이에요. 순서와 양이 맞을수록 장사 때 별점이 올라가요.</p>`,
        true,
      );
      return;
    }
    this.save();
    this.sfx.play('plop', 0.5);
    this.showTaste('hmm', '음…', this.feedback(set));
  }

  /** 아직 못 찾은 레시피 중 가장 가까운 것을 기준으로 반응한다 */
  private feedback(set: Set<IngId>) {
    const pool = RECIPES.filter((r) => !this.found.has(r.id) && recipeIngs(r).every((id) => this.isUnlocked(id)));
    if (!pool.length) return `<p>지금 재료로 찾을 수 있는 레시피는 다 찾았어요. 장사를 마치면 새 재료가 열려요.</p>`;
    let best = pool[0];
    let bestScore = -Infinity;
    for (const r of pool) {
      const ings = recipeIngs(r);
      const match = ings.filter((i) => set.has(i)).length;
      const score = match * 2 - (ings.length - match) - (set.size - match);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    const ings = recipeIngs(best);
    // 넣은 순서대로 어울리는 재료 / 안 어울리는 재료를 나눈다
    const added = this.order.filter((id) => set.has(id));
    const good = added.filter((id) => ings.includes(id));
    const bad = added.filter((id) => !ings.includes(id));
    const missing = ings.length - good.length;
    const chip = (id: IngId, cls: string) => `<span class="fb-chip ${cls}">${tok(id, 'sm')}${ingDef(id).name}</span>`;
    const rows: string[] = [];
    if (!good.length) {
      rows.push('<p>전혀 어울리지 않는 조합이에요.</p>');
    } else {
      rows.push(`<div class="fb-row"><span class="fb-label">잘 어울려요</span><div class="fb-chips">${good.map((id) => chip(id, 'good')).join('')}</div></div>`);
    }
    if (good.length && bad.length) {
      rows.push(`<div class="fb-row"><span class="fb-label">안 어울려요</span><div class="fb-chips">${bad.map((id) => chip(id, 'bad')).join('')}</div></div>`);
    }
    if (good.length && missing > 0) {
      const q = Array.from({ length: missing }, () => '<span class="fb-chip need">?</span>').join('');
      rows.push(`<div class="fb-row"><span class="fb-label">${missing}가지 더 필요해요</span><div class="fb-chips">${q}</div></div>`);
    }
    return `<div class="fb">${rows.join('')}</div>`;
  }

  private showTaste(icon: UiIcon, title: string, html: string, clear = false) {
    $('taste-icon').innerHTML = svgIcon(`u-${icon}`);
    $('taste-title').textContent = title;
    $('taste-body').innerHTML = html;
    $('taste').classList.remove('hidden');
    $('taste').dataset.clear = clear ? '1' : '';
  }

  private closeTaste() {
    const t = $('taste');
    t.classList.add('hidden');
    if (t.dataset.clear) {
      this.particles.clearLive();
      this.resetDish();
      if (!this.tutorial) $('guide').classList.add('hidden');
    }
  }

  private stepsHtml(r: Recipe) {
    return r.steps
      .map(
        ([id, n], i) =>
          `<span class="step"><span class="no">${i + 1}</span>${tok(id, 'sm')}${ingDef(id).name} <small>×${n} ${AMOUNT_LABEL[n]}</small></span>`,
      )
      .join('<span class="arrow">→</span>');
  }

  private openBook() {
    // 지금 열린 재료만으로 찾을 수 있는 (아직 못 찾은) 레시피
    const canFind = (r: Recipe) => !this.found.has(r.id) && recipeIngs(r).every((id) => this.isUnlocked(id));
    const list = RECIPES.map((r, i) => ({ r, i })).filter(({ r }) =>
      this.bookFilter === 'found' ? this.found.has(r.id) : this.bookFilter === 'open' ? canFind(r) : true,
    );
    const dots = (n: number) => `<span class="dots3">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
    $('book-grid').innerHTML =
      list
        .map(({ r, i }) => {
          const no = String(i + 1).padStart(2, '0');
          if (!this.found.has(r.id)) {
            const hint = canFind(r) ? '지금 재료로 찾을 수 있어요' : '아직 없는 재료가 필요해요';
            return `<div class="rcard locked"><div class="rc-top"><span class="rc-no">No. ${no}</span></div><div class="rc-name" aria-label="재료 ${r.steps.length}가지">${'?'.repeat(r.steps.length)}</div><div class="rc-hint">${hint}</div></div>`;
          }
          const steps = r.steps
            .map(([id, n], k) => `<span class="rc-step"><span class="no">${k + 1}</span>${tok(id, 'sm')}${ingDef(id).name}${dots(n)}</span>`)
            .join('');
          return `<div class="rcard"><div class="rc-top"><span class="rc-no">No. ${no}</span><span class="rc-price">${won(r.price)}원</span></div><div class="rc-name">${esc(r.name)}</div><div class="rc-steps">${steps}</div></div>`;
        })
        .join('') || '<p class="small">해당하는 레시피가 없어요.</p>';
    const openN = RECIPES.filter(canFind).length;
    const labels = { all: `전체 ${RECIPES.length}`, found: `찾은 것 ${this.found.size}`, open: `지금 찾을 수 있는 것 ${openN}` };
    for (const b of $('book-tabs').querySelectorAll<HTMLButtonElement>('button')) {
      const f = b.dataset.f as keyof typeof labels;
      b.textContent = labels[f];
      b.classList.toggle('on', f === this.bookFilter);
    }
    $('book-count').innerHTML = `${this.found.size}<small> / ${RECIPES.length}</small>`;
    $('book-bar').style.width = `${(this.found.size / RECIPES.length) * 100}%`;
    $('book').classList.remove('hidden');
  }

  // ───────────── 웍 ─────────────

  private resetDish() {
    this.oilMl = 0;
    this.wok.setOil(0);
    this.counts.clear();
    this.order = [];
    this.dishTotal = 0;
    this.particles.tossSum = 0;
    this.particles.tossPeak = 0;
  }

  addIngredient(id: IngId) {
    if (!this.active || !this.isUnlocked(id)) return;
    const n = this.counts.get(id) ?? 0;
    if (n >= MAX_PORTIONS) return;
    const def = ingDef(id);
    const c = this.tmp.copy(this.wok.base).add(this.wok.off);
    const count = Math.max(1, Math.round(def.count * T.ingredientAmount));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.1;
      const y = c.y + 0.22 + Math.random() * 0.3;
      if (this.particles.spawn(ING_INDEX[id], c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r, -0.5) >= 0) {
        this.dishTotal++;
      }
    }
    this.counts.set(id, n + 1);
    if (n === 0) this.order.push(id);
    this.sfx.play('plop', 0.7);
  }

  trash() {
    if (!this.active || (this.stats.live === 0 && this.oilMl <= 0.05)) return;
    this.particles.clearLive();
    this.resetDish();
    this.sfx.play('whoosh', 0.5);
    this.toast('웍을 비웠어요', '', '');
  }

  // ───────────── 장사 ─────────────

  private spawnCustomer() {
    const pool = RECIPES.filter((r) => this.found.has(r.id));
    if (!pool.length) return;
    const recipe = pool[Math.floor(Math.random() * pool.length)];
    const patience =
      Math.max(T.patienceMin, T.patienceBase - this.round * T.patiencePerDay) + recipe.steps.length * T.patiencePerIng;
    this.customer = new Customer(this.world.scene, recipe, patience);
    toonify(this.customer.group);
    enableShadows(this.customer.group);
    this.sfx.play('bell', 0.5);
  }

  private cookScoreOf(t: TypeStat) {
    if (t.avgCook < T.cookMin) return (t.avgCook / T.cookMin) ** 2;
    if (t.avgCook > T.cookMax) return Math.max(0, 1 - (t.avgCook - T.cookMax) / T.overcookRange);
    return 1;
  }

  private judge(recipe: Recipe, patienceFrac: number): Verdict {
    const s = this.stats;
    const want = recipeIngs(recipe);
    const missingIds = want.filter((i) => !this.counts.has(i));
    const extra = [...this.counts.keys()].filter((i) => !want.includes(i)).length;
    const amount = this.dishTotal ? s.live / this.dishTotal : 0;

    const ingScore = Math.max(0, 1 - T.missingPenalty * missingIds.length - T.extraPenalty * extra);
    const amountScore = 0.2 + 0.8 * clamp(amount / T.amountFull, 0, 1);

    // 양 (적게/기본/많이)
    let diff = 0;
    for (const [id, ideal] of recipe.steps) {
      const c = this.counts.get(id);
      if (c) diff += Math.abs(c - ideal);
    }
    const ratioScore = clamp(1 - T.amountPenalty * diff, 0.4, 1);

    // 넣는 순서: 레시피 순서와 어긋난 쌍의 수
    const seq = this.order.filter((i) => want.includes(i)).map((i) => want.indexOf(i));
    let inv = 0;
    for (let a = 0; a < seq.length; a++) for (let b = a + 1; b < seq.length; b++) if (seq[a] > seq[b]) inv++;
    const orderScore = clamp(1 - T.orderPenalty * inv, 0.5, 1);

    // 재료별 익힘
    let cookScore = 1;
    let worst: IngId | null = null;
    let worstScore = 2;
    let sdSum = 0;
    let typesN = 0;
    for (const id of this.counts.keys()) {
      const t = this.types[ING_INDEX[id]];
      if (!t || !t.n) continue;
      const cs = this.cookScoreOf(t);
      cookScore += cs;
      typesN++;
      sdSum += t.sdCook;
      if (cs < worstScore) {
        worstScore = cs;
        worst = id;
      }
    }
    cookScore = typesN ? (cookScore - 1) / typesN : 0;
    const evenScore = clamp(1 - ((typesN ? sdSum / typesN : 0) - T.evenTolerance) / 0.5, 0.5, 1);
    const burnScore = clamp(1 - s.burntFrac * T.burnPenalty, 0, 1);
    const oil = this.oilRatio();
    const oilOff = oil < T.oilMin ? T.oilMin - oil : oil > T.oilMax ? oil - T.oilMax : 0;
    const oilScore = clamp(1 - T.oilPenalty * oilOff, 0.3, 1);
    const base = ingScore * amountScore * ratioScore * orderScore * cookScore * evenScore * burnScore * oilScore;
    // 웍질 보너스: 재료가 높이 떠오를수록 가산점 (기본 점수에 비례해서 붙는다)
    const toss = this.tossFrac();
    const quality = Math.min(1, base * (1 + T.tossQuality * toss));

    const worstT = worst ? this.types[ING_INDEX[worst]] : null;
    const cookMsg = worst && worstT
      ? `${ingDef(worst).name}${worstT.avgCook < T.cookMin ? '이(가) 덜 익었어요…' : '이(가) 너무 익었어요…'}`
      : '덜 익었어요…';
    // 가장 문제가 되는 항목으로 손님 반응을 정한다
    const issues: [number, string][] = [
      [ingScore, missingIds.length ? `${ingDef(missingIds[0]).name}이(가) 빠졌잖아요…` : '이건 주문한 게 아닌데요?'],
      [amountScore, '양이 왜 이렇게 적어요?'],
      [ratioScore, '재료 양이 좀 이상해요.'],
      [orderScore, '뭔가 순서가 어긋난 맛이에요.'],
      [cookScore, cookMsg],
      [evenScore, '익은 게 들쭉날쭉해요.'],
      [burnScore, '탔잖아요!'],
      [oilScore, oil < T.oilMin ? '기름이 적어서 뻑뻑해요.' : '너무 느끼해요…'],
    ];
    issues.sort((a, b) => a[0] - b[0]);
    let comment: string;
    if (quality >= 0.9 && toss >= 1) comment = '완벽해요! 불맛 최고!';
    else if (quality >= 0.9) comment = '완벽해요!';
    else if (quality >= 0.75) comment = '맛있어요!';
    else comment = issues[0][1];

    const stars = clamp(Math.round(1 + 4 * quality), 1, 5);
    const pay = quality < T.refundBelow ? 0 : Math.round((recipe.price * (0.4 + 0.6 * quality)) / 100) * 100;
    const tip = quality >= T.tipAbove ? Math.round((recipe.price * T.tipRate * patienceFrac) / 100) * 100 : 0;
    const tossPay = pay > 0 ? Math.round((recipe.price * T.tossPay * toss) / 100) * 100 : 0;
    return { quality, stars, pay, tip, toss, tossPay, comment };
  }

  /** 적정 기름(모든 레시피 공통) 대비 지금 기름 비율 (1 = 적정) */
  private oilRatio() {
    return this.oilMl / Math.max(0.01, T.oilIdeal);
  }

  /** 웍질 보너스 (1 = 100%, 상한 없음): 조각당 누적 떠오른 높이 기준 */
  private tossFrac() {
    const n = Math.max(1, this.dishTotal);
    return this.particles.tossSum / n / T.tossFull;
  }

  serve() {
    const c = this.customer;
    if (this.state !== 'selling' || !c || c.state !== 'waiting' || this.stats.live < 8) return;
    const v = this.judge(c.recipe, c.patienceFrac);
    const earned = v.pay + v.tip + v.tossPay;
    this.money += earned;
    this.dayMoney += earned;
    this.dayToss += v.tossPay;
    this.served++;
    this.starsSum += v.stars;
    this.starsN++;

    // 접시 연출
    const w = this.world;
    this.plateFrom.copy(this.wok.base).add(this.wok.off).setY(1.1);
    this.plateTo.x = c.group.position.x - 0.1;
    this.plateT = 0;
    this.plateOwner = c;
    w.plate.visible = true;
    const col = (w.plateFood.material as THREE.MeshToonMaterial).color;
    col.set(0xf6f1e4).lerp(new THREE.Color(0xe2b566), clamp(this.stats.avgCook, 0, 1));
    if (this.stats.avgCook > 1) col.lerp(new THREE.Color(0x6b4420), clamp((this.stats.avgCook - 1) / 0.9, 0, 1));
    col.lerp(new THREE.Color(0x15110e), clamp(this.stats.burntFrac * 1.5, 0, 1));
    w.plateFood.scale.setScalar(0.45 + 0.55 * clamp(this.stats.live / Math.max(1, this.dishTotal), 0, 1));
    w.plateFood.scale.y *= 0.6;

    this.particles.clearLive();
    this.resetDish();
    c.react(v.comment);
    this.leaving.push(c);
    this.customer = null;
    this.nextCustomerIn = T.customerGapMin + Math.random() * T.customerGapRand;

    const starStr = '★'.repeat(v.stars) + '☆'.repeat(5 - v.stars);
    if (v.pay > 0) {
      const extras = [];
      if (v.tossPay) extras.push(`웍질 보너스 +${won(v.tossPay)}원`);
      if (v.tip) extras.push(`팁 +${won(v.tip)}원`);
      this.toast(`${starStr}  +${won(v.pay)}원`, extras.join(' · '), v.stars >= 4 ? 'good' : '', v.tossPay ? 'bonus' : v.tip ? 'tip' : undefined);
      this.sfx.play(v.stars >= 4 ? 'ding' : 'coin', 0.6);
    } else {
      this.toast(`${starStr}  환불…`, '손님이 돈을 내지 않았어요', 'bad');
      this.sfx.play('fail', 0.6);
    }
  }

  private customerGaveUp(c: Customer) {
    c.react('너무 오래 걸리네요. 갈게요!');
    this.leaving.push(c);
    this.customer = null;
    this.lost++;
    this.starsSum += 1;
    this.starsN++;
    this.nextCustomerIn = 3;
    this.toast('손님이 떠났어요', '★☆☆☆☆', 'bad');
    this.sfx.play('fail', 0.6);
  }

  /** 장사 마감 → 결과 확인 → 새 재료 해금 → 다음 회차 연구 */
  private endDay() {
    this.state = 'result';
    this.wok.release();
    this.best = Math.max(this.best, this.dayMoney);
    const avg = this.starsN ? (this.starsSum / this.starsN).toFixed(1) : '-';
    const before = this.unlocked;
    const day = this.round;
    this.round++;
    const newIng = this.unlocked > before ? INGREDIENTS[this.unlocked - 1] : null;
    // 다음 회차 연구부터 이어서 할 수 있게 저장
    writeSave({
      v: 1,
      round: this.round,
      phase: 'research',
      money: this.money,
      found: [...this.found],
      best: this.best,
    });
    $('end-kicker').textContent = `DAY ${day} · 장사 마감`;
    const starN = this.starsN ? Math.round(this.starsSum / this.starsN) : 0;
    const stars = [1, 2, 3, 4, 5].map((k) => ICON('star', k <= starN ? 'on' : '')).join('');
    $('end-body').innerHTML =
      `<div class="rs-line"><span>서빙한 손님</span><b>${this.served}명</b></div>` +
      `<div class="rs-line"><span>놓친 손님</span><b class="${this.lost ? 'bad' : ''}">${this.lost}명</b></div>` +
      `<div class="rs-line"><span>평균 별점</span><span class="rs-stars">${stars}<b>${avg}</b></span></div>` +
      `<div class="rs-line"><span>웍질 보너스</span><b class="hot">+${won(this.dayToss)}원</b></div>`;
    $('end-money').textContent = `${won(this.dayMoney)}원`;
    $('end-sum').textContent = `누적 ${won(this.money)}원`;
    $('end-best').textContent = `하루 최고 ${won(this.best)}원${this.dayMoney > 0 && this.dayMoney >= this.best ? ' · 새 기록' : ''}`;
    const unlock = $('end-unlock');
    if (newIng) {
      const sp = T[newIng.speedKey];
      const pace = sp < 0.8 ? '익는 속도 느림 · 일찍 넣어요' : sp > 1.15 ? '금방 익어요 · 늦게 넣어요' : '익는 속도 보통';
      $('end-unlock-kicker').textContent = '새 재료 해금';
      unlock.innerHTML = `${tok(newIng.id)}<b>${newIng.name}</b><span>${pace}</span>`;
    } else {
      $('end-unlock-kicker').textContent = '재료';
      unlock.innerHTML = `<b>모두 열었어요</b><span>모든 재료를 쓸 수 있어요. 남은 레시피를 찾아 보세요.</span>`;
    }
    $('end-ings').textContent = `${this.unlocked} / ${INGREDIENTS.length}`;
    $('end-recipes').textContent = `${this.found.size} / ${RECIPES.length}`;
    $('next-label').textContent = `${this.round}회차 레시피 연구`;
    $('dayend').classList.remove('hidden');
  }

  private debugInfo() {
    const s = this.stats;
    const n = Math.max(1, this.dishTotal);
    const f = (v: number, d = 2) => v.toFixed(d);
    const lines = [
      `상태       ${this.state} · ${this.round}회차`,
      `재료 조각  ${s.live} / ${this.dishTotal}`,
      `탄 비율    ${f(s.burntFrac * 100, 0)}%`,
      `웍질 누적  조각당 ${f((this.particles.tossSum / n) * 100, 1)}cm  → ${f(this.tossFrac() * 100, 0)}%`,
      `지금 공중  ${this.particles.airborne}조각, 최고 ${f(this.particles.airLift * 100, 1)}cm`,
      `웍 속도    ${f(this.wok.speed)} m/s`,
      `넣은 순서  ${this.order.map((id) => `${ingDef(id).emoji}×${this.counts.get(id)}`).join(' → ') || '-'}`,
    ];
    for (const id of this.order) {
      const t = this.types[ING_INDEX[id]];
      if (t?.n) lines.push(`  ${ingDef(id).emoji} 익힘 ${f(t.avgCook)} (편차 ${f(t.sdCook)}) 탐 ${f(t.burntFrac * 100, 0)}%`);
    }
    if (this.state === 'selling') lines.push(`남은 시간  ${f(this.timeLeft, 0)}초`);
    return lines.join('\n');
  }

  private popToss(text: string, cm: number) {
    const el = document.createElement('div');
    el.className = `tosspop${cm >= T.tossBigCm ? ' big' : cm >= T.tossBigCm * 0.7 ? ' mid' : ''}`;
    el.innerHTML = cm >= T.tossBigCm * 0.7 ? svgIcon('u-bonus') : '';
    el.append(text);
    $('tosspops').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  private toast(title: string, sub: string, cls: string, icon?: UiIcon) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    const head = document.createElement('div');
    head.className = 'toast-head';
    if (icon) head.innerHTML = svgIcon(`u-${icon}`);
    head.append(title);
    el.appendChild(head);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      el.appendChild(s);
    }
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  // ───────────── 시뮬레이션 ─────────────

  /** 물리 한 스텝. 테스트에서도 직접 호출한다. */
  stepPhysics(h: number) {
    this.wok.step(h);
    this.particles.step(h, this.wok, 1);
  }

  private update(dt: number) {
    this.time += dt;
    this.updateFraming(dt);
    const scene = this.world.scene;

    if (this.state === 'selling') {
      this.timeLeft -= dt;
      const c = this.customer;
      if (c) {
        c.update(dt, scene);
        if (c.state === 'waiting' && c.patience <= 0) this.customerGaveUp(c);
      } else if (this.timeLeft > 0) {
        this.nextCustomerIn -= dt;
        if (this.nextCustomerIn <= 0) this.spawnCustomer();
      } else if (this.leaving.length === 0) {
        // 마감: 전환 로딩창 뒤에서 결과 화면을 띄운다
        this.state = 'result';
        this.go({ kind: 'result', icon: 'close', kicker: `DAY ${this.round}`, title: '장사 마감', sub: '오늘의 결과를 확인해요' }, () =>
          this.endDay(),
        );
      }
    }
    for (const c of this.leaving) c.update(dt, scene);
    this.leaving = this.leaving.filter((c) => c.state !== 'gone');

    // 접시: 웍 → 선반 → 손님이 들고 감
    if (this.plateT >= 0) {
      const plate = this.world.plate;
      this.plateT += dt;
      const k = clamp(this.plateT / 0.45, 0, 1);
      const e = 1 - (1 - k) ** 3;
      const owner = this.plateOwner;
      if (owner && owner.state === 'leaving') {
        plate.position.set(owner.group.position.x, 1.0, owner.group.position.z + 0.3);
      } else {
        plate.position.lerpVectors(this.plateFrom, this.plateTo, e);
        plate.position.y += Math.sin(k * Math.PI) * 0.18;
      }
      if (!owner || owner.state === 'gone') {
        plate.visible = false;
        this.plateT = -1;
      }
    }

    if (this.particles.newlySpilled > 0) {
      this.sfx.play('spill', Math.min(0.6, 0.15 + this.particles.newlySpilled * 0.08), 0.06);
      this.particles.newlySpilled = 0;
    }
    this.tossPopupCd -= dt;
    const peak = this.particles.tossPeak;
    if (peak > 0 && this.tossPopupCd <= 0 && this.active) {
      if (peak >= T.tossPopupMin) {
        const cm = Math.round(peak * 100);
        this.popToss(cm >= T.tossBigCm ? `${cm}cm!!` : cm >= T.tossBigCm * 0.7 ? `${cm}cm!` : `${cm}cm`, cm);
        if (cm >= T.tossBigCm) {
          this.shake = Math.max(this.shake, Math.min(0.012, 0.004 + (cm - T.tossBigCm) * 0.0004) * T.shakeAmount);
          const fl = $('flash');
          fl.classList.remove('on');
          void fl.offsetWidth;
          fl.classList.add('on');
        }
        this.tossPopupCd = 0.9;
      }
      this.particles.tossPeak = 0;
    }
    const sp = this.wok.speed;
    if (sp > 1.3 && this.stats.live > 0) this.sfx.play('whoosh', clamp(sp / 4, 0.15, 0.6), 0.22);

    // 기름통
    this.oil.update(dt, this.wok);
    if (this.oil.landed > 0) {
      this.oilMl += this.oil.landed;
      this.oil.landed = 0;
      this.wok.setOil(this.oilMl);
    }
    this.particles.oilRatio = this.oilRatio();

    this.stats = this.particles.stats();
    this.types = this.particles.typeStats();
    const s = this.stats;
    // 전부 쏟아 버렸다면 처음부터 다시 담을 수 있게 한다
    if (s.live === 0 && this.dishTotal > 0) {
      this.resetDish();
      this.toast('전부 쏟았어요! 다시 담으세요', '', 'bad');
    }
    this.sfx.setSizzle(this.active ? s.contacts / 60 : 0);

    // 불꽃 / 김
    const flare = clamp(sp / 2.5, 0, 1);
    this.world.flames.forEach((f, i) => {
      const n = 0.75 + 0.35 * Math.sin(this.time * 23 + i * 1.7) + 0.2 * Math.sin(this.time * 37 + i * 3.1);
      f.scale.set(1 + flare * 0.5, n * (1 + flare * 1.2), 1 + flare * 0.5);
    });
    // 웍질 불길: 재료가 높이 뜰수록 림에서 불길이 솟고 불티가 튄다
    const wc = this.tmp.copy(this.wok.base).add(this.wok.off);
    const lift = this.particles.airLift;
    // 재료 몇 조각이 일정 높이 넘게 떠야 불길이 붙는다 (쏟아 넣을 때 튀는 정도는 무시)
    const hot = s.live > 0 && this.particles.airborne >= 3 ? clamp((lift - T.flameMinLift) / 0.15, 0, 1.5) : 0;
    this.flareCd -= dt;
    if (hot > 0 && this.flareCd <= 0) {
      this.fire.flare(wc, this.wok.rimR, hot);
      this.fire.sparks(wc, Math.round((hot * 6 + Math.min(10, this.particles.airborne * 0.15)) * T.sparkAmount));
      this.flareCd = 0.07;
    }
    this.fire.update(dt);
    // 화구 불빛: 겹친 사인 + 잔떨림으로 불규칙하게 일렁이고, 셀수록 노랗게
    const t = this.time;
    const flick =
      (0.07 * Math.sin(t * 31) + 0.05 * Math.sin(t * 17.3 + 1.1) + 0.04 * Math.sin(t * 53.7 + 2.3) + (Math.random() - 0.5) * 0.06) *
      T.fireFlicker;
    const fl = this.world.fireLight;
    fl.intensity = Math.max(0, 0.4 + flare * 0.5 + hot * 1.2 + flick * (1 + hot));
    fl.color.setRGB(1, 0.5 + 0.12 * hot + flick * 0.4, 0.18 + 0.05 * hot);

    // 카메라 흔들림
    this.shake = Math.max(0, this.shake - dt * 0.03);
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * this.shake * 2,
      this.camBase.y + (Math.random() - 0.5) * this.shake * 2,
      this.camBase.z,
    );
    const heatLevel = clamp(s.avgCook, 0, 1);
    // 달궈진 기름일수록 수면에 아지랑이 같은 잔물결이 인다
    this.wok.oil.heat = 0.35 + heatLevel * 0.8 + flare * 0.4;
    this.wok.oil.update();
    this.steam.update(dt, s.live ? 2 + heatLevel * 7 + s.burntFrac * 14 : 0, wc, clamp(s.burntFrac * 2.5, 0, 1));

    this.particleView.update(dt);
    this.updateHud();
  }

  /** 첫 회차 단계별 튜토리얼: 안내 문구, 강조, 화살표 */
  private updateTutorial() {
    const on = this.state === 'research' && this.tutorial && !this.modalOpen();
    const guide = $('guide');
    const arrow = $('tut-arrow');
    const pulse: HTMLElement[] = [];
    let arrowAt: THREE.Vector3 | null = null;
    let arrowLabel = '';
    if (on) {
      guide.classList.remove('hidden');
      $('hint').classList.add('off');
      const v = tutorialView({
        oilMl: this.oilMl,
        oilIdeal: T.oilIdeal,
        oilMin: T.oilMin,
        oilMax: T.oilMax,
        counts: this.counts,
        cook: (id) => {
          const t = this.types[ING_INDEX[id]];
          return { n: t?.n ?? 0, avg: t?.avgCook ?? 0, burnt: t?.burntFrac ?? 0 };
        },
        cookMin: T.cookMin,
        cookMax: T.cookMax,
        burntLimit: T.tasteBurntLimit,
      });
      $('guide-count').textContent = `${v.index + 1} / ${v.total}`;
      this.setHtml(
        'guide-dots',
        Array.from({ length: v.total }, (_, i) => `<i class="${i < v.index ? 'done' : i === v.index ? 'now' : ''}"></i>`).join(''),
      );
      $('guide-icon').innerHTML = svgIcon(v.icon);
      $('guide-name').textContent = v.title;
      $('guide-text').textContent = v.text;
      const warn = $('guide-warn');
      warn.classList.toggle('hidden', !v.warn);
      warn.textContent = v.warn ?? '';
      const target: TutTarget = v.warnTarget ?? v.target;
      const el = this.tutElement(target);
      if (el) pulse.push(el);
      if (target === 'wok') pulse.push($('gauge'));
      if (target === 'oil') {
        arrowAt = this.tmp.copy(this.oil.group.position).add(new THREE.Vector3(0, 0.34, 0));
        arrowLabel = this.oil.held ? '웍 위에서 흔들기!' : '꾹 누른 채 끌기';
      } else if (target === 'wok') {
        arrowAt = this.tmp.copy(this.wok.base).add(this.wok.off).add(new THREE.Vector3(0, 0.2, 0.15));
        arrowLabel = '꾹 누른 채 흔들기';
      }
    } else if (this.state === 'research' && this.round === 1 && this.found.has(TUTORIAL_RECIPE) && !this.modalOpen()) {
      // 튜토리얼을 마치면 장사하러 가기를 강조
      pulse.push($('go-sell'));
    }
    if (!on && this.tutorial === false) guide.classList.add('hidden');

    // 강조 갱신
    for (const el of this.pulsing) if (!pulse.includes(el)) el.classList.remove('tut-pulse');
    for (const el of pulse) el.classList.add('tut-pulse');
    this.pulsing = pulse;

    if (arrowAt) {
      const p = arrowAt.project(this.camera);
      arrow.classList.remove('hidden');
      arrow.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
      arrow.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
      (arrow.querySelector('b') as HTMLElement).textContent = arrowLabel;
    } else {
      arrow.classList.add('hidden');
    }
  }

  private tutElement(t: TutTarget): HTMLElement | null {
    if (t === 'taste') return $('taste-btn');
    if (t === 'trash') return $('trash');
    if (t.startsWith('ing:')) return this.ingButtons.get(t.slice(4) as IngId) ?? null;
    return null;
  }

  private setHtml(id: string, html: string) {
    const el = $(id);
    if (el.dataset.html !== html) {
      el.dataset.html = html;
      el.innerHTML = html;
    }
  }

  private updateHud() {
    if (!this.active) return;
    const s = this.stats;
    const research = this.state === 'research';
    $('day-kicker').textContent = research ? `ROUND ${this.round}` : `DAY ${this.round}`;
    $('day').textContent = research ? '레시피 연구' : '장사 중';
    if (!research) {
      const t = Math.max(0, Math.ceil(this.timeLeft));
      $('clock').textContent = t > 0 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '마감';
      const frac = clamp(this.timeLeft / T.dayLength, 0, 1);
      $('time-fill').style.width = `${frac * 100}%`;
      $('time-fill').parentElement!.classList.toggle('low', frac < 0.2);
    }
    $('money-label').textContent = research ? '보유' : '오늘 매출';
    $('money').textContent = `${won(research ? this.money : this.dayMoney)}원`;
    $('rating').textContent = this.starsN ? (this.starsSum / this.starsN).toFixed(1) : '-';

    this.updateTutorial();

    // 연구 패널
    if (research) {
      $('found-count').textContent = `${this.found.size}/${RECIPES.length}`;
      const tb = $<HTMLButtonElement>('taste-btn');
      tb.disabled = s.live < 8;
      $<HTMLButtonElement>('go-sell').disabled = this.tutorial;
    }

    const c = this.customer;
    const waiting = !research && !!c && c.state === 'waiting';
    $('ticket').classList.toggle('hidden', !waiting);
    if (c && waiting) {
      $('ticket-no').textContent = `주문 No. ${String(this.served + this.lost + 1).padStart(2, '0')}`;
      $('ticket-price').textContent = `${won(c.recipe.price)}원`;
      $('ticket-name').textContent = c.recipe.name;
      const rows = c.recipe.steps.map(([id, n], i) => {
        const got = this.counts.get(id) ?? 0;
        const cls = got === 0 ? '' : got === n ? 'ok' : got > n ? 'wrong' : 'part';
        return `<div class="tk-step ${cls}"><span class="no">${i + 1}</span>${tok(id, 'sm')}<span class="nm">${ingDef(id).name}</span><span class="ct">${got} / ${n}</span></div>`;
      });
      for (const id of this.counts.keys()) {
        if (c.recipe.steps.some(([x]) => x === id)) continue;
        rows.push(`<div class="tk-step wrong"><span class="no">✕</span>${tok(id, 'sm')}<span class="nm">${ingDef(id).name}</span><span class="ct">주문에 없음</span></div>`);
      }
      this.setHtml('ticket-ings', rows.join(''));
      const f = c.patienceFrac;
      const p = $('patience');
      p.style.width = `${f * 100}%`;
      p.className = f < 0.25 ? 'low' : f < 0.5 ? 'mid' : '';
      $('patience-label').textContent = f < 0.25 ? '곧 떠나요!' : f < 0.5 ? '조금 급해요' : '여유 있어요';
    }
    for (const [id, b] of this.ingButtons) {
      const open = this.isUnlocked(id);
      const n = this.counts.get(id) ?? 0;
      b.classList.toggle('locked', !open);
      b.classList.toggle('full', n >= MAX_PORTIONS);
      b.disabled = !open || n >= MAX_PORTIONS;
      b.setAttribute('aria-label', open ? `${ingDef(id).name} 넣기 (${n}/${MAX_PORTIONS})` : '잠긴 재료');
      (b.querySelector('.cnt') as HTMLElement).textContent = n ? `×${n}` : '';
      (b.querySelector('em') as HTMLElement).textContent = open ? ingDef(id).name : '잠김';
      const want = waiting && c ? c.recipe.steps.find(([x]) => x === id) : undefined;
      b.classList.toggle('need', !!want && n < want[1]);
    }
    $<HTMLButtonElement>('serve').disabled = !waiting || s.live < 8;
    $<HTMLButtonElement>('trash').disabled = s.live === 0 && this.oilMl <= 0.05;

    // 재료별 익힘 게이지
    const has = s.live > 0;
    const rows: IngId[] = [];
    let under = 0;
    let over = 0;
    for (const id of this.order) {
      const t = this.types[ING_INDEX[id]];
      if (!t || !t.n) continue;
      if (t.avgCook < T.cookMin) under++;
      else if (t.avgCook > T.cookMax) over++;
      rows.push(id);
    }
    const rowsHtml = rows
      .map((id) => {
        const t = this.types[ING_INDEX[id]];
        const st = t.avgCook < T.cookMin ? ['', '덜 익음'] : t.avgCook > T.cookMax ? ['bad', '너무 익음'] : ['ok', '딱 좋음'];
        return `<div class="crow"><div class="g-line"><span class="g-name">${tok(id, 'sm')}${ingDef(id).name}</span><span class="cstat ${st[0]}">${st[1]}</span></div><div class="bar cook"><div class="zone"></div><div class="fill" data-id="${id}"></div></div></div>`;
      })
      .join('');
    this.setHtml('cook-rows', rowsHtml || '<div class="empty">재료를 넣어 주세요</div>');
    const gauge = $('gauge');
    gauge.style.setProperty('--zl', `${clamp(T.cookMin / GAUGE_MAX, 0, 1) * 100}%`);
    gauge.style.setProperty('--zw', `${clamp((T.cookMax - T.cookMin) / GAUGE_MAX, 0, 1) * 100}%`);
    for (const el of $('cook-rows').querySelectorAll<HTMLElement>('.fill')) {
      const t = this.types[ING_INDEX[el.dataset.id as IngId]];
      el.style.width = `${clamp((t?.avgCook ?? 0) / GAUGE_MAX, 0, 1) * 100}%`;
    }
    let label = '-';
    let cls = '';
    if (rows.length) {
      if (over) [label, cls] = [`너무 익음 ${over}`, 'bad'];
      else if (under) [label, cls] = [`덜 익음 ${under}`, 'warn'];
      else [label, cls] = ['딱 좋음', 'ok'];
    }
    $('cook-text').textContent = label;
    $('cook-text').className = cls;
    const or = this.oilRatio();
    const oilOk = or >= T.oilMin && or <= T.oilMax;
    this.setHtml(
      'oil-text',
      this.oilMl > 0.05 || this.counts.size
        ? `${Math.round(this.oilMl)}ml<span class="oil-st"> · ${or < T.oilMin ? '적음' : or > T.oilMax ? '많음' : '적당'}</span>`
        : '-',
    );
    $('oil-text').className = this.oilMl > 0.05 ? (oilOk ? 'ok' : 'warn') : '';
    gauge.style.setProperty('--ol', `${clamp(T.oilMin / 2, 0, 1) * 100}%`);
    gauge.style.setProperty('--ow', `${clamp((T.oilMax - T.oilMin) / 2, 0, 1) * 100}%`);
    $('oil-fill').style.width = `${clamp(or / 2, 0, 1) * 100}%`;
    $('amount').textContent = has && this.dishTotal ? `${Math.round((s.live / this.dishTotal) * 100)}%` : '-';
    $('burnt').textContent = has ? `${Math.round(s.burntFrac * 100)}%` : '-';
    const toss = has ? this.tossFrac() : 0;
    // 100%마다 한 바퀴씩 다시 채우고 단계별로 색을 바꾼다
    const lap = Math.floor(toss);
    const fill = $('toss-fill');
    fill.style.width = `${(toss - lap) * 100}%`;
    fill.dataset.lap = String(Math.min(lap, 3));
    $('toss-bar').dataset.lap = String(Math.min(lap, 3));
    $('toss-text').textContent = has ? `+${Math.round(toss * 100)}%` : '-';

    // 말풍선
    const speaker = c && c.say ? c : this.leaving.find((l) => l.say);
    const bubble = $('bubble');
    if (speaker) {
      const p = this.tmp.copy(speaker.head).project(this.camera);
      bubble.classList.remove('hidden');
      bubble.textContent = speaker.say;
      bubble.style.left = `${clamp((p.x * 0.5 + 0.5) * window.innerWidth, 90, window.innerWidth - 90)}px`;
      bubble.style.top = `${Math.max(120, (-p.y * 0.5 + 0.5) * window.innerHeight)}px`;
    } else {
      bubble.classList.add('hidden');
    }
  }

  private last = performance.now();
  private frame() {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.watchPerf(raw);
    // 느린 기기(10fps 까지)에서도 게임 시간이 실제 시간대로 흐르게: 한 프레임에 최대 0.1초.
    // (예전엔 0.05초로 잘라 20fps 아래에선 게임 전체가 슬로모션이 되어 손님 인내심 등이 기기마다 달랐다)
    const dt = Math.min(0.1, raw);
    this.last = now;
    this.acc += dt;
    let n = 0;
    while (this.acc >= SUBSTEP && n < MAX_SUBSTEPS) {
      this.stepPhysics(SUBSTEP);
      this.acc -= SUBSTEP;
      n++;
    }
    if (n === MAX_SUBSTEPS) this.acc = 0;
    this.update(dt);
    const key = this.world.keyLight;
    key.castShadow = this.quality.shadows && T.shadows > 0;
    this.world.tick(this.time);
    key.intensity = this.world.keyBase * T.keyLight;
    this.post.render();
  }
}

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
