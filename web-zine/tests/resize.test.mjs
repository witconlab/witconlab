import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, isHeic } from '../js/image-resize.js';

test('fitWithin landscape', () => assert.deepEqual(fitWithin(4032, 3024), { w: 1800, h: 1350 }));
test('fitWithin portrait', () => assert.deepEqual(fitWithin(3024, 4032), { w: 1350, h: 1800 }));
test('fitWithin small unchanged', () => assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 }));

const bytes = (s) => Uint8Array.from([0, 0, 0, 24, ...[...s].map((c) => c.charCodeAt(0))]);
test('isHeic by file header', () => {
  assert.equal(isHeic(bytes('ftypheic')), true);
  assert.equal(isHeic(bytes('ftypmif1')), true);
  assert.equal(isHeic(bytes('ftypisom')), false); // mp4
  assert.equal(isHeic(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), false); // jpeg
});
test('isHeic by name or type', () => {
  assert.equal(isHeic(null, 'IMG_0001.HEIC'), true);
  assert.equal(isHeic(null, 'a.jpg', 'image/heif'), true);
  assert.equal(isHeic(null, 'a.jpg', 'image/jpeg'), false);
});
