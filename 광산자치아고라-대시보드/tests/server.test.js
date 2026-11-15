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
  } else {
    serverRows.push([[s.head], ['예시 (이렇게 쓰면 돼요)'], ['우리 테이블 답 ✍️']]);
    s.rows.forEach(r => serverRows.push([r[1] ? [r[0], r[1]] : [r[0]], r[2] ? [r[2]] : [], []]));
  }
});
assert.deepStrictEqual(serverRows, A.rowsFromCells({}));
assert.strictEqual(serverRows.length, 51);
assert.deepStrictEqual(J(gs.DOC_TABLES).map(s => s.tab), A.TEMPLATE.map(s => s.tab));

// 2) Docs API JSON(탭 여러 개) → 표 행
const para = t => ({ paragraph: { elements: [{ textRun: { content: t + '\n' } }] } });
const cell = (...ps) => ({ content: ps.length ? ps.map(para) : [para('')] });
const tbl = rows => ({ table: { tableRows: rows.map(r => ({ tableCells: r })) } });
const doc = { tabs: [
  { documentTab: { body: { content: [para('안내')] } } },
  { documentTab: { body: { content: [tbl([[cell('① 이용 경험 나누기'), cell('좋았던 점'), cell('불편한 점'), cell('개선점')], [cell('참여자 1'), cell('물소리\u000b산책로 넓음'), cell(), cell('벤치')]])] } } },
  { documentTab: { body: { content: [tbl([[cell('② 함께 할 일 제안하기'), cell('예시'), cell('답')], [cell('[외부협력]', '설명'), cell(), cell('조명  정비')]])] } }, childTabs: [] }
] };
const rows = J(gs.jsonRows_(doc));
assert.deepStrictEqual(rows[1], [['참여자 1'], ['물소리', '산책로 넓음'], [], ['벤치']]);
assert.deepStrictEqual(A.parseDoc(rows).map(x => x.field + ':' + x.text), ['good:물소리', 'good:산책로 넓음', 'better:벤치', 'ext:조명 정비']);

// 3) (대체 경로) HTML 내보내기
const html = '<table><tr><td><p><span>④ 과제 2 실행방법</span></p></td><td><p></p></td><td><p>x</p></td></tr><tr><td><p>우리의 제안</p><p>설명</p></td><td></td><td><p>공원&nbsp;이웃 &lt;모임&gt; &middot; &ldquo;함께&rdquo;</p></td></tr></table>';
assert.deepStrictEqual(A.parseDoc(J(gs.docRows_(html))).map(x => x.cell + ':' + x.text), ['prop1:공원 이웃 <모임> · “함께”']);
console.log('ok');
