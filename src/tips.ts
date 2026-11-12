/**
 * 로딩창 팁 문구. 전환할 때마다 화면 종류에 맞는 문구 중 하나가 무작위로 뜬다
 * (바로 전 문구는 다시 안 나옴). 문구를 더하거나 바꾸려면 이 목록만 고치면 된다.
 */
import type { WipeKind } from './transition';

export type TipTag = 'oil' | 'cook' | 'research' | 'sell' | 'wok' | 'control';

export interface Tip {
  text: string;
  tag: TipTag;
}

export const TAG_LABEL: Record<TipTag, string> = {
  oil: '기름',
  cook: '순서와 익힘',
  research: '레시피 연구',
  sell: '장사',
  wok: '웍질',
  control: '조작',
};

export const TIPS: Tip[] = [
  // 🧴 기름
  { tag: 'oil', text: '기름통을 꾹 누른 채 웍 위로 끌고 가서 흔들면 기름이 나와요.' },
  { tag: 'oil', text: '기름은 손가락이 가리키는 곳에 떨어져요. 웍 밖에 흘린 기름은 사라져요.' },
  { tag: 'oil', text: '세게 흔들수록 기름이 많이 나와요. 가만히 들고 있으면 안 나와요.' },
  { tag: 'oil', text: '기름은 어떤 레시피든 30ml가 적당해요. 21~42ml면 괜찮아요.' },
  { tag: 'oil', text: '기름 없이 볶으면 재료가 눌어붙어서 웍질해도 뜨지 않아요.' },
  { tag: 'oil', text: '기름이 모자라면 재료가 더 빨리 타요.' },
  { tag: 'oil', text: '기름을 너무 많이 부었다면 버리기를 눌러 다시 시작하세요. 기름만 있어도 버릴 수 있어요.' },
  // 🔥 넣는 순서와 익힘
  { tag: 'cook', text: '늦게 익는 재료부터 넣어야 모든 재료가 같이 알맞게 익어요.' },
  { tag: 'cook', text: '늦게 익는 순서: 대파 → 당근·베이컨 → 양파 → 계란 → 햄 → 밥 → 새우 → 김치 → 치즈.' },
  { tag: 'cook', text: '대부분의 볶음밥은 기름을 두르고 대파부터 볶아 파기름을 내요.' },
  { tag: 'cook', text: '치즈는 금방 익어요. 거의 마지막에 넣으세요.' },
  { tag: 'cook', text: '오른쪽 익힘 게이지에서 재료마다 초록 구간에 들어왔는지 확인하세요.' },
  { tag: 'cook', text: '재료는 웍 바닥에 닿아야 잘 익어요. 다른 재료 위에 얹혀 있으면 잘 안 익으니 웍질로 뒤집어 주세요.' },
  { tag: 'cook', text: '너무 오래 볶으면 재료가 까맣게 타요.' },
  // 🧪 레시피 연구
  { tag: 'research', text: '맛보기는 모든 재료가 초록 구간에 있고, 기름이 적당할 때만 할 수 있어요.' },
  { tag: 'research', text: '맛보기는 몇 번이든 할 수 있어요. 여러 조합을 시도해 보세요.' },
  { tag: 'research', text: '레시피는 넣은 재료의 종류만 맞으면 찾아져요. 순서와 양은 상관없어요.' },
  { tag: 'research', text: '"N가지는 잘 어울려요"는 가장 비슷한 레시피 기준이에요. 그 재료들은 남기고 하나씩 바꿔 보세요.' },
  { tag: 'research', text: '"뭔가 N가지가 더 필요해요"면 재료를 더해 보고, "N가지는 안 어울려요"면 하나씩 빼 보세요.' },
  { tag: 'research', text: '레시피를 찾으면 정석 순서와 양이 레시피 북에 기록돼요.' },
  { tag: 'research', text: '새 재료가 열리면 그 재료로 만드는 레시피가 1~2개씩 새로 생겨요.' },
  { tag: 'research', text: '모든 레시피에 밥이 들어가요.' },
  // 🚚 장사
  { tag: 'sell', text: '손님은 레시피 북에서 찾은 메뉴만 주문해요.' },
  { tag: 'sell', text: '주문서에 넣을 순서와 양(넣은 횟수/정석 횟수)이 나와요. 그대로 따라 하면 별점이 올라가요.' },
  { tag: 'sell', text: '같은 재료를 1번 넣으면 적게, 2번은 기본, 3번은 많이예요.' },
  { tag: 'sell', text: '엉뚱한 재료를 넣거나 빠뜨리면 별점이 크게 깎여요.' },
  { tag: 'sell', text: '손님이 오래 기다리면 팁이 줄어요. 너무 오래 걸리면 그냥 떠나요.' },
  { tag: 'sell', text: '별점이 4개 이상이면 팁을 받아요. 너무 엉망이면 손님이 돈을 내지 않아요.' },
  { tag: 'sell', text: '손님 말풍선은 가장 아쉬웠던 점을 알려 줘요. 다음 요리에 참고하세요.' },
  { tag: 'sell', text: '날이 갈수록 손님의 인내심이 줄어들어요.' },
  // 🍳 웍질
  { tag: 'wok', text: '웍을 꾹 누른 채 끌면 웍이 따라 움직이고, 빠르게 흔들면 재료가 떠올라요.' },
  { tag: 'wok', text: '재료를 높이 띄웠다가 웍 안으로 다시 받으면 웍질 보너스가 쌓여요. 보너스에는 상한이 없어요.' },
  { tag: 'wok', text: '5cm 이상 떠야 보너스로 쳐요. 20cm를 넘기면 불길이 크게 솟아요.' },
  { tag: 'wok', text: '너무 세게 흔들면 재료가 웍 밖으로 쏟아져 양이 줄어요. 쏟아진 재료는 보너스도 없어요.' },
  { tag: 'wok', text: '재료가 공중에 떠 있는 동안에는 덜 익어요. 웍질과 익히기 사이에서 균형을 잡으세요.' },
  // ⌨️ 조작
  { tag: 'control', text: '스페이스 키로 연구 때는 맛보기, 장사 때는 내놓기를 할 수 있어요.' },
  { tag: 'control', text: '홈 버튼으로 언제든 로비로 나갈 수 있어요. 장사 도중에 나가면 그날 장사는 처음부터 다시 해요.' },
];

/** 화면 종류별로 보여 줄 팁 분류 */
const KIND_TAGS: Record<WipeKind, TipTag[]> = {
  research: ['oil', 'cook', 'research', 'wok', 'control'],
  selling: ['sell', 'wok', 'oil', 'cook', 'control'],
  result: ['oil', 'cook', 'research', 'sell', 'wok', 'control'],
  lobby: ['oil', 'cook', 'research', 'sell', 'wok', 'control'],
};

let last: Tip | null = null;

/** 화면 종류에 맞는 팁 중, 바로 전과 다른 것을 무작위로 하나 */
export function randomTip(kind: WipeKind): Tip {
  const pool = TIPS.filter((t) => KIND_TAGS[kind].includes(t.tag) && t !== last);
  const tip = pool[Math.floor(Math.random() * pool.length)] ?? TIPS[0];
  last = tip;
  return tip;
}
