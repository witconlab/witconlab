/**
 * 2026 광산자치아고라 · AI 공론장 대시보드 백엔드 V2 (Google Apps Script)
 *
 * V2: 진행흐름도(①~⑦) 기준. 기록자는 Google 문서의 "표"에 답을 씁니다.
 *  - tables  시트 : 13개 테이블 설정(주제·동·대상공간·기록 Docs 링크)
 *  - summary 시트 : AI가 다듬은 의제 제안서·주제별 요약(JSON 한 칸씩, 관제 패널에서 검수)
 *  - manual  시트 : 관제반 수동 푸시
 *  - likes   시트 : 행사 후 exportLikes() 를 실행하면 공감 결과가 기록됨
 *
 * 스크립트 속성: ADMIN_KEY(필수), GEMINI_API_KEY, GEMINI_MODEL(선택), GEMINI_FALLBACK(선택)
 *
 * 왼쪽 「서비스 +」에서 Google Docs API 를 추가해 두세요(단계별 탭 문서를 만드는 데 씀).
 * V1에서 올릴 때: 이 파일로 교체 → 새 버전 배포 → 편집기에서 applyTemplateV2() 한 번 실행
 *  (13개 문서가 표 양식으로 바뀌고, tables 시트 B열이 주제로 바뀝니다. 문서 안 기존 기록은 지워집니다)
 */

var SHEETS = { tables: 'tables', summary: 'summary', manual: 'manual', likes: 'likes' };
var REREAD_MS = 20000;  // 수정 시각이 그대로여도 이만큼 지난 문서는 차례로 다시 읽음

// 4개 주제 · 13개 테이블 (assets/app.js 의 TOPICS 와 같게 유지)
var TOPICS = { river: '강', mount: '산', stream: '하천', park: '공원' };
var PLACES = { river: '황룡강', mount: '어등산·말미산', stream: '풍영정천·장수천', park: '신촌근린공원·대상공원' };
var TOPIC_ORDER = ['river', 'mount', 'stream', 'park'];
var TABLE_COUNT = 13;
// 기본 배정(현장 배치도): 1–4 강, 5–7 산, 8–11 하천, 12–13 공원 (시트 B열에서 바꿀 수 있음)
function defaultTopic_(no) { no = Number(no); return no <= 4 ? 'river' : no <= 7 ? 'mount' : no <= 11 ? 'stream' : 'park'; }
function topicLabel_(k) { return TOPICS[k] ? TOPICS[k] + '(' + PLACES[k] + ')' : k; }
// ② 탭의 주제별 보조질문과 예시 (사전학습자료 「공간별 물음과 제안 예시」)
var TOPIC_HINT = {
  river:  { q: '우리 동네와 황룡강을 어떻게 연결하면 좋을까요? 생태길30을 이용하는 동과 함께 해볼 일은 무엇인가요?',
    us: ['함께 걷기·길 살피기', '동마다 구간을 나눠 함께 걷고 산책로 살피기'], ext: ['연결길 안내표지 정비', '산책로가 끊긴 구간·진입로에 안내표지를 달아 주세요'] },
  mount:  { q: '많은 사람이 안전하게 걷고 서로 배려하려면 무엇이 필요할까요? 산책로 정비 이후 두 동이 함께 돌볼 일은 무엇인가요?',
    us: ['산행 배려 캠페인', '두 동 주민이 함께 걷는 날을 정해 숲길을 함께 돌보기'], ext: ['위험구간 안전시설 보완', '미끄러운 계단·위험 구간의 안전시설을 보완해 주세요'] },
  stream: { q: '매일 걷는 하천이 더 쾌적하고 편안해지려면 무엇이 필요할까요?',
    us: ['하천 정화·오염 살피기', '동별 구간을 정해 한 달에 한 번 함께 치우고 사진으로 남기기'], ext: ['오염 원인 점검', '기름띠·악취의 원인을 점검하고 결과를 알려 주세요'] },
  park:   { q: '공원이 있는 동과 많이 이용하는 동이 함께 챙길 일은 무엇인가요? 공원과 산책길을 이어 걷기를 늘리려면 무엇이 필요할까요?',
    us: ['두 동 공동 환경정화', '두 동 주민이 날을 정해 공원을 함께 가꾸고 이웃과 함께 걷기'], ext: ['공원시설 점검·보수', '벤치·그늘·조명을 점검하고 보수해 주세요'] }
};

