import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../js/history.js';

test('undo/redo', () => {
  const h = createHistory();
  h.push('a'); h.push('b'); h.push('c');
  assert.equal(h.undo(), 'b'); assert.equal(h.undo(), 'a'); assert.equal(h.undo(), null);
  assert.equal(h.canUndo(), false);
  assert.equal(h.redo(), 'b'); assert.equal(h.redo(), 'c'); assert.equal(h.redo(), null);
  assert.equal(h.canRedo(), false);
});
test('push after undo clears redo', () => {
  const h = createHistory();
  h.push('a'); h.push('b'); h.undo(); h.push('x');
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), 'a');
});
test('limit 50 drops oldest', () => {
  const h = createHistory(50);
  for (let i = 0; i < 60; i++) h.push(i);
  let last, n = 0, s;
  while ((s = h.undo()) !== null) { last = s; n++; }
  assert.equal(n, 49); assert.equal(last, 10);
});
