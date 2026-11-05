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
    res = fail_('SERVER', '서버에 문제가 생겼어요. 잠시 뒤에 다시 해 보세요.');
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(b) {
  switch (b.action) {
    case 'login': return locked_(function () { return login_(b); });
    case 'load': return load_(b);
    case 'save': return locked_(function () { return save_(b); });
    case 'uploadPhoto': return locked_(function () { return uploadPhoto_(b); });
    case 'getPhoto': return getPhoto_(b);
    case 'listStickers': return listStickers_();
    case 'getSticker': return getSticker_(b);
    case 'adminLogin': return adminLogin_(b);
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

function rootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  if (!id) throw new Error('setup() 을 먼저 실행하세요.');
  return DriveApp.getFolderById(id);
}

function child_(parent, name, create) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return create ? parent.createFolder(name) : null;
}

function studentFolder_(name, create) {
  return child_(rootFolder_(), name, create);
}

function readZine_(folder) {
  var it = folder.getFilesByName('zine.json');
  if (!it.hasNext()) return null;
  return JSON.parse(it.next().getBlob().getDataAsString());
}

function writeZine_(folder, zine) {
  var json = JSON.stringify(zine);
  var it = folder.getFilesByName('zine.json');
  if (it.hasNext()) it.next().setContent(json);
  else folder.createFile('zine.json', json, 'application/json');
}

function publicZine_(zine) {
  var out = {};
  for (var k in zine) if (k !== 'auth') out[k] = zine[k];
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
  var n = name.replace(/^\s+|\s+$/g, '');
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

  var folder = studentFolder_(name, false);
  var zine = folder ? readZine_(folder) : null;

  if (!zine) {
    folder = studentFolder_(name, true);
    zine = emptyZine_(name);
    zine.auth = makeAuth_(b.pin);
    zine.updatedAt = new Date().toISOString();
    writeZine_(folder, zine);
    return { ok: true, token: newToken_('tok_', name), zine: publicZine_(zine), created: true };
  }

  var now = Date.now();
  var f = getFail_(name);
  if (f.until && f.until > now) {
    return fail_('LOCKED', '비밀번호를 여러 번 틀려서 잠겼어요. 잠시 뒤에 다시 해 보세요.', { until: f.until });
  }
  if (f.until) f = { count: 0, until: 0 }; // 잠금이 풀림

  if (hash_(zine.auth.salt, b.pin) !== zine.auth.hash) {
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
  var folder = studentFolder_(name, false);
  var zine = folder ? readZine_(folder) : null;
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
  var folder = studentFolder_(name, false);
  var stored = folder ? readZine_(folder) : null;
  if (!stored) return AUTH_FAIL();
  if (z.rev !== stored.rev) {
    return fail_('CONFLICT', '다른 곳에서 먼저 저장했어요. 새로고침해 주세요.', { rev: stored.rev });
  }
  var next = {};
  for (var k in z) next[k] = z[k];
  next.name = name;
  next.rev = stored.rev + 1;
  next.updatedAt = new Date().toISOString();
  next.auth = stored.auth;
  writeZine_(folder, next);
  return { ok: true, rev: next.rev };
}

function uploadPhoto_(b) {
  var name = studentOf_(b);
  if (!name) return AUTH_FAIL();
  if (!MIMES[b.mime] || typeof b.data !== 'string' || !b.data) return fail_('BAD_INPUT', '사진 파일이 올바르지 않아요.');
  var folder = studentFolder_(name, false);
  if (!folder) return AUTH_FAIL();
  var photos = child_(folder, 'photos', true);
  var id = Utilities.getUuid();
  var blob = Utilities.newBlob(Utilities.base64Decode(b.data), b.mime, id);
  photos.createFile(blob);
  return { ok: true, photoId: id };
}

function readPhoto_(folder, photoId) {
  if (typeof photoId !== 'string' || !/^[0-9a-f\-]{8,64}$/.test(photoId)) return null;
  var photos = child_(folder, 'photos', false);
  if (!photos) return null;
  var it = photos.getFilesByName(photoId);
  if (!it.hasNext()) return null;
  var blob = it.next().getBlob();
  return { ok: true, data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
}

function getPhoto_(b) {
  var found = null;
  var name = studentOf_(b);
  if (name) {
    var folder = studentFolder_(name, false);
    if (folder) found = readPhoto_(folder, b.photoId);
  } else if (isAdmin_(b)) {
    var it = rootFolder_().getFolders();
    while (!found && it.hasNext()) found = readPhoto_(it.next(), b.photoId);
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

function adminLogin_(b) {
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw || typeof b.password !== 'string' || b.password !== pw) return fail_('AUTH', '관리자 비밀번호가 달라요.');
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
    if (folder.getName() === STICKER_FOLDER) continue;
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

function adminResetPin_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  if (!validPin_(b.pin)) return fail_('BAD_INPUT', '비밀번호는 숫자 4자리예요.');
  var folder = adminZineFolder_(b);
  var zine = folder ? readZine_(folder) : null;
  if (!zine) return fail_('NOT_FOUND', '그 학생을 찾을 수 없어요.');
  zine.auth = makeAuth_(b.pin);
  writeZine_(folder, zine);
  PropertiesService.getScriptProperties().deleteProperty('fail_' + folder.getName());
  return { ok: true };
}

function adminUnlock_(b) {
  if (!isAdmin_(b)) return AUTH_FAIL();
  var name = validName_(b.name);
  if (!name) return fail_('BAD_INPUT', '이름을 확인해 주세요.');
  PropertiesService.getScriptProperties().deleteProperty('fail_' + name);
  return { ok: true };
}