// 표 양식 — 단계마다 문서의 탭 하나 (assets/app.js 의 TEMPLATE 과 같게 유지)
//  cols: 참여자마다 한 줄(열 = 칸) / rows: [칸, 항목 이름, 무엇을 쓰면 좋은지, 예시]
var US_DESC = '주민이 직접 할 수 있는 일 · 모임, 캠페인, 정화·돌봄 활동, 기록, 교육 등';
var EXT_DESC = '구청·행정복지센터·기관의 도움이 필요한 일 · 시설 정비, 안전, 예산·제도 지원 등';
var REST_DESC = '투표에서 뽑히지 않은 제안도 지우지 말고 하나씩';
var WITH_DESC = '참여할 주민·모임 / 도움이 필요한 기관 · 현장에 없는 곳은 ‘참여 제안’·‘협조 요청’으로';
function rep_(row, n) { var a = []; for (var i = 0; i < n; i++) a.push(row); return a; }
var DOC_TABLES = [
  { tab: '📌 쓰는 법', head: '📌 시작 전 준비', q: '테이블 정보를 확인해요',
    guide: '테이블 번호·주제는 문서 제목에 있어요. 참여 동을 적고, 진행자와 단계별 질문·시간·제출 방법(⑤에서 ‘제출’)을 맞춰요. 관제반에 「기록 연결」이 초록불인지 확인해요.',
    rows: [['참여 동', '이 테이블 주민들의 동', '첨단1동, 첨단2동']] },
  { tab: '① 이용 경험', head: '① 이용 경험 나누기', q: '우리는 이곳에서 어떤 경험을 하고 있나요?',
    guide: '참여자 한 사람이 한 줄씩 써요(이름 대신 번호). 「장소·상황 — 핵심」으로 쓰고, 서로 다른 경험은 합치지 말고 따로 적어요. 말하지 않은 칸은 비워 두세요.',
    cols: ['좋았던 점', '불편한 점', '개선점'], ex: ['제방길 아침 — 물소리 들으며 걷기 좋아요', '제방길 저녁 — 조명이 어두워 혼자 걷기 무서워요', '산책로 중간 — 쉬어 갈 벤치가 더 있으면 좋겠어요'], people: 14 },
  { tab: '② 함께 할 일', head: '② 함께 할 일 제안하기', q: '우리의 경험을 바탕으로, 이곳이 어떻게 달라지면 좋을까요?',
    guide: '제안 하나에 한 줄. 주민이 직접 할 일은 🟢 초록 줄에, 기관 도움이 필요한 일은 🔵 파란 줄에 써요. 둘 다 필요하면 같은 제목으로 양쪽에 역할을 나눠 적어요. 화면에 번호가 자동으로 붙어요. 한 사람의 생각인지 테이블이 함께 확인한 것인지 구분해요.',
    pair: [['제안 제목 ✍️', '짧게, 이름처럼'], ['핵심 내용 ✍️', '무엇을 어떻게, 한 문장']],
    groups: [{ field: 'us', band: '🟢 주민이 직접 할 일', desc: '모임 · 캠페인 · 정화 · 돌봄 · 기록 · 교육', ex: ['함께 걷기', '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기'], color: '#dcfce7', n: 5, label: '🟢 주민 ' },
      { field: 'ext', band: '🔵 기관 도움이 필요한 일', desc: '구청 · 행정복지센터 · 기관 / 시설 정비 · 안전 · 예산 · 제도', ex: ['안내표지 정비', '연결길 안내표지를 새로 달아 주세요 (구청 공원녹지과)'], color: '#dbeafe', n: 4, label: '🔵 외부 ' }] },
  { tab: '③ 우선 과제', head: '③ 우선 과제 선정하기', q: '여러 제안 중 무엇을 먼저 이야기해 볼까요?',
    guide: '참가자가 휴대폰으로 투표해요(대형 화면 QR). 🟢 주민 중 가장 많은 표를 「선정 과제 1」, 🔵 외부 중 가장 많은 표를 「선정 과제 2」에 적고, 화면의 표 수를 「투표 결과」에 옮겨요. 뽑히지 않은 제안도 지우지 말고 남겨요.',
    rows: [['선정 과제 1 · 🟢 주민', '주민 제안 중 가장 많은 표', '함께 걷기·길 살피기'], ['선정 과제 2 · 🔵 외부', '외부 제안 중 가장 많은 표', '연결길 안내표지 정비'],
      ['투표 결과', '대형 화면의 번호별 표 수', '1번 7표, 3번 2표 / 6번 5표, 7번 1표'],
      ['선정되지 않은 의견', REST_DESC, '[주민실천] 쓰레기통 주변 함께 치우기 (2표)']].concat(rep_(['선정되지 않은 의견', '', ''], 5)) },
  { tab: '④ 실행방법', head: '④ 과제 1 실행방법', q: '이 제안을 실천하려면 무엇부터 시작하면 좋을까요?',
    guide: '선정 과제 1을 다섯 칸에 정리해요. 정하지 못한 칸은 ‘추후 협의’라고 써요. ⑤에서 고칠 곳이 나오면 이 탭에서 바로 고쳐요.',
    rows: [['현황·제안배경', '지금 어떤 상황이고 왜 필요한지', '아파트 사이를 길게 잇는 공원이라 두 동 주민이 만날 기회가 더해지면 좋겠음'],
      ['우리가 바라는 모습', '이 일이 이뤄지면 어떤 모습일지', '첨단1·2동 주민들이 아파트 경계를 넘어 인사하고 어울리는 모습'],
      ['우리의 제안', '바라는 모습을 위해 함께 할 일', '취미를 이웃과 나누는 ‘공원에서 만나는 이웃’'],
      ['우리가 시작할 첫걸음', '처음 해 볼 활동 · 언제 · 어디서 · 동별 역할', '각 동에서 취미를 나눌 주민을 찾아 공원 한 구간에서 시범 운영하기'],
      ['함께하고 싶은 이웃', WITH_DESC, '인근 아파트 주민모임(참여 제안), 주민자치회, 공원 관리부서(협조 요청)']] },
  { tab: '④ 실행방법', head: '④ 과제 2 실행방법', q: '선정 과제가 하나뿐이면 이 표는 비워 두세요',
    rows: [['현황·제안배경', '', ''], ['우리가 바라는 모습', '', ''], ['우리의 제안', '', ''], ['우리가 시작할 첫걸음', '', ''], ['함께하고 싶은 이웃', WITH_DESC, '']] },
  { tab: '⑤ 결과 확인', head: '⑤ 테이블 결과 확인', q: '정리된 내용이 우리가 이야기한 뜻과 맞나요?',
    guide: '진행자가 다섯 항목을 읽어 주면, 고칠 곳은 ④ 탭에서 바로 고쳐요(화면도 바로 바뀌어요). 기록과 화면이 같은지 확인하고, 진행자의 최종 확인 신호 뒤에 ‘제출’이라고 써요.',
    rows: [['고친 곳·빠진 의견 메모', '무엇을 고쳤는지 짧게', '첫걸음 날짜를 ‘추후 협의’로 고침'],
      ['✨ AI 다듬은 문장 확인', 'AI가 다듬은 문장이 화면에 뜨면 원래 발언과 비교해 다른 점을 적어요', '“줍깅”이 “환경정화”로 바뀜 → 원래 말로 되돌려 주세요'],
      ['최종 제출', '진행자의 최종 확인 신호 뒤에', '제출']] }
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
      case 'likes':   return json_(readLikes_());
      case 'votes':   return json_(readVotes_());
      default:        return json_({ ok: true, name: '광산자치아고라 API v2' });
    }
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ error: 'bad json' }); }
  try {
    if (body.action === 'like') return json_(like_(body));
    if (body.action === 'vote') return json_(vote_(body));
    if (body.key !== prop_('ADMIN_KEY')) return json_({ error: '관제 비밀번호가 맞지 않아요.' });
    switch (body.action) {
      case 'setState':    return json_({ state: writeState_(body.state) });
      case 'push':        return json_(pushManual_(body));
      case 'summarize':   return json_(startSummarizeJob_(body.input));
      case 'saveSummary': return json_(saveSummary_(body.data));
      case 'resetLikes':  return json_(resetLikes_());
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

// ─────────────────────────── 테이블 설정 ───────────────────────────

function readTables_() {
  var rows = sheet_(SHEETS.tables).getDataRange().getValues().slice(1);
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    var topic = String(r[1] || '').trim();
    // 주제 이름(강)이나 키(river) 둘 다 받음. 예전 값(황룡강 등)이면 번호로 기본 배정
    var byName = TOPIC_ORDER.filter(function (k) { return TOPICS[k] === topic; })[0];
    topic = TOPICS[topic] ? topic : (byName || defaultTopic_(r[0]));
    return {
      no: Number(r[0]), topic: topic, dongs: String(r[2] || ''), space: String(r[3] || ''),
      docId: docId_(String(r[4])), facilitator: String(r[5] || '')
    };
  });
}

