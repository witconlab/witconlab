import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadQueue } from '../js/upload-queue.js';

const tick = () => new Promise((r) => setImmediate(r));

test('uploads sequentially', async () => {
  let active = 0, max = 0;
  const q = createUploadQueue({
    upload: async (b) => { active++; max = Math.max(max, active); await tick(); active--; return 'id-' + b; },
    wait: async () => {},
  });
  const res = await Promise.all([q.add('1'), q.add('2'), q.add('3')]);
  assert.deepEqual(res, ['id-1', 'id-2', 'id-3']);
  assert.equal(max, 1);
  assert.equal(q.pending(), 0);
});

test('retries then succeeds', async () => {
  let n = 0; const waits = [];
  const q = createUploadQueue({
    upload: async () => { if (++n < 3) throw new Error('x'); return 'ok'; },
    wait: async (ms) => { waits.push(ms); },
  });
  assert.equal(await q.add('b'), 'ok');
  assert.deepEqual(waits, [2000, 5000]);
});

test('rejects after retries exhausted', async () => {
  let n = 0; const waits = [];
  const q = createUploadQueue({
    upload: async () => { n++; throw new Error('nope'); },
    wait: async (ms) => { waits.push(ms); },
  });
  await assert.rejects(q.add('b'), /nope/);
  assert.equal(n, 4);
  assert.deepEqual(waits, [2000, 5000, 10000]);
  assert.equal(q.pending(), 0);
  // queue keeps working after a failure
  const q2 = q.add('c');
  await assert.rejects(q2);
});

test('onChange reports pending count', async () => {
  const seen = [];
  const q = createUploadQueue({ upload: async () => 'i', wait: async () => {} });
  q.onChange((n) => seen.push(n));
  await Promise.all([q.add('a'), q.add('b')]);
  assert.equal(seen[0], 1);
  assert.equal(seen.at(-1), 0);
});

test('does not retry AUTH or BAD_INPUT by default', async () => {
  for (const code of ['AUTH', 'BAD_INPUT']) {
    let n = 0; const waits = [];
    const q = createUploadQueue({
      upload: async () => { n++; throw Object.assign(new Error(code), { code }); },
      wait: async (ms) => { waits.push(ms); },
    });
    await assert.rejects(q.add('b'), (e) => e.code === code);
    assert.equal(n, 1);
    assert.deepEqual(waits, []);
    assert.equal(q.pending(), 0);
  }
});

test('custom shouldRetry is honoured', async () => {
  let n = 0;
  const q = createUploadQueue({
    upload: async () => { n++; throw Object.assign(new Error('x'), { code: 'SERVER' }); },
    wait: async () => {},
    shouldRetry: () => false,
  });
  await assert.rejects(q.add('b'));
  assert.equal(n, 1);
});
