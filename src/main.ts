import * as THREE from 'three';
import { Sfx } from './audio';
import { Customer } from './customers';
import { INGREDIENTS, ING_INDEX, RECIPES, type IngId, type Recipe } from './ingredients';
import { ParticleRenderer, Particles, type DishStats } from './physics';
import { buildWorld, Steam } from './scene';
import { Wok } from './wok';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const won = (n: number) => n.toLocaleString('ko-KR');

const SUBSTEP = 1 / 240;
const DAY_LENGTH = 150;
const COOK_MIN = 0.85;
const COOK_MAX = 1.25;
const GAUGE_MAX = 1.6;
/** 재료 1조각당 이만큼(m) 높이를 누적하면 웍질 보너스 만점 */
const TOSS_FULL = 0.25;
const TOSS_QUALITY = 0.2;
const TOSS_PAY = 0.3;

interface Verdict {
  quality: number;
  stars: number;
  pay: number;
  tip: number;
  toss: number;
  tossPay: number;
  comment: string;
}

class Game {
  state: 'title' | 'playing' | 'dayend' = 'title';
  day = 1;
  timeLeft = DAY_LENGTH;
  money = 0;
  dayMoney = 0;
  served = 0;
  lost = 0;
  starsSum = 0;
  starsN = 0;

  customer: Customer | null = null;
  private leaving: Customer[] = [];
  private nextCustomerIn = 1.5;
  private added = new Set<IngId>();
  private dishTotal = 0;
  private tossPopupCd = 0;
  private stats: DishStats = { live: 0, avgCook: 0, sdCook: 0, burntFrac: 0, contacts: 0 };
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
  readonly sfx = new Sfx();
  private canvas = $<HTMLCanvasElement>('game');
  private ingButtons = new Map<IngId, HTMLButtonElement>();
  private tmp = new THREE.Vector3();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.world.scene.add(this.wok.group, this.particleView.group);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.buildUi();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ───────────── 입력 ─────────────