function docId_(url) {
  var m = url.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : url.trim();
}

// ─────────────────────────── 실시간 피드 ───────────────────────────

/**
 * 13개 문서의 표를 [[칸 문단들]] 로 → 5초 캐시.
 * UrlFetch 하루 한도(약 2만 번)를 쓰지 않도록 DocumentApp 으로 읽고,
 * 마지막 수정 시각이 바뀐 문서만 다시 엽니다(안 바뀐 문서는 캐시).
 */
function feed_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('feed');
  if (hit) return JSON.parse(hit);
  // 여러 화면이 동시에 물어도 한 번만 읽도록
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(15000);
  try {
    hit = cache.get('feed');
    if (hit) return JSON.parse(hit);
    var tables = readTables_();
    var keys = tables.map(function (t) { return 'doc' + t.no; });
    var prev = cache.getAll(keys);
    var docs = {}, put = {}, now = Date.now();
    // Drive 수정 시각은 몇 분 늦게 바뀔 수 있어서, 시각이 같아도 오래 안 읽은 문서는 한 번에 2개씩 다시 읽음
    var forced = 2;
    var cached = {};
    tables.forEach(function (t) { if (prev['doc' + t.no]) cached[t.no] = JSON.parse(prev['doc' + t.no]); });
    var oldest = tables.slice().sort(function (a, b) { return ((cached[a.no] || {}).read || 0) - ((cached[b.no] || {}).read || 0); });
    var refresh = {};
    oldest.forEach(function (t) { var p = cached[t.no]; if (forced > 0 && p && now - (p.read || 0) > REREAD_MS) { refresh[t.no] = true; forced--; } });
    tables.forEach(function (t) {
      if (!t.docId) { docs[t.no] = { ok: false, rows: [] }; return; }
      try {
        var at = DriveApp.getFileById(t.docId).getLastUpdated().getTime();
        var p = cached[t.no];
        if (p && p.at === at && p.id === t.docId && !refresh[t.no]) { docs[t.no] = { ok: true, rows: p.rows }; return; }
        var rows = docTabsRows_(DocumentApp.openById(t.docId).getTabs());
        docs[t.no] = { ok: true, rows: rows };
        put['doc' + t.no] = JSON.stringify({ at: at, id: t.docId, rows: rows, read: now });
      } catch (err) {
        console.log('테이블 ' + t.no + ' 문서 읽기 실패: ' + err.message);
        docs[t.no] = { ok: false, rows: [] };
      }
    });
    try { cache.putAll(put, 21600); } catch (err) { /* 너무 크면 다음에 다시 읽음 */ }
    var out = { docs: docs, manual: readManual_(), ts: Date.now() };
    try { cache.put('feed', JSON.stringify(out), 5); } catch (err) { /* 100KB 초과 시 캐시 생략 */ }
    return out;
  } finally {
    if (locked) lock.releaseLock();
  }
}

/** 문서 탭들(DocumentApp Tab[]) → 모든 탭의 표 행 (탭 순서대로). 칸 = 문단 줄 목록 */
function docTabsRows_(tabs) {
  var rows = [];
  (tabs || []).forEach(function (tab) {
    tab.asDocumentTab().getBody().getTables().forEach(function (table) {
      for (var r = 0; r < table.getNumRows(); r++) {
        var row = table.getRow(r), cells = [];
        for (var c = 0; c < row.getNumCells(); c++) {
          var cell = row.getCell(c), out = [];
          for (var k = 0; k < cell.getNumChildren(); k++) {
            var ch = cell.getChild(k), type = ch.getType();
            var text = type === DocumentApp.ElementType.PARAGRAPH ? ch.asParagraph().getText()
              : type === DocumentApp.ElementType.LIST_ITEM ? ch.asListItem().getText() : '';
            // 줄바꿈(Shift+Enter)도 줄로 나눔
            text.split(/[\r\n\u000b]/).forEach(function (l) { l = l.replace(/\s+/g, ' ').trim(); if (l) out.push(l); });
          }
          cells.push(out);
        }
        rows.push(cells);
      }
    });
    rows = rows.concat(docTabsRows_(tab.getChildTabs()));
  });
  return rows;
}

function readManual_() {
  var rows = sheet_(SHEETS.manual).getDataRange().getValues().slice(1);
  return rows.filter(function (r) { return r[1]; }).map(function (r) {
    return { time: new Date(r[0]).getTime(), table: Number(r[1]), field: String(r[2]), task: Number(r[3] || 0), text: String(r[4]) };
  });
}

