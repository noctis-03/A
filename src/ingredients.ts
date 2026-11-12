export type IngId = 'rice' | 'egg' | 'scallion' | 'carrot' | 'shrimp' | 'kimchi' | 'ham';
export type Shape = 'grain' | 'chunk' | 'ring' | 'cube' | 'curl' | 'leaf' | 'slab';

export interface IngDef {
  id: IngId;
  name: string;
  emoji: string;
  /** 한 번 넣을 때 생성되는 조각 수 */
  count: number;
  /** 충돌 반지름 (m) */
  radius: number;
  shape: Shape;
  raw: number;
  cooked: number;
}

export const INGREDIENTS: IngDef[] = [
  { id: 'rice', name: '밥', emoji: '🍚', count: 64, radius: 0.015, shape: 'grain', raw: 0xf6f1e4, cooked: 0xe2b566 },
  { id: 'egg', name: '계란', emoji: '🥚', count: 12, radius: 0.02, shape: 'chunk', raw: 0xffd84a, cooked: 0xf2b53a },
  { id: 'scallion', name: '대파', emoji: '🌿', count: 12, radius: 0.017, shape: 'ring', raw: 0x58b54a, cooked: 0x7f9a35 },
  { id: 'carrot', name: '당근', emoji: '🥕', count: 12, radius: 0.017, shape: 'cube', raw: 0xff8a2a, cooked: 0xd9701c },
  { id: 'shrimp', name: '새우', emoji: '🍤', count: 7, radius: 0.027, shape: 'curl', raw: 0x9aa6b4, cooked: 0xff7a55 },
  { id: 'kimchi', name: '김치', emoji: '🌶️', count: 12, radius: 0.02, shape: 'leaf', raw: 0xe2452f, cooked: 0xb8341f },
  { id: 'ham', name: '햄', emoji: '🥓', count: 10, radius: 0.02, shape: 'slab', raw: 0xf29a9a, cooked: 0xc9665a },
];

export const ING_INDEX: Record<IngId, number> = Object.fromEntries(
  INGREDIENTS.map((d, i) => [d.id, i]),
) as Record<IngId, number>;

export interface Recipe {
  name: string;
  price: number;
  ings: IngId[];
  /** 이 날짜부터 등장 */
  fromDay: number;
}

export const RECIPES: Recipe[] = [
  { name: '계란 볶음밥', price: 6000, ings: ['rice', 'egg', 'scallion'], fromDay: 1 },
  { name: '야채 볶음밥', price: 7000, ings: ['rice', 'egg', 'carrot', 'scallion'], fromDay: 1 },
  { name: '김치 볶음밥', price: 8000, ings: ['rice', 'kimchi', 'ham', 'scallion'], fromDay: 1 },
  { name: '새우 볶음밥', price: 9000, ings: ['rice', 'egg', 'shrimp', 'scallion'], fromDay: 2 },
  { name: '햄 볶음밥', price: 7500, ings: ['rice', 'ham', 'egg', 'carrot'], fromDay: 2 },
  { name: '스페셜 볶음밥', price: 12000, ings: ['rice', 'egg', 'shrimp', 'ham', 'carrot', 'scallion'], fromDay: 3 },
];
