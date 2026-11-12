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
import { FireFx, Post, toonify } from './look';
import { T, loadTuning } from './tuning';
import { DebugPanel, isTyping } from './debug';

// 디버그 패널에서 바꿔 둔 수치를 먼저 불러온다
loadTuning();

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const won = (n: number) => n.toLocaleString('ko-KR');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const SUBSTEP = 1 / 240;
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
  tastesLeft: number;
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
const ingLabel = (id: IngId) => `${ingDef(id).emoji} ${ingDef(id).name}`;

class Game {
  state: State = 'lobby';
  /** 회차 (= 장사 일차) */
  round = 1;
  money = 0;
  found = new Set<string>();
  tastesLeft = 2;
  best = 0;

  timeLeft = T.dayLength;
  dayMoney = 0;
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
  readonly debug = new DebugPanel();
  readonly post: Post;
  private camBase = new THREE.Vector3();
  private shake = 0;
  private flareCd = 0;
  readonly sfx = new Sfx();
  private canvas = $<HTMLCanvasElement>('game');
  private ingButtons = new Map<IngId, HTMLButtonElement>();
  private tmp = new THREE.Vector3();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.post = new Post(this.renderer, this.world.scene, this.camera);
    this.world.scene.add(this.wok.group, this.particleView.group);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.buildUi();
    this.debug.setInfo(() => this.debugInfo());
    this.showLobby();
    this.renderer.setAnimationLoop(() => this.frame());
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
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active || pid !== -1 || this.modalOpen()) return;
      pid = e.pointerId;
      cv.setPointerCapture(pid);
      lastX = e.clientX;
      lastY = e.clientY;
      this.wok.grabbed = true;
      cv.classList.add('grabbing');
      if (!this.hinted) {
        this.hinted = true;
        $('hint').classList.add('off');
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      // 화면 높이 기준으로 정규화: 어느 기기에서나 비슷한 손놀림
      const s = T.dragSensitivity / window.innerHeight;
      this.wok.nudge((e.clientX - lastX) * s, (e.clientY - lastY) * s);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      this.wok.release();
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
      b.innerHTML = `<i class="cnt"></i><span>${def.emoji}</span><em>${def.name}</em>`;
      b.addEventListener('click', () => this.addIngredient(def.id));
      wrap.appendChild(b);
      this.ingButtons.set(def.id, b);
    }
    $('serve').addEventListener('click', () => this.serve());
    $('taste-btn').addEventListener('click', () => this.taste());
    $('go-sell').addEventListener('click', () => this.startSelling());
    $('trash').addEventListener('click', () => this.trash());
    $('book-btn').addEventListener('click', () => this.openBook());
    $('lobby-book').addEventListener('click', () => this.openBook());
    $('book-close').addEventListener('click', () => $('book').classList.add('hidden'));
    $('taste-close').addEventListener('click', () => this.closeTaste());
    $('continue').addEventListener('click', () => {
      this.sfx.init();
      this.continueGame();
    });
    $('newgame').addEventListener('click', () => {
      this.sfx.init();
      if (readSave()) $('confirm').classList.remove('hidden');
      else this.newGame();
    });
    $('confirm-no').addEventListener('click', () => $('confirm').classList.add('hidden'));
    $('confirm-yes').addEventListener('click', () => {
      $('confirm').classList.add('hidden');
      this.newGame();
    });
    $('next').addEventListener('click', () => {
      $('dayend').classList.add('hidden');
      this.startResearch();
    });
    $('home-btn').addEventListener('click', () => this.showLobby());
    $('mute').addEventListener('click', () => {
      $('mute').textContent = this.sfx.toggleMute() ? '🔇' : '🔊';
    });
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
    this.camera.updateProjectionMatrix();
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
      tastesLeft: this.tastesLeft,
      best: this.best,
    });
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
    $('save-info').textContent = s
      ? `${s.round}회차 ${s.phase === 'research' ? '레시피 연구' : '장사'} · 레시피 ${s.found.length}/${RECIPES.length} · 💰 ${won(s.money)}원`
      : '저장된 게임이 없어요';
    $('lobby-book').classList.toggle('hidden', !s);
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
    this.particles.clearAll();
    this.resetDish();
  }

  private newGame() {
    const best = readSave()?.best ?? 0;
    this.round = 1;
    this.money = 0;
    this.found = new Set();
    this.best = best;
    this.tastesLeft = T.tastesPerRound;
    this.startResearch(true);
  }

  private continueGame() {
    const s = readSave();
    if (!s) return;
    this.round = s.round;
    this.money = s.money;
    this.found = new Set(s.found);
    this.tastesLeft = s.tastesLeft;
    this.best = s.best ?? 0;
    if (s.phase === 'selling') this.startSelling();
    else this.startResearch(false);
  }

  // ───────────── 레시피 연구 ─────────────

  private startResearch(fresh = true) {
    $('lobby').classList.add('hidden');
    this.clearStage();
    this.state = 'research';
    if (fresh) this.tastesLeft = T.tastesPerRound;
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
    $('lab').classList.toggle('hidden', !research);
    $('taste-btn').classList.toggle('hidden', !research);
    $('go-sell').classList.toggle('hidden', !research);
    $('serve').classList.toggle('hidden', research);
    $('ticket').classList.add('hidden');
    $('hint').textContent = research
      ? '재료를 넣고 웍을 끌어서 볶은 뒤 맛보기 · 재료마다 익는 속도가 달라요'
      : '웍을 누른 채로 끌어서 흔드세요 · 높이 띄울수록 보너스!';
  }

  /** 맛보기: 익힘이 맞아야 맛볼 수 있고, 회차당 횟수가 정해져 있다 */
  taste() {
    if (this.state !== 'research' || this.modalOpen()) return;
    if (this.stats.live < 8) {
      this.toast('재료를 넣고 볶아 주세요', '', 'bad');
      return;
    }
    if (this.tastesLeft <= 0 && !this.tutorial) {
      this.toast('이번 회차 맛보기를 다 썼어요', '장사하러 가서 다음 회차에 다시 연구해요', 'bad');
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

    const set = new Set(this.counts.keys());
    const hit = matchRecipe(set);
    if (hit && this.found.has(hit.id)) {
      this.showTaste('😋', '이미 아는 맛이에요', `<b>${esc(hit.name)}</b>이에요. 맛보기 횟수는 그대로예요.`);
      return;
    }
    if (!this.tutorial) this.tastesLeft--;
    if (hit) {
      this.found.add(hit.id);
      this.save();
      this.sfx.play('ding', 0.7);
      this.showTaste(
        '🎉',
        `새 레시피 발견! ${hit.name}`,
        `<p>레시피 북에 기록했어요. 장사할 때 손님이 주문해요.</p>
         <div class="steps">${this.stepsHtml(hit)}</div>
         <p class="small">정석 순서와 양이에요. 순서와 양이 맞을수록 장사 때 별점이 올라가요.</p>`,
        true,
      );
      return;
    }
    this.save();
    this.sfx.play('plop', 0.5);
    this.showTaste('🤔', '음…', this.feedback(set));
  }

  /** 아직 못 찾은 레시피 중 가장 가까운 것을 기준으로 반응한다 */
  private feedback(set: Set<IngId>) {
    const left = `<p class="small">이번 회차 남은 맛보기 ${this.tutorial ? '∞' : `${this.tastesLeft}번`}</p>`;
    const pool = RECIPES.filter((r) => !this.found.has(r.id) && recipeIngs(r).every((id) => this.isUnlocked(id)));
    if (!pool.length) return `<p>지금 재료로 찾을 수 있는 레시피는 다 찾았어요. 장사를 마치면 새 재료가 열려요.</p>${left}`;
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
    const match = ings.filter((i) => set.has(i)).length;
    const missing = ings.length - match;
    const extra = set.size - match;
    const lines: string[] = [];
    if (match === 0) lines.push('전혀 어울리지 않는 조합이에요.');
    else lines.push(`넣은 재료 중 <b>${match}가지</b>는 잘 어울려요.`);
    if (match > 0 && extra > 0) lines.push(`<b>${extra}가지</b>는 안 어울리는 것 같아요.`);
    if (match > 0 && missing > 0) lines.push(`뭔가 <b>${missing}가지</b>가 더 필요해요.`);
    return `<p>${lines.join('<br>')}</p>${left}`;
  }

  private showTaste(icon: string, title: string, html: string, clear = false) {
    $('taste-icon').textContent = icon;
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
      .map(([id, n]) => `<span class="step">${ingDef(id).emoji} ${ingDef(id).name} <small>×${n} ${AMOUNT_LABEL[n]}</small></span>`)
      .join('<span class="arrow">→</span>');
  }

  private openBook() {
    const grid = $('book-grid');
    grid.innerHTML = RECIPES.map((r, i) => {
      if (!this.found.has(r.id)) {
        return `<div class="rcard locked"><div class="no">${i + 1}</div><div class="q">???</div><div class="small">아직 찾지 못한 레시피</div></div>`;
      }
      return `<div class="rcard"><div class="no">${i + 1}</div><div class="rname">${esc(r.name)}</div><div class="price">${won(r.price)}원</div><div class="steps">${this.stepsHtml(r)}</div></div>`;
    }).join('');
    $('book-count').textContent = `${this.found.size} / ${RECIPES.length}`;
    $('book').classList.remove('hidden');
  }

  // ───────────── 웍 ─────────────

  private resetDish() {
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
    if (!this.active || this.stats.live === 0) return;
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
    const base = ingScore * amountScore * ratioScore * orderScore * cookScore * evenScore * burnScore;
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
    ];
    issues.sort((a, b) => a[0] - b[0]);
    let comment: string;
    if (quality >= 0.9 && toss >= 1) comment = '완벽해요! 불맛 최고 🔥';
    else if (quality >= 0.9) comment = '완벽해요! 😍';
    else if (quality >= 0.75) comment = '맛있어요! 😋';
    else comment = issues[0][1];

    const stars = clamp(Math.round(1 + 4 * quality), 1, 5);
    const pay = quality < T.refundBelow ? 0 : Math.round((recipe.price * (0.4 + 0.6 * quality)) / 100) * 100;
    const tip = quality >= T.tipAbove ? Math.round((recipe.price * T.tipRate * patienceFrac) / 100) * 100 : 0;
    const tossPay = pay > 0 ? Math.round((recipe.price * T.tossPay * toss) / 100) * 100 : 0;
    return { quality, stars, pay, tip, toss, tossPay, comment };
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
      if (v.tossPay) extras.push(`🔥 웍질 보너스 +${won(v.tossPay)}원`);
      if (v.tip) extras.push(`팁 +${won(v.tip)}원`);
      this.toast(`${starStr}  +${won(v.pay)}원`, extras.join(' · '), v.stars >= 4 ? 'good' : '');
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
    this.tastesLeft = T.tastesPerRound;
    const newIng = this.unlocked > before ? INGREDIENTS[this.unlocked - 1] : null;
    // 다음 회차 연구부터 이어서 할 수 있게 저장
    writeSave({
      v: 1,
      round: this.round,
      phase: 'research',
      money: this.money,
      found: [...this.found],
      tastesLeft: this.tastesLeft,
      best: this.best,
    });
    $('end-title').textContent = `${day}일차 장사 마감`;
    $('end-body').innerHTML =
      `오늘 매출 <b>${won(this.dayMoney)}원</b><br>` +
      `손님 <b>${this.served}명</b> 서빙 · <b>${this.lost}명</b> 놓침<br>` +
      `평균 별점 <b>⭐ ${avg}</b><br>` +
      `누적 <b>${won(this.money)}원</b> · 하루 최고 <b>${won(this.best)}원</b><br>` +
      `레시피 <b>${this.found.size} / ${RECIPES.length}</b>`;
    const unlock = $('end-unlock');
    if (newIng) {
      unlock.classList.remove('hidden');
      unlock.innerHTML = `<span class="big">${newIng.emoji}</span><div><small>새 재료 해금</small><b>${newIng.name}</b></div>`;
    } else {
      unlock.classList.add('hidden');
    }
    $('dayend').classList.remove('hidden');
  }

  private debugInfo() {
    const s = this.stats;
    const n = Math.max(1, this.dishTotal);
    const f = (v: number, d = 2) => v.toFixed(d);
    const lines = [
      `상태       ${this.state} · ${this.round}회차 · 맛보기 ${this.tastesLeft}`,
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
    el.textContent = text;
    $('tosspops').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  private toast(title: string, sub: string, cls: string) {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.textContent = title;
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
        this.endDay();
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
        this.popToss(cm >= T.tossBigCm ? `🔥🔥 ${cm}cm!!` : cm >= T.tossBigCm * 0.7 ? `🔥 ${cm}cm!` : `${cm}cm`, cm);
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
    this.world.fireLight.intensity = 0.4 + flare * 0.5 + hot * 1.2 + 0.08 * Math.sin(this.time * 30);

    // 카메라 흔들림
    this.shake = Math.max(0, this.shake - dt * 0.03);
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * this.shake * 2,
      this.camBase.y + (Math.random() - 0.5) * this.shake * 2,
      this.camBase.z,
    );
    const heatLevel = clamp(s.avgCook, 0, 1);
    this.steam.update(dt, s.live ? 2 + heatLevel * 7 + s.burntFrac * 14 : 0, wc, clamp(s.burntFrac * 2.5, 0, 1));

    this.particleView.update(dt);
    this.updateHud();
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
    $('day').textContent = research ? `🧪 ${this.round}회차 레시피 연구` : `🚚 ${this.round}일차 장사`;
    if (research) {
      $('clock').textContent = '';
    } else {
      const t = Math.max(0, Math.ceil(this.timeLeft));
      $('clock').textContent = t > 0 ? `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '⏱ 마감 임박';
    }
    $('money').textContent = won(this.money);
    $('rating').textContent = this.starsN ? (this.starsSum / this.starsN).toFixed(1) : '-';

    // 연구 패널
    if (research) {
      const total = T.tastesPerRound;
      const dots = this.tutorial
        ? '∞'
        : Array.from({ length: total }, (_, i) => `<i class="${i < this.tastesLeft ? 'on' : ''}"></i>`).join('');
      this.setHtml('taste-dots', dots);
      $('found-count').textContent = `${this.found.size} / ${RECIPES.length}`;
      const tb = $<HTMLButtonElement>('taste-btn');
      tb.disabled = s.live < 8 || (this.tastesLeft <= 0 && !this.tutorial);
      $<HTMLButtonElement>('go-sell').disabled = this.tutorial;
    }

    const c = this.customer;
    const waiting = !research && !!c && c.state === 'waiting';
    $('ticket').classList.toggle('hidden', !waiting);
    if (c && waiting) {
      $('ticket-name').textContent = `${c.recipe.name} · ${won(c.recipe.price)}원`;
      const chips = c.recipe.steps.map(([id, n]) => {
        const d = ingDef(id);
        const got = this.counts.get(id) ?? 0;
        const cls = got === 0 ? '' : got === n ? 'ok' : 'part';
        return `<span class="chip ${cls}">${d.emoji} ${d.name} <small>${got}/${n}</small></span>`;
      });
      for (const id of this.counts.keys()) {
        if (c.recipe.steps.some(([x]) => x === id)) continue;
        const d = ingDef(id);
        chips.push(`<span class="chip wrong">${d.emoji} ${d.name}</span>`);
      }
      this.setHtml('ticket-ings', chips.join('<span class="arrow">→</span>'));
      const p = $('patience');
      p.style.width = `${c.patienceFrac * 100}%`;
      p.classList.toggle('low', c.patienceFrac < 0.3);
    }
    for (const [id, b] of this.ingButtons) {
      const open = this.isUnlocked(id);
      const n = this.counts.get(id) ?? 0;
      b.classList.toggle('locked', !open);
      b.disabled = !open || n >= MAX_PORTIONS;
      (b.querySelector('.cnt') as HTMLElement).textContent = n ? `×${n}` : '';
      const want = waiting && c ? c.recipe.steps.find(([x]) => x === id) : undefined;
      b.classList.toggle('need', !!want && n < want[1]);
    }
    $<HTMLButtonElement>('serve').disabled = !waiting || s.live < 8;
    $<HTMLButtonElement>('trash').disabled = s.live === 0;

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
      .map(
        (id) =>
          `<div class="crow"><span>${ingDef(id).emoji}</span><div class="bar cook"><div class="zone"></div><div class="fill" data-id="${id}"></div></div></div>`,
      )
      .join('');
    this.setHtml('cook-rows', rowsHtml || '<div class="small dim">재료를 넣어 주세요</div>');
    const gauge = $('gauge');
    gauge.style.setProperty('--zl', `${clamp(T.cookMin / GAUGE_MAX, 0, 1) * 100}%`);
    gauge.style.setProperty('--zw', `${clamp((T.cookMax - T.cookMin) / GAUGE_MAX, 0, 1) * 100}%`);
    for (const el of $('cook-rows').querySelectorAll<HTMLElement>('.fill')) {
      const t = this.types[ING_INDEX[el.dataset.id as IngId]];
      el.style.width = `${clamp((t?.avgCook ?? 0) / GAUGE_MAX, 0, 1) * 100}%`;
    }
    let label = '-';
    if (rows.length) {
      if (over) label = '과하게 익음';
      else if (under) label = `덜 익음 ${under}`;
      else label = '딱 좋음!';
    }
    $('cook-text').textContent = label;
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let n = 0;
    while (this.acc >= SUBSTEP && n < 16) {
      this.stepPhysics(SUBSTEP);
      this.acc -= SUBSTEP;
      n++;
    }
    if (n === 16) this.acc = 0;
    this.update(dt);
    this.post.render();
  }
}

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
