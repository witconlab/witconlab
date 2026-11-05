import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin } from '../js/image-resize.js';

test('fitWithin landscape', () => assert.deepEqual(fitWithin(4032, 3024), { w: 1800, h: 1350 }));
test('fitWithin portrait', () => assert.deepEqual(fitWithin(3024, 4032), { w: 1350, h: 1800 }));
test('fitWithin small unchanged', () => assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 }));
