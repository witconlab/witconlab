import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../js/api-mock.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function mk(t0 = 1000) {
  const clock = { t: t0 };
  const mock = createMock({ storage: fakeStorage(), now: () => clock.t });
  return { mock, clock };
}

test('login creates, then logs in again', async () => {
  const { mock } = mk();
  const a = await mock({ action: 'login', name: '민지', pin: '1234' });
  assert.equal(a.ok, true); assert.equal(a.created, true);
  assert.equal(a.zine.pages.length, 8);
  assert.equal(a.zine.auth, undefined);
  const b = await mock({ action: 'login', name: '민지', pin: '1234' });
  assert.equal(b.created, false);
  assert.equal((await mock({ action: 'login', name: '민지', pin: '12' })).error, 'BAD_INPUT');
});

test('wrong PIN counts down, locks after 5', async () => {
  const { mock, clock } = mk();
  await mock({ action: 'login', name: 'a', pin: '1111' });
  const r1 = await mock({ action: 'login', name: 'a', pin: '0000' });
  assert.equal(r1.error, 'BAD_PIN'); assert.equal(r1.remaining, 4);
  for (let i = 0; i < 3; i++) await mock({ action: 'login', name: 'a', pin: '0000' });
  const r5 = await mock({ action: 'login', name: 'a', pin: '0000' });
  assert.equal(r5.error, 'LOCKED'); assert.equal(r5.until, 1000 + 600000);
  assert.equal((await mock({ action: 'login', name: 'a', pin: '1111' })).error, 'LOCKED');
  clock.t += 600001;
  assert.equal((await mock({ action: 'login', name: 'a', pin: '1111' })).ok, true);
});

test('save bumps rev and rejects stale rev with CONFLICT', async () => {
  const { mock } = mk();
  const { token, zine } = await mock({ action: 'login', name: 'a', pin: '1111' });
  const s1 = await mock({ action: 'save', token, zine: { ...zine, title: 'hi' } });
  assert.deepEqual([s1.ok, s1.rev], [true, 1]);
  const s2 = await mock({ action: 'save', token, zine: { ...zine, title: 'old' } });
  assert.equal(s2.error, 'CONFLICT'); assert.equal(s2.rev, 1);
  const l = await mock({ action: 'load', token });
  assert.equal(l.zine.title, 'hi'); assert.equal(l.zine.auth, undefined);
  assert.equal((await mock({ action: 'load', token: 'bad' })).error, 'AUTH');
});

test('photo roundtrip', async () => {
  const { mock } = mk();
  const { token } = await mock({ action: 'login', name: 'a', pin: '1111' });
  const up = await mock({ action: 'uploadPhoto', token, mime: 'image/png', data: 'QUJD' });
  assert.equal(up.ok, true);
  const got = await mock({ action: 'getPhoto', token, photoId: up.photoId });
  assert.deepEqual([got.data, got.mime], ['QUJD', 'image/png']);
  assert.equal((await mock({ action: 'uploadPhoto', token, mime: 'text/html', data: 'x' })).error, 'BAD_INPUT');
  assert.equal((await mock({ action: 'getPhoto', token: 'x', photoId: up.photoId })).error, 'AUTH');
});

