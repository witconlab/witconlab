import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadGas } from './gas-harness.mjs';

const CODE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps-script/Code.gs');

function setup() {
  const g = loadGas(CODE);
  g.ctx.setup();
  g.props.set('ADMIN_PASSWORD', 'teacher-pw');
  return g;
}
const MIN = 60 * 1000;

test('first login creates zine', () => {
  const { call, drive } = setup();
  const r = call('login', { name: '김민지', pin: '1234' });
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(r.zine.pages.length, 8);
  assert.equal(r.zine.auth, undefined);
  assert.ok(r.token);
  assert.ok(drive.find('웹진/김민지/zine.json'));
});

test('second login with right pin', () => {
  const { call } = setup();
  const a = call('login', { name: '김민지', pin: '1234' });
  const b = call('login', { name: '김민지', pin: '1234' });
  assert.equal(b.ok, true);
  assert.equal(b.created, false);
  assert.deepEqual(b.zine, a.zine);
});

test('bad pin counts down', () => {
  const { call } = setup();
  call('login', { name: '김민지', pin: '1234' });
  const r = call('login', { name: '김민지', pin: '0000' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'BAD_PIN');
  assert.equal(r.remaining, 4);
  assert.match(r.message, /[가-힣]/);
});

test('five failures lock 10 minutes', () => {
  const { call, ctx } = setup();
  call('login', { name: '김민지', pin: '1234' });
  for (let i = 0; i < 5; i++) call('login', { name: '김민지', pin: '0000' });
  const locked = call('login', { name: '김민지', pin: '1234' });
  assert.equal(locked.error, 'LOCKED');
  assert.ok(locked.until > ctx.__now);
  ctx.__now += 10 * MIN + 1;
  const ok = call('login', { name: '김민지', pin: '1234' });
  assert.equal(ok.ok, true);
});

test('pin must be 4 digits, name required', () => {
  const { call } = setup();
  for (const pin of ['12a4', '123', '12345', '']) {
    assert.equal(call('login', { name: '김민지', pin }).error, 'BAD_INPUT');
  }
  assert.equal(call('login', { name: '   ', pin: '1234' }).error, 'BAD_INPUT');
  assert.equal(call('login', { name: '', pin: '1234' }).error, 'BAD_INPUT');
});

test('save increments rev', () => {
  const { call } = setup();
  const { token, zine } = call('login', { name: '김민지', pin: '1234' });
  zine.title = '나의 웹진';
  const s1 = call('save', { token, zine });
  assert.deepEqual([s1.ok, s1.rev], [true, 1]);
  const s2 = call('save', { token, zine }); // still rev 0
  assert.equal(s2.error, 'CONFLICT');
  assert.equal(s2.rev, 1);
  const loaded = call('load', { token });
  assert.equal(loaded.zine.title, '나의 웹진');
  assert.equal(loaded.zine.rev, 1);
  assert.equal(loaded.zine.auth, undefined);
});

test('save cannot overwrite auth', () => {
  const { call } = setup();
  const { token, zine } = call('login', { name: '김민지', pin: '1234' });
  zine.auth = { salt: 'x', hash: 'y' };
  call('save', { token, zine });
  assert.equal(call('login', { name: '김민지', pin: '1234' }).ok, true);
});

test('token required', () => {
  const { call } = setup();
  assert.equal(call('load', { token: 'nope' }).error, 'AUTH');
  assert.equal(call('load', {}).error, 'AUTH');
});

test('photo roundtrip, never shared', () => {
  const { call, drive } = setup();
  const { token } = call('login', { name: '김민지', pin: '1234' });
  const data = Buffer.from([1, 2, 3, 250, 255, 0]).toString('base64');
  const up = call('uploadPhoto', { token, data, mime: 'image/jpeg' });
  assert.equal(up.ok, true);
  const got = call('getPhoto', { token, photoId: up.photoId });
  assert.deepEqual([got.data, got.mime], [data, 'image/jpeg']);
  assert.equal(drive.find('웹진/김민지/photos')._files.length, 1);
  assert.equal(drive.sharingCalls.length, 0);
  assert.equal(call('uploadPhoto', { token, data, mime: 'text/html' }).error, 'BAD_INPUT');
});

test("other student's photo denied", () => {
  const { call } = setup();
  const a = call('login', { name: '김민지', pin: '1234' });
  const b = call('login', { name: '이서준', pin: '5678' });
  const up = call('uploadPhoto', { token: a.token, data: Buffer.from('abc').toString('base64'), mime: 'image/png' });
  assert.equal(call('getPhoto', { token: b.token, photoId: up.photoId }).error, 'AUTH');
});

test('admin flows', () => {
  const { call, ctx } = setup();
  const a = call('login', { name: '김민지', pin: '1234' });
  a.zine.pages[0].title = '표지';
  a.zine.pages[1].elements.push({ id: 'e1', type: 'text', text: 'hi' });
  a.zine.done = true;
  call('save', { token: a.token, zine: a.zine });
  call('login', { name: '이서준', pin: '5678' });

  assert.equal(call('adminLogin', { password: 'wrong' }).error, 'AUTH');
  const { adminToken } = call('adminLogin', { password: 'teacher-pw' });
  assert.ok(adminToken);
  assert.equal(call('adminList', { adminToken: 'bad' }).error, 'AUTH');
  const list = call('adminList', { adminToken }).students;
  const mj = list.find((s) => s.name === '김민지');
  assert.equal(mj.filledPages, 2);
  assert.equal(mj.done, true);
  assert.ok(mj.updatedAt);
  assert.equal(list.find((s) => s.name === '이서준').filledPages, 0);
  assert.equal(list.some((s) => s.name === 'stickers'), false);

  const z = call('adminGetZine', { adminToken, name: '김민지' }).zine;
  assert.equal(z.title, '');
  assert.equal(z.auth, undefined);
  assert.equal(call('load', { token: adminToken }).error, 'AUTH');

  // photo access by admin
  const up = call('uploadPhoto', { token: a.token, data: Buffer.from('xyz').toString('base64'), mime: 'image/png' });
  assert.equal(call('getPhoto', { adminToken, photoId: up.photoId }).ok, true);

  // reset pin
  assert.equal(call('adminResetPin', { adminToken, name: '김민지', pin: '9999' }).ok, true);
  assert.equal(call('login', { name: '김민지', pin: '1234' }).error, 'BAD_PIN');
  assert.equal(call('login', { name: '김민지', pin: '9999' }).ok, true);

  // unlock
  for (let i = 0; i < 5; i++) call('login', { name: '이서준', pin: '0000' });
  assert.ok(call('adminList', { adminToken }).students.find((s) => s.name === '이서준').lockedUntil > ctx.__now);
  assert.equal(call('login', { name: '이서준', pin: '5678' }).error, 'LOCKED');
  assert.equal(call('adminUnlock', { adminToken, name: '이서준' }).ok, true);
  assert.equal(call('login', { name: '이서준', pin: '5678' }).ok, true);
});

test('stickers', () => {
  const { call } = setup();
  assert.deepEqual(call('listStickers').stickers, []);
  const { adminToken } = call('adminLogin', { password: 'teacher-pw' });
  const data = Buffer.from('png!').toString('base64');
  assert.equal(call('adminAddSticker', { adminToken, name: 'star.png', data, mime: 'image/png' }).ok, true);
  const [s] = call('listStickers').stickers;
  assert.equal(s.name, 'star.png');
  const got = call('getSticker', { id: s.id });
  assert.deepEqual([got.data, got.mime], [data, 'image/png']);
  assert.equal(call('getSticker', { id: 'folder1' }).ok, false);
});

test('emptyZine_ shape', () => {
  const { ctx } = setup();
  const z = JSON.parse(JSON.stringify(ctx.emptyZine_('김민지')));
  assert.equal(z.version, 1);
  assert.equal(z.rev, 0);
  assert.equal(z.updatedAt, null);
  assert.equal(z.pages.length, 8);
  assert.equal(z.pages[0].background, 'yellow');
  assert.equal(z.pages[1].background, 'cream');
  assert.deepEqual(z.pages[3], {
    title: '', titleBox: { x: 0.06, y: 0.04, w: 0.88 }, titleHighlight: 'sky',
    background: 'cream', pattern: 'dots', frameLine: true, elements: [],
  });
});

// ---------- concurrency (no global lock for student traffic) ----------

test('save and upload take no script lock; stale rev still CONFLICT', () => {
  const { call, lockState } = setup();
  const { token, zine } = call('login', { name: '김민지', pin: '1234' });
  const before = lockState.locks;
  // two devices both based on rev 0: the first wins, the second must not overwrite it
  const a = call('save', { token, zine: { ...zine, title: 'A' }, saveId: 'sa' });
  const b = call('save', { token, zine: { ...zine, title: 'B' }, saveId: 'sb' });
  assert.deepEqual([a.ok, a.rev], [true, 1]);
  assert.equal(b.error, 'CONFLICT');
  assert.equal(call('load', { token }).zine.title, 'A');
  call('uploadPhoto', { token, data: Buffer.from('x').toString('base64'), mime: 'image/png' });
  call('login', { name: '김민지', pin: '1234' }); // existing student: no lock either
  assert.equal(lockState.locks, before);
});

test('only the create-new-student branch of login is locked', () => {
  const { call, lockState } = setup();
  const before = lockState.locks;
  call('login', { name: '김민지', pin: '1234' });
  assert.equal(lockState.locks, before + 1);
});

test('login create re-checks inside the lock (same name created meanwhile)', () => {
  const g = setup();
  // while this login waits for the lock, another device creates 김민지 with pin 1111
  g.lockState.onLock = () => {
    assert.equal(g.call('login', { name: '김민지', pin: '1111' }).created, true);
  };
  const r = g.call('login', { name: '김민지', pin: '2222' });
  assert.equal(r.error, 'BAD_PIN'); // did not overwrite the other device's zine
  assert.equal(g.call('login', { name: '김민지', pin: '1111' }).ok, true);
  assert.equal(g.drive.find('웹진')._folders.filter((f) => f._name === '김민지').length, 1);
});

test('saves use cached file ids (no name search) and survive stale cache ids', () => {
  const { call, drive, cache } = setup();
  const { token, zine } = call('login', { name: '김민지', pin: '1234' });
  const n0 = drive.counts.getFilesByName + drive.counts.getFoldersByName;
  const s = call('save', { token, zine: { ...zine, title: 'x' } });
  assert.equal(s.ok, true);
  assert.equal(drive.counts.getFilesByName + drive.counts.getFoldersByName, n0);
  // stale ids (e.g. cache from before a folder was replaced) fall back to name search
  for (const k of [...cache.keys()]) if (k.startsWith('id_')) cache.set(k, { v: 'gone', exp: Infinity });
  assert.equal(call('load', { token }).zine.title, 'x');
  assert.equal(call('save', { token, zine: { ...zine, rev: 1, title: 'y' } }).rev, 2);
});

test('trashed student folder is not reused from cache', () => {
  const { call, drive } = setup();
  call('login', { name: '테스트01', pin: '1234' });
  drive.find('웹진/테스트01').setTrashed(true);
  const r = call('login', { name: '테스트01', pin: '9999' });
  assert.equal(r.created, true);
});

// ---------- idempotent save (lost response) ----------

test('resending the same save (same saveId) is not a CONFLICT', () => {
  const { call } = setup();
  const { token, zine } = call('login', { name: '김민지', pin: '1234' });
  const z = { ...zine, title: 'one' };
  const first = call('save', { token, zine: z, saveId: 'id-1' });
  assert.deepEqual([first.ok, first.rev], [true, 1]);
  // response was lost; client retries the same snapshot with the same saveId
  const again = call('save', { token, zine: z, saveId: 'id-1' });
  assert.deepEqual([again.ok, again.rev], [true, 1]);
  assert.equal(call('load', { token }).zine.rev, 1);
  assert.equal(call('load', { token }).zine.lastSaveId, undefined); // internal, not exposed
  // a different save based on the old rev is still a conflict
  assert.equal(call('save', { token, zine: z, saveId: 'id-2' }).error, 'CONFLICT');
  assert.equal(call('save', { token, zine: z }).error, 'CONFLICT');
});

// ---------- admin photo lookup by name ----------

test('admin getPhoto with name checks that folder first, falls back to scan', () => {
  const { call } = setup();
  const a = call('login', { name: '김민지', pin: '1234' });
  call('login', { name: '이서준', pin: '5678' });
  const up = call('uploadPhoto', { token: a.token, data: Buffer.from('p').toString('base64'), mime: 'image/png' });
  const { adminToken } = call('adminLogin', { password: 'teacher-pw' });
  assert.equal(call('getPhoto', { adminToken, photoId: up.photoId, name: '김민지' }).ok, true);
  assert.equal(call('getPhoto', { adminToken, photoId: up.photoId, name: '이서준' }).ok, true); // wrong hint: scan
  assert.equal(call('getPhoto', { adminToken, photoId: up.photoId }).ok, true);
  assert.equal(call('getPhoto', { adminToken, photoId: 'deadbeef00' , name: '김민지' }).error, 'AUTH');
});

// ---------- admin password throttle ----------

test('admin password: 5 failures lock 10 minutes', () => {
  const { call, ctx } = setup();
  const r1 = call('adminLogin', { password: 'x' });
  assert.equal(r1.error, 'AUTH');
  assert.equal(r1.remaining, 4);
  for (let i = 0; i < 3; i++) call('adminLogin', { password: 'x' });
  assert.equal(call('adminLogin', { password: 'x' }).error, 'LOCKED');
  assert.equal(call('adminLogin', { password: 'teacher-pw' }).error, 'LOCKED');
  ctx.__now += 10 * MIN + 1;
  assert.ok(call('adminLogin', { password: 'teacher-pw' }).adminToken);
  // success resets the counter
  for (let i = 0; i < 4; i++) call('adminLogin', { password: 'x' });
  assert.ok(call('adminLogin', { password: 'teacher-pw' }).adminToken);
  assert.equal(call('adminLogin', { password: 'x' }).remaining, 4);
});

test('a student named admin does not share the admin fail counter', () => {
  const { call } = setup();
  call('login', { name: 'admin', pin: '1234' });
  for (let i = 0; i < 5; i++) call('login', { name: 'admin', pin: '0000' });
  assert.ok(call('adminLogin', { password: 'teacher-pw' }).adminToken);
});

// ---------- NFC ----------

test('names are NFC-normalized (NFD input reaches the same zine)', () => {
  const { call } = setup();
  const nfc = '김민지';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfd, nfc);
  assert.equal(call('login', { name: nfc, pin: '1234' }).created, true);
  const r = call('login', { name: nfd, pin: '1234' });
  assert.equal(r.created, false);
  assert.equal(r.zine.name, nfc);
});
