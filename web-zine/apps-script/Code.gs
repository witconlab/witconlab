/**
 * 웹진 백엔드 (Google Apps Script 웹 앱)
 * 드라이브 구조: 웹진/<이름>/zine.json, 웹진/<이름>/photos/, 웹진/stickers/
 * 사진은 절대 공유 설정을 바꾸지 않는다 (setSharing 호출 금지).
 */

var ROOT_NAME = '웹진';
var STICKER_FOLDER = 'stickers';
var PAGE_COUNT = 8;
var TOKEN_TTL = 6 * 60 * 60; // 초
var MAX_FAILS = 5;
var LOCK_MS = 10 * 60 * 1000;
var ID_TTL = 6 * 60 * 60; // 폴더·파일 ID 캐시 (초, CacheService 최대값)
var ADMIN_FAIL_KEY = 'admin_fail'; // 학생 이름은 'fail_' + 이름이므로 겹치지 않는 키
var MIMES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 };

// ---------- 설치 ----------

function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ROOT_FOLDER_ID');
  var root = null;
  if (id) {
    try { root = DriveApp.getFolderById(id); } catch (err) { root = null; }
  }
  if (!root) {
    root = DriveApp.createFolder(ROOT_NAME);
    props.setProperty('ROOT_FOLDER_ID', root.getId());
  }
  child_(root, STICKER_FOLDER, true);
  Logger.log('설치 완료 · 웹진 폴더 ID: ' + root.getId());
  return root.getId();
}

// ---------- 빈 진 ----------

function emptyZine_(name) {
  var pages = [];
  for (var i = 0; i < PAGE_COUNT; i++) {
    pages.push({
      title: '',
      titleBox: { x: 0.06, y: 0.04, w: 0.88 },
      titleHighlight: 'sky',
      background: i === 0 ? 'yellow' : 'cream',
      pattern: 'dots',
      frameLine: true,
      elements: []
    });
  }
  return { version: 1, name: name, title: '', done: false, rev: 0, updatedAt: null, pages: pages };
}

// ---------- 진입점 ----------

