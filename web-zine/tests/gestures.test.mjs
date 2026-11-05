import test from 'node:test';
import assert from 'node:assert/strict';
import { dragDelta, pinch, applyTransform } from '../js/gestures.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('dragDelta is a page fraction', () => {
  const d = dragDelta({ x: 10, y: 10 }, { x: 110, y: 60 }, { w: 200, h: 100 });
  near(d.dx, 0.5); near(d.dy, 0.5);
});
test('pinch doubling distance -> scale 2', () => {
  const r = pinch({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 });
  near(r.scale, 2); near(r.rotateDeg, 0);
});
test('pinch rotating 90deg', () => {
  const r = pinch({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 });
  near(r.scale, 1); near(r.rotateDeg, 90);
});
test('applyTransform keeps center', () => {
  const p = applyTransform({ x: 0.2, y: 0.2, w: 0.2, h: 0.1, rotate: 10 }, { dx: 0, dy: 0, scale: 2, rotateDeg: 5 });
  near(p.w, 0.4); near(p.h, 0.2); near(p.x + p.w / 2, 0.3); near(p.y + p.h / 2, 0.25); near(p.rotate, 15);
});
test('applyTransform moves', () => {
  const p = applyTransform({ x: 0.2, y: 0.2, w: 0.2, h: 0.1, rotate: 0 }, { dx: 0.1, dy: -0.1, scale: 1, rotateDeg: 0 });
  near(p.x, 0.3); near(p.y, 0.1);
});
test('applyTransform clamps min and max size', () => {
  const el = { x: 0.4, y: 0.4, w: 0.2, h: 0.1, rotate: 0 };
  const s = applyTransform(el, { dx: 0, dy: 0, scale: 0.01, rotateDeg: 0 });
  near(s.w, 0.05); near(s.h, 0.05); near(s.x + s.w / 2, 0.5);
  const b = applyTransform(el, { dx: 0, dy: 0, scale: 100, rotateDeg: 0 });
  near(b.w, 1.5); near(b.h, 1.5);
});
