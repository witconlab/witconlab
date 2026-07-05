/**
 * 청소년 혈당 변화 실험 웹앱 - Google Apps Script 백엔드
 *
 * 이 스크립트를 구글 스프레드시트에 바인딩된 Apps Script 프로젝트에 붙여넣고
 * "웹앱으로 배포"하면, index.html의 CONFIG.GAS_URL 에 넣을 수 있는 URL이 발급됩니다.
 *
 * 배포 설정:
 *   - 실행 계정: 나 (Me)
 *   - 액세스 권한: 전체 (Anyone) ← 로그인 없이 학생들이 접근해야 하므로 필수
 *
 * 모든 요청은 GET 방식(?action=read / ?action=write&data=... / ?action=clear&class=...)만
 * 사용합니다. Apps Script 웹앱은 POST 요청에 대해 브라우저 프리플라이트(OPTIONS) CORS를
 * 지원하지 않으므로, GET 쿼리스트링으로만 통신해 CORS 문제를 원천 차단합니다.
 *
 * 학생 한 명이 값을 입력할 때마다(모둠당 4명) 해당 (반, 모둠, 학생번호) 행을
 * 새로 추가하지 않고 덮어쓰는(upsert) 방식으로 동작합니다.
 */

const SHEET_NAME = '혈당데이터';
const HEADERS = ['반', '모둠', '학생', '공복(0분)', '30분후', '수정시간'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    if (action === 'write') return handleWrite_(e);
    if (action === 'clear') return handleClear_(e);
    return handleRead_();
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function handleRead_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue; // 빈 행 스킵
    rows.push({
      class: r[0],
      group: r[1],
      student: r[2],
      before: r[3] === '' ? '' : Number(r[3]),
      after: r[4] === '' ? '' : Number(r[4]),
      ts: r[5]
    });
  }
  return jsonOutput_({ ok: true, rows: rows });
}

function handleWrite_(e) {
  const raw = e.parameter.data;
  if (!raw) return jsonOutput_({ ok: false, error: 'no data' });

  let item;
  try {
    item = JSON.parse(raw);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'invalid json' });
  }

  const cls = String(item.class || '');
  const group = Number(item.group);
  const student = Number(item.student);
  if (!cls || !group || !student) {
    return jsonOutput_({ ok: false, error: 'missing class/group/student' });
  }
  const before = item.before === '' || item.before == null ? '' : Number(item.before);
  const after = item.after === '' || item.after == null ? '' : Number(item.after);

  const sheet = getSheet_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const timestamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1; // 1-based sheet row
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (String(r[0]) === cls && Number(r[1]) === group && Number(r[2]) === student) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    sheet.appendRow([cls, group, student, before, after, timestamp]);
  } else {
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([[cls, group, student, before, after, timestamp]]);
  }

  return jsonOutput_({ ok: true });
}

function handleClear_(e) {
  const cls = e.parameter['class'];
  if (!cls) return jsonOutput_({ ok: false, error: 'missing class' });

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const kept = [values[0]]; // 헤더 유지
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) !== cls) kept.push(values[i]);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }
  if (kept.length > 1) {
    sheet.getRange(2, 1, kept.length - 1, HEADERS.length).setValues(kept.slice(1));
  }

  return jsonOutput_({ ok: true });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
