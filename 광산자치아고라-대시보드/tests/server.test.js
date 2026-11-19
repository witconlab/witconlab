// 실행: node tests/server.test.js  (서버 문서 양식·문서 읽기 ↔ 화면 파서가 같은지)
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const gs = { console }; vm.createContext(gs);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), gs);
global.window = { addEventListener() {} }; global.location = { search: '?demo' };
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
require('../assets/app.js');
const A = window.Agora, J = x => JSON.parse(JSON.stringify(x));

// 1) 서버가 문서에 만드는 표(writeTable_ 와 같은 모양) == 화면 쪽 양식
const serverRows = [];
J(gs.DOC_TABLES).forEach(s => {
  if (s.cols) {
    serverRows.push([[s.head]].concat(s.cols.map(c => [c])), [['예시']].concat(s.ex.map(x => [x])));
    for (let i = 1; i <= s.people; i++) serverRows.push([['참여자 ' + i]].concat(s.cols.map(() => [])));
  } else if (s.pair) {
    serverRows.push([[s.head]].concat(s.pair));
    J(gs.pairRows_(s)).forEach(r => serverRows.push(r.kind === 'band' ? [[r.g.band, r.g.desc]].concat(s.pair.map(() => [])) : r.cells.map(x => x ? [x] : [])));
  } else if (s.sel) {
    serverRows.push([[s.head]].concat(s.sel), [['예시']].concat(s.ex.map(x => [x])));
    s.rows.forEach(r => serverRows.push([[r[0], r[1]]].concat(s.sel.map(() => []))));
  } else {
    serverRows.push([[s.head], ['예시 (이렇게 쓰면 돼요)'], ['우리 테이블 답 ✍️']]);
    s.rows.forEach(r => serverRows.push([r[1] ? [r[0], r[1]] : [r[0]], r[2] ? [r[2]] : [], []]));
  }
});
assert.deepStrictEqual(serverRows, A.rowsFromCells({}));
assert.strictEqual(serverRows.length, 55);  // ④ 작성 완료(제출) 표 포함
assert.deepStrictEqual(J(gs.DOC_TABLES).map(s => s.tab), A.TEMPLATE.map(s => s.tab));

// 2) DocumentApp 탭(가짜 객체) → 표 행 (UrlFetch 없이 읽는 경로)
gs.DocumentApp = { ElementType: { PARAGRAPH: 'P', LIST_ITEM: 'L', TABLE: 'T' } };
const par = t => ({ getType: () => 'P', asParagraph: () => ({ getText: () => t }) });
const cell = (...ps) => ({ getNumChildren: () => (ps.length ? ps : ['']).length, getChild: k => (ps.length ? ps : ['']).map(par)[k] });
const table = rows => ({ getNumRows: () => rows.length, getRow: r => ({ getNumCells: () => rows[r].length, getCell: c => rows[r][c] }) });
const tab = (tables, kids = []) => ({ asDocumentTab: () => ({ getBody: () => ({ getTables: () => tables }) }), getChildTabs: () => kids });
const tabs = [
  tab([]),
  tab([table([[cell('① 이용 경험 나누기'), cell('좋았던 점'), cell('불편한 점'), cell('개선점')], [cell('참여자 1'), cell('물소리\r산책로 넓음'), cell(), cell('벤치')]])]),
  tab([table([[cell('② 함께 할 일 제안하기'), cell('예시'), cell('답')], [cell('[외부협력]', '설명'), cell(), cell('조명  정비')]])], [tab([])])
];
const rows = J(gs.docTabsRows_(tabs));
assert.deepStrictEqual(rows[1], [['참여자 1'], ['물소리', '산책로 넓음'], [], ['벤치']]);
assert.deepStrictEqual(A.parseDoc(rows).map(x => x.field + ':' + x.text), ['good:물소리', 'good:산책로 넓음', 'better:벤치', 'ext:조명 정비']);

// 2-1) ③ 표: 선정 과제는 「제목 — 핵심 내용」, 투표 결과는 주민·외부 줄 각각(오른쪽 칸 요약)
const r3 = [[['③ 우선 과제 선정하기'], ['제안 제목 ✍️', '② 표의 제목 그대로'], ['핵심 내용 ✍️']], [['예시'], ['함께 걷기'], ['두 동…']],
  [['선정 과제 1 · 🟢 주민', '설명'], ['함께 걷기'], ['한 달에 한 번 함께 걷기']], [['선정 과제 2 · 🔵 외부', '설명'], ['조명 정비'], ['어두운 구간 조명 보완']],
  [['투표 결과 · 🟢 주민', '자동'], ['1번 함께 걷기 — 7표'], ['10명 투표 · 최다 1번 함께 걷기 7표']], [['투표 결과 · 🔵 외부', '자동'], [], []]];