function doPost(e) {
  var res;
  try {
    var body = JSON.parse(e.postData.contents);
    res = dispatch_(body || {});
  } catch (err) {
    console.error(err);
    res = fail_('SERVER', '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 보세요.');
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

// 학생 요청(login/load/save/uploadPhoto/getPhoto)은 스크립트 전체 잠금을 쓰지 않는다.
// 30명이 동시에 저장해도 줄 서지 않게 하기 위해서다. 저장은 rev 비교와 saveId(같은 저장의 재전송)로 지킨다.
// 잠금은 새 학생 만들기와 관리자 변경(드묾)에만 쓴다.
function dispatch_(b) {
  switch (b.action) {
    case 'login': return login_(b);
    case 'load': return load_(b);
    case 'save': return save_(b);
    case 'uploadPhoto': return uploadPhoto_(b);
    case 'getPhoto': return getPhoto_(b);
    case 'listStickers': return listStickers_();
    case 'getSticker': return getSticker_(b);
    case 'adminLogin': return locked_(function () { return adminLogin_(b); });
    case 'adminList': return adminList_(b);
    case 'adminGetZine': return adminGetZine_(b);
    case 'adminResetPin': return locked_(function () { return adminResetPin_(b); });
    case 'adminUnlock': return locked_(function () { return adminUnlock_(b); });
    case 'adminAddSticker': return locked_(function () { return adminAddSticker_(b); });
    default: return fail_('BAD_INPUT', '알 수 없는 요청이에요.');
  }
}

function fail_(error, message, extra) {
  var r = { ok: false, error: error, message: message };
  if (extra) for (var k in extra) r[k] = extra[k];
  return r;
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- 드라이브 도우미 ----------

// 폴더·파일 ID는 CacheService에 둔다. 이름으로 찾기(getFoldersByName/getFilesByName)는 느리기 때문.
// 캐시가 비었거나 ID가 낡았으면(지워짐·휴지통) 이름으로 다시 찾는다.
function idCache_() { return CacheService.getScriptCache(); }

function alive_(node) {
  return !(node && typeof node.isTrashed === 'function' && node.isTrashed());
}

function cachedNode_(key, getById) {
  var id = idCache_().get(key);
  if (!id) return null;
  try {
    var node = getById(id);
    if (alive_(node)) return node;
  } catch (err) { /* 낡은 ID */ }
  idCache_().remove(key);
  return null;
}

function rootFolder_() {
  var root = cachedNode_('id_root', function (id) { return DriveApp.getFolderById(id); });
  if (root) return root;
  var id = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  if (!id) throw new Error('setup() 을 먼저 실행하세요.');
  root = DriveApp.getFolderById(id);
  idCache_().put('id_root', id, ID_TTL);
  return root;
}

// 같은 이름이 여러 개면(두 요청이 동시에 만든 경우) 가장 먼저 만들어진 것을 쓴다. 모든 요청이 같은 것을 고르게 된다.
function older_(a, b) {
  var ta = a.getDateCreated().getTime(), tb = b.getDateCreated().getTime();
  return ta !== tb ? ta < tb : String(a.getId()) < String(b.getId());
}
function earliest_(it) {
  var best = null;
  while (it.hasNext()) {
    var n = it.next();
    if (alive_(n) && (!best || older_(n, best))) best = n;
  }
  return best;
}

function child_(parent, name, create) {
  var found = earliest_(parent.getFoldersByName(name));
  if (found || !create) return found;
  // 잠그지 않고 만든 뒤 다시 찾는다: 다른 요청이 먼저 만든 폴더가 있으면 그것을 쓰고 내 것은 버린다.
  var mine = parent.createFolder(name);
  var winner = earliest_(parent.getFoldersByName(name)) || mine;
  if (winner.getId() !== mine.getId()) mine.setTrashed(true);
  return winner;
}

function studentFolder_(name, create) {
  var key = 'id_dir_' + name;
  var folder = cachedNode_(key, function (id) { return DriveApp.getFolderById(id); });
  if (folder) return folder;
  folder = child_(rootFolder_(), name, create);
  if (folder) idCache_().put(key, folder.getId(), ID_TTL);
  return folder;
}

// 학생의 zine.json 파일 (캐시된 ID → getFileById, 없으면 폴더에서 이름으로 찾기)
function zineFile_(name, folder) {
  var key = 'id_zine_' + name;
  var file = cachedNode_(key, function (id) { return DriveApp.getFileById(id); });
  if (file) return file;
  folder = folder || studentFolder_(name, false);
  if (!folder) return null;
  var f = earliest_(folder.getFilesByName('zine.json'));
  if (f) idCache_().put(key, f.getId(), ID_TTL);
  return f;
}

function readStudentZine_(name) {
  var file = zineFile_(name);
  return file ? JSON.parse(file.getBlob().getDataAsString()) : null;
}

function writeStudentZine_(name, zine, folder) {
  var json = JSON.stringify(zine);
  var file = zineFile_(name, folder);
  if (file) { file.setContent(json); return; }
  folder = folder || studentFolder_(name, true);
  file = folder.createFile('zine.json', json, 'application/json');
  idCache_().put('id_zine_' + name, file.getId(), ID_TTL);
}

// 관리자 목록처럼 폴더를 차례로 훑을 때 쓴다.
function readZine_(folder) {
  var f = earliest_(folder.getFilesByName('zine.json'));
  return f ? JSON.parse(f.getBlob().getDataAsString()) : null;
}

function publicZine_(zine) {
  var out = {};
  for (var k in zine) if (k !== 'auth' && k !== 'lastSaveId') out[k] = zine[k];
  return out;
}

// ---------- 인증 ----------

function hash_(salt, pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pin);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = (bytes[i] + 256) % 256;
    hex += (v < 16 ? '0' : '') + v.toString(16);
  }
  return hex;
}

function makeAuth_(pin) {
  var salt = Utilities.getUuid();
  return { salt: salt, hash: hash_(salt, pin) };
}

function validName_(name) {
  if (typeof name !== 'string') return null;
  var n = name.normalize('NFC').replace(/^\s+|\s+$/g, '');
  if (!n || n.length > 20 || /[\/\\]/.test(n) || n === STICKER_FOLDER) return null;
  return n;
}

function validPin_(pin) {
  return typeof pin === 'string' && /^[0-9]{4}$/.test(pin);
}

function getFail_(name) {
  var raw = PropertiesService.getScriptProperties().getProperty('fail_' + name);
  return raw ? JSON.parse(raw) : { count: 0, until: 0 };
}

function setFail_(name, f) {
  PropertiesService.getScriptProperties().setProperty('fail_' + name, JSON.stringify(f));
}

function newToken_(prefix, value) {
  var t = prefix + Utilities.getUuid();
  CacheService.getScriptCache().put(t, value, TOKEN_TTL);
  return t;
}

function tokenName_(token, prefix) {
  if (typeof token !== 'string' || token.indexOf(prefix) !== 0) return null;
  return CacheService.getScriptCache().get(token);
}

function studentOf_(b) { return tokenName_(b.token, 'tok_'); }
function isAdmin_(b) { return tokenName_(b.adminToken, 'adm_') === 'admin'; }

var AUTH_FAIL = function () { return fail_('AUTH', '다시 로그인해 주세요.'); };

// ---------- 학생 ----------

function login_(b) {
  var name = validName_(b.name);
  if (!name) return fail_('BAD_INPUT', '이름을 확인해 주세요.');
  if (!validPin_(b.pin)) return fail_('BAD_INPUT', '비밀번호는 숫자 4자리예요.');

  var zine = readStudentZine_(name);

  if (!zine) {
    // 새 학생. 수업 시작에 여럿이 한꺼번에 들어오므로 반 전체를 줄 세우는 잠금을 쓰지 않는다.
    // 같은 이름이 동시에 만들어지면 폴더·zine.json 모두 '가장 먼저 만들어진 것'이 이긴다(child_, zineFile_).
    var made = (function () {
      var folder = studentFolder_(name, true);
      var existing = zineFile_(name, folder);
      if (existing) return { zine: JSON.parse(existing.getBlob().getDataAsString()) };
      var fresh = emptyZine_(name);
      fresh.auth = makeAuth_(b.pin);
      fresh.updatedAt = new Date().toISOString();
      PropertiesService.getScriptProperties().deleteProperty('auth_' + name); // 예전 같은 이름의 리셋 기록 정리
      var mine = folder.createFile('zine.json', JSON.stringify(fresh), 'application/json');
      var winner = earliest_(folder.getFilesByName('zine.json')) || mine;
      idCache_().put('id_zine_' + name, winner.getId(), ID_TTL);
      if (winner.getId() === mine.getId()) return { zine: fresh, created: true };
      mine.setTrashed(true); // 다른 기기가 한발 먼저 만들었다
      return { zine: JSON.parse(winner.getBlob().getDataAsString()) };
    })();
    if (made.created) {
      return { ok: true, token: newToken_('tok_', name), zine: publicZine_(made.zine), created: true };
    }
    zine = made.zine; // 그 사이 다른 기기가 먼저 만들었다: 비밀번호를 확인한다
  }

  var now = Date.now();
  var f = getFail_(name);
  if (f.until && f.until > now) {
    return fail_('LOCKED', '비밀번호를 여러 번 틀려서 잠겼어요. 잠시 뒤에 다시 해 보세요.', { until: f.until });
  }
  if (f.until) f = { count: 0, until: 0 }; // 잠금이 풀림

  var auth = authOf_(name, zine);
  if (hash_(auth.salt, b.pin) !== auth.hash) {
    f.count += 1;
    if (f.count >= MAX_FAILS) {
      var until = now + LOCK_MS;
      setFail_(name, { count: 0, until: until });
      return fail_('LOCKED', '비밀번호를 5번 틀려서 10분 동안 잠겼어요.', { until: until });
    }
    setFail_(name, f);
    var remaining = MAX_FAILS - f.count;
    return fail_('BAD_PIN', '비밀번호가 달라요. ' + remaining + '번 더 틀리면 잠겨요.', { remaining: remaining });
  }

  PropertiesService.getScriptProperties().deleteProperty('fail_' + name);
  return { ok: true, token: newToken_('tok_', name), zine: publicZine_(zine), created: false };
}

function load_(b) {
  var name = studentOf_(b);
  if (!name) return AUTH_FAIL();
  var zine = readStudentZine_(name);
  if (!zine) return AUTH_FAIL();
  return { ok: true, zine: publicZine_(zine) };
}

function save_(b) {
  var name = studentOf_(b);
  if (!name) return AUTH_FAIL();
  var z = b.zine;
  if (!z || typeof z !== 'object' || !Array.isArray(z.pages) || z.pages.length !== PAGE_COUNT || typeof z.rev !== 'number') {
    return fail_('BAD_INPUT', '저장할 내용이 올바르지 않아요.');
  }
  var saveId = typeof b.saveId === 'string' && b.saveId ? b.saveId.slice(0, 64) : null;
  var stored = readStudentZine_(name);
  if (!stored) return AUTH_FAIL();
  if (z.rev !== stored.rev) {
    // 같은 저장을 다시 보낸 것(앞 응답이 중간에 사라짐)이면 이미 저장된 것이다.
    if (saveId && stored.lastSaveId === saveId) return { ok: true, rev: stored.rev };
    return fail_('CONFLICT', '다른 곳에서 먼저 저장했어요. 새로고침해 주세요.', { rev: stored.rev });
  }
  var next = {};
  for (var k in z) next[k] = z[k];
  next.name = name;
  next.rev = stored.rev + 1;
  next.updatedAt = new Date().toISOString();
  next.auth = stored.auth;
  next.lastSaveId = saveId;
  writeStudentZine_(name, next);
  return { ok: true, rev: next.rev };
}

function uploadPhoto_(b) {
  var name = studentOf_(b);
  if (!name) return AUTH_FAIL();
  if (!MIMES[b.mime] || typeof b.data !== 'string' || !b.data) return fail_('BAD_INPUT', '사진 파일이 올바르지 않아요.');
  var photos = photosFolder_(name);
  if (!photos) return AUTH_FAIL();
  var id = Utilities.getUuid();
  var blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime, id);
  photos.createFile(blob);
  return { ok: true, photoId: id };
}

