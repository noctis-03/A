/**
 * 게임 밸런스 수치. 디버그 패널에서 실시간으로 바꿀 수 있고,
 * "수치 복사"로 전체를 JSON 으로 복사할 수 있다.
 * 코드에서는 항상 T.xxx 를 그때그때 읽는다 (값이 바뀌면 바로 반영).
 */
export const DEFAULTS = {
  // ── 물리 ──
  gravity: 9.8,
  restitution: 0.05,
  friction: 0.38,
  stickiness: 2.5,
  airDrag: 0.25,
  spillLife: 7,

  // ── 익힘 / 탐 ──
  cookRate: 0.115,
  cookSideFactor: 0.55,
  cookPileFactor: 0.22,
  burnStart: 1.7,
  burnRate: 0.3,

  // ── 재료별 익는 속도 (밥 = 1) ── 느린 재료를 먼저 넣어야 다 같이 맞게 익는다
  // 넣는 순서: 대파(파기름) → 당근·베이컨 → 양파 → 계란 → 햄 → 밥 → 새우 → 김치 → 치즈
  speedRice: 1,
  speedScallion: 0.7,
  speedEgg: 0.85,
  speedKimchi: 1.2,
  speedHam: 0.9,
  speedOnion: 0.8,
  speedCarrot: 0.75,
  speedShrimp: 1.1,
  speedBacon: 0.75,
  speedCheese: 2.5,

  // ── 기름 ──
  oilIdeal: 30,
  oilStickBelow: 0.5,
  oilMin: 0.7,
  oilMax: 1.4,
  oilFlow: 40,
  oilShakeMin: 0.35,
  oilDrop: 0.5,
  oilDryFriction: 0.9,
  oilDryBurn: 0.4,
  oilPenalty: 0.6,

  // ── 레시피 연구 ──
  tasteBurntLimit: 0.15,
  amountPenalty: 0.12,
  orderPenalty: 0.1,

  // ── 웍 조작 ──
  dragSensitivity: 1.15,
  wokStiffness: 38,
  wokReturnStiffness: 15,
  wokTiltGain: 0.13,
  wokTiltMax: 0.4,
  wokLiftBase: 0.012,
  wokLiftPerSpeed: 0.02,
  wokLiftMax: 0.06,
  wokRangeX: 0.2,
  wokRangeBack: 0.14,
  wokRangeFront: 0.2,

  // ── 웍질 보너스 ──
  tossMin: 0.05,
  tossFull: 0.4,
  tossQuality: 0.2,
  tossPay: 0.3,
  tossPopupMin: 0.08,
  tossBigCm: 20,

  // ── 채점 ──
  cookMin: 0.85,
  cookMax: 1.25,
  overcookRange: 0.5,
  missingPenalty: 0.35,
  extraPenalty: 0.2,
  amountFull: 0.92,
  evenTolerance: 0.2,
  burnPenalty: 2.5,
  refundBelow: 0.25,
  tipAbove: 0.8,
  tipRate: 0.25,

  // ── 하루 / 손님 ──
  dayLength: 150,
  patienceBase: 95,
  patiencePerDay: 5,
  patienceMin: 50,
  patiencePerIng: 3,
  customerGapMin: 2.5,
  customerGapRand: 2,
  ingredientAmount: 1,

  // ── 그래픽 ──
  exposure: 0.95,
  bloomStrength: 0.7,
  bloomRadius: 0.5,
  bloomThreshold: 1.0,
  flameSize: 1,
  flameMinLift: 0.05,
  sparkAmount: 1,
  shakeAmount: 1,
};

export type TuneKey = keyof typeof DEFAULTS;
export const T: Record<TuneKey, number> = { ...DEFAULTS };

interface Meta {
  label: string;
  min: number;
  max: number;
  step: number;
  /** 정수로 표시 */
  int?: boolean;
}

