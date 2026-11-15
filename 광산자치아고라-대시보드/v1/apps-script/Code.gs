/**
 * 2026 광산자치아고라 · AI 공론장 대시보드 백엔드 (Google Apps Script)
 *
 * 이 스크립트는 "관제 스프레드시트"에 붙여서(확장 프로그램 → Apps Script) 사용합니다.
 *  - tables  시트 : 12개 테이블 설정(분야·동·대상공간·기록 Docs 링크)
 *  - summary 시트 : AI 요약 결과(관제반이 셀을 직접 고쳐 검수)
 *  - manual  시트 : 관제반 수동 푸시 발언
 *  - votes   시트 : 행사 후 exportVotes() 를 실행하면 투표 결과가 기록됨 (투표 중에는 스크립트 속성에 저장)
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)
 *  - ADMIN_KEY      : 관제 패널 비밀번호(필수)
 *  - GEMINI_API_KEY : Gemini API 키(AI 요약용)
 *  - GEMINI_MODEL   : 선택, 기본 gemini-3.8-flash
 *  - GEMINI_FALLBACK: 선택, 첫 모델이 붐비거나 없을 때 차례로 시도할 모델(쉼표). 기본 gemini-3.5-flash,gemini-flash-latest
 *
 * 처음 한 번 setup() 을 실행하면 시트와 12개 기록 Docs(양식 포함)가 만들어집니다.
 */

var SHEETS = { tables: 'tables', summary: 'summary', manual: 'manual', votes: 'votes' };

var CATS = {
  river:  '하천·수변공간',
  park:   '공원·정원·쉼터',
  road:   '산책길·둘레길·골목길',
  common: '공동공간 활용활동'
};

var DEFAULT_TABLES = [
  [1,  'river',  '도산·임곡',          '황룡강 제방길·산막동 구간'],
  [2,  'river',  '수완·동곡·본량',      '풍영정천·평동천·석계마을 천변길'],
  [3,  'park',   '송정2·우산·월곡1·월곡2', '생활권 쉼터·한빛동산·영천마을 근린공원'],
  [4,  'park',   '하남·첨단1·첨단2',    '경암근린공원·아미둘레길 유휴공간·무양공원'],
  [5,  'park',   '신가·신창·삼도',      '초록어린이공원·역사문화공원·오운제 꽃동산'],
  [6,  'road',   '송정1·도산',          '광산로67번길 골목·송정초~미르채 골목'],
  [7,  'road',   '신흥·어룡·월곡1',      '골목 방개산 산책로·어등산 등산로·월곡중 담장'],
  [8,  'road',   '운남·하남·수완',       '완충녹지 금구육교·지실마을·데크길 둘레길'],
  [9,  'road',   '신가·신창·비아',       '사거리 보행로·신창 이야기길·비아 먹자골목'],
  [10, 'common', '첨단1·운남·신가',      '아미둘레길·운남근린공원·신가2근린공원'],
  [11, 'common', '도산·수완·송정1',      '도루메어린이공원·원당산공원·문화예술회관 야외무대'],
  [12, 'common', '비아·동곡·신창',       '담은정·호가정·수완동 유휴부지']
];

var DOC_TEMPLATE = [
  '※ 이 줄처럼 ※ 로 시작하는 줄은 화면에 나가지 않아요.',
  '※ 한 줄 = 발언 하나. 줄 맨 앞에 [태그]를 붙이면 화면에서 색으로 구분돼요.',
  '※ 태그: [경험] [불편] [자원] [아이디어] [실천] [협력]  /  "도산:" 처럼 동 이름을 앞에 쓰면 동이 함께 표시돼요.',
  '※ 태그를 생략하면 바로 위에 쓴 태그를 이어서 사용합니다.',
  '',
  '[경험] 도산: (예시) 저녁마다 제방길을 걷는데 가로등이 드문드문해서 무서워요',
  ''
];

