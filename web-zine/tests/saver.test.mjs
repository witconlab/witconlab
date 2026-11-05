import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaver } from '../js/saver.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
function fakeTimers() {
  let id = 0;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimer: (i) => timers.delete(i),
    pending: () => [...timers.values()],
    async fire() {
      const [i, t] = [...timers.entries()][0];
      timers.delete(i);
      t.fn();
      await tick();
    },
  };
}
const tick = () => new Promise((r) => setImmediate(r));
const zine = (rev = 0, title = '') => ({ rev, title, pages: [] });
const err = (code) => Object.assign(new Error(code || 'net'), code ? { code } : {});

function setup(saveImpl, extra = {}) {
  const storage = fakeStorage();
  const t = fakeTimers();
  const calls = [];
  const save = async (z) => { calls.push(z); return saveImpl(z, calls.length); };
  const s = createSaver({ save, backupKey: 'bk', storage, setTimer: t.setTimer, clearTimer: t.clearTimer, now: () => 111, ...extra });
  const statuses = [];
  s.onStatus((st) => statuses.push(st));
  return { s, storage, t, calls, statuses };
}

test('debounces to one save after 3000ms', async () => {
  const { s, t, calls } = setup(async (z) => ({ rev: z.rev + 1 }));
  s.schedule(zine(0, 'a')); s.schedule(zine(0, 'b')); s.schedule(zine(0, 'c'));
  assert.equal(t.pending().length, 1);
  assert.equal(t.pending()[0].ms, 3000);
  assert.equal(calls.length, 0);
  await t.fire();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'c');
});

test('backup written immediately', () => {
  const { s, storage } = setup(async (z) => ({ rev: z.rev + 1 }));
  s.schedule(zine(4, 'x'));
  const b = JSON.parse(storage.getItem('bk'));
  assert.equal(b.zine.title, 'x');
  assert.equal(b.savedAt, 111);
});

test('retries after failure and reports error then saved', async () => {
  let n = 0;
  const { s, t, calls, statuses, storage } = setup(async (z) => {
    if (++n === 1) throw err();
    return { rev: z.rev + 1 };
  });
  s.schedule(zine(0, 'a'));
  await t.fire();
  assert.deepEqual(statuses, ['saving', 'error']);
  assert.equal(t.pending()[0].ms, 5000);
  assert.ok(storage.getItem('bk'));
  await t.fire();
  assert.equal(calls.length, 2);
  assert.equal(statuses.at(-1), 'saved');
  assert.equal(storage.getItem('bk'), null);
});

test('retry delays are 5s, 15s, 30s, then 30s repeating', async () => {
  const { s, t } = setup(async () => { throw err(); });
  s.schedule(zine(0));
  const delays = [];
  await t.fire();
  for (let i = 0; i < 5; i++) { delays.push(t.pending()[0].ms); await t.fire(); }
  assert.deepEqual(delays, [5000, 15000, 30000, 30000, 30000]);
});

test('conflict stops retry', async () => {
  const { s, t, statuses, storage } = setup(async () => { throw err('CONFLICT'); });
  s.schedule(zine(0));
  await t.fire();
  assert.equal(statuses.at(-1), 'conflict');
  assert.equal(t.pending().length, 0);
  assert.ok(storage.getItem('bk'));
});

test('auth error keeps backup and stops retry', async () => {
  const { s, t, statuses, storage, calls } = setup(async () => { throw err('AUTH'); });
  s.schedule(zine(2, 'mine'));
  await t.fire();
  assert.equal(statuses.at(-1), 'auth');
  assert.equal(t.pending().length, 0);
  assert.equal(JSON.parse(storage.getItem('bk')).zine.title, 'mine');
  s.schedule(zine(2, 'more'));
  assert.equal(t.pending().length, 0);
  assert.equal(calls.length, 1);
  // after re-login, restore brings the backup back and saving resumes
  const back = s.restore(zine(2, 'server'));
  assert.equal(back.title, 'more');
  assert.equal(t.pending().length, 1);
});

