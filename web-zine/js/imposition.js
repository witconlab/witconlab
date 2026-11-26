// A3 sheet, 8-up imposition. Folded A6 pages; top row is rotated 180 degrees.
export const A3 = { w: 420, h: 297 };
export const A6 = { w: 105, h: 148.5 };

export const IMPOSITION = [
  { page: 5, col: 0, row: 0, rotate: 180 },
  { page: 4, col: 1, row: 0, rotate: 180 },
  { page: 3, col: 2, row: 0, rotate: 180 },
  { page: 2, col: 3, row: 0, rotate: 180 },
  { page: 6, col: 0, row: 1, rotate: 0 },
  { page: 7, col: 1, row: 1, rotate: 0 },
  { page: 8, col: 2, row: 1, rotate: 0 },
  { page: 1, col: 3, row: 1, rotate: 0 },
];

export function panelRect(slot) {
  return { x: slot.col * A6.w, y: slot.row * A6.h, w: A6.w, h: A6.h };
}

export const CUT_LINE = { x1: 105, x2: 315, y: 148.5 };

// 프린터 '맞춤(여백 있게)'으로 줄여 찍으면 그림이 종이보다 작아진다 → 이 테두리를 따라 흰 여백을 잘라 내면 종이=그림이 되어 접는 선이 다시 맞는다.
const T = 0.5; // mm, 실제 크기로 찍을 때 잘리는 걸 줄이려 아주 살짝 안쪽
export const TRIM_LINES = [
  { x1: T, y1: T, x2: 420 - T, y2: T },
  { x1: 420 - T, y1: T, x2: 420 - T, y2: 297 - T },
  { x1: 420 - T, y1: 297 - T, x2: T, y2: 297 - T },
  { x1: T, y1: 297 - T, x2: T, y2: T },
];

export const FOLD_LINES = [
  { x1: 0, y1: 148.5, x2: 420, y2: 148.5 },
  { x1: 105, y1: 0, x2: 105, y2: 297 },
  { x1: 210, y1: 0, x2: 210, y2: 297 },
  { x1: 315, y1: 0, x2: 315, y2: 297 },
];

// 프린터는 종이 끝 3–5mm를 못 찍어서 '맞춤'으로 줄여 찍는다 → 접는 선이 종이 반접기와 어긋나 쪽 길이가 달라진다.
// 그래서 그림은 칸 안쪽에 비율 그대로 줄여 넣고 둘레를 비워 둔다. 실제 크기로 찍어도 잘리는 건 빈 여백뿐.
export const SAFE = 5; // mm
export function printRect(slot) {
  const r = panelRect(slot);
  const s = Math.min((r.w - 2 * SAFE) / r.w, (r.h - 2 * SAFE) / r.h);
  const w = r.w * s, h = r.h * s;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}
