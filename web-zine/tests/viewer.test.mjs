import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadsFor } from '../js/viewer.js';

test('wide: cover alone, inner pages paired, back cover alone', () => {
  assert.deepEqual(spreadsFor(true), [[1], [2, 3], [4, 5], [6, 7], [8]]);
});
test('narrow: one page at a time', () => {
  assert.deepEqual(spreadsFor(false), [[1], [2], [3], [4], [5], [6], [7], [8]]);
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