// ─────────────────────────── 라우팅 ───────────────────────────

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'config':  return json_({ tables: readTables_() });
      case 'feed':    return json_(feed_());
      case 'state':   return json_({ state: readState_() });
      case 'summary': return json_(readSummary_());
      case 'votes':   return json_(readVotes_());
      case 'all':     return json_(all_());
      default:        return json_({ ok: true, name: '광산자치아고라 API' });
    }
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ error: 'bad json' }); }
  try {
    if (body.action === 'vote') return json_(vote_(body));
    if (body.key !== prop_('ADMIN_KEY')) return json_({ error: '관제 비밀번호가 맞지 않아요.' });
    switch (body.action) {
      case 'setState':    return json_({ state: writeState_(body.state) });
      case 'push':        return json_(pushManual_(body));
      case 'summarize':   return json_(startSummarizeJob_());
      case 'saveSummary': return json_(saveSummary_(body.tables));
      case 'resetVotes':  return json_(resetVotes_());
      default:            return json_({ error: 'unknown action' });
    }
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// 대시보드가 2~3초마다 부르는 묶음 응답(상태·투표). 피드는 캐시가 있어 따로 부름.
function all_() {
  return { state: readState_(), votes: readVotes_() };
}

// ─────────────────────────── 테이블 설정 ───────────────────────────

function readTables_() {
  var rows = sheet_(SHEETS.tables).getDataRange().getValues().slice(1);
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return {
      no: Number(r[0]), cat: String(r[1]), dongs: String(r[2]), space: String(r[3]),
      docId: docId_(String(r[4])), facilitator: String(r[5] || '')
    };
  });
}

function docId_(url) {
  // .../document/d/ID/edit 와 .../open?id=ID 두 형식 모두 지원
  var m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : url.trim();
}

// ─────────────────────────── 실시간 피드 ───────────────────────────

/** 12개 Docs를 병렬로 텍스트 내보내기 → 4초 캐시. 파싱은 브라우저가 합니다. */
function feed_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('feed');
  if (hit) return JSON.parse(hit);

  var tables = readTables_();
  var token = ScriptApp.getOAuthToken();
  var withDoc = tables.filter(function (t) { return t.docId; });
  var reqs = withDoc.map(function (t) {
    return {
      url: 'https://www.googleapis.com/drive/v3/files/' + t.docId + '/export?mimeType=text/plain',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    };
  });
  var res = reqs.length ? UrlFetchApp.fetchAll(reqs) : [];
  var docs = {};
  withDoc.forEach(function (t, i) {
    var ok = res[i].getResponseCode() === 200;
    docs[t.no] = { ok: ok, text: ok ? res[i].getContentText('UTF-8') : '' };
  });
  tables.forEach(function (t) { if (!docs[t.no]) docs[t.no] = { ok: false, text: '' }; });

  var out = { docs: docs, manual: readManual_(), ts: Date.now() };
  try { cache.put('feed', JSON.stringify(out), 4); } catch (err) { /* 100KB 초과 시 캐시 생략 */ }
  return out;
}

function readManual_() {
  var rows = sheet_(SHEETS.manual).getDataRange().getValues().slice(1);
  return rows.filter(function (r) { return r[1]; }).map(function (r) {
    return { time: new Date(r[0]).getTime(), table: Number(r[1]), type: String(r[2]), dong: String(r[3]), text: String(r[4]) };
  });
}

function pushManual_(b) {
  sheet_(SHEETS.manual).appendRow([new Date(), b.table, b.type || 'exp', b.dong || '', b.text]);
  CacheService.getScriptCache().remove('feed');
  return { ok: true };
}

// ─────────────────────────── 화면 상태 ───────────────────────────

function readState_() {
  var s = prop_('STATE');
  return s ? JSON.parse(s) : null;
}

function writeState_(state) {
  state.updated = Date.now();
  PropertiesService.getScriptProperties().setProperty('STATE', JSON.stringify(state));
  return state;
}

// ─────────────────────────── AI 요약 ───────────────────────────

function readSummary_() {
  var rows = sheet_(SHEETS.summary).getDataRange().getValues().slice(1);
  var tables = {};
  rows.forEach(function (r) {
    if (!r[0]) return;
    tables[r[0]] = {
      summary: String(r[1] || ''),
      actions: [r[2], r[3]].filter(String).map(String),
      admin: String(r[4] || ''),
      keywords: String(r[5] || '').split(',').map(function (s) { return s.trim(); }).filter(String)
    };
  });
  return {
    tables: tables, at: prop_('SUMMARY_AT') ? Number(prop_('SUMMARY_AT')) : 0, source: prop_('SUMMARY_SRC') || '',
    job: prop_('SUMMARY_JOB') ? JSON.parse(prop_('SUMMARY_JOB')) : null
  };
}