test('admin list, zine, reset pin, unlock, stickers', async () => {
  const { mock } = mk();
  const { token, zine } = await mock({ action: 'login', name: 'a', pin: '1111' });
  const z = { ...zine, pages: zine.pages.map((p, i) => (i === 0 ? { ...p, title: 'T' } : p)) };
  await mock({ action: 'save', token, zine: z });
  assert.equal((await mock({ action: 'adminLogin', password: 'x' })).error, 'AUTH');
  const { adminToken } = await mock({ action: 'adminLogin', password: 'admin' });
  assert.equal((await mock({ action: 'adminList' })).error, 'AUTH');
  const list = await mock({ action: 'adminList', adminToken });
  assert.equal(list.students.length, 1);
  assert.equal(list.students[0].filledPages, 1);
  assert.equal(list.students[0].lockedUntil, null);
  assert.equal((await mock({ action: 'adminGetZine', adminToken, name: 'a' })).zine.pages[0].title, 'T');
  assert.equal((await mock({ action: 'adminGetZine', adminToken, name: 'zz' })).error, 'NOT_FOUND');
  for (let i = 0; i < 5; i++) await mock({ action: 'login', name: 'a', pin: '0000' });
  assert.ok((await mock({ action: 'adminList', adminToken })).students[0].lockedUntil);
  await mock({ action: 'adminUnlock', adminToken, name: 'a' });
  await mock({ action: 'adminResetPin', adminToken, name: 'a', pin: '9999' });
  assert.equal((await mock({ action: 'login', name: 'a', pin: '9999' })).ok, true);
  // photo visible to admin
  const up = await mock({ action: 'uploadPhoto', token, mime: 'image/png', data: 'QUJD' });
  assert.equal((await mock({ action: 'getPhoto', adminToken, photoId: up.photoId })).data, 'QUJD');
  // stickers
  assert.equal((await mock({ action: 'adminAddSticker', adminToken, name: 's.png', mime: 'image/png', data: 'RA==' })).ok, true);
  const ls = await mock({ action: 'listStickers' });
  assert.equal(ls.stickers.length, 1);
  assert.equal((await mock({ action: 'getSticker', id: ls.stickers[0].id })).data, 'RA==');
  assert.equal((await mock({ action: 'getSticker', id: 'nope' })).error, 'NOT_FOUND');
});

test('same saveId resent after a lost response is ok, not CONFLICT', async () => {
  const { mock } = mk();
  const { token, zine } = await mock({ action: 'login', name: 'a', pin: '1111' });
  const z = { ...zine, title: 'one' };
  assert.deepEqual((await mock({ action: 'save', token, zine: z, saveId: 'id-1' })).rev, 1);
  const again = await mock({ action: 'save', token, zine: z, saveId: 'id-1' });
  assert.deepEqual([again.ok, again.rev], [true, 1]);
  assert.equal((await mock({ action: 'save', token, zine: z, saveId: 'id-2' })).error, 'CONFLICT');
  assert.equal((await mock({ action: 'save', token, zine: z })).error, 'CONFLICT');
  assert.equal((await mock({ action: 'load', token })).zine.lastSaveId, undefined);
});

test('admin getPhoto with a name hint, and fallback scan', async () => {
  const { mock } = mk();
  const a = await mock({ action: 'login', name: 'a', pin: '1111' });
  await mock({ action: 'login', name: 'b', pin: '2222' });
  const up = await mock({ action: 'uploadPhoto', token: a.token, mime: 'image/png', data: 'QUJD' });
  const { adminToken } = await mock({ action: 'adminLogin', password: 'admin' });
  assert.equal((await mock({ action: 'getPhoto', adminToken, photoId: up.photoId, name: 'a' })).data, 'QUJD');
  assert.equal((await mock({ action: 'getPhoto', adminToken, photoId: up.photoId, name: 'b' })).data, 'QUJD');
});

test('admin password locks after 5 failures for 10 minutes', async () => {
  const { mock, clock } = mk();
  assert.equal((await mock({ action: 'adminLogin', password: 'x' })).remaining, 4);
  for (let i = 0; i < 3; i++) await mock({ action: 'adminLogin', password: 'x' });
  assert.equal((await mock({ action: 'adminLogin', password: 'x' })).error, 'LOCKED');
  assert.equal((await mock({ action: 'adminLogin', password: 'admin' })).error, 'LOCKED');
  clock.t += 600001;
  assert.ok((await mock({ action: 'adminLogin', password: 'admin' })).adminToken);
});

test('names are NFC-normalized', async () => {
  const { mock } = mk();
  await mock({ action: 'login', name: '김민지', pin: '1234' });
  const r = await mock({ action: 'login', name: '김민지'.normalize('NFD'), pin: '1234' });
  assert.equal(r.created, false);
});
