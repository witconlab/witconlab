import test from 'node:test';
import assert from 'node:assert/strict';
import { A3, A6, IMPOSITION, panelRect, CUT_LINE, FOLD_LINES } from '../js/imposition.js';

test('top row is 5,4,3,2 rotated 180', () => {
  const top = IMPOSITION.filter((s) => s.row === 0).sort((a, b) => a.col - b.col);
  assert.deepStrictEqual(top.map((s) => s.page), [5, 4, 3, 2]);
  assert.ok(top.every((s) => s.rotate === 180));
});
test('bottom row is 6,7,8,1 upright', () => {
  const bot = IMPOSITION.filter((s) => s.row === 1).sort((a, b) => a.col - b.col);
  assert.deepStrictEqual(bot.map((s) => s.page), [6, 7, 8, 1]);
  assert.ok(bot.every((s) => s.rotate === 0));
});
test('all 8 pages appear once', () => {
  assert.deepStrictEqual(IMPOSITION.map((s) => s.page).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
});
test('panelRect for page 1 is {x:315,y:148.5,w:105,h:148.5}', () => {
  const slot = IMPOSITION.find((s) => s.page === 1);
  assert.deepStrictEqual(panelRect(slot), { x: 315, y: 148.5, w: 105, h: 148.5 });
});
test('constants', () => {
  assert.deepStrictEqual(A3, { w: 420, h: 297 });
  assert.deepStrictEqual(A6, { w: 105, h: 148.5 });
  assert.deepStrictEqual(CUT_LINE, { x1: 105, x2: 315, y: 148.5 });
  assert.equal(FOLD_LINES.length, 4);
});