test('backup restored when newer', () => {
  const { s, storage, t } = setup(async (z) => ({ rev: z.rev + 1 }));
  storage.setItem('bk', JSON.stringify({ zine: zine(3, 'local'), savedAt: 1 }));
  const r = s.restore(zine(3, 'server'));
  assert.equal(r.title, 'local');
  assert.equal(t.pending().length, 1);
});

test('stale backup discarded', () => {
  const { s, storage, t } = setup(async (z) => ({ rev: z.rev + 1 }));
  storage.setItem('bk', JSON.stringify({ zine: zine(2, 'local'), savedAt: 1 }));
  const r = s.restore(zine(5, 'server'));
  assert.equal(r.title, 'server');
  assert.equal(storage.getItem('bk'), null);
  assert.equal(t.pending().length, 0);
  assert.equal(s.getStaleBackup().zine.title, 'local');
});

test('change during save triggers second save', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let n = 0;
  const { s, t, calls, storage } = setup(async (z) => {
    if (++n === 1) await gate;
    return { rev: z.rev + 1 };
  });
  s.schedule(zine(0, 'a'));
  t.fire();
  await tick();
  s.schedule(zine(0, 'b'));
  release();
  await s.flush();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].title, 'b');
  assert.equal(calls[1].rev, 1);
  assert.equal(storage.getItem('bk'), null);
});

test('flush saves immediately', async () => {
  const { s, calls } = setup(async (z) => ({ rev: z.rev + 1 }));
  s.schedule(zine(0, 'a'));
  await s.flush();
  assert.equal(calls.length, 1);
});

test('in-flight save then reload rebases newer backup', () => {
  const { s, storage, t } = setup(async (z) => ({ rev: z.rev + 1 }));
  storage.setItem('bk', JSON.stringify({ zine: zine(4, 'B'), savedAt: 5000 }));
  const r = s.restore({ ...zine(5, 'A'), updatedAt: new Date(1000).toISOString() });
  assert.equal(r.title, 'B');
  assert.equal(r.rev, 5);
  assert.equal(t.pending().length, 1);
  assert.equal(s.getStaleBackup(), null);
});

test('older backup kept as stale not deleted', () => {
  const { s, storage } = setup(async (z) => ({ rev: z.rev + 1 }));
  storage.setItem('bk', JSON.stringify({ zine: zine(4, 'old'), savedAt: 500 }));
  const r = s.restore({ ...zine(5, 'srv'), updatedAt: new Date(1000).toISOString() });
  assert.equal(r.title, 'srv');
  assert.equal(storage.getItem('bk'), null);
  assert.equal(s.getStaleBackup().zine.title, 'old');
  s.discardStaleBackup();
  assert.equal(s.getStaleBackup(), null);
});

test('success with pending edits rewrites backup rev', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  let n = 0;
  const { s, t, storage } = setup(async (z) => {
    if (++n === 1) { await gate; return { rev: z.rev + 1 }; }
    return new Promise(() => {}); // second save stays in flight
  });
  s.schedule(zine(0, 'a'));
  t.fire();
  await tick();
  s.schedule(zine(0, 'b'));
  release();
  await tick(); await tick();
  const b = JSON.parse(storage.getItem('bk'));
  assert.equal(b.zine.title, 'b');
  assert.equal(b.zine.rev, 1);
});

test('flush resolves to final status', async () => {
  const ok = setup(async (z) => ({ rev: z.rev + 1 }));
  ok.s.schedule(zine(0));
  assert.equal(await ok.s.flush(), 'saved');
  const bad = setup(async () => { throw err('CONFLICT'); });
  bad.s.schedule(zine(0));
  assert.equal(await bad.s.flush(), 'conflict');
});

test('non-retryable codes stop retrying and keep backup', async () => {
  const { s, t, statuses, storage } = setup(async () => { throw err('BAD_INPUT'); });
  s.schedule(zine(0, 'x'));
  await t.fire();
  assert.equal(statuses.at(-1), 'error');
  assert.equal(t.pending().length, 0);
  assert.ok(storage.getItem('bk'));
  s.schedule(zine(0, 'y'));
  assert.equal(t.pending().length, 1);
});
