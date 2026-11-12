/**
 * 화면 전환 로딩창 (모션 그래픽).
 * 사선 패널 3장이 차례로 쓸고 들어와 화면을 덮고 → 그 사이에 장면을 바꾸고 →
 * 제목·로딩 바·재료 띠가 움직이다가 → 패널이 반대쪽으로 빠지며 새 화면이 드러난다.
 */
export type WipeKind = 'research' | 'selling' | 'result' | 'lobby';

export interface WipeInfo {
  kind: WipeKind;
  icon: string;
  kicker: string;
  title: string;
  sub?: string;
}

const TIPS: Record<WipeKind, string[]> = {
  research: [
    '기름부터 두르고, 느리게 익는 재료부터 넣어요',
    '대파를 먼저 볶아 파기름을 내 보세요',
    '모든 재료가 초록 구간에 와야 맛볼 수 있어요',
    '맛보기 반응으로 빠진 재료를 추리해 보세요',
  ],
  selling: [
    '주문서의 순서와 양대로 넣으면 별점이 올라가요',
    '재료를 높이 띄울수록 웍질 보너스!',
    '기름이 모자라면 재료가 눌어붙어요',
    '손님이 기다리다 지치기 전에 내놓으세요',
  ],
  result: ['오늘도 수고했어요', '내일은 새 재료가 기다려요'],
  lobby: ['불맛 볶음밥 푸드트럭', '레시피 연구 → 장사 → 결과'],
};

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
    const tips = TIPS[info.kind];
    el.querySelector('.wipe-tip')!.textContent = tips[Math.floor(Math.random() * tips.length)];
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
