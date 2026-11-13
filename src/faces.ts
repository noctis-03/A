import * as THREE from 'three';

/**
 * 손님 얼굴 표정. 캔버스에 눈 · 눈썹 · 입 · 볼터치 · 땀방울 등을 그려
 * 머리 앞쪽에 씌운 곡면(구의 일부)에 붙인다. 표정마다 눈 뜬 것 · 감은 것(깜빡임) 두 장.
 *
 * 캔버스 256×128 이 머리 앞면 가로 약 103°, 세로 69°~123° 에 대응한다
 * (y≈17 눈썹, y≈40 눈, y≈64 볼, y≈88 입).
 */
export type Mood = 'neutral' | 'happy' | 'worried' | 'angry' | 'wow' | 'delight' | 'sad' | 'shock';

const W = 256;
const H = 128;
const INK = '#2b1d16';
const EYE_X = 51; // 가운데에서 눈까지

type Eyes = 'dot' | 'smile' | 'wide' | 'closed' | 'down';
type Mouth = 'smile' | 'grin' | 'flat' | 'wavy' | 'frown' | 'o' | 'bigO';
type Brows = 'none' | 'up' | 'worry' | 'angry' | 'flat';

interface Spec {
  eyes: Eyes;
  mouth: Mouth;
  brows: Brows;
  blush?: string;
  sweat?: boolean;
  vein?: boolean;
  sparkle?: boolean;
}

const SPECS: Record<Mood, Spec> = {
  neutral: { eyes: 'dot', mouth: 'flat', brows: 'flat' },
  happy: { eyes: 'dot', mouth: 'smile', brows: 'up', blush: 'rgba(255,120,120,0.35)' },
  worried: { eyes: 'dot', mouth: 'wavy', brows: 'worry', sweat: true },
  angry: { eyes: 'down', mouth: 'frown', brows: 'angry', blush: 'rgba(230,40,30,0.45)', vein: true },
  wow: { eyes: 'wide', mouth: 'o', brows: 'up', blush: 'rgba(255,120,120,0.3)' },
  delight: { eyes: 'smile', mouth: 'grin', brows: 'up', blush: 'rgba(255,110,120,0.5)', sparkle: true },
  sad: { eyes: 'down', mouth: 'frown', brows: 'worry' },
  shock: { eyes: 'wide', mouth: 'bigO', brows: 'up', sweat: true },
};

