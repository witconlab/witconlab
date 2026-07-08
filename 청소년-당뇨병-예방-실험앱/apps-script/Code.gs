/**
 * 우리 모둠의 혈당 변화 - 음식별 혈당 실험(탭1) + 운동 전후 혈당 실험(탭2) 백엔드
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
 * 학생 한 명이 값을 입력할 때마다 해당 (반, 모둠, 학생번호, 실험유형) 행을
 * 새로 추가하지 않고 덮어쓰는(upsert) 방식으로 동작합니다. 탭1(음식)과 탭2(운동)는
 * 실험유형 값('음식' / '운동')으로 구분되는 서로 독립적인 실험입니다.
 */

const SHEET_NAME = '혈당데이터';
const HEADERS = ['반', '모둠', '학생', '실험유형', '항목', '측정전', '측정후', 'Δ변화', '수정시간'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
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
    if (!r[0] && !r[4]) continue; // 빈 행 스킵
    rows.push({
      class: r[0],
      group: r[1],
      student: r[2],
      type: r[3],
      item: r[4],
      before: r[5] === '' ? '' : Number(r[5]),
      after: r[6] === '' ? '' : Number(r[6]),
      delta: r[7] === '' ? '' : Number(r[7]),
      ts: r[8]
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
  const type = String(item.type || '');
  if (!cls || !group || !student || !type) {
    return jsonOutput_({ ok: false, error: 'missing class/group/student/type' });
  }
  const before = item.before === '' || item.before == null ? '' : Number(item.before);
  const after = item.after === '' || item.after == null ? '' : Number(item.after);
  const delta = (before === '' || after === '') ? '' : (after - before);
  const label = item.item || '';

  const sheet = getSheet_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const timestamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1; // 1-based sheet row
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (String(r[0]) === cls && Number(r[1]) === group && Number(r[2]) === student && String(r[3]) === type) {
      rowIndex = i + 1;
      break;
    }
  }

  const rowData = [cls, group, student, type, label, before, after, delta, timestamp];
  if (rowIndex === -1) {
    sheet.appendRow(rowData);
  } else {
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowData]);
  }

  return jsonOutput_({ ok: true });
}

function handleClear_(e) {
  const cls = e.parameter['class'];
  const type = e.parameter['type']; // 선택: '음식' 또는 '운동'. 없으면 해당 반 전체 삭제
  if (!cls) return jsonOutput_({ ok: false, error: 'missing class' });

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const kept = [values[0]]; // 헤더 유지
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const matchClass = String(r[0]) === cls;
    const matchType = !type || String(r[3]) === type;
    if (matchClass && matchType) continue; // 삭제 대상은 제외하고 나머지만 유지
    kept.push(r);
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
