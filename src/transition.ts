/**
 * 화면 전환 로딩창 (모션 그래픽).
 * 사선 패널 3장이 차례로 쓸고 들어와 화면을 덮고 → 그 사이에 장면을 바꾸고 →
 * 제목·로딩 바·재료 띠가 움직이다가 → 패널이 반대쪽으로 빠지며 새 화면이 드러난다.
 */
import { TAG_LABEL, randomTip } from './tips';

export type WipeKind = 'research' | 'selling' | 'result' | 'lobby';

export interface WipeInfo {
  kind: WipeKind;
  icon: string;
  kicker: string;
  title: string;
  sub?: string;
}

const TICKER = '🍚 🌿 🥚 🌶️ 🍖 🧅 🥕 🍤 🥓 🧀 🔥 ';

export class Wipe {
  busy = false;
  private el: HTMLDivElement;
  private reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'wipe';
    this.el.className = 'hidden';
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="wp p1"></div><div class="wp p2"></div><div class="wp p3"></div>
      <div class="wipe-ticker t1"><span></span><span></span></div>
      <div class="wipe-ticker t2"><span></span><span></span></div>
      <div class="wipe-card">
        <div class="wipe-icon"></div>
        <div class="wipe-kicker"></div>
        <div class="wipe-title"></div>
        <div class="wipe-sub"></div>
        <div class="wipe-bar"><i></i></div>
        <div class="wipe-tip"></div>
      </div>`;
    const line = TICKER.repeat(6);
    for (const s of this.el.querySelectorAll('.wipe-ticker span')) s.textContent = line;
    document.body.appendChild(this.el);
  }

  /**
   * 전환 실행. mid 는 화면이 다 덮였을 때 호출된다 (여기서 장면을 바꾼다).
   * covered: 이미 덮인 상태에서 시작 (첫 로딩용)
   */
  run(info: WipeInfo, mid: () => void, opts: { covered?: boolean; hold?: number; onSweep?: () => void } = {}) {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    const IN = this.reduced ? 160 : 520;
    const HOLD = opts.hold ?? (this.reduced ? 500 : 950);
    const OUT = this.reduced ? 200 : 620;
    const el = this.el;
    el.querySelector('.wipe-icon')!.textContent = info.icon;
    el.querySelector('.wipe-kicker')!.textContent = info.kicker;
    el.querySelector('.wipe-title')!.textContent = info.title;
    el.querySelector('.wipe-sub')!.textContent = info.sub ?? '';
    // 팁 문구: 화면 종류에 맞는 것 중 무작위
    const tip = randomTip(info.kind);
    const tipEl = el.querySelector('.wipe-tip')!;
    tipEl.textContent = '';
    const tag = document.createElement('small');
    tag.textContent = `TIP · ${TAG_LABEL[tip.tag]}`;
    tipEl.append(tag, tip.text);
    el.style.setProperty('--hold', `${HOLD}ms`);
    el.className = `wipe-${info.kind}${this.reduced ? ' reduced' : ''}`;
    void el.offsetWidth;

    return new Promise<void>((resolve) => {
      const hold = () => {
        mid();
        el.classList.add('covered', 'hold');
        setTimeout(() => {
          opts.onSweep?.();
          el.classList.remove('in', 'hold');
          el.classList.add('out');
          setTimeout(() => {
            el.className = 'hidden';
            this.busy = false;
            resolve();
          }, OUT);
        }, HOLD);
      };
      if (opts.covered) {
        el.classList.add('in', 'instant');
        hold();
      } else {
        opts.onSweep?.();
        el.classList.add('in');
        setTimeout(hold, IN);
      }
    });
  }
}