// 학생의 photos 폴더 (캐시). 보통 처음 들어올 때 만들어진다. 없으면(예전 학생) 잠근 뒤 만든다.
function photosFolder_(name) {
  var key = 'id_photos_' + name;
  var photos = cachedNode_(key, function (id) { return DriveApp.getFolderById(id); });
  if (photos) return photos;
  var folder = studentFolder_(name, false);
  if (!folder) return null;
  photos = child_(folder, 'photos', true); // 잠금 없이: 동시에 만들어도 가장 먼저 만든 폴더로 모인다
  idCache_().put(key, photos.getId(), ID_TTL);
  return photos;
}

function readPhoto_(folder, photoId) {
  if (typeof photoId !== 'string' || !/^[0-9a-f\-]{8,64}$/.test(photoId)) return null;
  var dirs = folder.getFoldersByName('photos');
  while (dirs.hasNext()) {
    var it = dirs.next().getFilesByName(photoId);
    if (it.hasNext()) {
      var blob = it.next().getBlob();
      return { ok: true, data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
    }
  }
  return null;
}

function getPhoto_(b) {
  var found = null;
  var name = studentOf_(b);
  if (name) {
    var folder = studentFolder_(name, false);
    if (folder) found = readPhoto_(folder, b.photoId);
  } else if (isAdmin_(b)) {
    // 관리자: 이름을 알려 주면 그 학생 폴더부터 보고, 없을 때만 전체를 훑는다.
    var hint = validName_(b.name);
    var first = hint ? studentFolder_(hint, false) : null;
    if (first) found = readPhoto_(first, b.photoId);
    var it = found ? null : rootFolder_().getFolders();
    while (!found && it.hasNext()) {
      var f = it.next();
      if (first && f.getId() === first.getId()) continue;
      found = readPhoto_(f, b.photoId);
    }
  }
  return found || AUTH_FAIL();
}

// ---------- 스티커 ----------

function stickerFolder_() {
  return child_(rootFolder_(), STICKER_FOLDER, true);
}

function listStickers_() {
  var it = stickerFolder_().getFiles();
  var out = [];
  while (it.hasNext()) {
    var f = it.next();
    out.push({ id: f.getId(), name: f.getName() });
  }
  return { ok: true, stickers: out };
}

function getSticker_(b) {
  var it = stickerFolder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getId() === b.id) {
      var blob = f.getBlob();
      return { ok: true, data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
    }
  }
  return fail_('NOT_FOUND', '스티커를 찾을 수 없어요.');
}

