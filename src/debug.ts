import { DEFAULTS, GROUPS, T, applyTuning, changedKeys, resetTuning, saveTuning, type TuneKey } from './tuning';

const decimals = (step: number) => {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

/**
 * 디버그 패널: 게임 수치를 슬라이더/입력칸으로 바로 바꾸고,
 * "수치 복사"로 전체 값을 한 번에 복사한다.
 */
export class DebugPanel {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private info: HTMLPreElement;
  private rows = new Map<TuneKey, { row: HTMLElement; range: HTMLInputElement; num: HTMLInputElement; dec: number }>();
  private infoFn: () => string = () => '';
  private infoTimer = 0;

  constructor() {
    const toggle = document.createElement('button');
    toggle.id = 'dbg-toggle';
    toggle.type = 'button';
    toggle.textContent = '🛠 디버그';
    toggle.title = '디버그 패널 열기 (` 키)';
    toggle.addEventListener('click', () => this.toggle());
    document.body.appendChild(toggle);

    this.root = document.createElement('div');
    this.root.id = 'dbg';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="dbg-head">
        <b>🛠 디버그</b>
        <span class="dbg-count" id="dbg-count"></span>
        <button type="button" id="dbg-close" aria-label="닫기">✕</button>
      </div>
      <div class="dbg-actions">
        <button type="button" id="dbg-copy" class="primary">📋 수치 복사</button>
        <button type="button" id="dbg-reset">↺ 전부 기본값</button>
      </div>
      <div class="dbg-msg" id="dbg-msg"></div>
      <textarea id="dbg-out" readonly hidden></textarea>
      <details class="dbg-group">
        <summary>실시간 정보</summary>
        <pre id="dbg-info"></pre>
      </details>
      <div id="dbg-body"></div>
      <details class="dbg-group">
        <summary>수치 붙여넣기</summary>
        <textarea id="dbg-in" placeholder="복사해 둔 수치를 여기에 붙여넣고 적용을 누르세요"></textarea>
        <button type="button" id="dbg-apply">적용</button>
      </details>
    `;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector('#dbg-body')!;
    this.info = this.root.querySelector('#dbg-info')!;

    for (const g of GROUPS) {
      const det = document.createElement('details');
      det.className = 'dbg-group';
      det.open = true;
      const sum = document.createElement('summary');
      sum.textContent = g.name;
      det.appendChild(sum);
      for (const [key, m] of g.items) {
        const dec = m.int ? 0 : decimals(m.step);
        const row = document.createElement('div');
        row.className = 'dbg-row';
        const label = document.createElement('label');
        label.htmlFor = `dbg-${key}`;
        label.innerHTML = `${m.label} <code>${key}</code>`;
        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(m.min);
        range.max = String(m.max);
        range.step = String(m.step);
        const num = document.createElement('input');
        num.type = 'number';
        num.id = `dbg-${key}`;
        num.step = String(m.step);
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'dbg-back';
        back.textContent = '↺';
        back.title = `기본값 ${DEFAULTS[key]}`;
        range.addEventListener('input', () => this.set(key, Number(range.value)));
        num.addEventListener('change', () => {
          const v = Number(num.value);
          if (Number.isFinite(v)) this.set(key, v);
          else this.sync();
        });
        back.addEventListener('click', () => this.set(key, DEFAULTS[key]));
        const ctl = document.createElement('div');
        ctl.className = 'dbg-ctl';
        ctl.append(range, num, back);
        row.append(label, ctl);
        det.appendChild(row);
        this.rows.set(key, { row, range, num, dec });
      }
      this.body.appendChild(det);
    }

    this.root.querySelector('#dbg-close')!.addEventListener('click', () => this.toggle(false));
    this.root.querySelector('#dbg-copy')!.addEventListener('click', () => this.copy());
    this.root.querySelector('#dbg-reset')!.addEventListener('click', () => {
      resetTuning();
      this.changed();
      this.msg('전부 기본값으로 되돌렸어요');
    });
    this.root.querySelector('#dbg-apply')!.addEventListener('click', () => {
      const ta = this.root.querySelector<HTMLTextAreaElement>('#dbg-in')!;
      const text = ta.value;
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      let n = 0;
      try {
        if (a >= 0 && b > a) n = applyTuning(JSON.parse(text.slice(a, b + 1)));
      } catch {
        n = 0;
      }
      if (n > 0) {
        this.changed();
        this.msg(`수치 ${n}개를 적용했어요`);
      } else {
        this.msg('읽을 수 있는 수치가 없어요. "수치 복사"로 만든 내용을 그대로 붙여넣어 주세요', true);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && !isTyping(e.target)) this.toggle();
    });
    this.sync();
  }

  /** 실시간 정보 칸에 보여 줄 내용 */
  setInfo(fn: () => string) {
    this.infoFn = fn;
  }

  toggle(open = this.root.hidden) {
    this.root.hidden = !open;
    document.body.classList.toggle('dbg-open', open);
    window.clearInterval(this.infoTimer);
    if (open) {
      this.sync();
      this.infoTimer = window.setInterval(() => {
        this.info.textContent = this.infoFn();
      }, 200);
    }
  }

  private set(key: TuneKey, v: number) {
    T[key] = v;
    this.changed();
  }

  private changed() {
    saveTuning();
    this.sync();
  }

  private sync() {
    for (const [key, r] of this.rows) {
      const v = T[key];
      r.range.value = String(v);
      if (document.activeElement !== r.num) r.num.value = v.toFixed(r.dec);
      r.row.classList.toggle('changed', Math.abs(v - DEFAULTS[key]) > 1e-9);
    }
    const n = changedKeys().length;
    this.root.querySelector('#dbg-count')!.textContent = n ? `바뀐 수치 ${n}개` : '기본값';
  }

  /** 전체 수치를 한 덩어리 텍스트로 */
  private dump() {
    const changed = changedKeys();
    const lines = ['[웍웍! 수치]'];
    lines.push(changed.length ? `바뀐 항목: ${changed.map((k) => `${k} ${DEFAULTS[k]} → ${round(T[k])}`).join(', ')}` : '바뀐 항목: 없음');
    const obj: Record<string, number> = {};
    for (const k of Object.keys(DEFAULTS) as TuneKey[]) obj[k] = round(T[k]);
    lines.push(JSON.stringify(obj, null, 2));
    return lines.join('\n');
  }

  private copy() {
    const text = this.dump();
    const out = this.root.querySelector<HTMLTextAreaElement>('#dbg-out')!;
    const fallback = () => {
      out.hidden = false;
      out.value = text;
      out.focus();
      out.select();
      this.msg('자동 복사가 막혀 있어요. 아래 칸이 선택돼 있으니 Ctrl+C(길게 눌러 복사)로 복사하세요', true);
    };
    try {
      const p = navigator.clipboard?.writeText(text);
      if (!p) return fallback();
      p.then(() => {
        out.hidden = true;
        this.msg(`수치를 복사했어요 (바뀐 수치 ${changedKeys().length}개 포함 전체)`);
      }, fallback);
    } catch {
      fallback();
    }
  }

  private msg(text: string, bad = false) {
    const el = this.root.querySelector<HTMLElement>('#dbg-msg')!;
    el.textContent = text;
    el.classList.toggle('bad', bad);
  }
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

export function isTyping(t: EventTarget | null) {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
