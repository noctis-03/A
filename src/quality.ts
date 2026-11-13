/**
 * 그래픽 품질 단계. 자동은 터치 기기 · 작은 화면이면 중간, 아니면 높음.
 * 선택은 이 브라우저에 저장된다.
 */
export type QualityLevel = 'auto' | 'low' | 'mid' | 'high';

export interface QualityProfile {
  /** 렌더 해상도 배율 상한 (devicePixelRatio 와 비교해 작은 쪽) */
  maxPixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  ao: boolean;
  /** 후처리 렌더 타깃 MSAA 샘플 수 */
  msaa: number;
  smaa: boolean;
}

export const QUALITY_LEVELS: QualityLevel[] = ['auto', 'low', 'mid', 'high'];

export const QUALITY_LABEL: Record<QualityLevel, string> = {
  auto: '자동',
  low: '낮음',
  mid: '중간',
  high: '높음',
};

const PROFILES: Record<Exclude<QualityLevel, 'auto'>, QualityProfile> = {
  low: { maxPixelRatio: 1, shadows: false, shadowSize: 512, ao: false, msaa: 0, smaa: true },
  mid: { maxPixelRatio: 1.5, shadows: true, shadowSize: 1024, ao: false, msaa: 2, smaa: true },
  high: { maxPixelRatio: 2, shadows: true, shadowSize: 2048, ao: true, msaa: 4, smaa: true },
};

export function resolveQuality(level: QualityLevel): { level: Exclude<QualityLevel, 'auto'>; profile: QualityProfile } {
  let l: Exclude<QualityLevel, 'auto'>;
  if (level === 'auto') {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    l = coarse || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'mid' : 'high';
  } else l = level;
  return { level: l, profile: PROFILES[l] };
}

const KEY = 'woktruck.quality';

export function loadQuality(): QualityLevel {
  try {
    const v = localStorage.getItem(KEY) as QualityLevel | null;
    return v && QUALITY_LEVELS.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveQuality(level: QualityLevel) {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* 저장 불가 환경 */
  }
}
