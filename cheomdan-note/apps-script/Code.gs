/**
 * 우리 동네 기록 노트 저장소 (Google Apps Script 웹 앱, 구글 시트에 붙여 씀)
 * 시트 3개: people · tables · staff. 한 줄 = 한 사람(테이블, 작성자). 같은 id로 다시 저장하면 그 줄을 고친다.
 * 열: id | 저장 시각 | 이름·테이블·작성자 | 내용(JSON)
 * 배포: 배포 > 새 배포 > 웹 앱, 실행 계정 "나", 액세스 "모든 사용자".
 */
var SHEET_ID = '1aORW62T9rslCllr4FSUI0yfMmt_NI3G_qMfVdfMB_Bk'; // 우리 동네 기록 노트 시트
var COLS = { people: 'name', tables: 'table', staff: 'writer' };
var MAX_JSON = 20000;   // 한 줄 내용 최대 글자 수
var MAX_ROWS = 2000;    // 시트 하나 최대 줄 수 (장난 저장 막기)

function doPost(e) {
  var res;
  try {
    var b = JSON.parse(e.postData.contents);
    res = save_(b || {});
  } catch (err) {
    console.error(err);
    res = { ok: false, error: 'server' };
  }
  return out_(res);
}

function doGet() {
  var all = {};
  Object.keys(COLS).forEach(function (c) { all[c] = rows_(c); });
  return out_({ ok: true, data: all });
}

function save_(b) {
  if (!COLS.hasOwnProperty(b.col)) return { ok: false, error: 'bad_col' };
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(b.id || ''))) return { ok: false, error: 'bad_id' };
  var d = clean_(b.data);
  if (!d) return { ok: false, error: 'bad_data' };
  d.updatedAt = new Date().toISOString();
  var json = JSON.stringify(d);
  if (json.length > MAX_JSON) return { ok: false, error: 'too_long' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_(b.col);
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    var row = -1;
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === b.id) { row = i + 2; break; }
    if (row < 0) {
      if (last - 1 >= MAX_ROWS) return { ok: false, error: 'full' };
      row = last + 1;
    }
    // 앞에 ' 를 붙여 수식으로 읽히지 않게
    sh.getRange(row, 1, 1, 4).setValues([["'" + b.id, d.updatedAt, "'" + String(d[COLS[b.col]] || ''), "'" + json]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, updatedAt: d.updatedAt };
}

// 글자·참거짓 값만, 키 이름은 영문·숫자만 남긴다
function clean_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  var o = {}, n = 0;
  for (var k in data) {
    if (!data.hasOwnProperty(k) || !/^[A-Za-z0-9_]{1,30}$/.test(k)) continue;
    var v = data[k];
    if (typeof v === 'string') o[k] = v.slice(0, 2000);
    else if (typeof v === 'boolean') o[k] = v;
    else continue;
    if (++n > 120) break;
  }
  return o;
}

function rows_(c) {
  var sh = sheet_(c), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 4).getValues().map(function (r) {
    var d = {};
    try { d = JSON.parse(String(r[3])); } catch (err) { d = {}; }
    return { id: String(r[0]), data: d };
  });
}

function sheet_(c) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(c);
  if (!sh) {
    sh = ss.insertSheet(c);
    sh.getRange(1, 1, 1, 4).setValues([['id', '저장 시각', '이름·테이블·작성자', '내용(JSON)']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