function pushManual_(b) {
  sheet_(SHEETS.manual).appendRow([new Date(), b.table, b.field || 'good', b.task || 0, b.text]);
  CacheService.getScriptCache().remove('feed');
  return { ok: true };
}

// ─────────────────────────── 화면 상태 ───────────────────────────

// 스크립트 속성 값 하나는 9KB까지라 2,500자씩 나눠 담음(한글 3바이트 → 7.5KB).
// 휴대폰 150대가 10초마다 읽어도 하루 속성 읽기 한도(5만 번)를 쓰지 않도록 캐시에서 먼저 읽음.
var STATE_CHUNK = 2500;
function readState_() {
  var c = CacheService.getScriptCache(), s = c.get('STATE');
  if (s === null) {
    var p = PropertiesService.getScriptProperties().getProperties();
    s = p.STATE || '';
    for (var i = 1; i < Number(p.STATE_N || 1); i++) s += p['STATE_' + i] || '';
    s = s || 'null';
    try { c.put('STATE', s, 21600); } catch (e) { /* 캐시가 안 되면 다음에도 속성에서 */ }
  }
  return JSON.parse(s);
}
function writeState_(state) {
  state.updated = Date.now();
  var s = JSON.stringify(state), n = Math.max(1, Math.ceil(s.length / STATE_CHUNK)), put = { STATE_N: String(n) };
  for (var i = 0; i < n; i++) put[i ? 'STATE_' + i : 'STATE'] = s.substr(i * STATE_CHUNK, STATE_CHUNK);
  PropertiesService.getScriptProperties().setProperties(put);
  var c = CacheService.getScriptCache();
  try { c.put('STATE', s, 21600); } catch (e) { c.remove('STATE'); }
  return state;
}
function clearState_() {
  var sp = PropertiesService.getScriptProperties();
  sp.deleteProperty('STATE'); sp.deleteProperty('STATE_N');
  CacheService.getScriptCache().remove('STATE');
}

// 캐시 값 하나는 100KB까지라 3만 자씩 나눠 담음 (AI 다듬기 입력처럼 클 수 있는 값)
function cachePutBig_(key, s, ttl) {
  var n = Math.max(1, Math.ceil(s.length / 30000)), put = {};
  for (var i = 0; i < n; i++) put[key + '_' + i] = s.substr(i * 30000, 30000);
  put[key + '_n'] = String(n);
  CacheService.getScriptCache().putAll(put, ttl);
}
function cacheGetBig_(key) {
  var c = CacheService.getScriptCache(), n = Number(c.get(key + '_n') || 0), keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '_' + i);
  var got = c.getAll(keys);
  if (!n || keys.some(function (k) { return got[k] == null; })) return null;
  return keys.map(function (k) { return got[k]; }).join('');
}

// ─────────────────────────── AI 다듬기 · 주제별 요약 ───────────────────────────
// summary 시트: A열 키(t1…t13, p:river…) · B열 JSON. 관제 패널에서 검수·저장합니다.

function readSummary_() {
  var rows = sheet_(SHEETS.summary).getDataRange().getValues().slice(1);
  var tables = {}, topics = {};
  rows.forEach(function (r) {
    var k = String(r[0] || ''), v;
    try { v = JSON.parse(String(r[1] || '')); } catch (e) { return; }
    if (/^t\d+$/.test(k)) tables[k.slice(1)] = v;
    else if (/^p:/.test(k)) topics[k.slice(2)] = v;
  });
  return {
    tables: tables, topics: topics,
    at: prop_('SUMMARY_AT') ? Number(prop_('SUMMARY_AT')) : 0, source: prop_('SUMMARY_SRC') || '',
    job: prop_('SUMMARY_JOB') ? JSON.parse(prop_('SUMMARY_JOB')) : null
  };
}

function saveSummary_(data) {
  var sh = sheet_(SHEETS.summary);
  sh.clearContents();
  var rows = [['키', '내용(JSON)']];
  Object.keys(data.tables || {}).sort(function (a, b) { return a - b; }).forEach(function (no) { rows.push(['t' + no, JSON.stringify(data.tables[no])]); });
  Object.keys(data.topics || {}).forEach(function (k) { rows.push(['p:' + k, JSON.stringify(data.topics[k])]); });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  PropertiesService.getScriptProperties().setProperties({ SUMMARY_AT: String(Date.now()) });
  return readSummary_();
}

/**
 * input: 관제 패널이 보낸 테이블별 정리 내용
 *   [{ no, topic, picks:[..], us:[..], ext:[..], tasks:[{bg,want,prop,first,with}], check:[..] }]
 */