assert.deepStrictEqual(A.parseDoc(r3).map(x => x.field + x.task + ':' + x.text),
  ['pick0:함께 걷기 — 한 달에 한 번 함께 걷기', 'pick1:조명 정비 — 어두운 구간 조명 보완', 'tally0:10명 투표 · 최다 1번 함께 걷기 7표']);
const d3 = A.tableData(A.parseDoc(r3).map(x => Object.assign({ table: 1 }, x)), 1);
assert.deepStrictEqual(J(d3.picks), [{ text: '함께 걷기', sub: '한 달에 한 번 함께 걷기', kind: 'us', task: 0 }, { text: '조명 정비', sub: '어두운 구간 조명 보완', kind: 'ext', task: 1 }]);

// 3) ③ 테이블별 투표: 후보 밖 id 는 버리고, 기기마다 마지막 표만 셈
// 가짜 스프레드시트(기록 시트용)
const sheets = {};
const mkSheet = () => { const rows = []; return { rows, getLastRow: () => rows.length, appendRow: r => rows.push(r), getRange: (r, c, n) => ({ setValues: v => { rows.splice(r - 1, n, ...v); } }) }; };
gs.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n], insertSheet: n => (sheets[n] = mkSheet()) }) };
const triggers = [];
gs.ScriptApp = { getProjectTriggers: () => triggers.slice(), deleteTrigger: x => triggers.splice(triggers.indexOf(x), 1), newTrigger: h => ({ timeBased: () => ({ after: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }) }) }) };
const kinds = () => (sheets.log ? sheets.log.rows.slice(1).map(r => r[1]) : []);
// Google 한도를 흉내: 속성 값 하나 9KB, 캐시 값 하나 100KB. 속성 읽기 횟수를 셈
const store = {}, cache = {}; let propReads = 0;
const bytes = v => Buffer.byteLength(String(v));
const setP = (k, v) => { if (bytes(v) > 9 * 1024) throw new Error('Argument too large: ' + k); store[k] = String(v); };
gs.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (propReads++, store[k] || null), setProperty: setP, setProperties: o => Object.keys(o).forEach(k => setP(k, o[k])), deleteProperty: k => { delete store[k]; }, getProperties: () => (propReads++, Object.assign({}, store)) }) };
const putC = (k, v) => { if (bytes(v) > 100 * 1024) throw new Error('Argument too large: ' + k); cache[k] = String(v); };
gs.CacheService = { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), getAll: ks => Object.fromEntries(ks.filter(k => k in cache).map(k => [k, cache[k]])), put: putC, putAll: o => Object.keys(o).forEach(k => putC(k, o[k])), remove: k => { delete cache[k]; } }) };
gs.writeState_({ voteOpen: true, ballot: { 3: { us: [{ id: 't3n1' }, { id: 't3n2' }], ext: [{ id: 't3n3' }] } } });
assert.deepStrictEqual(J(gs.vote_({ device: 'a', table: 3, us: 't3n1', ext: 't3n3' })), { ok: true, us: 't3n1', ext: 't3n3' });
gs.vote_({ device: 'b', table: 3, us: 't3n2', ext: 'zzz' });        // 외부 후보가 아니면 빈칸
gs.vote_({ device: 'a', table: 3, us: 't3n2', ext: 't3n3' });       // 다시 누르면 바뀜
assert.deepStrictEqual(J(gs.readVotes_()), { counts: { t3n2: 2, t3n3: 1 }, people: 2, tables: { 3: 2 }, done: {} });
assert.ok(gs.vote_({ device: 'c', table: 9, us: 't3n1' }).error);    // 후보 없는 테이블
// 테이블 퍼실의 「투표 완료」 알림 → votes.done, 취소, 후보 없는 테이블은 거절
gs.Utilities = { formatDate: () => '15:03:10', sleep() {} };
assert.ok(gs.voteDone_({ table: 3 }).ok);
assert.deepStrictEqual(J(gs.readVotes_()).done, { 3: '15:03:10' });
assert.ok(gs.voteDone_({ table: 9 }).error);
assert.ok(gs.voteDone_({ table: 3, done: false }).ok); assert.deepStrictEqual(J(gs.readVotes_()).done, {});
gs.voteDone_({ table: 3 });
assert.ok(kinds().includes('③ 테이블 투표 완료') && kinds().includes('③ 투표 완료 취소'));
gs.writeState_({ voteOpen: false, ballot: J(gs.readState_()).ballot }); // 투표 마치기 → 결과 스냅숏
const vrows = sheets.votes.rows;
assert.deepStrictEqual(J(vrows[0].slice(2)), ['테이블', '구분', '번호', '제안', '설명', '표 수']);
assert.deepStrictEqual(J(vrows.slice(1).map(r => [r[1], r[2], r[3], r[7]])), [['투표 마치기', 3, '주민', 0], ['투표 마치기', 3, '주민', 2], ['투표 마치기', 3, '외부', 1]]);
assert.ok(kinds().includes('투표 마치기') && kinds().includes('화면'));
assert.deepStrictEqual(triggers.map(x => x.getHandlerFunction()), ['writeVoteDocs']);   // 문서 기록은 트리거로
assert.deepStrictEqual(J(JSON.parse(gs.cacheGetBig_('VOTE_DOCS'))[3].us.lines.map(l => l.split(' — ')[1])), ['0표', '2표']);
gs.resetVotes_(); assert.deepStrictEqual(J(gs.readVotes_()).people, 0); assert.deepStrictEqual(J(gs.readVotes_()).done, {});
assert.ok(kinds().includes('투표 초기화 직전'));                         // 지우기 전에 남김
const raw = JSON.parse(sheets.log.rows.find(r => r[1] === '투표 초기화 직전')[3]);
assert.deepStrictEqual(raw.devices, { a: '3|t3n2|t3n3', b: '3|t3n2|' });
gs.writeState_({ voteOpen: false });
assert.ok(gs.vote_({ device: 'a', table: 3, us: 't3n1' }).error);

