// 실행: node tests/app.test.js  (표 양식 → 파서 → 테이블 정리·공감 카드)
const assert = require('assert');
global.window = { addEventListener() {} }; global.location = { search: '?demo' };
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
require('../assets/app.js');
const A = window.Agora;
const key = (field, task = 0, n = 0) => A.slotList().filter(x => x.field === field && x.task === task)[n].key;
const short = p => p.map(x => x.field + x.task + ':' + x.text);

// 현장 배치도: 13개 테이블 = 강 4 · 산 3 · 하천 4 · 공원 2
assert.deepStrictEqual(A.DEFAULT_TABLES.map(t => t.topic).join(','), 'river,river,river,river,mount,mount,mount,stream,stream,stream,stream,park,park');

// 빈 양식(예시만 있음)은 아무것도 안 나옴
assert.deepStrictEqual(A.parseDoc(A.rowsFromCells({})), []);

const cells = {};
cells[key('good', 0, 0)] = ['산책 좋아요'];            // 참여자 1 좋았던 점
cells[key('bad', 0, 1)] = ['밤에 어두워요'];           // 참여자 2 불편한 점
cells[key('good', 0, 2)] = ['산책 좋아요'];            // 참여자 3 같은 말 → 카드 따로
cells[key('us', 0, 0)] = ['함께 걷기'];                // ② [주민실천] 1: 제목
cells[key('us', 0, 1)] = ['한 달에 한 번', '같이 걷기'];  //            핵심 내용(여러 줄도 한 제안)
cells[key('us', 0, 2)] = ['[외부협력] 조명 정비'];      // [주민실천] 2: 칸 안 표시가 우선
cells[key('ext', 0, 1)] = ['안내표지만'];               // [외부협력] 1: 핵심 내용만 써도 올라감
cells[key('pick', 0, 0)] = ['함께 걷기'];                // ③ 선정 과제 1: 제목 (과제 하나만)
cells[key('pick', 0, 1)] = ['한 달에 한 번 같이 걷기'];     //              핵심 내용
cells[key('prop', 0)] = ['공원 이웃'];
cells[key('done')] = ['제출'];
const p = A.parseDoc(A.rowsFromCells(cells));
assert.deepStrictEqual(short(p), ['good0:산책 좋아요', 'bad0:밤에 어두워요', 'good0:산책 좋아요', 'us0:함께 걷기 — 한 달에 한 번 같이 걷기', 'ext0:조명 정비', 'ext0:안내표지만', 'pick0:함께 걷기 — 한 달에 한 번 같이 걷기', 'prop0:공원 이웃', 'done0:제출']);
assert.notStrictEqual(p[0].slot, p[2].slot);  // 쓰는 중 판단은 칸마다

(async () => {
  localStorage.setItem('agora-vdocs-v2b', JSON.stringify({ 1: cells }));
  const items = await A.loadFeed();
  assert.strictEqual(new Set(items.map(i => i.id)).size, items.length);
  const d = A.tableData(items, 1);
  assert.deepStrictEqual(d.picks, [{ text: '함께 걷기', sub: '한 달에 한 번 같이 걷기', kind: 'us', task: 0 }]);
  assert.ok(d.done);
  const ps = A.proposals(1, items, null, false);
  assert.strictEqual(ps.length, 1);                 // 선정 과제가 하나면 제안서도 하나
  assert.strictEqual(ps[0].title, '함께 걷기');
  assert.strictEqual(A.buildCards(items, null, false).length, 1);
  // 데모 시뮬레이터가 양식 칸을 채움
  for (let sub = 0; sub < 5; sub++) for (let i = 0; i < 60; i++) A.simTick({ stage: 'talk', sub });
  const all = await A.loadFeed();
  assert.ok(['good', 'us', 'ext', 'pick', 'tally', 'bg', 'done'].every(f => all.some(i => i.field === f)));
  console.log('ok', all.length);
})().catch(e => { console.error(e); process.exit(1); });

// 기록자 역할 반영: 참여 동, AI 문장 확인, ⑥ 공유 확인, ⑦ 추가 의견, 제안 번호·제목
(async () => {
  const k = f => A.slotList().find(x => x.field === f).key;
  const c = { [k('dongs')]: ['첨단1동, 첨단2동'], [k('aiCheck')]: ['줍깅을 그대로'],
    [k('us')]: ['함께 걷기 — 한 달에 한 번 걷기'], [k('ext')]: ['안내표지: 새로 달기'] };
  const items = A.parseDoc(A.rowsFromCells(c)).map((x, i) => Object.assign({ table: 2, id: 'x' + i }, x));
  const d = A.tableData(items, 2);
  assert.strictEqual(d.dongs, '첨단1동, 첨단2동');
  assert.deepStrictEqual(d.aiCheck.length, 1);
  assert.deepStrictEqual(A.numbered(d).map(x => x.no + x.kind), ['1us', '2ext']);
  assert.deepStrictEqual(A.splitTitle(d.us[0].text), ['함께 걷기', '한 달에 한 번 걷기']);
  assert.deepStrictEqual(A.splitTitle(d.ext[0].text), ['안내표지', '새로 달기']);
  assert.deepStrictEqual(A.splitTitle('그냥 한 문장'), ['', '그냥 한 문장']);
  // ③ 투표 후보: 화면 번호 그대로, 주민·외부 따로
  const bt = A.buildBallot(items)[2];
  assert.deepStrictEqual(bt.us.map(o => [o.id, o.no, o.text, o.sub]), [['t2n1', 1, '함께 걷기', '한 달에 한 번 걷기']]);
  assert.deepStrictEqual(bt.ext.map(o => [o.id, o.no, o.text]), [['t2n2', 2, '안내표지']]);
  console.log('ok roles');
})().catch(e => { console.error(e); process.exit(1); });
