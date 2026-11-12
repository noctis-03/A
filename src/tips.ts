/**
 * 로딩창 팁 문구. 전환할 때마다 여기서 무작위로 하나씩 뜬다 (바로 전 문구는 다시 안 나옴).
 * 문구를 더하거나 바꾸려면 이 목록만 고치면 된다.
 */
export interface Tip {
  text: string;
  /** 출처 표시 (속담 · 사자성어 등) */
  from?: string;
}

export const TIPS: Tip[] = [
  // 음식 · 요리
  { text: '시장이 반찬이다', from: '속담' },
  { text: '금강산도 식후경', from: '속담' },
  { text: '밥이 보약이다', from: '속담' },
  { text: '보기 좋은 떡이 먹기도 좋다', from: '속담' },
  { text: '같은 값이면 다홍치마', from: '속담' },
  { text: '꿩 먹고 알 먹고', from: '속담' },
  { text: '누워서 떡 먹기', from: '속담' },
  { text: '식은 죽 먹기', from: '속담' },
  { text: '작은 고추가 더 맵다', from: '속담' },
  { text: '남의 떡이 더 커 보인다', from: '속담' },
  { text: '사공이 많으면 배가 산으로 간다', from: '속담' },
  { text: '첫술에 배부르랴', from: '속담' },
  { text: '죽 쑤어 개 준다', from: '속담' },
  { text: '떡 본 김에 제사 지낸다', from: '속담' },
  { text: '울며 겨자 먹기', from: '속담' },
  // 노력 · 시작 · 꾸준함
  { text: '시작이 반이다', from: '속담' },
  { text: '천 리 길도 한 걸음부터', from: '속담' },
  { text: '티끌 모아 태산', from: '속담' },
  { text: '구슬이 서 말이라도 꿰어야 보배', from: '속담' },
  { text: '공든 탑이 무너지랴', from: '속담' },
  { text: '열 번 찍어 안 넘어가는 나무 없다', from: '속담' },
  { text: '백지장도 맞들면 낫다', from: '속담' },
  { text: '될성부른 나무는 떡잎부터 알아본다', from: '속담' },
  { text: '가는 말이 고와야 오는 말이 곱다', from: '속담' },
  { text: '낮말은 새가 듣고 밤말은 쥐가 듣는다', from: '속담' },
  { text: '돌다리도 두들겨 보고 건너라', from: '속담' },
  { text: '고생 끝에 낙이 온다', from: '속담' },
  { text: '칠전팔기 · 일곱 번 넘어져도 여덟 번 일어난다', from: '사자성어' },
  { text: '우공이산 · 꾸준히 하면 산도 옮긴다', from: '사자성어' },
  { text: '일취월장 · 날마다 달마다 자란다', from: '사자성어' },
  { text: '온고지신 · 옛것을 익혀 새것을 안다', from: '사자성어' },
  { text: '유비무환 · 준비가 있으면 걱정이 없다', from: '사자성어' },
];

let last = -1;

/** 바로 전과 다른 문구를 무작위로 하나 */
export function randomTip(): Tip {
  if (TIPS.length === 1) return TIPS[0];
  let i = Math.floor(Math.random() * TIPS.length);
  if (i === last) i = (i + 1 + Math.floor(Math.random() * (TIPS.length - 1))) % TIPS.length;
  last = i;
  return TIPS[i];
}