function saveSummary_(tables) {
  var sh = sheet_(SHEETS.summary);
  sh.clearContents();
  sh.appendRow(['번호', '논의 요약', '주민 실천과제 1', '주민 실천과제 2', '행정 협력 요청', '키워드(쉼표)']);
  Object.keys(tables).sort(function (a, b) { return a - b; }).forEach(function (no) {
    var t = tables[no];
    sh.appendRow([Number(no), t.summary, t.actions[0] || '', t.actions[1] || '', t.admin, (t.keywords || []).join(', ')]);
  });
  PropertiesService.getScriptProperties().setProperties({ SUMMARY_AT: String(Date.now()) });
  return readSummary_();
}

function summarize_() {
  var key = prop_('GEMINI_API_KEY');
  if (!key) throw new Error('스크립트 속성에 GEMINI_API_KEY 가 없어요.');
  var models = [prop_('GEMINI_MODEL') || 'gemini-3.8-flash']
    .concat((prop_('GEMINI_FALLBACK') || 'gemini-3.5-flash,gemini-flash-latest').split(','))
    .map(function (m) { return m.trim(); })
    .filter(function (m, i, a) { return m && a.indexOf(m) === i; });
  CacheService.getScriptCache().remove('feed');
  var feed = feed_();
  var tables = readTables_();

  var corpus = tables.map(function (t) {
    var manual = feed.manual.filter(function (m) { return m.table === t.no; })
      .map(function (m) { return '[' + m.type + '] ' + (m.dong ? m.dong + ': ' : '') + m.text; });
    var text = (feed.docs[t.no] ? feed.docs[t.no].text : '')
      .split('\n').filter(function (l) { return l.trim() && !/^\s*※/.test(l); }).join('\n');
    return '### 테이블 ' + t.no + ' (' + CATS[t.cat] + ' / ' + t.dongs + ' / ' + t.space + ')\n' + text + '\n' + manual.join('\n');
  }).join('\n\n');

  var prompt = [
    '당신은 광산구 주민공론장(광산자치아고라)의 기록 정리를 돕는 퍼실리테이터입니다.',
    '아래는 12개 테이블 기록자가 실시간으로 받아 적은 토론 기록입니다.',
    '각 테이블마다 다음을 한국어로 정리하세요. 주민이 쓴 표현과 지명을 최대한 살리고, 없는 내용을 지어내지 마세요.',
    '- summary: 논의 핵심 2문장 이내',
    '- actions: 주민이 스스로 함께 실천할 과제 1~2개. 각 30자 이내, "~하기" 형태의 행동 문장',
    '- admin: 행정(구청·동 행정복지센터·관련 부서)에 요청할 협력사항 1개. 40자 이내',
    '- keywords: 핵심 키워드 3~5개',
    '기록이 거의 없는 테이블은 summary 를 "기록 대기 중" 으로, 나머지는 빈 값으로 두세요.',
    '',
    corpus
  ].join('\n');

  var schema = {
    type: 'OBJECT',
    properties: {
      tables: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            no: { type: 'INTEGER' },
            summary: { type: 'STRING' },
            actions: { type: 'ARRAY', items: { type: 'STRING' } },
            admin: { type: 'STRING' },
            keywords: { type: 'ARRAY', items: { type: 'STRING' } }
          },
          required: ['no', 'summary', 'actions', 'admin', 'keywords']
        }
      }
    },
    required: ['tables']
  };

  var payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema }
  });
  var r = callGemini_(key, models, payload);
  var parsed = r.parsed;

  var out = {};
  parsed.tables.forEach(function (t) {
    out[t.no] = { summary: t.summary, actions: (t.actions || []).slice(0, 2), admin: t.admin, keywords: t.keywords || [] };
  });
  PropertiesService.getScriptProperties().setProperty('SUMMARY_SRC', 'gemini:' + r.model);
  return saveSummary_(out);
}

/**
 * 모델을 차례로 시도합니다. 붐빔(429·500·503)은 같은 모델로 잠시 뒤 한 번 더,
 * 없는 모델(404)이나 계속 붐비면 다음 모델로 넘어갑니다.
 */