function summarize_(input) {
  var key = prop_('GEMINI_API_KEY');
  if (!key) throw new Error('스크립트 속성에 GEMINI_API_KEY 가 없어요.');
  var models = [prop_('GEMINI_MODEL') || 'gemini-3.8-flash']
    .concat((prop_('GEMINI_FALLBACK') || 'gemini-3.5-flash,gemini-flash-latest').split(','))
    .map(function (m) { return m.trim(); })
    .filter(function (m, i, a) { return m && a.indexOf(m) === i; });

  var corpus = input.map(function (t) {
    var lines = ['### 테이블 ' + t.no + ' · 주제 ' + topicLabel_(t.topic)];
    if (t.us && t.us.length) lines.push('주민 실천 제안: ' + t.us.join(' / '));
    if (t.ext && t.ext.length) lines.push('외부 협력 제안: ' + t.ext.join(' / '));
    if (t.picks && t.picks.length) lines.push('선정 과제: ' + t.picks.join(' / '));
    (t.tasks || []).forEach(function (k, i) {
      if (!k) return;
      lines.push('[과제 ' + (i + 1) + '] 현황·제안배경: ' + (k.bg || '') + ' | 바라는 모습: ' + (k.want || '') + ' | 우리의 제안: ' + (k.prop || '') +
        ' | 첫걸음: ' + (k.first || '') + ' | 함께하고 싶은 이웃: ' + (k.with || ''));
    });
    if (t.check && t.check.length) lines.push('테이블이 고쳐 달라고 한 점: ' + t.check.join(' / '));
    return lines.join('\n');
  }).join('\n\n');

  var prompt = [
    '당신은 광산구 주민공론장(광산자치아고라)의 기록 정리를 돕는 퍼실리테이터입니다.',
    '아래는 13개 테이블 기록자가 표에 받아 적은 의제 제안서 초안입니다. 두 가지를 하세요.',
    '',
    '1) tables: 테이블별 의제 제안서의 "표현 다듬기"',
    ' - 다른 테이블 주민도 바로 이해하도록 길거나 모호한 문장을 짧고 분명하게 고치세요(항목당 60자 이내).',
    ' - 없는 내용을 지어내지 마세요. 주민이 쓴 지명·표현·숫자는 살리세요. 빈 항목은 "추후 협의"로 두세요.',
    ' - 비슷한 말이 여러 번 나오면 하나로 합치세요. "테이블이 고쳐 달라고 한 점"은 반드시 반영하세요.',
    ' - title: 과제 이름 20자 이내. us: 주민이 맡을 일 한 줄, ext: 외부(구청·기관)에 요청할 일 한 줄(없으면 빈 값).',
    ' - 과제 2가 비어 있으면 tasks 에 과제 1만 넣으세요.',
    '2) topics: 같은 주제(공간)를 다룬 테이블들의 결과를 묶은 "주제별 결과 요약"',
    ' - summary: 두 테이블 제안의 공통점과 주요 실행 방안을 2문장 이내로.',
    ' - points: 주요 제안 2~4개, 각 25자 이내.',
    '',
    corpus
  ].join('\n');

  var task = { type: 'OBJECT', properties: {
    title: { type: 'STRING' }, bg: { type: 'STRING' }, want: { type: 'STRING' }, prop: { type: 'STRING' },
    first: { type: 'STRING' }, with: { type: 'STRING' }, us: { type: 'STRING' }, ext: { type: 'STRING' } },
    required: ['title', 'bg', 'want', 'prop', 'first', 'with', 'us', 'ext'] };
  var schema = {
    type: 'OBJECT',
    properties: {
      tables: { type: 'ARRAY', items: { type: 'OBJECT', properties: { no: { type: 'INTEGER' }, tasks: { type: 'ARRAY', items: task } }, required: ['no', 'tasks'] } },
      topics: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        topic: { type: 'STRING', enum: TOPIC_ORDER }, summary: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['topic', 'summary', 'points'] } }
    },
    required: ['tables', 'topics']
  };
  var payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt + '\n\n(topics 의 topic 값은 영문 키: ' + TOPIC_ORDER.map(function (k) { return k + '=' + topicLabel_(k); }).join(', ') + ')' }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema }
  });
  var r = callGemini_(key, models, payload);
  var out = { tables: {}, topics: {} };
  r.parsed.tables.forEach(function (t) { out.tables[t.no] = { tasks: (t.tasks || []).slice(0, 2) }; });
  r.parsed.topics.forEach(function (p) { out.topics[p.topic] = { summary: p.summary, points: (p.points || []).slice(0, 4) }; });
  PropertiesService.getScriptProperties().setProperty('SUMMARY_SRC', 'gemini:' + r.model);
  return saveSummary_(out);
}

/** 모델을 차례로 시도. 붐빔(429·500·503)은 한 번 더, 없는 모델(404)은 다음 모델로 */
function callGemini_(key, models, payload) {
  var errors = [];
  var started = Date.now();
  for (var i = 0; i < models.length; i++) {
    for (var attempt = 0; attempt < 2; attempt++) {
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
  throw new Error('Gemini 실패 (' + errors.join(', ') + '). 잠시 뒤 다시 실행하거나 원문 그대로 쓰세요.');
}

/** 웹 요청 안에서 기다리지 않고 1초 뒤 일회용 트리거로 실행. 입력은 캐시에 잠시 보관 */
function startSummarizeJob_(input) {
  if (!input || !input.length) throw new Error('정리할 기록이 없어요.');
  var job = prop_('SUMMARY_JOB') ? JSON.parse(prop_('SUMMARY_JOB')) : null;
  if (job && job.status === 'running' && Date.now() - job.started < 7 * 60000) return { job: job };
  cachePutBig_('SUM_INPUT', JSON.stringify(input), 1800);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSummarizeJob') ScriptApp.deleteTrigger(t);
  });
  job = { status: 'running', started: Date.now() };
  PropertiesService.getScriptProperties().setProperty('SUMMARY_JOB', JSON.stringify(job));
  ScriptApp.newTrigger('runSummarizeJob').timeBased().after(1000).create();
  return { job: job };
}

/** 트리거가 실행하는 함수 */
function runSummarizeJob() {
  var sp = PropertiesService.getScriptProperties();
  var job = { started: (JSON.parse(prop_('SUMMARY_JOB') || '{}').started) || Date.now() };
  try {
    var input = JSON.parse(cacheGetBig_('SUM_INPUT') || '[]');
    if (!input.length) throw new Error('정리할 입력이 사라졌어요. 다시 실행해 주세요.');
    summarize_(input);
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
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': prop_('GEMINI_API_KEY') }, muteHttpExceptions: true });
  Logger.log('응답 코드: ' + res.getResponseCode());
  var body = JSON.parse(res.getContentText());
  if (body.error) { Logger.log('오류: ' + body.error.message); return; }
  Logger.log('쓸 수 있는 flash 모델: ' + body.models.map(function (m) { return m.name.replace('models/', ''); })
    .filter(function (n) { return /flash/.test(n); }).join(', '));
}

/** 편집기에서 실행: 문서 표가 제대로 읽히는지 확인 (테이블 1) */
function testFeed() {
  var c = CacheService.getScriptCache();
  c.removeAll(['feed'].concat(readTables_().map(function (t) { return 'doc' + t.no; })));
  var f = feed_();
  Logger.log('테이블 1 표 행 수: ' + f.docs[1].rows.length + ' (V2 표 양식이면 58)');
  Logger.log(JSON.stringify(f.docs[1]).slice(0, 2000));
}

// ─────────────────────────── 공감(좋아요) ───────────────────────────
// 150명이 거의 동시에 누르므로 기기별 스크립트 속성 한 칸에 "누른 카드 목록"을 통째로 덮어씁니다.

var LIKE_PREFIX = 'l_';

function like_(b) {
  var state = readState_() || {};
  if (!state.likeOpen) return { error: '지금은 공감 시간이 아니에요.' };
  var valid = (state.cards || []).map(function (c) { return c.id; });
  var ids = (b.ids || []).filter(function (id) { return valid.indexOf(id) >= 0; });
  var device = String(b.device || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!device) return { error: '기기 정보가 없어요.' };
  var sp = PropertiesService.getScriptProperties();
  if (ids.length) sp.setProperty(LIKE_PREFIX + device, ids.join(','));
  else sp.deleteProperty(LIKE_PREFIX + device);
  return { ok: true, ids: ids };
}

function readLikes_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var counts = {}, people = 0;
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(LIKE_PREFIX) !== 0) return;
    people++;
    props[k].split(',').forEach(function (id) { if (id) counts[id] = (counts[id] || 0) + 1; });
  });
  return { counts: counts, people: people };
}