function draw(c: CanvasRenderingContext2D, s: Spec, closed: boolean) {
  c.clearRect(0, 0, W, H);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.fillStyle = INK;
  const cx = W / 2;

  // 볼터치
  if (s.blush) {
    c.fillStyle = s.blush;
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.ellipse(cx + sx * 66, 64, 17, 9, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  // 눈썹 · 눈 · 입은 화면에서 손님이 작게 보여도 읽히게 1.25배로 크게 (가운데 기준)
  c.save();
  c.translate(cx, 56);
  c.scale(1.25, 1.25);
  c.translate(-cx, -56);

  // 눈썹
  c.lineWidth = 5;
  for (const sx of [-1, 1]) {
    const x = cx + sx * EYE_X;
    c.beginPath();
    switch (s.brows) {
      case 'up':
        c.moveTo(x - 12, 18);
        c.quadraticCurveTo(x, 9, x + 12, 18);
        break;
      case 'flat':
        c.moveTo(x - 11, 20);
        c.lineTo(x + 11, 20);
        break;
      case 'worry': // 안쪽 끝이 올라간 八자
        c.moveTo(x - sx * 12, 13);
        c.lineTo(x + sx * 11, 22);
        break;
      case 'angry': // 안쪽 끝이 내려간 V자
        c.moveTo(x - sx * 12, 26);
        c.lineTo(x + sx * 11, 14);
        break;
      default:
        break;
    }
    c.stroke();
  }

  // 눈
  c.fillStyle = INK;
  for (const sx of [-1, 1]) {
    const x = cx + sx * EYE_X;
    const y = 41;
    c.lineWidth = 5;
    if (closed || s.eyes === 'smile') {
      // 감은 눈: 아래로 볼록 / 웃는 눈: 위로 볼록(^)
      c.beginPath();
      if (s.eyes === 'smile') {
        c.moveTo(x - 11, y + 4);
        c.quadraticCurveTo(x, y - 10, x + 11, y + 4);
      } else {
        c.moveTo(x - 10, y);
        c.quadraticCurveTo(x, y + 7, x + 10, y);
      }
      c.stroke();
      continue;
    }
    const rx = s.eyes === 'wide' ? 9 : 7;
    const ry = s.eyes === 'wide' ? 12 : s.eyes === 'down' ? 8 : 10;
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    // 반짝이는 눈동자 하이라이트
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + 3, y - 4, rx * 0.36, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = INK;
    if (s.eyes === 'down') {
      // 처진 눈꺼풀
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x - 11, y - 6 + (sx > 0 ? 0 : 0));
      c.lineTo(x + 11, y - 6);
      c.stroke();
    }
  }

  // 입
  const my = 88;
  c.lineWidth = 5;
  c.beginPath();
  switch (s.mouth) {
    case 'smile':
      c.moveTo(cx - 16, my - 3);
      c.quadraticCurveTo(cx, my + 11, cx + 16, my - 3);
      c.stroke();
      break;
    case 'grin':
      c.moveTo(cx - 20, my - 6);
      c.quadraticCurveTo(cx, my + 22, cx + 20, my - 6);
      c.closePath();
      c.fillStyle = '#7a2a22';
      c.fill();
      c.stroke();
      c.fillStyle = '#e8706a'; // 혀
      c.beginPath();
      c.ellipse(cx, my + 7, 8, 4, 0, 0, Math.PI * 2);
      c.fill();
      break;
    case 'flat':
      c.moveTo(cx - 11, my);
      c.lineTo(cx + 11, my);
      c.stroke();
      break;
    case 'wavy':
      c.moveTo(cx - 16, my);
      c.quadraticCurveTo(cx - 8, my - 6, cx, my);
      c.quadraticCurveTo(cx + 8, my + 6, cx + 16, my);
      c.stroke();
      break;
    case 'frown':
      c.moveTo(cx - 15, my + 5);
      c.quadraticCurveTo(cx, my - 9, cx + 15, my + 5);
      c.stroke();
      break;
    case 'o':
      c.ellipse(cx, my, 7, 9, 0, 0, Math.PI * 2);
      c.fillStyle = '#7a2a22';
      c.fill();
      c.stroke();
      break;
    case 'bigO':
      c.ellipse(cx, my + 2, 11, 14, 0, 0, Math.PI * 2);
      c.fillStyle = '#7a2a22';
      c.fill();
      c.stroke();
      break;
  }

  c.restore();

  // 땀방울 (오른쪽 관자놀이)
  if (s.sweat) {
    const x = cx + 92;
    const y = 30;
    c.fillStyle = '#8fd0ff';
    c.strokeStyle = '#3b7fb8';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x, y - 12);
    c.quadraticCurveTo(x + 9, y + 2, x, y + 6);
    c.quadraticCurveTo(x - 9, y + 2, x, y - 12);
    c.fill();
    c.stroke();
  }
  // 화남 표시 (이마 왼쪽 위, 십자 모양 핏줄)
  if (s.vein) {
    const x = cx - 88;
    const y = 16;
    c.strokeStyle = '#d8281c';
    c.lineWidth = 4;
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      c.beginPath();
      c.moveTo(x + dx * 3, y + dy * 9);
      c.quadraticCurveTo(x + dx * 3, y + dy * 3, x + dx * 9, y + dy * 3);
      c.stroke();
    }
  }
  // 반짝이 (양옆)
  if (s.sparkle) {
    c.fillStyle = '#ffd34a';
    for (const [x, y, r] of [
      [cx - 100, 22, 9],
      [cx + 100, 70, 7],
    ]) {
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = k % 2 ? r * 0.35 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
    }
  }
}

const cache = new Map<string, THREE.CanvasTexture>();

/** 표정 텍스처 (공유) */
export function faceTexture(mood: Mood, closed = false) {
  const key = `${mood}${closed ? '-c' : ''}`;
  let t = cache.get(key);
  if (!t) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    draw(cv.getContext('2d')!, SPECS[mood], closed);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return t;
}

/** 얼굴을 붙일 머리 앞쪽 곡면 (머리 반지름 r 보다 아주 살짝 크게) */
export function faceGeometry(r: number) {
  // 세로 69°~123°, 가로 정면 기준 ±51.5°
  const theta0 = THREE.MathUtils.degToRad(69);
  const theta1 = THREE.MathUtils.degToRad(123);
  const phiLen = THREE.MathUtils.degToRad(103);
  return new THREE.SphereGeometry(r * 1.004, 32, 16, Math.PI / 2 - phiLen / 2, phiLen, theta0, theta1 - theta0);
}