function callGemini_(key, models, payload) {
  var errors = [];
  var started = Date.now();
  for (var i = 0; i < models.length; i++) {
    for (var attempt = 0; attempt < 2; attempt++) {
      // 6분 실행 제한 안에서 끝나도록, 3분이 지났으면 새 요청을 시작하지 않음
      if (Date.now() - started > 180000) { errors.push('시간 초과'); i = models.length; break; }
      if (attempt) Utilities.sleep(3000);
      var t0 = Date.now();
      var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', {
        method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
        muteHttpExceptions: true, payload: payload
      });
      var code = res.getResponseCode();
      console.log('Gemini ' + models[i] + ' → ' + code + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + '초');
      if (code === 200) {
        var data = JSON.parse(res.getContentText());
        var text = data.candidates[0].content.parts
          .filter(function (p) { return p.text && !p.thought; })
          .map(function (p) { return p.text; }).join('');
        return { model: models[i], parsed: JSON.parse(text) };
      }
      errors.push(models[i] + ' ' + code);
      if ([429, 500, 503].indexOf(code) < 0) break;
    }
  }
  throw new Error('Gemini 요약 실패 (' + errors.join(', ') + '). 잠시 뒤 다시 실행하거나 [실천]/[협력] 태그로 정리하세요.');
}

/**
 * AI 요약은 Gemini가 붐비면 몇 분 걸릴 수 있어 웹 요청 안에서 기다리지 않고,
 * 1초 뒤 실행되는 일회용 트리거로 뒤에서 돌립니다. 진행 상황은 SUMMARY_JOB 에 기록되고
 * 관제 패널이 summary 를 다시 읽어 확인합니다.
 */
function startSummarizeJob_() {
  var job = prop_('SUMMARY_JOB') ? JSON.parse(prop_('SUMMARY_JOB')) : null;
  if (job && job.status === 'running' && Date.now() - job.started < 7 * 60000) return { job: job };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSummarizeJob') ScriptApp.deleteTrigger(t);
  });
  job = { status: 'running', started: Date.now() };
  PropertiesService.getScriptProperties().setProperty('SUMMARY_JOB', JSON.stringify(job));
  ScriptApp.newTrigger('runSummarizeJob').timeBased().after(1000).create();
  return { job: job };
}

/** 트리거가 실행하는 함수(직접 실행하지 않아도 됨) */
function runSummarizeJob() {
  var sp = PropertiesService.getScriptProperties();
  var job = { started: Date.now() };
  try {
    summarize_();
    job.status = 'done';
    job.model = (prop_('SUMMARY_SRC') || '').replace('gemini:', '');
  } catch (e) {
    job.status = 'failed';
    job.error = e.message;
  }
  job.finished = Date.now();
  sp.setProperty('SUMMARY_JOB', JSON.stringify(job));
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSummarizeJob') ScriptApp.deleteTrigger(t);
  });
}

/** 편집기에서 실행: API 키·모델 확인용 */
function testGemini() {
  var key = prop_('GEMINI_API_KEY');
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  Logger.log('응답 코드: ' + res.getResponseCode());
  var body = JSON.parse(res.getContentText());
  if (body.error) { Logger.log('오류: ' + body.error.message); return; }
  Logger.log('쓸 수 있는 flash 모델: ' + body.models.map(function (m) { return m.name.replace('models/', ''); })
    .filter(function (n) { return /flash/.test(n); }).join(', '));
}

/** 편집기에서 실행: 지금 기록으로 AI 요약을 돌려 보고 결과를 summary 시트에 저장 */
function testSummarize() {
  try {
    var r = summarize_();
    Logger.log('성공(' + prop_('SUMMARY_SRC') + '): ' + JSON.stringify(r.tables[1]));
  } catch (e) {
    Logger.log('실패: ' + e.message);
  }
}

// ─────────────────────────── 투표 ───────────────────────────
// 150명이 거의 동시에 누르므로 잠금·시트 쓰기 없이 기기별 스크립트 속성 한 칸에 덮어씁니다.
// (같은 기기가 다시 투표하면 같은 칸이 바뀌므로 잠금이 필요 없음) 시트 기록은 exportVotes() 로.

var VOTE_PREFIX = 'v_';

function vote_(b) {
  var state = readState_() || {};
  if (!state.voteOpen) return { error: '지금은 투표 시간이 아니에요.' };
  var valid = (state.candidates || []).map(function (c) { return c.id; });
  var picks = (b.picks || []).filter(function (id) { return valid.indexOf(id) >= 0; }).slice(0, state.votePicks || 3);
  var device = String(b.device || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!device || !picks.length) return { error: '선택한 항목이 없어요.' };
  PropertiesService.getScriptProperties().setProperty(VOTE_PREFIX + device, picks.join(','));
  return { ok: true, picks: picks };
}

function readVotes_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var ballots = {};
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(VOTE_PREFIX) === 0) ballots[k.slice(VOTE_PREFIX.length)] = props[k].split(',').filter(String);
  });
  return { ballots: ballots };
}

