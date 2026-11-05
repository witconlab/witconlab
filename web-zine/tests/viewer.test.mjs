import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadsFor } from '../js/viewer.js';

test('wide: cover alone, inner pages paired, back cover alone', () => {
  assert.deepEqual(spreadsFor(true), [[1], [2, 3], [4, 5], [6, 7], [8]]);
});
test('narrow: one page at a time', () => {
  assert.deepEqual(spreadsFor(false), [[1], [2], [3], [4], [5], [6], [7], [8]]);
});
