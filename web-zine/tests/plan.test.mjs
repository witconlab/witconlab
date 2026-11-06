import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, schedulePhases, FIELDS, QUESTIONS, SAMPLE, PH } from '../js/plan.js';

test('empty answers: every plan field is the "(적어 주세요)" placeholder', () => {
  for (const a of [undefined, null, {}, { budget: {} }, { kinds: [], count: '' }]) {
    const p = buildPlan(a);
    for (const f of FIELDS) assert.equal(p[f.key], PH, f.key);
    assert.deepEqual(p.budgetRows, []);
    assert.equal(p.budgetTotal, 0);
  }
});

test('ten screens: nine questions + one-line summary, every plan field fed by a question', () => {
  assert.equal(QUESTIONS.length, 10);
  const fed = new Set(QUESTIONS.flatMap((q) => q.to));
  for (const f of FIELDS) assert.ok(fed.has(f.label), f.label);
});

test('sample answers fill every field with the expected texts', () => {
  const p = buildPlan(SAMPLE);
  for (const f of FIELDS) assert.notEqual(p[f.key], PH, f.key);
  assert.equal(p.title, '송정동 간판 이야기');
  assert.equal(p.target, '광산구 송정동 골목의 40년 단골가게와 간판\n· 가게·간판, 이웃 이야기');
  assert.match(p.background, /^간판이 하나둘 바뀌는데/);
  assert.match(p.background, /· 곧 없어지거나 바뀔 것 같아서/);
  assert.match(p.people, /모두 10명$/);
  assert.match(p.methods, /· 눈으로 찍기 — /);
  assert.match(p.methods, /→ 간판 찍고/);
  assert.equal(p.schedule.split('\n')[0], '4~9월 (6개월), 한 달에 2번 모임');
  assert.equal(p.budgetTotal, 150);
  assert.match(p.budget, /합계 150만원$/);
  assert.equal(p.budgetRows.length, 5);
});

test('title falls back to place + what from question 1', () => {
  assert.equal(buildPlan({ place: '송정동', what: '간판' }).title, '송정동 ‘간판’ 기록');
  assert.equal(buildPlan({ place: '송정동' }).title, '송정동 기록');
});

test('budget: ticked item without amount still shows, amounts summed', () => {
  const p = buildPlan({ budget: { print: '40', fee: '' } });
  assert.deepEqual(p.budgetRows.map((r) => [r.id, r.amount]), [['print', 40], ['fee', null]]);
  assert.equal(p.budget, '· 출력·인쇄비 40만원\n· 사례비 (금액)\n합계 40만원');
});

test('schedule phases wrap around the year and skip short plans', () => {
  assert.deepEqual(schedulePhases(4, 6), ['4월 모여서 계획 세우기', '5~7월 동네 걸으며 기록하기', '8월 진·전시·지도 만들기', '9월 동네에 나누기']);
  assert.deepEqual(schedulePhases(11, 3), ['11월 모여서 계획 세우기', '12월 동네 걸으며 기록하기', '1월 정리해서 만들고 나누기']);
  assert.deepEqual(schedulePhases(4, 0), []);
  assert.equal(buildPlan({ start: '11', dur: '3' }).schedule.split('\n')[0], '11~1월 (3개월)');
});
