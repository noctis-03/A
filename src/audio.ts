import { Howl, Howler } from 'howler';

// 오디오 에셋 없이, 짧은 효과음을 직접 합성해서 WAV data URI 로 만든 뒤 Howler 로 재생한다.
const SR = 22050;

function toWav(samples: Float32Array): string {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return 'data:audio/wav;base64,' + btoa(bin);
}

function gen(dur: number, fn: (t: number, i: number, n: number) => number): string {
  const n = Math.floor(dur * SR);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = fn(i / SR, i, n);
  return toWav(s);
}

const tone = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);

function sizzle(): string {
  let prev = 0;
  let pop = 0;
  return gen(2, (_t, i, n) => {
    const w = Math.random() * 2 - 1;
    const hp = w - prev * 0.92; // 고역 강조
    prev = w;
    if (Math.random() < 0.0015) pop = 1;
    pop *= 0.985;
    // 루프 이음매를 부드럽게
    const edge = Math.min(1, i / 600, (n - i) / 600);
    return (hp * 0.22 + (Math.random() * 2 - 1) * pop * 0.5) * edge;
  });
}

function whoosh(): string {
  let lp = 0;
  return gen(0.28, (t) => {
    lp += ((Math.random() * 2 - 1) - lp) * 0.18;
    return lp * Math.sin((Math.PI * t) / 0.28) ** 2 * 0.9;
  });
}

const defs: Record<string, () => string> = {
  sizzle,
  whoosh,
  plop: () => gen(0.16, (t) => tone(190 - 500 * t, t) * Math.exp(-t * 26) * 0.8),
  ding: () => gen(0.7, (t) => (tone(1320, t) + 0.5 * tone(1980, t)) * Math.exp(-t * 6) * 0.4),
  coin: () =>
    gen(0.45, (t) => (t < 0.09 ? tone(988, t) : tone(1319, t)) * Math.exp(-Math.max(0, t - 0.09) * 9) * 0.35),
  bell: () => gen(0.5, (t) => (tone(880, t) + 0.6 * tone(1108, t)) * Math.exp(-t * 7) * 0.3),
  fail: () => gen(0.45, (t) => Math.sign(tone(220 - 180 * t, t)) * Math.exp(-t * 5) * 0.16),
  spill: () => gen(0.07, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 70) * 0.5),
};

export class Sfx {
  private sounds: Record<string, Howl> = {};
  private sizzleId: number | null = null;
  private lastPlay: Record<string, number> = {};
  muted = false;
  private ready = false;

  /** 사용자 입력(시작 버튼) 이후에 호출 */
  init() {
    if (this.ready) return;
    this.ready = true;
    for (const [name, make] of Object.entries(defs)) {
      this.sounds[name] = new Howl({ src: [make()], format: ['wav'], loop: name === 'sizzle', volume: 0.6 });
    }
    this.sizzleId = this.sounds.sizzle.play();
    this.sounds.sizzle.volume(0, this.sizzleId);
  }

  play(name: string, volume = 0.6, minGap = 0.05) {
    const s = this.sounds[name];
    if (!s) return;
    const now = performance.now() / 1000;
    if (now - (this.lastPlay[name] ?? -1) < minGap) return;
    this.lastPlay[name] = now;
    const id = s.play();
    s.volume(volume, id);
    s.rate(0.92 + Math.random() * 0.16, id);
  }

  setSizzle(level: number) {
    if (this.sizzleId === null) return;
    this.sounds.sizzle.volume(Math.max(0, Math.min(1, level)) * 0.55, this.sizzleId);
  }

  toggleMute() {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    return this.muted;
  }
}