  private bindInput() {
    const cv = this.canvas;
    let lastX = 0;
    let lastY = 0;
    let pid = -1;
    cv.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing' || pid !== -1) return;
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
      const s = 1.15 / window.innerHeight;
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
      if (e.code === 'Space' && this.state === 'playing') {
        e.preventDefault();
        this.serve();
      }
    });
  }

  private buildUi() {
    const wrap = $('ings');
    for (const def of INGREDIENTS) {
      const b = document.createElement('button');
      b.innerHTML = `<span>${def.emoji}</span>${def.name}`;
      b.addEventListener('click', () => this.addIngredient(def.id));
      wrap.appendChild(b);
      this.ingButtons.set(def.id, b);
    }
    $('serve').addEventListener('click', () => this.serve());
    $('trash').addEventListener('click', () => this.trash());
    $('start').addEventListener('click', () => {
      this.sfx.init();
      $('title').classList.add('hidden');
      this.startDay();
    });
    $('next').addEventListener('click', () => {
      $('dayend').classList.add('hidden');
      this.day++;
      this.startDay();
    });
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
    this.camera.updateProjectionMatrix();
  }

  // ───────────── 게임 흐름 ─────────────

  startDay() {
    this.state = 'playing';
    this.timeLeft = DAY_LENGTH;
    this.dayMoney = 0;
    this.served = 0;
    this.lost = 0;
    this.starsSum = 0;
    this.starsN = 0;
    this.nextCustomerIn = 1.2;
    this.particles.clearAll();
    this.resetDish();
    $('hud').classList.remove('hidden');
  }

  private resetDish() {
    this.added.clear();
    this.dishTotal = 0;
    this.particles.tossSum = 0;
    this.particles.tossPeak = 0;
  }

  private spawnCustomer() {
    const pool = RECIPES.filter((r) => r.fromDay <= this.day);
    const recipe = pool[Math.floor(Math.random() * pool.length)];
    const patience = Math.max(50, 95 - this.day * 5) + recipe.ings.length * 3;
    this.customer = new Customer(this.world.scene, recipe, patience);
    this.sfx.play('bell', 0.5);
  }

  addIngredient(id: IngId) {
    if (this.state !== 'playing' || this.added.has(id)) return;
    const def = INGREDIENTS[ING_INDEX[id]];
    const c = this.tmp.copy(this.wok.base).add(this.wok.off);
    for (let i = 0; i < def.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.1;
      const y = c.y + 0.22 + Math.random() * 0.3;
      if (this.particles.spawn(ING_INDEX[id], c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r, -0.5) >= 0) {
        this.dishTotal++;
      }
    }
    this.added.add(id);
    this.sfx.play('plop', 0.7);
  }

  trash() {
    if (this.state !== 'playing' || this.stats.live === 0) return;
    this.particles.clearLive();
    this.resetDish();
    this.sfx.play('whoosh', 0.5);
    this.toast('웍을 비웠어요', '', '');
  }

  private judge(recipe: Recipe, patienceFrac: number): Verdict {
    const s = this.stats;
    const missing = recipe.ings.filter((i) => !this.added.has(i)).length;
    const extra = [...this.added].filter((i) => !recipe.ings.includes(i)).length;
    const amount = this.dishTotal ? s.live / this.dishTotal : 0;

    const ingScore = Math.max(0, 1 - 0.35 * missing - 0.2 * extra);
    const amountScore = 0.2 + 0.8 * clamp(amount / 0.92, 0, 1);
    let cookScore = 1;
    if (s.avgCook < COOK_MIN) cookScore = (s.avgCook / COOK_MIN) ** 2;
    else if (s.avgCook > COOK_MAX) cookScore = Math.max(0, 1 - (s.avgCook - COOK_MAX) / 0.5);
    const evenScore = clamp(1 - (s.sdCook - 0.2) / 0.5, 0.5, 1);
    const burnScore = clamp(1 - s.burntFrac * 2.5, 0, 1);
    const base = ingScore * amountScore * cookScore * evenScore * burnScore;
    // 웍질 보너스: 재료가 높이 떠오를수록 가산점 (기본 점수에 비례해서 붙는다)
    const toss = this.tossFrac();
    const quality = Math.min(1, base * (1 + TOSS_QUALITY * toss));

    // 가장 문제가 되는 항목으로 손님 반응을 정한다
    const issues: [number, string][] = [
      [ingScore, missing ? '재료가 빠졌잖아요…' : '이건 주문한 게 아닌데요?'],
      [amountScore, '양이 왜 이렇게 적어요?'],
      [cookScore, s.avgCook < COOK_MIN ? '덜 익었어요…' : '너무 볶았어요…'],
      [evenScore, '익은 게 들쭉날쭉해요.'],
      [burnScore, '탔잖아요!'],
    ];
    issues.sort((a, b) => a[0] - b[0]);
    let comment: string;
    if (quality >= 0.9 && toss >= 0.7) comment = '완벽해요! 불맛 최고 🔥';
    else if (quality >= 0.9) comment = '완벽해요! 😍';
    else if (quality >= 0.75) comment = '맛있어요! 😋';
    else comment = issues[0][1];

    const stars = clamp(Math.round(1 + 4 * quality), 1, 5);
    const pay = quality < 0.25 ? 0 : Math.round((recipe.price * (0.4 + 0.6 * quality)) / 100) * 100;
    const tip = quality >= 0.8 ? Math.round((recipe.price * 0.25 * patienceFrac) / 100) * 100 : 0;
    const tossPay = pay > 0 ? Math.round((recipe.price * TOSS_PAY * toss) / 100) * 100 : 0;
    return { quality, stars, pay, tip, toss, tossPay, comment };
  }

  /** 웍질 보너스 0~1: 조각당 누적 떠오른 높이 기준 */
  private tossFrac() {
    const n = Math.max(1, this.dishTotal);
    return clamp(this.particles.tossSum / n / TOSS_FULL, 0, 1);
  }

  serve() {
    const c = this.customer;
    if (this.state !== 'playing' || !c || c.state !== 'waiting' || this.stats.live < 8) return;
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
    const col = (w.plateFood.material as THREE.MeshStandardMaterial).color;
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
    this.nextCustomerIn = 2.5 + Math.random() * 2;

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

  private endDay() {
    this.state = 'dayend';
    this.wok.release();
    let best = this.dayMoney;
    try {
      best = Math.max(Number(localStorage.getItem('woktruck.best') ?? 0), best);
      localStorage.setItem('woktruck.best', String(best));
    } catch {
      /* 저장 불가 환경은 무시 */
    }
    const avg = this.starsN ? (this.starsSum / this.starsN).toFixed(1) : '-';
    $('end-title').textContent = `${this.day}일차 마감`;
    $('end-body').innerHTML =
      `오늘 매출 <b>${won(this.dayMoney)}원</b><br>` +
      `손님 <b>${this.served}명</b> 서빙 · <b>${this.lost}명</b> 놓침<br>` +
      `평균 별점 <b>⭐ ${avg}</b><br>` +
      `누적 <b>${won(this.money)}원</b> · 하루 최고 <b>${won(best)}원</b>`;
    $('dayend').classList.remove('hidden');
  }

  private popToss(text: string, cm: number) {
    const el = document.createElement('div');
    el.className = `tosspop${cm >= 20 ? ' big' : cm >= 14 ? ' mid' : ''}`;
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

    if (this.state === 'playing') {
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
    if (peak > 0 && this.tossPopupCd <= 0 && this.state === 'playing') {
      if (peak >= 0.08) {
        const cm = Math.round(peak * 100);
        this.popToss(cm >= 20 ? `🔥🔥 ${cm}cm!!` : cm >= 14 ? `🔥 ${cm}cm!` : `${cm}cm`, cm);
        this.tossPopupCd = 0.9;
      }
      this.particles.tossPeak = 0;
    }
    const sp = this.wok.speed;
    if (sp > 1.3 && this.stats.live > 0) this.sfx.play('whoosh', clamp(sp / 4, 0.15, 0.6), 0.22);

    this.stats = this.particles.stats();
    const s = this.stats;
    // 전부 쏟아 버렸다면 처음부터 다시 담을 수 있게 한다
    if (s.live === 0 && this.dishTotal > 0) {
      this.resetDish();
      this.toast('전부 쏟았어요! 다시 담으세요', '', 'bad');
    }
    this.sfx.setSizzle(this.state === 'playing' ? s.contacts / 60 : 0);

    // 불꽃 / 김
    const flare = clamp(sp / 2.5, 0, 1);
    this.world.flames.forEach((f, i) => {
      const n = 0.75 + 0.35 * Math.sin(this.time * 23 + i * 1.7) + 0.2 * Math.sin(this.time * 37 + i * 3.1);
      f.scale.set(1 + flare * 0.5, n * (1 + flare * 1.2), 1 + flare * 0.5);
    });
    this.world.fireLight.intensity = 0.8 + flare * 1.6 + 0.15 * Math.sin(this.time * 30);
    const wc = this.tmp.copy(this.wok.base).add(this.wok.off);
    const heatLevel = clamp(s.avgCook, 0, 1);
    this.steam.update(dt, s.live ? 2 + heatLevel * 7 + s.burntFrac * 14 : 0, wc, clamp(s.burntFrac * 2.5, 0, 1));

    this.particleView.update(dt);
    this.updateHud();
  }

  private updateHud() {
    if (this.state === 'title') return;
    const s = this.stats;
    $('day').textContent = `${this.day}일차`;
    const t = Math.max(0, Math.ceil(this.timeLeft));
    $('clock').textContent = t > 0 ? `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '⏱ 마감 임박';
    $('money').textContent = won(this.money);
    $('rating').textContent = this.starsN ? (this.starsSum / this.starsN).toFixed(1) : '-';

    const c = this.customer;
    const waiting = !!c && c.state === 'waiting';
    $('ticket').classList.toggle('hidden', !waiting);
    if (c && waiting) {
      $('ticket-name').textContent = `${c.recipe.name} · ${won(c.recipe.price)}원`;
      const chips = c.recipe.ings.map((id) => {
        const d = INGREDIENTS[ING_INDEX[id]];
        return `<span class="chip ${this.added.has(id) ? 'ok' : ''}">${d.emoji} ${d.name}</span>`;
      });
      for (const id of this.added) {
        if (c.recipe.ings.includes(id)) continue;
        const d = INGREDIENTS[ING_INDEX[id]];
        chips.push(`<span class="chip wrong">${d.emoji} ${d.name}</span>`);
      }
      const html = chips.join('');
      const el = $('ticket-ings');
      if (el.dataset.html !== html) {
        el.dataset.html = html;
        el.innerHTML = html;
      }
      const p = $('patience');
      p.style.width = `${c.patienceFrac * 100}%`;
      p.classList.toggle('low', c.patienceFrac < 0.3);
    }
    for (const [id, b] of this.ingButtons) {
      b.disabled = this.state !== 'playing' || this.added.has(id);
      b.classList.toggle('need', waiting && !!c && c.recipe.ings.includes(id) && !this.added.has(id));
    }
    $<HTMLButtonElement>('serve').disabled = !waiting || s.live < 8;
    $<HTMLButtonElement>('trash').disabled = s.live === 0;

    // 익힘 게이지
    const has = s.live > 0;
    $('cook-fill').style.width = `${has ? clamp(s.avgCook / GAUGE_MAX, 0, 1) * 100 : 0}%`;
    let label = '-';
    if (has) {
      if (s.avgCook < 0.3) label = '날것';
      else if (s.avgCook < COOK_MIN) label = '덜 익음';
      else if (s.avgCook <= COOK_MAX) label = '딱 좋음!';
      else label = '과하게 익음';
    }
    $('cook-text').textContent = label;
    $('amount').textContent = has && this.dishTotal ? `${Math.round((s.live / this.dishTotal) * 100)}%` : '-';
    $('burnt').textContent = has ? `${Math.round(s.burntFrac * 100)}%` : '-';
    const toss = has ? this.tossFrac() : 0;
    $('toss-fill').style.width = `${toss * 100}%`;
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
    this.renderer.render(this.world.scene, this.camera);
  }
}

const game = new Game();
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
