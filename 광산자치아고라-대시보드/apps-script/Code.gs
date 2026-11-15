/**
 * 2026 광산자치아고라 · AI 공론장 대시보드 백엔드 V2 (Google Apps Script)
 *
 * V2: 진행흐름도(①~⑦) 기준. 기록자는 Google 문서의 "표"에 답을 씁니다.
 *  - tables  시트 : 12개 테이블 설정(주제·동·대상공간·기록 Docs 링크)
 *  - summary 시트 : AI가 다듬은 의제 제안서·주제별 요약(JSON 한 칸씩, 관제 패널에서 검수)
 *  - manual  시트 : 관제반 수동 푸시
 *  - likes   시트 : 행사 후 exportLikes() 를 실행하면 공감 결과가 기록됨
 *
 * 스크립트 속성: ADMIN_KEY(필수), GEMINI_API_KEY, GEMINI_MODEL(선택), GEMINI_FALLBACK(선택)
 *
 * V1에서 올릴 때: 이 파일로 교체 → 새 버전 배포 → 편집기에서 applyTemplateV2() 한 번 실행
 *  (12개 문서가 표 양식으로 바뀌고, tables 시트 B열이 주제로 바뀝니다. 문서 안 기존 기록은 지워집니다)
 */

var SHEETS = { tables: 'tables', summary: 'summary', manual: 'manual', likes: 'likes' };

var TOPICS = {
  hwang:   '황룡강',
  pung:    '풍영정천',
  eodeung: '어등산',
  malmi:   '말미산',
  sinchon: '신촌근린공원',
  daesang: '대상공원'
};
var TOPIC_ORDER = ['hwang', 'pung', 'eodeung', 'malmi', 'sinchon', 'daesang'];
// 기본 배정: 1·7 황룡강, 2·8 풍영정천 … (시트 B열에서 바꿀 수 있음)
function defaultTopic_(no) { return TOPIC_ORDER[(Number(no) - 1) % 6]; }

