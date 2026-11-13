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

export const FIXED_LEVELS: Exclude<QualityLevel, 'auto'>[] = ['low', 'mid', 'high'];

/**
 * cap: 자동일 때 실측 프레임이 낮아서 내려간 상한 (자동에만 적용).
 * 반환하는 renderScale 은 '낮음'에서도 느릴 때 해상도를 더 줄이는 배율.
 */
export function resolveQuality(
  level: QualityLevel,
  cap: Exclude<QualityLevel, 'auto'> | null = null,
): { level: Exclude<QualityLevel, 'auto'>; profile: QualityProfile } {
  let l: Exclude<QualityLevel, 'auto'>;
  if (level === 'auto') {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    l = coarse || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'mid' : 'high';
    if (cap && FIXED_LEVELS.indexOf(cap) < FIXED_LEVELS.indexOf(l)) l = cap;
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
