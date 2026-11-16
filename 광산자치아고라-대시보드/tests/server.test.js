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
const store = {};
gs.PropertiesService = { getScriptProperties: () => ({ getProperty: k => store[k] || null, setProperty: (k, v) => { store[k] = v; }, deleteProperty: k => { delete store[k]; }, getProperties: () => Object.assign({}, store) }) };
store.STATE = JSON.stringify({ voteOpen: true, ballot: { 3: { us: [{ id: 't3n1' }, { id: 't3n2' }], ext: [{ id: 't3n3' }] } } });
assert.deepStrictEqual(J(gs.vote_({ device: 'a', table: 3, us: 't3n1', ext: 't3n3' })), { ok: true, us: 't3n1', ext: 't3n3' });
gs.vote_({ device: 'b', table: 3, us: 't3n2', ext: 'zzz' });        // 외부 후보가 아니면 빈칸
gs.vote_({ device: 'a', table: 3, us: 't3n2', ext: 't3n3' });       // 다시 누르면 바뀜
assert.deepStrictEqual(J(gs.readVotes_()), { counts: { t3n2: 2, t3n3: 1 }, people: 2 });
assert.ok(gs.vote_({ device: 'c', table: 9, us: 't3n1' }).error);    // 후보 없는 테이블
gs.resetVotes_(); assert.deepStrictEqual(J(gs.readVotes_()).people, 0);
store.STATE = JSON.stringify({ voteOpen: false });
assert.ok(gs.vote_({ device: 'a', table: 3, us: 't3n1' }).error);
console.log('ok');
