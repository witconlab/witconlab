import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoLoader, createLimiter, MAX_FETCHES } from '../js/photo-cache.js';

const tick = () => new Promise((r) => setImmediate(r));
const fakeImg = async (url) => ({ url });

test('at most 3 photo downloads at once', async () => {
  let active = 0, peak = 0;
  const releases = [];
  const fetchPhoto = (src) => new Promise((resolve) => {
    active++; peak = Math.max(peak, active);
    releases.push(() => { active--; resolve({ data: src, mime: 'image/png' }); });
  });
  const load = createPhotoLoader({ fetchPhoto, limit: createLimiter(MAX_FETCHES), toImg: fakeImg, useDb: false });
  const all = Promise.all(Array.from({ length: 8 }, (_, i) => load('p' + i)));
  for (let k = 0; k < 20; k++) { await tick(); if (releases.length) releases.shift()(); }
  const imgs = await all;
  assert.equal(MAX_FETCHES, 3);
  assert.equal(peak, 3);
  assert.equal(imgs.length, 8);
});

test('network error retried once; server (coded) error not retried', async () => {
  let n = 0;
  const flaky = async () => { if (++n === 1) throw new TypeError('Failed to fetch'); return { data: 'AA', mime: 'image/png' }; };
  const a = createPhotoLoader({ fetchPhoto: flaky, toImg: fakeImg, useDb: false });
  assert.equal((await a('x')).url, 'data:image/png;base64,AA');
  assert.equal(n, 2);

  let m = 0;
  const denied = async () => { m++; throw Object.assign(new Error('no'), { code: 'AUTH' }); };
  const b = createPhotoLoader({ fetchPhoto: denied, toImg: fakeImg, useDb: false });
  await assert.rejects(b('y'));
  assert.equal(m, 1);
  // failures are not cached
  await assert.rejects(b('y'));
  assert.equal(m, 2);
});

test('prime: an uploaded photo is served from cache without downloading', async () => {
  let fetched = 0;
  const load = createPhotoLoader({ fetchPhoto: async () => { fetched++; return { data: 'ZZ', mime: 'image/jpeg' }; }, toImg: fakeImg, useDb: false });
  load.prime('photo-1', { data: 'QUJD', mime: 'image/jpeg' });
  assert.equal((await load('photo-1')).url, 'data:image/jpeg;base64,QUJD');
  assert.equal(fetched, 0);
});