// 4) 13개 테이블 후보 + 공감 카드(글자 수 최대) → 9KB 넘어도 저장·읽기, 캐시가 지워져도 속성에서 그대로
const ko = n => '가'.repeat(n);
const ballot = {}, cards = [];
for (let t = 1; t <= 13; t++) {
  ballot[t] = { us: [1, 2, 3].map(n => ({ id: 't' + t + 'n' + n, no: n, text: ko(30), sub: ko(40) })), ext: [4, 5, 6].map(n => ({ id: 't' + t + 'n' + n, no: n, text: ko(30), sub: ko(40) })) };
  for (let k = 0; k < 4; k++) cards.push({ id: 't' + t + 'k' + k, table: t, topic: 'river', text: ko(24), sub: ko(40) });
}
const big = { stage: 'like', voteOpen: true, likeOpen: true, ballot, cards };
assert.ok(bytes(JSON.stringify(big)) > 3 * 9 * 1024);
gs.writeState_(big);
assert.deepStrictEqual(J(gs.readState_()).cards.length, 52);
delete cache.STATE;
assert.deepStrictEqual(J(gs.readState_()).ballot[13].ext[2].sub, ko(40));
gs.writeState_({ stage: 'wait' });                                   // 줄어들어도 예전 조각이 섞이지 않음
delete cache.STATE;
assert.deepStrictEqual(J(gs.readState_()).stage, 'wait');
assert.strictEqual(J(gs.readState_()).ballot, undefined);
propReads = 0;
for (let i = 0; i < 1000; i++) gs.readState_();                      // 휴대폰 1,000번 읽어도 속성은 0번
assert.strictEqual(propReads, 0);
gs.clearState_();
assert.strictEqual(gs.readState_(), null);
assert.ok(gs.like_({ device: 'a', ids: [] }).error);                 // 상태가 없으면 공감 닫힘