function adminAddSticker_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  var name = validName_(b.name);
  if (!name && typeof b.name === 'string') name = b.name.replace(/[\/\\]/g, '_');
  if (!name || !MIMES[b.mime] || typeof b.data !== 'string' || !b.data) return fail_('BAD_INPUT', '스티커 파일이 올바르지 않아요.');
  stickerFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(b.data), b.mime, name));
  return { ok: true };
}

// ---------- 관리자 ----------

// 학생과 같은 규칙: 5번 틀리면 10분 잠금.
function adminLogin_(b) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(ADMIN_FAIL_KEY);
  var f = raw ? JSON.parse(raw) : { count: 0, until: 0 };
  var now = Date.now();
  if (f.until && f.until > now) {
    return fail_('LOCKED', '관리자 비밀번호를 여러 번 틀려서 잠겼어요. 10분 뒤에 다시 해 보세요.', { until: f.until });
  }
  if (f.until) f = { count: 0, until: 0 };
  var pw = props.getProperty('ADMIN_PASSWORD');
  if (!pw || typeof b.password !== 'string' || b.password !== pw) {
    f.count += 1;
    if (f.count >= MAX_FAILS) {
      var until = now + LOCK_MS;
      props.setProperty(ADMIN_FAIL_KEY, JSON.stringify({ count: 0, until: until }));
      return fail_('LOCKED', '관리자 비밀번호를 5번 틀려서 10분 동안 잠겼어요.', { until: until });
    }
    props.setProperty(ADMIN_FAIL_KEY, JSON.stringify(f));
    return fail_('AUTH', '관리자 비밀번호가 달라요.', { remaining: MAX_FAILS - f.count });
  }
  props.deleteProperty(ADMIN_FAIL_KEY);
  return { ok: true, adminToken: newToken_('adm_', 'admin') };
}