function resetLikes_() {
  var sp = PropertiesService.getScriptProperties();
  Object.keys(sp.getProperties()).forEach(function (k) { if (k.indexOf(LIKE_PREFIX) === 0) sp.deleteProperty(k); });
  return { ok: true };
}

// ── ③ 테이블별 휴대폰 투표: 기기마다 「테이블|주민 후보|외부 후보」 한 줄 ──
var VOTE_PREFIX = 'v_';
function vote_(b) {
  var state = readState_() || {};
  if (!state.voteOpen) return { error: '지금은 투표 시간이 아니에요.' };
  var bt = (state.ballot || {})[b.table];
  if (!bt) return { error: '이 테이블은 투표할 제안이 없어요.' };
  var ids = function (a) { return (a || []).map(function (o) { return o.id; }); };
  var us = ids(bt.us).indexOf(b.us) >= 0 ? b.us : '', ext = ids(bt.ext).indexOf(b.ext) >= 0 ? b.ext : '';
  var device = String(b.device || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!device) return { error: '기기 정보가 없어요.' };
  var sp = PropertiesService.getScriptProperties();
  if (us || ext) sp.setProperty(VOTE_PREFIX + device, [Number(b.table), us, ext].join('|'));
  else sp.deleteProperty(VOTE_PREFIX + device);
  return { ok: true, us: us, ext: ext };
}
function readVotes_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var counts = {}, people = 0;
  Object.keys(props).forEach(function (k) {
    if (k.indexOf(VOTE_PREFIX) !== 0) return;
    people++;
    props[k].split('|').slice(1).forEach(function (id) { if (id) counts[id] = (counts[id] || 0) + 1; });
  });
  return { counts: counts, people: people };
}
function resetVotes_() {
  var sp = PropertiesService.getScriptProperties();
  Object.keys(sp.getProperties()).forEach(function (k) { if (k.indexOf(VOTE_PREFIX) === 0) sp.deleteProperty(k); });
  return { ok: true };
}

/** 행사 후 실행: 카드별 공감 수를 likes 시트에 기록 (화면에는 숫자를 보이지 않음) */
function exportLikes() {
  var r = readLikes_();
  var sh = sheet_(SHEETS.likes);
  sh.clearContents();
  sh.appendRow(['카드', '테이블', '주제', '제안', '공감 수']);
  (((readState_() || {}).cards) || []).forEach(function (c) {
    sh.appendRow([c.id, c.table, TOPICS[c.topic] || c.topic, c.text, r.counts[c.id] || 0]);
  });
  sh.appendRow([]);
  sh.appendRow(['참여 기기', r.people]);
}

// ─────────────────────────── 문서 양식 ───────────────────────────

/** 문서 탭을 titles 대로 다시 만듦(첫 탭은 이름만 바꿈). 고급 서비스 Docs 사용(UrlFetch 한도와 무관) */
function resetTabs_(id, titles) {
  var ids = function () { return Docs.Documents.get(id, { includeTabsContent: true, fields: 'tabs(tabProperties(tabId))' }).tabs.map(function (t) { return t.tabProperties.tabId; }); };
  var cur = ids();
  var reqs = cur.slice(1).map(function (tabId) { return { deleteTab: { tabId: tabId } }; });
  reqs.push({ updateDocumentTabProperties: { tabProperties: { tabId: cur[0], title: titles[0] }, fields: 'title' } });
  titles.slice(1).forEach(function (title, i) { reqs.push({ addDocumentTab: { tabProperties: { title: title, index: i + 1 } } }); });
  Docs.Documents.batchUpdate({ requests: reqs }, id);
  var after = ids();
  if (after.length !== titles.length) throw new Error('탭 수가 맞지 않음 ' + after.length);
  return after;
}

function gray_(text, size) { text.setForegroundColor('#6b7280').setItalic(true); if (size) text.setFontSize(size); return text; }

function writeIntro_(body, t) {
  body.appendParagraph('테이블 ' + t.no + ' · ' + topicLabel_(t.topic) + ' 기록지').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  ['✍️ 단계마다 위쪽 탭(📌 쓰는 법 → ① 이용 경험 … ⑤ 결과 확인)을 눌러 그 탭의 표에만 쓰세요.',
   '✍️ 표의 맨 오른쪽 「우리 테이블 답」 칸에 써요. 칸 안에서 엔터를 치면 화면 카드가 한 장 더 생겨요.',
   '⏱ 쓰고 10~15초 뒤 대형 화면에 떠요. 잘못 쓴 글은 그냥 고치면 화면도 고쳐져요.',
   '🚫 이름·전화번호는 쓰지 않아요. 표의 첫 칸(항목 이름)과 예시는 지우지 마세요.'].forEach(function (l) { body.appendListItem(l); });
  body.appendParagraph('진행자와 기록자가 함께 지킬 사항').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  ['요약 확인 — 발언의 뜻이 헷갈리면 진행자를 통해 “이렇게 정리해도 될까요?”라고 확인해요.',
   '동의 여부 구분 — 한 사람의 제안과 테이블이 함께 확인한 내용을 구분해요. 말이 없다고 동의한 것으로 보지 않아요.',
   'AI 정리 검토 — AI가 만든 제목·요약은 원래 발언과 대조하고, 최종 내용은 참여자가 확인해요.',
   '역할 확정 구분 — 현장에 없는 주민·기관은 확정된 주체가 아니라 ‘참여 제안’·‘협조 요청’ 대상으로 적어요.',
   '기록 시간 — 단계가 끝날 때 진행자가 요약을 읽어 주는 동안 정리를 마무리해요.'].forEach(function (l) { body.appendListItem(l); });
}

