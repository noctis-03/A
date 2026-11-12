/**
 * 첫 레시피 연구 튜토리얼 (파 계란 볶음밥).
 * 웍 상태를 보고 "아직 못 한 첫 단계"를 현재 단계로 정한다 → 플레이어가 하는 대로 자연스럽게 넘어간다.
 */
import type { IngId } from './ingredients';

export interface TutSnapshot {
  oilMl: number;
  oilIdeal: number;
  oilMin: number;
  oilMax: number;
  counts: Map<IngId, number>;
  /** 재료별 평균 익힘 / 탄 비율 (웍 안에 있는 것만) */
  cook: (id: IngId) => { n: number; avg: number; burnt: number };
  cookMin: number;
  cookMax: number;
  burntLimit: number;
}

export type TutTarget = 'oil' | 'wok' | 'taste' | 'trash' | `ing:${IngId}`;

export interface TutView {
  index: number;
  total: number;
  icon: string;
  title: string;
  text: string;
  /** 강조할 대상 */
  target: TutTarget;
  /** 실수했을 때 경고 (있으면 target 대신 버리기를 강조할 수 있음) */
  warn?: string;
  warnTarget?: TutTarget;
}

interface Step {
  icon: string;
  title: string;
  text: string;
  target: TutTarget;
  /** 이 단계에서 넣는 재료 (순서 확인용) */
  ing?: IngId;
  done: (s: TutSnapshot) => boolean;
}

const RECIPE: IngId[] = ['scallion', 'egg', 'rice'];

const STEPS: Step[] = [
  {
    icon: '🧴',
    title: '기름 두르기',
    text: '오른쪽 기름통을 꾹 누른 채 웍 위로 끌고 가서 흔드세요. 기름 막대가 초록 구간에 들어오면 OK!',
    target: 'oil',
    done: (s) => s.oilMl >= s.oilIdeal * s.oilMin,
  },
  {
    icon: '🌿',
    title: '대파 넣기',
    text: '아래 대파 버튼을 1번 누르세요. 대파를 먼저 볶아 파기름을 내요.',
    target: 'ing:scallion',
    ing: 'scallion',
    done: (s) => (s.counts.get('scallion') ?? 0) >= 1,
  },
  {
    icon: '🍳',
    title: '대파 볶기',
    text: '웍을 꾹 누른 채 앞뒤로 흔들어 볶으세요. 오른쪽 🌿 게이지가 조금 찰 때까지!',
    target: 'wok',
    done: (s) => s.cook('scallion').avg >= 0.3,
  },
  {
    icon: '🥚',
    title: '계란 넣기',
    text: '계란 버튼을 2번 누르세요. 같은 재료를 2번 넣으면 "기본" 양이에요.',
    target: 'ing:egg',
    ing: 'egg',
    done: (s) => (s.counts.get('egg') ?? 0) >= 2,
  },
  {
    icon: '🍳',
    title: '계란 익히기',
    text: '계란이 살짝 익을 때까지 계속 볶으세요. 🥚 게이지를 보세요.',
    target: 'wok',
    done: (s) => s.cook('egg').avg >= 0.2,
  },
  {
    icon: '🍚',
    title: '밥 넣기',
    text: '밥 버튼을 2번 누르세요. 밥은 빨리 익어서 나중에 넣어요.',
    target: 'ing:rice',
    ing: 'rice',
    done: (s) => (s.counts.get('rice') ?? 0) >= 2,
  },
  {
    icon: '🔥',
    title: '다 같이 볶기',
    text: '모든 재료 게이지가 초록 구간에 들어올 때까지 웍질하세요. 바닥에 닿아야 익으니 골고루 뒤집어요!',
    target: 'wok',
    done: (s) =>
      RECIPE.every((id) => {
        const c = s.cook(id);
        return c.n > 0 && c.avg >= s.cookMin;
      }),
  },
  {
    icon: '👅',
    title: '맛보기',
    text: '지금이에요! 맛보기 버튼(또는 스페이스 키)을 누르세요.',
    target: 'taste',
    done: () => false,
  },
];

export function tutorialView(s: TutSnapshot): TutView {
  let index = STEPS.findIndex((st) => !st.done(s));
  if (index < 0) index = STEPS.length - 1;
  const st = STEPS[index];
  const view: TutView = { index, total: STEPS.length, icon: st.icon, title: st.title, text: st.text, target: st.target };

  // 실수 확인 (가장 심각한 것부터)
  const ids = [...s.counts.keys()];
  const extra = ids.filter((id) => !RECIPE.includes(id));
  const over = RECIPE.filter((id) => {
    const c = s.cook(id);
    return c.n > 0 && (c.avg > s.cookMax || c.burnt > s.burntLimit);
  });
  // 지금 단계보다 뒤에 넣어야 할 재료가 벌써 들어갔는지
  const laterIngs = STEPS.slice(index + 1)
    .map((x) => x.ing)
    .filter((x): x is IngId => !!x);
  const early = ids.filter((id) => laterIngs.includes(id) && !STEPS.slice(0, index + 1).some((x) => x.ing === id));

  if (over.length) {
    view.warn = '너무 익었어요! 🗑️ 버리기를 누르고 기름부터 다시 해 봐요.';
    view.warnTarget = 'trash';
  } else if (extra.length) {
    view.warn = '안내에 없는 재료가 들어갔어요. 🗑️ 버리고 다시 해 봐요.';
    view.warnTarget = 'trash';
  } else if (s.oilMl > s.oilIdeal * s.oilMax) {
    view.warn = '기름이 너무 많아요. 🗑️ 버리고 다시 둘러요.';
    view.warnTarget = 'trash';
  } else if (index === 0 && ids.length) {
    view.warn = '재료보다 기름이 먼저예요! 기름이 없으면 재료가 눌어붙어요.';
  } else if (early.length) {
    view.warn = '순서가 바뀌었어요. 늦게 익는 재료부터 넣어야 해요. 🗑️ 버리고 다시 해 볼까요?';
    view.warnTarget = 'trash';
  }
  return view;
}
