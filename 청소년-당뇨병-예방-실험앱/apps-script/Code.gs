/**
 * 청소년 2형 당뇨 예방 - 음식 및 운동 혈당 실험 웹앱 - Google Apps Script 백엔드
 *
 * 이 스크립트를 구글 스프레드시트에 바인딩된 Apps Script 프로젝트에 붙여넣고
 * "웹앱으로 배포"하면, index.html의 CONFIG.GAS_URL 에 넣을 수 있는 URL이 발급됩니다.
 *
 * 배포 설정:
 *   - 실행 계정: 나 (Me)
 *   - 액세스 권한: 전체 (Anyone) ← 로그인 없이 학생들이 접근해야 하므로 필수
 *
 * 모든 요청은 GET 방식(?action=read / ?action=write&data=...)만 사용합니다.
 * Apps Script 웹앱은 POST 요청에 대해 브라우저 프리플라이트(OPTIONS) CORS를
 * 지원하지 않으므로, GET 쿼리스트링으로만 통신해 CORS 문제를 원천 차단합니다.
 */

const SHEET_NAME = '혈당데이터';
const HEADERS = ['제출시간', '반', '모둠', '실험유형', '음식', '운동여부', '운동종류', '식전', '식후30분', 'Δ혈당'];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  // 헤더 행을 항상 현재 스키마로 맞춰줌 (이전 버전 스키마가 남아있어도 자동 정리)
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    if (action === 'write') return handleWrite_(e);
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
    if (!r[1] && !r[4]) continue; // 빈 행 스킵
    rows.push({
      ts: r[0],
      class: r[1],
      group: r[2],
      type: r[3],
      food: r[4],
      exercised: r[5],
      exerciseType: r[6],
      before: r[7] === '' ? '' : Number(r[7]),
      after: r[8] === '' ? '' : Number(r[8]),
      delta: r[9] === '' ? '' : Number(r[9])
    });
  }
  return jsonOutput_({ ok: true, rows: rows });
}

function handleWrite_(e) {
  const raw = e.parameter.data;
  if (!raw) return jsonOutput_({ ok: false, error: 'no data' });

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'invalid json' });
  }
  const items = Array.isArray(payload) ? payload : [payload];

  const sheet = getSheet_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const timestamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');

  items.forEach(function (item) {
    const before = Number(item.before);
    const after = Number(item.after);
    if (isNaN(before) || isNaN(after)) return;
    const delta = after - before;
    sheet.appendRow([
      timestamp,
      item.class || '',
      item.group || '',
      item.type || '',
      item.food || '',
      item.exercised || '',
      item.exerciseType || '',
      before,
      after,
      delta
    ]);
  });

  return jsonOutput_({ ok: true, count: items.length });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 유지보수용 1회성 함수 (웹앱 API와는 무관, Apps Script 편집기에서 직접 실행)
 *
 * 이전 스키마(반·모둠·학생·공복·30분후·수정시간, 6열)로 저장된 행들은 지금의
 * 10열 헤더(제출시간·반·모둠·실험유형·음식·운동여부·운동종류·식전·식후30분·Δ혈당)
 * 밑에서 컬럼이 밀려 보입니다. 이 함수는 '실험유형' 칸이 '음식'/'운동'이 아닌
 * (=이전 스키마로 추정되는) 행만 골라 '이전버전_보관' 탭으로 옮기고, 원본
 * 시트에는 정상 스키마 행만 남깁니다.
 *
 * 실행 방법: Apps Script 편집기 상단 함수 선택 드롭다운에서 archiveOldRows
 * 선택 → ▷ 실행 → 권한 요청 시 승인. 완료 후 스프레드시트를 열어 확인하세요.
 */
function archiveOldRows() {
  const sheet = getSheet_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ARCHIVE_NAME = '이전버전_보관';
  let archive = ss.getSheetByName(ARCHIVE_NAME);
  if (!archive) {
    archive = ss.insertSheet(ARCHIVE_NAME);
    archive.appendRow(['반', '모둠', '학생', '공복(0분)', '30분후', '수정시간']);
  }

  const values = sheet.getDataRange().getValues();
  const keepRows = [];
  const archiveRows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[1] && !r[4]) continue; // 완전히 빈 행은 건너뜀
    const type = r[3];
    if (type !== '음식' && type !== '운동') {
      archiveRows.push([r[0], r[1], r[2], r[3], r[4], r[5]]);
    } else {
      keepRows.push(r);
    }
  }

  if (archiveRows.length > 0) {
    archive.getRange(archive.getLastRow() + 1, 1, archiveRows.length, 6).setValues(archiveRows);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }
  if (keepRows.length > 0) {
    sheet.getRange(2, 1, keepRows.length, HEADERS.length).setValues(keepRows);
  }

  Logger.log('보관 ' + archiveRows.length + '건, 유지 ' + keepRows.length + '건');
  return '보관 ' + archiveRows.length + '건, 유지 ' + keepRows.length + '건';
}