function writeTable_(body, s) {
  body.appendParagraph(s.head + ' — ' + s.q).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (s.guide) gray_(body.appendParagraph(s.guide).editAsText(), 10);
  if (s.pair) return writePairTable_(body, s);
  var cells, i;
  var exN = 0;  // 회색 예시 줄 수(머리 줄 다음)
  if (s.cols) {
    cells = [[s.head].concat(s.cols), ['예시'].concat(s.ex)];
    for (i = 1; i <= s.people; i++) cells.push(['참여자 ' + i].concat(s.cols.map(function () { return ''; })));
    exN = 1;
  } else {
    cells = [[s.head, '예시 (이렇게 쓰면 돼요)', '우리 테이블 답 ✍️']].concat(s.rows.map(function (r) { return [r[0], r[2], '']; }));
  }
  var table = body.appendTable(cells);
  table.setColumnWidth(0, s.cols ? 80 : 130);
  if (!s.cols) table.setColumnWidth(1, 160);
  for (i = 0; i < table.getNumRows(); i++) {
    var row = table.getRow(i);
    if (i === 0) {
      for (var c = 0; c < row.getNumCells(); c++) row.getCell(c).setBackgroundColor('#1f2937').editAsText().setBold(true).setForegroundColor('#ffffff');
      continue;
    }
    row.getCell(0).setBackgroundColor('#f3f4f6').editAsText().setBold(true);
    if (s.cols) {
      if (i <= exN) for (c = 1; c < row.getNumCells(); c++) gray_(row.getCell(c).editAsText(), 9);
    } else {
      var desc = s.rows[i - 1][1];
      if (desc) gray_(row.getCell(0).appendParagraph(desc).editAsText().setBold(false), 8);
      if (row.getCell(1).getText()) gray_(row.getCell(1).editAsText(), 9);
    }
  }
}

/** ② 표: 구역 띠(🟢 주민 / 🔵 외부) → 그 구역 예시 → 쓰는 줄. 칸 = 제안 제목 | 핵심 내용 */
function pairRows_(s) {
  var rows = [];
  s.groups.forEach(function (g) {
    rows.push({ kind: 'band', g: g, cells: [g.band, '', ''] });
    rows.push({ kind: 'ex', g: g, cells: ['예시', g.ex[0], g.ex[1]] });
    for (var n = 1; n <= g.n; n++) rows.push({ kind: 'in', g: g, cells: [g.label + n, '', ''] });
  });
  return rows;
}
function writePairTable_(body, s) {
  var rows = pairRows_(s);
  var table = body.appendTable([[s.head, s.pair[0][0], s.pair[1][0]]].concat(rows.map(function (r) { return r.cells; })));
  table.setColumnWidth(0, 130);
  table.setColumnWidth(1, 150);
  var hd = table.getRow(0);
  for (var c = 0; c < 3; c++) {
    hd.getCell(c).setBackgroundColor('#1f2937').editAsText().setBold(true).setForegroundColor('#ffffff');
    if (c) hd.getCell(c).appendParagraph(s.pair[c - 1][1]).editAsText().setBold(false).setFontSize(8).setForegroundColor('#d1d5db');
  }
  rows.forEach(function (r, i) {
    var row = table.getRow(i + 1);
    if (r.kind === 'band') {
      for (c = 0; c < 3; c++) row.getCell(c).setBackgroundColor(r.g.color);
      row.getCell(0).editAsText().setBold(true).setFontSize(11);
      gray_(row.getCell(0).appendParagraph(r.g.desc).editAsText().setBold(false), 8);
    } else if (r.kind === 'ex') {
      row.getCell(0).setBackgroundColor('#f9fafb');
      for (c = 0; c < 3; c++) gray_(row.getCell(c).editAsText(), 9);
    } else {
      row.getCell(0).setBackgroundColor(r.g.color).editAsText().setBold(true);
    }
  });
}

/** ② 탭에 그 테이블 주제의 보조질문·예시를 넣은 사본 */
function withHint_(s, t) {
  var h = TOPIC_HINT[t.topic];
  if (!s.groups || !h) return s;
  var c = JSON.parse(JSON.stringify(s));
  c.guide = s.guide + '\n💬 ' + TOPICS[t.topic] + ' 보조질문: ' + h.q;
  c.groups[0].ex = h.us; c.groups[1].ex = h.ext;
  return c;
}