// 3-1) 투표 결과 → 테이블 문서 ③ 「투표 결과 · 주민/외부」 줄
const bal = { 3: { us: [{ id: 't3n1', no: 1, text: '함께 걷기', full: ['함께 걷기', '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기'] }, { id: 't3n2', no: 2, text: '사진 기록단' }], ext: [{ id: 't3n3', no: 3, text: '조명 정비' }, { id: 't3n4', no: 4, text: '표지판' }] } };
const vl = J(gs.voteLines_(bal, { a: '3|t3n1|t3n3', b: '3|t3n1|t3n4', c: '3|t3n2|', d: '5|t5n1|' }));
assert.deepStrictEqual(vl[3].us, { lines: ['1번 함께 걷기 — 2표', '2번 사진 기록단 — 1표'], sum: '3명 투표 · 1위 1번 함께 걷기 2표 → 선정 과제 자동 기록', pick: { title: '함께 걷기', body: '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기' } });
assert.deepStrictEqual(vl[3].ext, { lines: ['3번 조명 정비 — 1표', '4번 표지판 — 1표'], sum: '2명 투표 · 동점 3번·4번 1표 → 테이블에서 정해 선정 과제에 직접 적어요', pick: null });
const dcell = () => { let txt = ''; return { getText: () => txt, setText: v => { txt = v; } }; };
const drow = label => { const cs = [{ getText: () => label + '\n설명' }, dcell(), dcell()]; return { getNumCells: () => 3, getCell: c => cs[c] }; };
const drows = [drow('③ 우선 과제 선정하기'), drow('선정 과제 1 · 🟢 주민'), drow('투표 결과 · 🟢 주민'), drow('투표 결과 · 🔵 외부'), drow('선정 과제 2 · 🔵 외부')];
drows[4].getCell(1).setText('기록자가 쓴 것');
const dtable = { getCell: (r, c) => ({ getText: () => c === 1 ? '제안 제목 ✍️' : '③ 우선 과제 선정하기' }), getNumRows: () => drows.length, getRow: i => drows[i] };
assert.ok(gs.writeVoteDoc_([{ asDocumentTab: () => ({ getBody: () => ({ getTables: () => [dtable] }) }), getChildTabs: () => [] }], vl[3]));
assert.strictEqual(drows[2].getCell(1).getText(), '1번 함께 걷기 — 2표\n2번 사진 기록단 — 1표');
assert.strictEqual(drows[3].getCell(2).getText(), '2명 투표 · 동점 3번·4번 1표 → 테이블에서 정해 선정 과제에 직접 적어요');
assert.deepStrictEqual([drows[1].getCell(1).getText(), drows[1].getCell(2).getText()], ['함께 걷기', '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기']);  // 1위 하나 → 자동
assert.strictEqual(drows[4].getCell(1).getText(), '기록자가 쓴 것');   // 동점 → 기록자가 쓴 그대로
// 한 칸 양식(항목 | 제안 내용): 선정 과제 = 「제목 — 내용」 한 칸, 투표 결과 = 요약 + 줄
const orow = label => { const cs = [{ getText: () => label + '\n설명' }, dcell()]; return { getNumCells: () => 2, getCell: c => cs[c] }; };
const orows = [orow('③ 우선 과제 선정하기'), orow('선정 과제 1 · 🟢 주민'), orow('선정 과제 2 · 🔵 외부'), orow('투표 결과 · 🟢 주민'), orow('투표 결과 · 🔵 외부')];
const otable = { getCell: (r, c) => ({ getText: () => c === 1 ? '제안 내용 ✍️' : '③ 우선 과제 선정하기' }), getNumRows: () => orows.length, getRow: i => orows[i] };
assert.ok(gs.writeVoteDoc_([{ asDocumentTab: () => ({ getBody: () => ({ getTables: () => [otable] }) }), getChildTabs: () => [] }], vl[3]));
assert.strictEqual(orows[1].getCell(1).getText(), '함께 걷기 — 두 동 주민이 한 달에 한 번 함께 걷고 길 살피기');
assert.strictEqual(orows[2].getCell(1).getText(), '');   // 동점 → 비워 둠
assert.strictEqual(orows[3].getCell(1).getText(), '3명 투표 · 1위 1번 함께 걷기 2표 → 선정 과제 자동 기록\n1번 함께 걷기 — 2표\n2번 사진 기록단 — 1표');
// 한 칸 양식 문서 읽기: 투표 결과 칸 첫 줄(요약)이 화면에
const o3 = [[['③ 우선 과제 선정하기'], ['제안 내용 ✍️', '② 표에 쓴 제안 그대로']], [['예시'], ['두 동…']], [['선정 과제 1 · 🟢 주민', '설명'], ['한 달에 한 번 함께 걷기']], [['투표 결과 · 🟢 주민', '자동'], ['3명 투표 · 1위', '1번 — 2표']]];
assert.deepStrictEqual(A.parseDoc(o3).map(x => x.field + x.task + ':' + x.text), ['pick0:한 달에 한 번 함께 걷기', 'tally0:3명 투표 · 1위', 'tally0:1번 — 2표']);

