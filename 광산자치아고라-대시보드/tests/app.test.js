// 실행: node tests/app.test.js  (표 양식 → 파서 → 테이블 정리·공감 카드)
const assert = require('assert');
global.window = { addEventListener() {} }; global.location = { search: '?demo' };
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; }, removeItem(k) { delete this._[k]; } };
require('../assets/app.js');
const A = window.Agora;
const key = (field, task = 0, n = 0) => A.slotList().filter(x => x.field === field && x.task === task)[n].key;
const short = p => p.map(x => x.field + x.task + ':' + x.text);

// 빈 양식(예시만 있음)은 아무것도 안 나옴
assert.deepStrictEqual(A.parseDoc(A.rowsFromCells({})), []);

const cells = {};
cells[key('good', 0, 0)] = ['산책 좋아요'];            // 참여자 1 좋았던 점
cells[key('bad', 0, 1)] = ['밤에 어두워요'];           // 참여자 2 불편한 점
cells[key('good', 0, 2)] = ['산책 좋아요'];            // 참여자 3 같은 말 → 카드 따로
cells[key('us', 0, 0)] = ['함께 걷기', '[외부협력] 조명 정비'];  // 칸 안 표시가 우선
cells[key('ext', 0, 0)] = ['안내표지'];
cells[key('pick', 0)] = ['[주민실천] 함께 걷기'];      // 과제 하나만
cells[key('rest', 0, 0)] = ['[외부협력] 화장실 (2표)'];
cells[key('rest', 0, 1)] = ['쓰레기통'];
cells[key('prop', 0)] = ['공원 이웃'];
cells[key('done')] = ['제출'];
const p = A.parseDoc(A.rowsFromCells(cells));
assert.deepStrictEqual(short(p), ['good0:산책 좋아요', 'bad0:밤에 어두워요', 'good0:산책 좋아요', 'us0:함께 걷기', 'ext0:조명 정비', 'ext0:안내표지', 'pick0:[주민실천] 함께 걷기', 'rest0:[외부협력] 화장실 (2표)', 'rest0:쓰레기통', 'prop0:공원 이웃', 'done0:제출']);
assert.notStrictEqual(p[0].slot, p[2].slot);  // 쓰는 중 판단은 칸마다

(async () => {
  localStorage.setItem('agora-vdocs-v2b', JSON.stringify({ 1: cells }));
  const items = await A.loadFeed();
  assert.strictEqual(new Set(items.map(i => i.id)).size, items.length);
  const d = A.tableData(items, 1);
  assert.deepStrictEqual(d.picks, [{ text: '함께 걷기', kind: 'us', task: 0 }]);
  assert.deepStrictEqual(d.rest.map(r => r.kind + ':' + r.text), ['ext:화장실 (2표)', ':쓰레기통']);
  assert.ok(d.done);
  const ps = A.proposals(1, items, null, false);
  assert.strictEqual(ps.length, 1);                 // 선정 과제가 하나면 제안서도 하나
  assert.strictEqual(ps[0].title, '함께 걷기');
  assert.strictEqual(A.buildCards(items, null, false).length, 1);
  // 데모 시뮬레이터가 양식 칸을 채움
  for (let sub = 0; sub < 5; sub++) for (let i = 0; i < 60; i++) A.simTick({ stage: 'talk', sub });
  const all = await A.loadFeed();
  assert.ok(['good', 'us', 'ext', 'pick', 'rest', 'bg', 'done'].every(f => all.some(i => i.field === f)));
  console.log('ok', all.length);
})().catch(e => { console.error(e); process.exit(1); });
