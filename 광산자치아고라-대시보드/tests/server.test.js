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
    J(gs.pairRows_(s)).forEach(r => serverRows.push(r.kind === 'band' ? [[r.g.band, r.g.desc], [], []] : r.cells.map(x => x ? [x] : [])));
  } else {
    serverRows.push([[s.head], ['예시 (이렇게 쓰면 돼요)'], ['우리 테이블 답 ✍️']]);
    s.rows.forEach(r => serverRows.push([r[1] ? [r[0], r[1]] : [r[0]], r[2] ? [r[2]] : [], []]));
  }
});
assert.deepStrictEqual(serverRows, A.rowsFromCells({}));
assert.strictEqual(serverRows.length, 58);
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

// 3) ③ 테이블별 투표: 후보 밖 id 는 버리고, 기기마다 마지막 표만 셈
// 가짜 스프레드시트(기록 시트용)
const sheets = {};
const mkSheet = () => { const rows = []; return { rows, getLastRow: () => rows.length, appendRow: r => rows.push(r), getRange: (r, c, n) => ({ setValues: v => { rows.splice(r - 1, n, ...v); } }) }; };
gs.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n], insertSheet: n => (sheets[n] = mkSheet()) }) };
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
assert.deepStrictEqual(J(gs.readVotes_()), { counts: { t3n2: 2, t3n3: 1 }, people: 2 });
assert.ok(gs.vote_({ device: 'c', table: 9, us: 't3n1' }).error);    // 후보 없는 테이블
gs.writeState_({ voteOpen: false, ballot: J(gs.readState_()).ballot }); // 투표 마치기 → 결과 스냅숏
const vrows = sheets.votes.rows;
assert.deepStrictEqual(J(vrows[0].slice(2)), ['테이블', '구분', '번호', '제안', '설명', '표 수']);
assert.deepStrictEqual(J(vrows.slice(1).map(r => [r[1], r[2], r[3], r[7]])), [['투표 마치기', 3, '주민', 0], ['투표 마치기', 3, '주민', 2], ['투표 마치기', 3, '외부', 1]]);
assert.ok(kinds().includes('투표 마치기') && kinds().includes('화면'));
gs.resetVotes_(); assert.deepStrictEqual(J(gs.readVotes_()).people, 0);
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
console.log('ok');
