/**
 * 새나가온 책상자 체험단 신청 → 구글 시트 저장
 *
 * 1. 운영용 구글 시트에서 [확장 프로그램 > Apps Script]를 열고 이 코드를 붙여 넣어요.
 * 2. [배포 > 새 배포 > 유형: 웹 앱]
 *    - 실행 사용자: 나
 *    - 액세스 권한: 모든 사용자
 * 3. 발급된 웹 앱 주소(https://script.google.com/macros/s/.../exec)를
 *    js/config.js 의 APPLY_ENDPOINT 에 붙여 넣어요.
 */
const SHEET_NAME = '책상자신청';
const COLUMNS = [
  ['submittedAt', '신청 일시'],
  ['typeLabel', '유형'],
  ['org', '기관·단체'],
  ['name', '이름'],
  ['phone', '연락처'],
  ['email', '이메일'],
  ['area', '동네/위치'],
  ['kids', '자녀 연령대'],
  ['receive', '수령 방법'],
  ['headcount', '예상 인원'],
  ['orgTarget', '대상 연령'],
  ['when', '희망 일정'],
  ['message', '신청 동기'],
  ['agreePrivacy', '개인정보 동의'],
  ['agreeStory', '후기 활용 동의'],
  ['status', '진행 상태']
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(COLUMNS.map(c => c[1]));
      sheet.setFrozenRows(1);
    }
    const p = e.parameter || {};
    // 시트 수식으로 해석되지 않도록 = + - @ 로 시작하는 값 앞에 ' 를 붙여요
    const safe = v => /^[=+\-@]/.test(v) ? "'" + v : v;
    sheet.appendRow(COLUMNS.map(([key]) => key === 'status' ? '접수' : safe(String(p[key] || '').slice(0, 2000))));
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
