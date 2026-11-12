import type { TuneKey } from './tuning';

export type IngId =
  | 'rice'
  | 'scallion'
  | 'egg'
  | 'kimchi'
  | 'ham'
  | 'onion'
  | 'carrot'
  | 'shrimp'
  | 'bacon'
  | 'cheese';
export type Shape = 'grain' | 'chunk' | 'ring' | 'cube' | 'curl' | 'leaf' | 'slab' | 'petal' | 'strip';

export interface IngDef {
  id: IngId;
  name: string;
  emoji: string;
  /** 한 번(한 줌) 넣을 때 생성되는 조각 수 */
  count: number;
  /** 충돌 반지름 (m) */
  radius: number;
  shape: Shape;
  raw: number;
  cooked: number;
  /** 익는 속도 배율 (디버그 패널에서 조절하는 수치 키) */
  speedKey: TuneKey;
}

/** 해금 순서대로. 앞의 3개(밥·대파·계란)는 처음부터 열려 있다 */
export const INGREDIENTS: IngDef[] = [
  { id: 'rice', name: '밥', emoji: '🍚', count: 46, radius: 0.0105, shape: 'grain', raw: 0xf6f1e4, cooked: 0xe2b566, speedKey: 'speedRice' },
  { id: 'scallion', name: '대파', emoji: '🌿', count: 6, radius: 0.017, shape: 'ring', raw: 0x58b54a, cooked: 0x7f9a35, speedKey: 'speedScallion' },
  { id: 'egg', name: '계란', emoji: '🥚', count: 6, radius: 0.02, shape: 'chunk', raw: 0xffd84a, cooked: 0xf2b53a, speedKey: 'speedEgg' },
  { id: 'kimchi', name: '김치', emoji: '🌶️', count: 6, radius: 0.02, shape: 'leaf', raw: 0xe2452f, cooked: 0xb8341f, speedKey: 'speedKimchi' },
  { id: 'ham', name: '햄', emoji: '🍖', count: 5, radius: 0.02, shape: 'slab', raw: 0xf29a9a, cooked: 0xc9665a, speedKey: 'speedHam' },
  { id: 'onion', name: '양파', emoji: '🧅', count: 6, radius: 0.019, shape: 'petal', raw: 0xf4efe2, cooked: 0xd29a52, speedKey: 'speedOnion' },
  { id: 'carrot', name: '당근', emoji: '🥕', count: 6, radius: 0.016, shape: 'cube', raw: 0xff8a2a, cooked: 0xd9701c, speedKey: 'speedCarrot' },
  { id: 'shrimp', name: '새우', emoji: '🍤', count: 4, radius: 0.027, shape: 'curl', raw: 0x9aa6b4, cooked: 0xff7a55, speedKey: 'speedShrimp' },
  { id: 'bacon', name: '베이컨', emoji: '🥓', count: 5, radius: 0.021, shape: 'strip', raw: 0xe97a7a, cooked: 0x9a4a2a, speedKey: 'speedBacon' },
  { id: 'cheese', name: '치즈', emoji: '🧀', count: 5, radius: 0.017, shape: 'cube', raw: 0xffe27a, cooked: 0xf2b630, speedKey: 'speedCheese' },
];

export const ING_INDEX: Record<IngId, number> = Object.fromEntries(
  INGREDIENTS.map((d, i) => [d.id, i]),
) as Record<IngId, number>;

export const ingDef = (id: IngId) => INGREDIENTS[ING_INDEX[id]];

/** 처음부터 열려 있는 재료 수. 장사가 끝날 때마다 하나씩 늘어난다 */
export const START_UNLOCKED = 3;
export const MAX_PORTIONS = 3;
export const AMOUNT_LABEL = ['', '적게', '기본', '많이'];

export interface Recipe {
  id: string;
  name: string;
  price: number;
  /** 넣는 순서대로 [재료, 양(1 적게 · 2 기본 · 3 많이)] */
  steps: [IngId, number][];
}

/** 레시피 북. 찾기 판정은 재료 종류만 본다 (밥 포함) */
export const RECIPES: Recipe[] = [
  { id: 'scallion-egg', name: '파 계란 볶음밥', price: 6000, steps: [['egg', 2], ['rice', 2], ['scallion', 1]] },
  { id: 'kimchi', name: '김치 볶음밥', price: 7000, steps: [['rice', 2], ['kimchi', 3], ['scallion', 1]] },
  { id: 'kimchi-egg', name: '김치 계란 볶음밥', price: 7000, steps: [['egg', 2], ['rice', 2], ['kimchi', 2]] },
  { id: 'ham-kimchi', name: '햄 김치 볶음밥', price: 8000, steps: [['ham', 2], ['rice', 2], ['kimchi', 2]] },
  { id: 'lunchbox', name: '도시락 볶음밥', price: 8000, steps: [['egg', 2], ['ham', 2], ['rice', 2], ['scallion', 1]] },
  { id: 'onion-ham', name: '양파 햄 볶음밥', price: 8000, steps: [['onion', 2], ['ham', 2], ['rice', 2]] },
  { id: 'veggie', name: '야채 볶음밥', price: 7500, steps: [['carrot', 2], ['onion', 2], ['rice', 2], ['scallion', 2]] },
  { id: 'five-color', name: '오색 볶음밥', price: 10000, steps: [['carrot', 1], ['egg', 2], ['ham', 1], ['rice', 2], ['scallion', 1]] },
  { id: 'shrimp', name: '새우 볶음밥', price: 9000, steps: [['egg', 2], ['rice', 2], ['shrimp', 2], ['scallion', 1]] },
  { id: 'shrimp-veggie', name: '새우 야채 볶음밥', price: 9500, steps: [['carrot', 1], ['onion', 2], ['rice', 2], ['shrimp', 2]] },
  { id: 'bacon-kimchi', name: '베이컨 김치 볶음밥', price: 9500, steps: [['bacon', 2], ['onion', 1], ['rice', 2], ['kimchi', 2]] },
  { id: 'cheese-kimchi', name: '치즈 김치 볶음밥', price: 9000, steps: [['rice', 2], ['kimchi', 2], ['cheese', 2]] },
  { id: 'bacon-cheese', name: '베이컨 치즈 볶음밥', price: 11000, steps: [['bacon', 2], ['egg', 1], ['rice', 2], ['cheese', 3]] },
];

export const recipeIngs = (r: Recipe) => r.steps.map((s) => s[0]);

/** 재료 집합이 정확히 같은 레시피 */
export function matchRecipe(ings: Set<IngId>): Recipe | undefined {
  return RECIPES.find((r) => r.steps.length === ings.size && r.steps.every(([id]) => ings.has(id)));
}
