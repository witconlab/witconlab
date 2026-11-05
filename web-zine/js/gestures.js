// Pure gesture math. Element coords are 0-1 fractions of the page; rotation in degrees.
export function dragDelta(start, now, pageSize) {
  return { dx: (now.x - start.x) / pageSize.w, dy: (now.y - start.y) / pageSize.h };
}

export function pinch(startA, startB, nowA, nowB) {
  const d0 = Math.hypot(startB.x - startA.x, startB.y - startA.y);
  const d1 = Math.hypot(nowB.x - nowA.x, nowB.y - nowA.y);
  const a0 = Math.atan2(startB.y - startA.y, startB.x - startA.x);
  const a1 = Math.atan2(nowB.y - nowA.y, nowB.x - nowA.x);
  let deg = ((a1 - a0) * 180) / Math.PI;
  deg = ((((deg + 180) % 360) + 360) % 360) - 180; // normalize to [-180,180)
  return { scale: d0 > 0 ? d1 / d0 : 1, rotateDeg: deg };
}

const MAX_SIZE = 1.5;

export function applyTransform(el, { dx = 0, dy = 0, scale = 1, rotateDeg = 0 }, minSize = 0.05) {
  const cx = el.x + el.w / 2 + dx;
  const cy = el.y + el.h / 2 + dy;
  const clamp = (v) => Math.min(MAX_SIZE, Math.max(minSize, v));
  const w = clamp(el.w * scale);
  const h = clamp(el.h * scale);
  return { x: cx - w / 2, y: cy - h / 2, w, h, rotate: (el.rotate || 0) + rotateDeg };
}
