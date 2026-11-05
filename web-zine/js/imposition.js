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

export const FOLD_LINES = [
  { x1: 0, y1: 148.5, x2: 420, y2: 148.5 },
  { x1: 105, y1: 0, x2: 105, y2: 297 },
  { x1: 210, y1: 0, x2: 210, y2: 297 },
  { x1: 315, y1: 0, x2: 315, y2: 297 },
];