// 4-1) 공감: 카드·열기·마치기·초기화 모두 기록, 큰 자료는 옆 칸으로 나눔
gs.writeState_({ likeOpen: true, cards: [{ id: 'c1', table: 1, topic: 'river', text: '산책로' }, { id: 'c2', table: 2, topic: 'park', text: '벤치' }] });
gs.like_({ device: 'p', ids: ['c1', 'c2'] }); gs.like_({ device: 'q', ids: ['c1'] });
gs.writeState_({ likeOpen: false, cards: J(gs.readState_()).cards });
assert.deepStrictEqual(J(sheets.likes.rows.slice(1).map(r => [r[2], r[4], r[7]])), [['c1', '강', 2], ['c2', '공원', 1]]);
gs.pushManual_({ key: 'SECRET', table: 4, field: 'good', task: 0, text: '한 줄' });
assert.ok(!JSON.stringify(sheets.log.rows).includes('SECRET'));          // 비밀번호는 남기지 않음
gs.log_('검수 저장', '큰 자료', { x: ko(60000) });
assert.ok(sheets.log.rows[sheets.log.rows.length - 1].length >= 5 && sheets.log.rows.every(r => r.every(c => String(c).length <= 50000)));

// 5) AI 다듬기 입력이 100KB를 넘어도 캐시에 나눠 담기
const input = JSON.stringify(Array.from({ length: 900 }, (_, i) => ({ table: i % 13 + 1, text: ko(60) })));
assert.ok(bytes(input) > 150 * 1024);
gs.cachePutBig_('SUM_INPUT', input, 1800);
assert.strictEqual(gs.cacheGetBig_('SUM_INPUT'), input);
delete cache.SUM_INPUT_1;
assert.strictEqual(gs.cacheGetBig_('SUM_INPUT'), null);               // 조각이 빠지면 없음으로

// 7) ⑤ 테이블에서 AI 다듬기 → 퍼실 확정 (다른 테이블 요약은 그대로)
gs.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
store.GEMINI_API_KEY = 'k';
gs.callGemini_ = () => ({ model: 'm', parsed: { tables: [{ no: 4, tasks: [{ title: '다듬음', bg: 'b', want: 'w', prop: 'p', first: 'f', with: 'x', us: '', ext: '' }] }], topics: [] } });
let SUM = { tables: { 2: { tasks: [{ title: '관제가 다듬음' }] } }, topics: { river: { summary: 's', points: [] } } };   // summary 시트 대신
gs.saveSummary_ = d => { SUM = JSON.parse(JSON.stringify({ tables: d.tables, topics: d.topics })); return gs.readSummary_(); };
gs.readSummary_ = () => Object.assign(JSON.parse(JSON.stringify(SUM)), { confirm: gs.readConfirm_() });
gs.writeState_({ stage: 'talk', sub: 1 });
assert.ok(gs.aiTable_({ table: 4, input: { no: 4, tasks: [{ prop: '원문' }] } }).error);   // ④ 전에는 안 됨
gs.writeState_({ stage: 'talk', sub: 4 });
assert.ok(gs.aiTable_({ table: 4, input: { no: 5, tasks: [{}] } }).error);                // 다른 테이블 입력은 거절
assert.ok(gs.confirmTable_({ table: 4, use: 'ai' }).error);                                 // AI 문장 없이 AI 확정 불가
const at = J(gs.aiTable_({ table: 4, input: { no: 4, tasks: [{ prop: '원문' }] } }));
assert.ok(at.ok && at.table.byTable && at.table.tasks[0].title === '다듬음');
let sm = J(gs.readSummary_());
assert.strictEqual(sm.tables[2].tasks[0].title, '관제가 다듬음'); assert.strictEqual(sm.topics.river.summary, 's');   // 다른 것 그대로
assert.ok(gs.confirmTable_({ table: 4, use: 'ai' }).ok);
assert.strictEqual(J(gs.readSummary_()).confirm[4].use, 'ai');
assert.ok(gs.confirmTable_({ table: 4, use: 'raw' }).ok);                                   // 원문으로 → AI 문장 지움
sm = J(gs.readSummary_()); assert.ok(!sm.tables[4] && sm.tables[2] && sm.confirm[4].use === 'raw');
assert.ok(gs.confirmTable_({ table: 4, use: 'cancel' }).ok); assert.ok(!J(gs.readSummary_()).confirm[4]);
assert.ok(kinds().includes('AI 실행 (테이블)') && kinds().includes('⑤ 퍼실 확정'));
console.log('ok');