function resetVotes_() {
  var sp = PropertiesService.getScriptProperties();
  Object.keys(sp.getProperties()).forEach(function (k) { if (k.indexOf(VOTE_PREFIX) === 0) sp.deleteProperty(k); });
  var sh = sheet_(SHEETS.votes);
  sh.clearContents();
  sh.appendRow(['기기', '선택']);
  return { ok: true };
}

/** 행사 후 실행: 투표 결과를 votes 시트에 기록(기기별 선택 + 후보별 득표) */
function exportVotes() {
  var ballots = readVotes_().ballots;
  var sh = sheet_(SHEETS.votes);
  sh.clearContents();
  sh.appendRow(['기기', '선택']);
  Object.keys(ballots).forEach(function (d) { sh.appendRow([d, ballots[d].join(',')]); });
  var counts = {};
  Object.keys(ballots).forEach(function (d) { ballots[d].forEach(function (id) { counts[id] = (counts[id] || 0) + 1; }); });
  var cands = ((readState_() || {}).candidates) || [];
  sh.appendRow([]);
  sh.appendRow(['후보', '테이블', '실천과제', '득표']);
  cands.map(function (c) { return [c.id, c.table, c.text, counts[c.id] || 0]; })
    .sort(function (x, y) { return y[3] - x[3]; })
    .forEach(function (r) { sh.appendRow(r); });
}

// ─────────────────────────── 최초 설정 ───────────────────────────

/** 처음 한 번 실행: 시트 4개 + 12개 기록용 Google Docs(양식 포함) 생성 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parent = DriveApp.getFileById(ss.getId()).getParents();
  var folder = parent.hasNext() ? parent.next() : DriveApp.getRootFolder();
  var docsFolder = folder.createFolder('광산자치아고라 테이블 기록');

  var tables = sheet_(SHEETS.tables);
  tables.clearContents();
  tables.appendRow(['번호', '분야(river/park/road/common)', '참여 동', '대상 공간', '기록 Docs 링크', '퍼실리테이터']);
  DEFAULT_TABLES.forEach(function (t) {
    var doc = DocumentApp.create('[광산자치아고라] 테이블 ' + t[0] + ' 기록 · ' + CATS[t[1]]);
    var body = doc.getBody();
    body.clear();
    body.appendParagraph('테이블 ' + t[0] + ' · ' + CATS[t[1]] + ' · ' + t[2]).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    DOC_TEMPLATE.forEach(function (line) { body.appendParagraph(line); });
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(docsFolder);
    tables.appendRow([t[0], t[1], t[2], t[3], 'https://docs.google.com/document/d/' + doc.getId() + '/edit', '']);
  });

  sheet_(SHEETS.summary).clearContents().appendRow(['번호', '논의 요약', '주민 실천과제 1', '주민 실천과제 2', '행정 협력 요청', '키워드(쉼표)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '유형', '동', '내용']);
  resetVotes_();
  if (!prop_('ADMIN_KEY')) PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', 'agora2026');
  SpreadsheetApp.getUi().alert('완료! tables 시트에서 12개 Docs 링크를 확인하고, 기록자에게 각 링크를 "편집 가능"으로 공유해 주세요.\n관제 비밀번호 기본값: agora2026 (스크립트 속성 ADMIN_KEY 에서 변경)');
}

/** 행사 직전 리허설 기록을 지울 때 실행: 12개 Docs를 양식만 남기고 비움 + 요약·수동·투표 초기화 */
function resetForEvent() {
  readTables_().forEach(function (t) {
    if (!t.docId) return;
    var doc = DocumentApp.openById(t.docId);
    var body = doc.getBody();
    body.clear();
    body.appendParagraph('테이블 ' + t.no + ' · ' + CATS[t.cat] + ' · ' + t.dongs).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    DOC_TEMPLATE.slice(0, 4).forEach(function (line) { body.appendParagraph(line); });
    body.appendParagraph('');
    doc.saveAndClose();
  });
  sheet_(SHEETS.summary).clearContents().appendRow(['번호', '논의 요약', '주민 실천과제 1', '주민 실천과제 2', '행정 협력 요청', '키워드(쉼표)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '유형', '동', '내용']);
  resetVotes_();
  PropertiesService.getScriptProperties().deleteProperty('STATE');
  CacheService.getScriptCache().remove('feed');
}
