import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadsFor, sidesOf, turnPlan } from '../js/viewer.js';

test('every screen size: cover alone, inner pages paired, back cover alone', () => {
  const want = [[1], [2, 3], [4, 5], [6, 7], [8]];
  assert.deepEqual(spreadsFor(), want);
  assert.deepEqual(spreadsFor(true), want);
  assert.deepEqual(spreadsFor(false), want);
});
test('closed book: front cover on the right, back cover on the left', () => {
  assert.deepEqual(sidesOf([1]), { L: null, R: 1 });
  assert.deepEqual(sidesOf([2, 3]), { L: 2, R: 3 });
  assert.deepEqual(sidesOf([8]), { L: 8, R: null });
});
test('turn plan: which page flips, what shows on its back, what is revealed', () => {
  const sp = spreadsFor();
  // opening the cover: page 1 flips over, its back shows 2, page 3 is revealed underneath
  assert.deepEqual(turnPlan(sp, 0, 1), { front: 1, back: 2, under: 3, stays: null });
  assert.deepEqual(turnPlan(sp, 1, 2), { front: 3, back: 4, under: 5, stays: 2 });
  // closing onto the back cover: nothing is revealed on the right
  assert.deepEqual(turnPlan(sp, 3, 4), { front: 7, back: 8, under: null, stays: 6 });
  // backward is the mirror
  assert.deepEqual(turnPlan(sp, 4, 3), { front: 8, back: 7, under: 6, stays: null });
  assert.deepEqual(turnPlan(sp, 1, 0), { front: 2, back: 1, under: null, stays: 3 });
  assert.equal(turnPlan(sp, 0, -1), null);
  assert.equal(turnPlan(sp, 4, 5), null);
});

import { hasUnsavedBackup } from '../js/viewer.js';
import { backupKeyFor } from '../js/saver.js';

test('unsaved editor backup for this student is detected', () => {
  const m = new Map([[backupKeyFor('민지'), '{"zine":{}}'], [backupKeyFor('서준') + '.stale', '{}']]);
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null) };
  assert.equal(hasUnsavedBackup(st, '민지'), true);
  assert.equal(hasUnsavedBackup(st, '서준'), false); // stale copies are not "unsaved changes"
  assert.equal(hasUnsavedBackup({ getItem() { throw new Error('private mode'); } }, '민지'), false);
});