export const GROUPS: { name: string; items: [TuneKey, Meta][] }[] = [
  {
    name: '물리',
    items: [
      ['gravity', { label: '중력 (m/s²)', min: 2, max: 20, step: 0.1 }],
      ['restitution', { label: '튕김 (반발계수)', min: 0, max: 0.6, step: 0.01 }],
      ['friction', { label: '웍 마찰', min: 0, max: 1, step: 0.01 }],
      ['stickiness', { label: '눌어붙음 (점성)', min: 0, max: 10, step: 0.1 }],
      ['airDrag', { label: '공기 저항', min: 0, max: 2, step: 0.01 }],
      ['spillLife', { label: '흘린 재료 남는 시간 (초)', min: 1, max: 20, step: 0.5 }],
    ],
  },
  {
    name: '익힘 / 탐',
    items: [
      ['cookRate', { label: '익는 속도 (바닥, /초)', min: 0.02, max: 0.5, step: 0.005 }],
      ['cookSideFactor', { label: '옆면 익힘 배율', min: 0, max: 1, step: 0.01 }],
      ['cookPileFactor', { label: '위에 얹힌 재료 익힘 배율', min: 0, max: 1, step: 0.01 }],
      ['burnStart', { label: '타기 시작하는 익힘', min: 1, max: 3, step: 0.05 }],
      ['burnRate', { label: '타는 속도', min: 0, max: 2, step: 0.01 }],
    ],
  },
  {
    name: '재료별 익는 속도',
    items: [
      ['speedRice', { label: '🍚 밥', min: 0.1, max: 4, step: 0.05 }],
      ['speedScallion', { label: '🌿 대파', min: 0.1, max: 4, step: 0.05 }],
      ['speedEgg', { label: '🥚 계란', min: 0.1, max: 4, step: 0.05 }],
      ['speedKimchi', { label: '🌶️ 김치', min: 0.1, max: 4, step: 0.05 }],
      ['speedHam', { label: '🍖 햄', min: 0.1, max: 4, step: 0.05 }],
      ['speedOnion', { label: '🧅 양파', min: 0.1, max: 4, step: 0.05 }],
      ['speedCarrot', { label: '🥕 당근', min: 0.1, max: 4, step: 0.05 }],
      ['speedShrimp', { label: '🍤 새우', min: 0.1, max: 4, step: 0.05 }],
      ['speedBacon', { label: '🥓 베이컨', min: 0.1, max: 4, step: 0.05 }],
      ['speedCheese', { label: '🧀 치즈', min: 0.1, max: 4, step: 0.05 }],
    ],
  },
  {
    name: '기름',
    items: [
      ['oilIdeal', { label: '적정 기름 양 (ml, 모든 레시피 공통)', min: 1, max: 120, step: 1 }],
      ['oilStickBelow', { label: '이 비율보다 적으면 눌어붙어 안 뜸', min: 0, max: 1.5, step: 0.05 }],
      ['oilMin', { label: '적정량 최소 (적정 대비 비율)', min: 0, max: 1.5, step: 0.05 }],
      ['oilMax', { label: '적정량 최대 (적정 대비 비율)', min: 0.5, max: 3, step: 0.05 }],
      ['oilFlow', { label: '흔들 때 나오는 양 (방울/초, 최대)', min: 1, max: 150, step: 1 }],
      ['oilShakeMin', { label: '기름이 나오기 시작하는 흔들기 세기', min: 0, max: 4, step: 0.05 }],
      ['oilDrop', { label: '한 방울 양 (ml)', min: 0.05, max: 3, step: 0.05 }],
      ['oilDryFriction', { label: '기름 없을 때 더 달라붙는 정도', min: 0, max: 3, step: 0.05 }],
      ['oilDryBurn', { label: '기름 없을 때 빨리 타는 정도', min: 0, max: 1.5, step: 0.05 }],
      ['oilPenalty', { label: '기름 양 어긋남 감점 (장사)', min: 0, max: 2, step: 0.05 }],
    ],
  },
  {
    name: '레시피 연구',
    items: [
      ['tasteBurntLimit', { label: '맛보기 가능한 탄 비율 최대', min: 0, max: 1, step: 0.01 }],
      ['amountPenalty', { label: '양(적게/기본/많이) 1단계 차이 감점', min: 0, max: 0.5, step: 0.01 }],
      ['orderPenalty', { label: '넣는 순서 1번 어긋남 감점', min: 0, max: 0.5, step: 0.01 }],
    ],
  },
  {
    name: '웍 조작',
    items: [
      ['dragSensitivity', { label: '드래그 감도', min: 0.3, max: 3, step: 0.05 }],
      ['wokStiffness', { label: '웍 반응 속도 (잡았을 때)', min: 5, max: 80, step: 1 }],
      ['wokReturnStiffness', { label: '웍 복귀 속도 (놓았을 때)', min: 2, max: 60, step: 1 }],
      ['wokTiltGain', { label: '기울기 민감도', min: 0, max: 0.5, step: 0.005 }],
      ['wokTiltMax', { label: '최대 기울기 (rad)', min: 0, max: 1, step: 0.01 }],
      ['wokLiftBase', { label: '잡으면 들리는 높이 (m)', min: 0, max: 0.1, step: 0.001 }],
      ['wokLiftPerSpeed', { label: '속도당 들리는 높이', min: 0, max: 0.1, step: 0.001 }],
      ['wokLiftMax', { label: '최대 들림 (m)', min: 0, max: 0.2, step: 0.005 }],
      ['wokRangeX', { label: '좌우 이동 범위 (m)', min: 0.02, max: 0.5, step: 0.01 }],
      ['wokRangeBack', { label: '앞(먼 쪽) 이동 범위 (m)', min: 0.02, max: 0.4, step: 0.01 }],
      ['wokRangeFront', { label: '뒤(내 쪽) 이동 범위 (m)', min: 0.02, max: 0.4, step: 0.01 }],
    ],
  },
  {
    name: '웍질 보너스',
    items: [
      ['tossMin', { label: '보너스 인정 최소 높이 (m)', min: 0, max: 0.3, step: 0.005 }],
      ['tossFull', { label: '100% 기준 (조각당 누적 m)', min: 0.05, max: 2, step: 0.01 }],
      ['tossQuality', { label: '100%당 품질 가산', min: 0, max: 1, step: 0.01 }],
      ['tossPay', { label: '100%당 보너스 금액 (가격 비율)', min: 0, max: 2, step: 0.01 }],
      ['tossPopupMin', { label: '높이 팝업 최소 (m)', min: 0, max: 0.5, step: 0.005 }],
      ['tossBigCm', { label: '화면 흔들림 높이 (cm)', min: 5, max: 60, step: 1, int: true }],
    ],
  },
  {
    name: '채점',
    items: [
      ['cookMin', { label: '적정 익힘 최소', min: 0.3, max: 1.5, step: 0.01 }],
      ['cookMax', { label: '적정 익힘 최대', min: 0.5, max: 2, step: 0.01 }],
      ['overcookRange', { label: '과익힘 0점까지 폭', min: 0.05, max: 2, step: 0.01 }],
      ['missingPenalty', { label: '빠진 재료 감점', min: 0, max: 1, step: 0.01 }],
      ['extraPenalty', { label: '엉뚱한 재료 감점', min: 0, max: 1, step: 0.01 }],
      ['amountFull', { label: '양 만점 기준 (남은 비율)', min: 0.3, max: 1, step: 0.01 }],
      ['evenTolerance', { label: '고르게 익음 허용 편차', min: 0, max: 1, step: 0.01 }],
      ['burnPenalty', { label: '탄 재료 감점 배율', min: 0, max: 10, step: 0.1 }],
      ['refundBelow', { label: '환불 품질 기준', min: 0, max: 1, step: 0.01 }],
      ['tipAbove', { label: '팁 받는 품질 기준', min: 0, max: 1, step: 0.01 }],
      ['tipRate', { label: '팁 비율 (가격 대비)', min: 0, max: 1, step: 0.01 }],
    ],
  },
  {
    name: '하루 / 손님',
    items: [
      ['dayLength', { label: '하루 길이 (초, 다음 날부터)', min: 30, max: 600, step: 5, int: true }],
      ['patienceBase', { label: '기본 인내심 (초)', min: 10, max: 300, step: 1, int: true }],
      ['patiencePerDay', { label: '하루마다 줄어드는 인내심', min: 0, max: 30, step: 0.5 }],
      ['patienceMin', { label: '최소 인내심 (초)', min: 5, max: 200, step: 1, int: true }],
      ['patiencePerIng', { label: '재료당 추가 인내심 (초)', min: 0, max: 20, step: 0.5 }],
      ['customerGapMin', { label: '다음 손님까지 최소 (초)', min: 0, max: 20, step: 0.5 }],
      ['customerGapRand', { label: '다음 손님 랜덤 추가 (초)', min: 0, max: 20, step: 0.5 }],
      ['ingredientAmount', { label: '한 줌당 재료 양 배율', min: 0.3, max: 2, step: 0.05 }],
    ],
  },
  {
    name: '그래픽',
    items: [
      ['exposure', { label: '밝기 (노출)', min: 0.3, max: 2, step: 0.01 }],
      ['bloomStrength', { label: '빛 번짐 세기', min: 0, max: 3, step: 0.05 }],
      ['bloomRadius', { label: '빛 번짐 반경', min: 0, max: 1.5, step: 0.05 }],
      ['bloomThreshold', { label: '빛 번짐 시작 밝기', min: 0, max: 3, step: 0.05 }],
      ['flameSize', { label: '웍질 불길 크기', min: 0, max: 3, step: 0.05 }],
      ['flameMinLift', { label: '불길 시작 높이 (m)', min: 0, max: 0.3, step: 0.005 }],
      ['sparkAmount', { label: '불티 양', min: 0, max: 4, step: 0.1 }],
      ['shakeAmount', { label: '화면 흔들림 세기', min: 0, max: 4, step: 0.1 }],
    ],
  },
];

/** 기본값과 다른 항목만 */
export function changedKeys(): TuneKey[] {
  return (Object.keys(DEFAULTS) as TuneKey[]).filter((k) => Math.abs(T[k] - DEFAULTS[k]) > 1e-9);
}

const STORE = 'woktruck.tuning';

export function saveTuning() {
  try {
    localStorage.setItem(STORE, JSON.stringify(T));
  } catch {
    /* 저장 불가 환경 */
  }
}

export function loadTuning() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    applyTuning(JSON.parse(raw));
  } catch {
    /* 무시 */
  }
}

/** 객체에서 알려진 키의 숫자만 반영. 반영한 개수를 돌려준다 */
export function applyTuning(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  let n = 0;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k in DEFAULTS && typeof v === 'number' && Number.isFinite(v)) {
      T[k as TuneKey] = v;
      n++;
    }
  }
  return n;
}

export function resetTuning() {
  Object.assign(T, DEFAULTS);
}