function filledPages_(zine) {
  var n = 0;
  for (var i = 0; i < zine.pages.length; i++) {
    var p = zine.pages[i];
    if ((p.title && p.title !== '') || (p.elements && p.elements.length > 0)) n++;
  }
  return n;
}

function adminList_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  var it = rootFolder_().getFolders();
  var now = Date.now();
  var students = [];
  while (it.hasNext()) {
    var folder = it.next();
    if (folder.getName() === STICKER_FOLDER || !alive_(folder)) continue;
    var zine = readZine_(folder);
    if (!zine) continue;
    var f = getFail_(folder.getName());
    students.push({
      name: folder.getName(),
      filledPages: filledPages_(zine),
      updatedAt: zine.updatedAt,
      done: !!zine.done,
      lockedUntil: f.until && f.until > now ? f.until : null
    });
  }
  return { ok: true, students: students };
}

function adminZineFolder_(b) {
  var name = validName_(b.name);
  return name ? studentFolder_(name, false) : null;
}

function adminGetZine_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  var folder = adminZineFolder_(b);
  var zine = folder ? readZine_(folder) : null;
  if (!zine) return fail_('NOT_FOUND', '그 학생을 찾을 수 없어요.');
  return { ok: true, zine: publicZine_(zine) };
}

// 선생님이 바꾼 비밀번호(스크립트 속성)가 있으면 그것을, 없으면 zine.json의 것을 쓴다.
function authOf_(name, zine) {
  var raw = PropertiesService.getScriptProperties().getProperty('auth_' + name);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* 손상된 값은 무시 */ }
  }
  return zine.auth;
}

function adminResetPin_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  if (!validPin_(b.pin)) return fail_('BAD_INPUT', '비밀번호는 숫자 4자리예요.');
  var folder = adminZineFolder_(b);
  var zine = folder ? readZine_(folder) : null;
  if (!zine) return fail_('NOT_FOUND', '그 학생을 찾을 수 없어요.');
  // 학생 저장은 잠그지 않으므로 zine.json을 다시 쓰면 그 사이의 학생 저장을 되돌릴 수 있다.
  // 새 비밀번호는 스크립트 속성에만 저장하고, 로그인 때 이것을 먼저 본다.
  var props = PropertiesService.getScriptProperties();
  props.setProperty('auth_' + folder.getName(), JSON.stringify(makeAuth_(b.pin)));
  props.deleteProperty('fail_' + folder.getName());
  return { ok: true };
}

function adminUnlock_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  var name = validName_(b.name);
  if (!name) return fail_('BAD_INPUT', '이름을 확인해 주세요.');
  PropertiesService.getScriptProperties().deleteProperty('fail_' + name);
  return { ok: true };
}