/** 문서 한 개를 표 양식으로: 탭 [📌 쓰는 법, ①, ②, ③, ④, ⑤, ⑥⑦] */
function writeDoc_(docId, t) {
  var tabNames = DOC_TABLES.map(function (s) { return s.tab; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  var tabIds = resetTabs_(docId, tabNames);
  var doc = DocumentApp.openById(docId);
  var bodyOf = function (i) { return doc.getTab(tabIds[i]).asDocumentTab().getBody(); };
  tabNames.forEach(function (name, ti) {
    var b = bodyOf(ti);
    b.appendParagraph('');  // 탭이 표로 끝나면 clear()가 실패해서
    b.clear();
    if (ti === 0) writeIntro_(b, t);
    DOC_TABLES.filter(function (s) { return s.tab === name; }).forEach(function (s) { writeTable_(b, withHint_(s, t)); });
    b.appendParagraph('');
  });
  doc.saveAndClose();
  CacheService.getScriptCache().remove('doc' + t.no);
}

/** V1 → V2: 13개 문서를 표 양식으로 바꾸고 tables 시트 B열을 주제로 (문서 안 기존 기록은 지워짐) */
function applyTemplateV2() {
  var sh = sheet_(SHEETS.tables);
  sh.getRange(1, 1, 1, 6).setValues([['번호', '주제(강/산/하천/공원)', '참여 동', '대상 공간', '기록 Docs 링크', '퍼실리테이터']]);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    var v = String(rows[i][1] || '');
    if (!TOPICS[v] && TOPIC_ORDER.every(function (k) { return TOPICS[k] !== v; })) sh.getRange(i + 1, 2).setValue(TOPICS[defaultTopic_(rows[i][0])]);
  }
  readTables_().forEach(function (t) {
    if (!t.docId) return;
    DriveApp.getFileById(t.docId).setName('[광산자치아고라] 테이블 ' + t.no + ' 기록 · ' + topicLabel_(t.topic));
    writeDoc_(t.docId, t);
    console.log('테이블 ' + t.no + ' · 단계별 탭으로');
  });
  sheet_(SHEETS.summary).clearContents().appendRow(['키', '내용(JSON)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '항목', '과제', '내용']);
  resetLikes_();
  resetVotes_();
  clearState_();
  CacheService.getScriptCache().remove('feed');
}

/** 처음 한 번 실행(새로 만들 때): 시트 + 13개 기록용 Google Docs(표 양식) 생성 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parent = DriveApp.getFileById(ss.getId()).getParents();
  var folder = parent.hasNext() ? parent.next() : DriveApp.getRootFolder();
  var docsFolder = folder.createFolder('광산자치아고라 테이블 기록');
  var sh = sheet_(SHEETS.tables);
  sh.clearContents();
  sh.appendRow(['번호', '주제(강/산/하천/공원)', '참여 동', '대상 공간', '기록 Docs 링크', '퍼실리테이터']);
  for (var no = 1; no <= TABLE_COUNT; no++) {
    var t = { no: no, topic: defaultTopic_(no) };
    var doc = DocumentApp.create('[광산자치아고라] 테이블 ' + no + ' 기록 · ' + topicLabel_(t.topic));
    doc.saveAndClose();
    writeDoc_(doc.getId(), t);
    DriveApp.getFileById(doc.getId()).moveTo(docsFolder);
    sh.appendRow([no, TOPICS[t.topic], '', '', 'https://docs.google.com/document/d/' + doc.getId() + '/edit', '']);
  }
  sheet_(SHEETS.summary).clearContents().appendRow(['키', '내용(JSON)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '항목', '과제', '내용']);
  if (!prop_('ADMIN_KEY')) PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', 'agora2026');
  SpreadsheetApp.getUi().alert('완료! tables 시트의 13개 문서 링크를 기록자에게 "편집자"로 공유해 주세요.');
}

/** 기록자가 로그인·권한 요청 없이 쓰도록: 13개 문서를 「링크가 있는 모든 사용자 = 편집자」로 */
function shareDocsForEditing() {
  readTables_().forEach(function (t) {
    if (!t.docId) return;
    DriveApp.getFileById(t.docId).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
    console.log('테이블 ' + t.no + ' · 링크로 편집 가능');
  });
}

/** 행사 직전: 리허설 기록 지우기(13개 문서를 빈 표 양식으로) + 요약·수동·공감·화면 상태 초기화 */
function resetForEvent() {
  readTables_().forEach(function (t) { if (t.docId) writeDoc_(t.docId, t); });
  sheet_(SHEETS.summary).clearContents().appendRow(['키', '내용(JSON)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '항목', '과제', '내용']);
  resetLikes_();
  resetVotes_();
  clearState_();
  CacheService.getScriptCache().remove('feed');
}

/** 13개 테이블·4개 주제로 바꾸기 (한 번만): 시트 B열을 기본 배치로, 13번 문서 만들기, 문서 이름 바꾸기.
 *  문서 안 내용은 그대로 두고, 표 양식(제목·② 예시)은 resetForEvent 때 새 주제로 다시 써져요. */
function applyTopics13() {
  var sh = sheet_(SHEETS.tables);
  sh.getRange(1, 1, 1, 6).setValues([['번호', '주제(강/산/하천/공원)', '참여 동', '대상 공간', '기록 Docs 링크', '퍼실리테이터']]);
  var rows = sh.getDataRange().getValues();
  var have = {};
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    have[Number(rows[i][0])] = true;
    sh.getRange(i + 1, 2).setValue(TOPICS[defaultTopic_(rows[i][0])]);
  }
  var first = readTables_().filter(function (t) { return t.docId; })[0];
  var parents = first ? DriveApp.getFileById(first.docId).getParents() : null;
  var folder = parents && parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  for (var no = 1; no <= TABLE_COUNT; no++) {
    if (have[no]) continue;
    var t = { no: no, topic: defaultTopic_(no) };
    var doc = DocumentApp.create('[광산자치아고라] 테이블 ' + no + ' 기록 · ' + topicLabel_(t.topic));
    doc.saveAndClose();
    writeDoc_(doc.getId(), t);
    var f = DriveApp.getFileById(doc.getId());
    f.moveTo(folder);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
    sh.appendRow([no, TOPICS[t.topic], '', '', 'https://docs.google.com/document/d/' + doc.getId() + '/edit', '']);
    console.log('테이블 ' + no + ' 문서 새로 만듦');
  }
  readTables_().forEach(function (t) {
    if (t.docId) DriveApp.getFileById(t.docId).setName('[광산자치아고라] 테이블 ' + t.no + ' 기록 · ' + topicLabel_(t.topic));
  });
  resetVotes_();
  CacheService.getScriptCache().remove('feed');
  console.log('완료: ' + readTables_().length + '개 테이블');
}
