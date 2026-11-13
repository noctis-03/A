/**
 * 손님 요청사항: 2일차부터 손님이 메뉴에 요청을 붙인다 ("파는 빼 주세요" 등).
 * 요청은 주문(steps · 가격)을 바꾸고, 채점에서 지켰는지 따로 본다.
 */
import { INGREDIENTS, type IngId, type Recipe } from './ingredients';
import { T } from './tuning';

export type ReqKind = 'remove' | 'more' | 'less' | 'add' | 'fire';

export interface Req {
  kind: ReqKind;
  ing?: IngId;
  /** 말풍선 문장 */
  speech: string;
}

export interface Order {
  /** 원래 레시피 (이름 · 레시피 북 기준) */
  recipe: Recipe;
  /** 요청을 반영한 실제 주문: 넣는 순서대로 [재료, 양] */
  steps: [IngId, number][];
  reqs: Req[];
  price: number;
}

/** '추가' 요청 하나당 가격 */
export const ADD_PRICE = 1000;

const nameOf = (id: IngId) => INGREDIENTS.find((d) => d.id === id)!.name;

/** 받침이 있으면 a, 없으면 b (은/는, 이/가 …) */
function josa(word: string, a: string, b: string) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  return (c - 0xac00) % 28 ? a : b;
}

/** 메뉴 이름에 그 재료가 들어 있는지 ('파 계란 볶음밥'의 대파 → '파' 도 본다) */
function inName(recipe: Recipe, id: IngId) {
  const words = recipe.name.split(' ');
  const n = nameOf(id);
  return words.includes(n) || (id === 'scallion' && words.includes('파'));
}

const pick = <T>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

function speechOf(kind: ReqKind, ing: IngId | undefined, r: () => number): string {
  const n = ing ? nameOf(ing) : '';
  const eun = ing ? n + josa(n, '은', '는') : '';
  switch (kind) {
    case 'remove':
      return pick([`${eun} 빼 주세요.`, `${eun} 빼고요!`, `저 ${n} 못 먹어요. 빼 주세요.`], r);
    case 'more':
      return pick([`${n} 많이 넣어 주세요.`, `${n} 듬뿍이요!`, `${n} 좀 많이요.`], r);
    case 'less':
      return pick([`${eun} 조금만요.`, `${n} 적게 넣어 주세요.`, `${eun} 살짝만요.`], r);
    case 'add':
      return pick([`${n}도 넣어 주세요.`, `${n} 추가요!`, `${n}도 같이 볶아 주세요.`], r);
    case 'fire':
      return pick(['불맛 세게요!', '불맛 팍팍 내 주세요!', '웍질 화끈하게요!'], r);
  }
}

/** 티켓에 붙는 짧은 표시 */
export function reqLabel(q: Req): string {
  const n = q.ing ? nameOf(q.ing) : '';
  switch (q.kind) {
    case 'remove':
      return `${n} 빼기`;
    case 'more':
      return `${n} 많이`;
    case 'less':
      return `${n} 적게`;
    case 'add':
      return `${n} 추가 +${ADD_PRICE.toLocaleString('ko-KR')}원`;
    case 'fire':
      return '불맛 세게';
  }
}

/** 이 날(장사 회차)에 손님이 요청을 붙일 확률 */
export function requestChance(day: number) {
  if (day < T.requestStartDay) return 0;
  return Math.min(T.requestChanceMax, T.requestChance + T.requestChancePerDay * (day - T.requestStartDay));
}

/**
 * 주문 만들기. unlocked: 지금 열린 재료 (추가 요청 후보).
 * 같은 재료에 요청이 겹치지 않게, 재료가 2가지 아래로 줄지 않게 고른다.
 */