// 표 양식. [항목(첫 칸), 예시] — 세 번째 칸이 기록자가 쓰는 칸
var DOC_SECTIONS = [
  { head: '① 이용 경험 나누기', q: '우리는 이곳에서 어떤 경험을 하고 있나요?', rows: [
    ['좋았던 점', '아침마다 강변을 걸으면 물소리가 좋아요'],
    ['불편한 점', '밤에 조명이 어두워 혼자 걷기 무서워요'],
    ['개선점', '쉬어 갈 벤치가 더 있으면 좋겠어요']] },
  { head: '② 함께 할 일 제안하기', q: '이 공간이 더 좋게 바뀌려면 어떤 변화가 필요할까요?', rows: [
    ['우리가 함께 할 일 (주민 실천)', '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기'],
    ['외부 협력·지원이 필요한 일', '연결길 안내표지 정비 (구청)']] },
  { head: '③ 우선 과제 선정하기', q: '여러 제안 중 무엇을 먼저 이야기해 볼까요? (외부 협력만 2개 고르지 않기)', rows: [
    ['선정 과제 1', '함께 걷기·길 살피기 (우리)'],
    ['선정 과제 2', '연결길 안내표지 정비 (외부)'],
    ['투표 결과', '함께 걷기 7표, 안내표지 5표, 쓰레기통 2표'],
    ['선정되지 않은 의견', '쓰레기통 늘리기 — 지우지 말고 남겨 두기']] },
  { head: '④ 과제 1 실행방법', q: '이 일을 실제로 추진하려면 어떻게 시작하면 좋을까요? (못 정하면 ‘추후 협의’)', rows: [
    ['현황·제안배경', '아파트 사이를 길게 잇는 공원이라 두 동 주민이 만날 기회가 더해지면 좋겠음'],
    ['우리가 바라는 모습', '첨단1·2동 주민들이 아파트 경계를 넘어 인사하고 어울리는 모습'],
    ['우리의 제안', '취미를 이웃과 나누는 ‘공원에서 만나는 이웃’'],
    ['우리가 시작할 첫걸음', '각 동에서 취미를 나눌 주민을 찾아 공원 한 구간에서 시범 운영하기'],
    ['함께하고 싶은 이웃', '인근 아파트 주민모임, 주민자치회, 공원 관리부서']] },
  { head: '④ 과제 2 실행방법', q: '선정 과제가 하나뿐이면 비워 두세요', rows: [
    ['현황·제안배경', ''], ['우리가 바라는 모습', ''], ['우리의 제안', ''], ['우리가 시작할 첫걸음', ''], ['함께하고 싶은 이웃', '']] },
  { head: '⑤ 테이블 결과 확인', q: '우리의 의견이 잘 담겼나요?', rows: [
    ['빠진 의견·고칠 표현', '“밤길” 대신 “저녁 산책길”로 고쳐 주세요'],
    ['최종 제출', '모두 동의하면 ‘제출’이라고 쓰기']] }
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
    if (body.key !== prop_('ADMIN_KEY')) return json_({ error: '관제 비밀번호가 맞지 않아요.' });
    switch (body.action) {
      case 'setState':    return json_({ state: writeState_(body.state) });
      case 'push':        return json_(pushManual_(body));
      case 'summarize':   return json_(startSummarizeJob_(body.input));
      case 'saveSummary': return json_(saveSummary_(body.data));
      case 'resetLikes':  return json_(resetLikes_());
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
    // 주제 이름(황룡강)이나 키(hwang) 둘 다 받음. V1 값(river 등)이면 기본 배정
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

/** 12개 Docs를 HTML로 병렬 내보내기 → 표만 뽑아 [[칸 줄들]] 로 → 4초 캐시 */
function feed_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('feed');
  if (hit) return JSON.parse(hit);

  var tables = readTables_();
  var token = ScriptApp.getOAuthToken();
  var withDoc = tables.filter(function (t) { return t.docId; });
  var res = withDoc.length ? UrlFetchApp.fetchAll(withDoc.map(function (t) {
    return {
      url: 'https://www.googleapis.com/drive/v3/files/' + t.docId + '/export?mimeType=text/html',
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
    };
  })) : [];
  var docs = {};
  withDoc.forEach(function (t, i) {
    var ok = res[i].getResponseCode() === 200;
    docs[t.no] = { ok: ok, rows: ok ? docRows_(res[i].getContentText('UTF-8')) : [] };
  });
  tables.forEach(function (t) { if (!docs[t.no]) docs[t.no] = { ok: false, rows: [] }; });

  var out = { docs: docs, manual: readManual_(), ts: Date.now() };
  try { cache.put('feed', JSON.stringify(out), 4); } catch (err) { /* 100KB 초과 시 캐시 생략 */ }
  return out;
}

/** Docs HTML → 표의 행 목록. 각 행 = 칸 목록, 각 칸 = 문단(줄) 목록 */
function docRows_(html) {
  var rows = [];
  (html.match(/<tr[\s\S]*?<\/tr>/g) || []).forEach(function (tr) {
    rows.push((tr.match(/<td[\s\S]*?<\/td>/g) || []).map(function (td) {
      var paras = td.match(/<(p|li)\b[\s\S]*?<\/\1>/g) || [td];
      return paras.map(htmlText_).filter(function (s) { return s; });
    }));
  });
  return rows;
}
function htmlText_(s) {
  return s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
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

function readState_() {
  var s = prop_('STATE');
  return s ? JSON.parse(s) : null;
}
function writeState_(state) {
  state.updated = Date.now();
  PropertiesService.getScriptProperties().setProperty('STATE', JSON.stringify(state));
  return state;
}

// ─────────────────────────── AI 다듬기 · 주제별 요약 ───────────────────────────
// summary 시트: A열 키(t1…t12, p:hwang…) · B열 JSON. 관제 패널에서 검수·저장합니다.

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
    var lines = ['### 테이블 ' + t.no + ' · 주제 ' + (TOPICS[t.topic] || t.topic)];
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
    '아래는 12개 테이블 기록자가 표에 받아 적은 의제 제안서 초안입니다. 두 가지를 하세요.',
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
    contents: [{ role: 'user', parts: [{ text: prompt + '\n\n(topics 의 topic 값은 영문 키: ' + TOPIC_ORDER.map(function (k) { return k + '=' + TOPICS[k]; }).join(', ') + ')' }] }],
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
  CacheService.getScriptCache().put('SUM_INPUT', JSON.stringify(input), 1800);
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
    var input = JSON.parse(CacheService.getScriptCache().get('SUM_INPUT') || '[]');
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
  CacheService.getScriptCache().remove('feed');
  var f = feed_();
  Logger.log(JSON.stringify(f.docs[1]).slice(0, 3000));
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

function writeDoc_(doc, t) {
  var body = doc.getBody();
  body.clear();
  body.appendParagraph('테이블 ' + t.no + ' · ' + TOPICS[t.topic] + ' 기록지').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('✍️ 맨 오른쪽 「우리 테이블 답」 칸에만 쓰세요. 칸 안에서 엔터를 치면 화면 카드가 한 장 더 생겨요.');
  body.appendParagraph('⏱ 쓰고 10~15초 뒤 대형 화면에 떠요. 이름·전화번호는 쓰지 않아요. 가운데 예시 칸은 지우지 마세요.');
  DOC_SECTIONS.forEach(function (s) {
    body.appendParagraph(s.head + ' — ' + s.q).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var cells = [[s.head, '예시 (이렇게 쓰면 돼요)', '우리 테이블 답 ✍️']].concat(s.rows.map(function (r) { return [r[0], r[1], '']; }));
    var table = body.appendTable(cells);
    table.setColumnWidth(0, 120).setColumnWidth(1, 170);
    for (var i = 0; i < table.getNumRows(); i++) {
      var row = table.getRow(i);
      if (i === 0) {
        for (var c = 0; c < 3; c++) row.getCell(c).setBackgroundColor('#1f2937').editAsText().setBold(true).setForegroundColor('#ffffff');
      } else {
        row.getCell(0).editAsText().setBold(true);
        row.getCell(0).setBackgroundColor('#f3f4f6');
        if (row.getCell(1).getText()) row.getCell(1).editAsText().setForegroundColor('#6b7280').setItalic(true).setFontSize(9);
      }
    }
  });
  body.appendParagraph('');
  doc.saveAndClose();
}

/** V1 → V2: 12개 문서를 표 양식으로 바꾸고 tables 시트 B열을 주제로 (문서 안 기존 기록은 지워짐) */
function applyTemplateV2() {
  var sh = sheet_(SHEETS.tables);
  sh.getRange(1, 1, 1, 6).setValues([['번호', '주제(황룡강/풍영정천/어등산/말미산/신촌근린공원/대상공원)', '참여 동', '대상 공간', '기록 Docs 링크', '퍼실리테이터']]);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    var v = String(rows[i][1] || '');
    if (!TOPICS[v] && TOPIC_ORDER.every(function (k) { return TOPICS[k] !== v; })) sh.getRange(i + 1, 2).setValue(TOPICS[defaultTopic_(rows[i][0])]);
  }
  readTables_().forEach(function (t) {
    if (!t.docId) return;
    var doc = DocumentApp.openById(t.docId);
    doc.setName('[광산자치아고라] 테이블 ' + t.no + ' 기록 · ' + TOPICS[t.topic]);
    writeDoc_(doc, t);
  });
  sheet_(SHEETS.summary).clearContents().appendRow(['키', '내용(JSON)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '항목', '과제', '내용']);
  resetLikes_();
  PropertiesService.getScriptProperties().deleteProperty('STATE');
  CacheService.getScriptCache().remove('feed');
}

/** 처음 한 번 실행(새로 만들 때): 시트 + 12개 기록용 Google Docs(표 양식) 생성 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parent = DriveApp.getFileById(ss.getId()).getParents();
  var folder = parent.hasNext() ? parent.next() : DriveApp.getRootFolder();
  var docsFolder = folder.createFolder('광산자치아고라 테이블 기록');
  var sh = sheet_(SHEETS.tables);
  sh.clearContents();
  sh.appendRow(['번호', '주제(황룡강/풍영정천/어등산/말미산/신촌근린공원/대상공원)', '참여 동', '대상 공간', '기록 Docs 링크', '퍼실리테이터']);
  for (var no = 1; no <= 12; no++) {
    var t = { no: no, topic: defaultTopic_(no) };
    var doc = DocumentApp.create('[광산자치아고라] 테이블 ' + no + ' 기록 · ' + TOPICS[t.topic]);
    writeDoc_(doc, t);
    DriveApp.getFileById(doc.getId()).moveTo(docsFolder);
    sh.appendRow([no, TOPICS[t.topic], '', '', 'https://docs.google.com/document/d/' + doc.getId() + '/edit', '']);
  }
  sheet_(SHEETS.summary).clearContents().appendRow(['키', '내용(JSON)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '항목', '과제', '내용']);
  if (!prop_('ADMIN_KEY')) PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', 'agora2026');
  SpreadsheetApp.getUi().alert('완료! tables 시트의 12개 문서 링크를 기록자에게 "편집자"로 공유해 주세요.');
}

/** 행사 직전: 리허설 기록 지우기(12개 문서를 빈 표 양식으로) + 요약·수동·공감·화면 상태 초기화 */
function resetForEvent() {
  readTables_().forEach(function (t) { if (t.docId) writeDoc_(DocumentApp.openById(t.docId), t); });
  sheet_(SHEETS.summary).clearContents().appendRow(['키', '내용(JSON)']);
  sheet_(SHEETS.manual).clearContents().appendRow(['시각', '테이블', '항목', '과제', '내용']);
  resetLikes_();
  PropertiesService.getScriptProperties().deleteProperty('STATE');
  CacheService.getScriptCache().remove('feed');
}
