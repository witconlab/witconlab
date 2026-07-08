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
const NUMBER_COL_START = 6; // '측정전' 열 (1-based)
const NUMBER_COL_COUNT = 3; // 측정전, 측정후, Δ변화

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  // 예전(더 넓은 컬럼 수) 스키마의 흔적이 오른쪽 열에 남아있으면 getDataRange()가
  // 실제보다 넓게 잡혀서 배열 길이가 안 맞는 문제가 생기므로, 헤더보다 오른쪽 열은
  // 통째로 비워서 항상 정확히 HEADERS.length 만큼만 사용되게 함
  const maxCol = sheet.getMaxColumns();
  if (maxCol > HEADERS.length) {
    sheet.getRange(1, HEADERS.length + 1, sheet.getMaxRows(), maxCol - HEADERS.length).clearContent();
  }
  // 예전 스키마에서 이 열들이 날짜/시간 서식으로 지정된 채 남아있으면, 이후 숫자를
  // 써도 날짜로 잘못 해석되는 문제가 생겨서 매번 일반 숫자 서식으로 고정해줌
  sheet.getRange(2, NUMBER_COL_START, Math.max(sheet.getMaxRows() - 1, 1), NUMBER_COL_COUNT).setNumberFormat('0.###');
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

function numOrEmpty_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return ''; // 셀 서식이 날짜로 잘못 지정되어 있던 경우에 대한 방어
  const n = Number(v);
  return isNaN(n) ? '' : n;
}

function handleRead_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    // 실험유형(반/항목 아님)으로 빈 행을 판별함 — 반/모둠/학생 없는 익명 운동
    // 제출(특히 '운동 안 함'처럼 항목명도 비어있는 경우)까지 실수로 걸러지지 않게 함
    if (!r[3]) continue;
    rows.push({
      class: r[0],
      group: r[1],
      student: r[2],
      type: r[3],
      item: r[4],
      before: numOrEmpty_(r[5]),
      after: numOrEmpty_(r[6]),
      delta: numOrEmpty_(r[7]),
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

  const type = String(item.type || '');
  if (!type) {
    return jsonOutput_({ ok: false, error: 'missing type' });
  }
  // 탭1(음식)은 반/모둠/학생이 필수이며 같은 자리를 덮어쓰는(upsert) 방식.
  // 탭2(운동)는 반/모둠 선택 없는 익명 제출이라 매번 새 행으로 추가함.
  const isFood = type === '음식';
  const cls = String(item.class || '');
  const group = item.group ? Number(item.group) : '';
  const student = item.student ? Number(item.student) : '';
  if (isFood && (!cls || !group || !student)) {
    return jsonOutput_({ ok: false, error: 'missing class/group/student' });
  }
  const before = item.before === '' || item.before == null ? '' : Number(item.before);
  const after = item.after === '' || item.after == null ? '' : Number(item.after);
  if (before === '' || after === '' || isNaN(before) || isNaN(after)) {
    return jsonOutput_({ ok: false, error: 'missing before/after' });
  }
  const delta = after - before;
  const label = item.item || '';

  const sheet = getSheet_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const timestamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

  let rowIndex = -1; // 1-based sheet row
  if (isFood) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (String(r[0]) === cls && Number(r[1]) === group && Number(r[2]) === student && String(r[3]) === type) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  const rowData = [cls, group, student, type, label, before, after, delta, timestamp];
  const targetRow = rowIndex === -1 ? sheet.getLastRow() + 1 : rowIndex;
  const range = sheet.getRange(targetRow, 1, 1, HEADERS.length);
  range.setNumberFormat('@'); // 우선 전체를 일반 텍스트로 리셋
  range.setValues([rowData]);
  sheet.getRange(targetRow, NUMBER_COL_START, 1, NUMBER_COL_COUNT).setNumberFormat('0.###'); // 숫자 열만 다시 숫자 서식으로

  return jsonOutput_({ ok: true });
}

function handleClear_(e) {
  const cls = e.parameter['class'];
  const type = e.parameter['type']; // 선택: '음식' 또는 '운동'. 없으면 해당 반 전체 삭제
  if (!cls) return jsonOutput_({ ok: false, error: 'missing class' });

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const kept = [values[0].slice(0, HEADERS.length)]; // 헤더 유지
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const matchClass = String(r[0]) === cls;
    const matchType = !type || String(r[3]) === type;
    if (matchClass && matchType) continue; // 삭제 대상은 제외하고 나머지만 유지
    kept.push(r.slice(0, HEADERS.length));
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

/**
 * 유지보수용 1회성 함수 (웹앱 API와는 무관, Apps Script 편집기에서 직접 실행)
 *
 * 지금 스키마(반·모둠·학생·실험유형·항목·측정전·측정후·Δ변화·수정시간)와 맞지 않거나
 * (예: 실험유형이 '음식'/'운동'이 아님), 날짜 서식 오염으로 측정값이 숫자가 아닌 행을
 * 찾아 삭제합니다. 실행 방법: Apps Script 편집기 상단 함수 선택 드롭다운에서
 * cleanupCorruptRows 선택 → ▷ 실행 → 권한 요청 시 승인.
 */
function cleanupCorruptRows() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const kept = [values[0].slice(0, HEADERS.length)];
  let removed = 0;
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0] && !r[4]) continue; // 완전히 빈 행은 건너뜀
    const type = r[3];
    const beforeOk = r[5] === '' || typeof r[5] === 'number';
    const afterOk = r[6] === '' || typeof r[6] === 'number';
    const valid = (type === '음식' || type === '운동') && beforeOk && afterOk;
    if (valid) {
      kept.push(r.slice(0, HEADERS.length));
    } else {
      removed++;
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }
  if (kept.length > 1) {
    sheet.getRange(2, 1, kept.length - 1, HEADERS.length).setValues(kept.slice(1));
  }
  sheet.getRange(2, NUMBER_COL_START, Math.max(sheet.getMaxRows() - 1, 1), NUMBER_COL_COUNT).setNumberFormat('0.###');

  Logger.log('삭제 ' + removed + '건, 유지 ' + (kept.length - 1) + '건');
  return '삭제 ' + removed + '건, 유지 ' + (kept.length - 1) + '건';
}