export function makeOrder(recipe: Recipe, day: number, unlocked: IngId[], r: () => number = Math.random): Order {
  const steps: [IngId, number][] = recipe.steps.map(([id, n]) => [id, n]);
  const reqs: Req[] = [];
  let price = recipe.price;
  let want = 0;
  if (r() < requestChance(day)) want = day >= T.requestTwoFromDay && r() < T.requestTwoChance ? 2 : 1;

  const used = new Set<IngId>();
  for (let k = 0; k < want; k++) {
    const options: (() => void)[] = [];
    const inSteps = steps.filter(([id]) => !used.has(id));
    // 빼기: 밥 · 메뉴 이름에 들어간 재료(새우 볶음밥의 새우 등)는 빼지 않고, 재료가 2가지는 남게
    for (const [id] of inSteps) {
      if (id === 'rice' || steps.length <= 2 || inName(recipe, id)) continue;
      options.push(() => {
        steps.splice(
          steps.findIndex(([x]) => x === id),
          1,
        );
        reqs.push({ kind: 'remove', ing: id, speech: speechOf('remove', id, r) });
        used.add(id);
      });
    }
    for (const s of inSteps) {
      const [id, n] = s;
      if (n < 3)
        options.push(() => {
          s[1] = n + 1;
          reqs.push({ kind: 'more', ing: id, speech: speechOf('more', id, r) });
          used.add(id);
        });
      if (n > 1)
        options.push(() => {
          s[1] = n - 1;
          reqs.push({ kind: 'less', ing: id, speech: speechOf('less', id, r) });
          used.add(id);
        });
    }
    // 추가: 열린 재료 중 주문에 없는 것 (밥 제외), 맨 끝에 1번
    for (const id of unlocked) {
      if (id === 'rice' || used.has(id) || steps.some(([x]) => x === id) || recipe.steps.some(([x]) => x === id)) continue;
      options.push(() => {
        steps.push([id, 1]);
        price += ADD_PRICE;
        reqs.push({ kind: 'add', ing: id, speech: speechOf('add', id, r) });
        used.add(id);
      });
    }
    if (!reqs.some((q) => q.kind === 'fire'))
      // 불맛은 다른 종류보다 덜 자주
      for (let i = 0; i < 2; i++) options.push(() => reqs.push({ kind: 'fire', speech: speechOf('fire', undefined, r) }));
    if (!options.length) break;
    pick(options, r)();
  }
  return { recipe, steps, reqs, price };
}

/** 주문할 때 하는 말 */
export function orderSpeech(o: Order) {
  return [`${o.recipe.name} 주세요!`, ...o.reqs.map((q) => q.speech)].join(' ');
}

/**
 * 요청을 지켰는지. counts: 넣은 횟수, toss: 웍질 보너스(1 = 100%).
 * 못 지킨 요청마다 품질 배율과 손님 불만 문장.
 */
export function checkRequests(o: Order, counts: Map<IngId, number>, toss: number) {
  let score = 1;
  const failed: string[] = [];
  for (const q of o.reqs) {
    const n = q.ing ? nameOf(q.ing) : '';
    const got = q.ing ? (counts.get(q.ing) ?? 0) : 0;
    const target = q.ing ? (o.steps.find(([x]) => x === q.ing)?.[1] ?? 0) : 0;
    let ok = true;
    let msg = '';
    switch (q.kind) {
      case 'remove':
        ok = got === 0;
        msg = `${n} 빼 달라고 했잖아요!`;
        break;
      case 'more':
        ok = got >= target;
        msg = `${n} 많이 달라고 했는데…`;
        break;
      case 'less':
        ok = got > 0 && got <= target;
        msg = got === 0 ? `${n}${josa(n, '이', '가')} 아예 없잖아요…` : `${n} 적게 달라고 했는데…`;
        break;
      case 'add':
        ok = got > 0;
        msg = `${n} 추가해 달라고 했는데요?`;
        break;
      case 'fire':
        ok = toss >= T.fireReqToss;
        msg = '불맛이 약해요…';
        break;
    }
    if (!ok) {
      score *= q.kind === 'remove' ? T.requestRemovePenalty : T.requestMissPenalty;
      failed.push(msg);
    }
  }
  return { score, failed, allOk: o.reqs.length > 0 && failed.length === 0 };
}

/** 티켓 표시용: 지금 넣은 재료 기준으로 요청 상태 (ok · bad · '') */
export function reqState(o: Order, q: Req, counts: Map<IngId, number>): '' | 'ok' | 'bad' {
  if (!q.ing) return '';
  const got = counts.get(q.ing) ?? 0;
  const target = o.steps.find(([x]) => x === q.ing)?.[1] ?? 0;
  switch (q.kind) {
    case 'remove':
      return got ? 'bad' : '';
    case 'more':
      return got >= target ? 'ok' : '';
    case 'less':
      return got > target ? 'bad' : got > 0 ? 'ok' : '';
    case 'add':
      return got > 0 ? 'ok' : '';
    default:
      return '';
  }
}
