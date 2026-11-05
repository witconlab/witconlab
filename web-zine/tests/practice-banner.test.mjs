import test from 'node:test';
import assert from 'node:assert/strict';
import { isPracticeMode } from '../js/practice-banner.js';

test('practice banner only for mock off localhost', () => {
  assert.equal(isPracticeMode('mock', 'witconlab.github.io'), true);
  assert.equal(isPracticeMode('mock', ''), true);
  assert.equal(isPracticeMode('mock', 'localhost'), false);
  assert.equal(isPracticeMode('mock', '127.0.0.1'), false);
  assert.equal(isPracticeMode('https://script.google.com/macros/s/x/exec', 'witconlab.github.io'), false);
});
