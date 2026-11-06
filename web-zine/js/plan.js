// 3차시 "내년 기록화 사업 원페이퍼": questions, sample answers, answer -> plan mapping, and the web question flow.
// The data + buildPlan() are pure (imported by tests and by print/session3-print.js); the UI only starts on plan.html.

export const PH = '(적어 주세요)';
export const STORE_KEY = 'webzine.plan';
export const SESSION_KEY = 'webzine.session';

// Line icons (24x24, stroke = currentColor) used on screen and on paper.
export const ICONS = {
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  ques: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 015.2 1c0 1.8-2.6 2.3-2.6 4"/><path d="M12 17.6v.1"/>',
  bang: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6.5"/><path d="M12 17v.1"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3.6 3-5.3 5.5-5.3s4.9 1.7 5.5 5.3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.1c2.4-.2 4.3 1.3 4.7 4.4"/>',
  camera: '<path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M8 14h2M12 14h2M8 17h2"/>',
  book: '<path d="M4 5.5c2.7-.9 5.4-.6 8 1 2.6-1.6 5.3-1.9 8-1v13c-2.7-.9-5.4-.6-8 1-2.6-1.6-5.3-1.9-8-1z"/><path d="M12 6.5v13"/>',
  house: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.6V20h12V9.6"/><path d="M10 20v-5h4v5"/>',
  coin: '<ellipse cx="12" cy="7" rx="7" ry="2.8"/><path d="M5 7v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V7"/><path d="M5 12v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/>',
  pen: '<path d="M15.5 4.5l4 4L9 19l-4.6.6L5 15z"/><path d="M13.5 6.5l4 4"/>',
  arrow: '<path d="M4 12h15"/><path d="M14 6.5l5.5 5.5-5.5 5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
export const icon = (name, size = 24, sw = 2) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const CIRCLED = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

// Each question: parts are the things a learner fills (tick choices first, then a short line).
// `to` = the plan boxes this question is copied into.
export const QUESTIONS = [
  {
    n: 1, icon: 'pin', title: '어느 동네의 무엇을 기록하고 싶나요?', to: ['사업명', '기록 대상·장소'],
    example: '광산구 송정동 골목 / 40년 단골가게와 간판',
    parts: [
      { type: 'text', key: 'place', label: '어느 동네?', lines: 1, ph: '예) 광산구 송정동 골목' },
      { type: 'multi', key: 'kinds', cols: 2, label: '무엇을? (여러 개 골라도 돼요)', options: [
        ['shop', '가게·간판'], ['alley', '골목·길'], ['market', '시장'],
        ['house', '집·마을'], ['nature', '나무·꽃'], ['people', '이웃 이야기'],
      ] },
      { type: 'text', key: 'what', label: '한마디로 적으면?', lines: 1, ph: '예) 40년 단골가게와 간판' },
    ],
  },
  {
    n: 2, icon: 'ques', title: '왜 지금 기록해야 하나요?', sub: '내 물음표', to: ['추진 배경'],
    example: '간판이 하나둘 바뀌는데, 이 가게들은 언제부터 여기 있었을까?',
    parts: [
      { type: 'multi', key: 'whyPicks', label: '이유를 골라 보세요', options: [
        ['gone', '곧 없어지거나 바뀔 것 같아서'], ['fewer', '기억하는 사람이 줄어서'], ['none', '남은 기록이 거의 없어서'],
        ['young', '젊은 사람들이 잘 몰라서'], ['love', '내가 아끼는 곳이라서'],
      ] },
      { type: 'text', key: 'why', lines: 2, label: '내 물음표 한 줄 (왜 ~일까?)', ph: '예) 이 가게들은 언제부터 여기 있었을까?' },
    ],
  },
  {
    n: 3, icon: 'bang', title: '기록해서 무엇을 남기고 싶나요?', sub: '내 느낌표', to: ['목적'],
    example: '아하, 간판 하나에 한 집안의 40년이 들어 있구나!',
    parts: [
      { type: 'multi', key: 'keepPicks', label: '남기고 싶은 것', options: [
        ['story', '가게와 사람의 이야기'], ['look', '지금 모습 (사진·그림)'], ['memory', '동네 사람들의 기억'],
        ['sound', '동네의 소리와 말'], ['pride', '동네 자랑거리'],
      ] },
      { type: 'text', key: 'aha', lines: 2, label: '내 느낌표 한 줄 (아하, ~구나!)', ph: '예) 간판마다 40년이 들어 있구나!' },
    ],
  },
  {
    n: 4, icon: 'people', title: '누구와 함께하나요?', to: ['참여 대상·인원'],
    example: '수업 이웃 6명 + 가게 사장님 4명 = 모두 10명',
    parts: [
      { type: 'multi', key: 'who', label: '함께할 사람', options: [
        ['class', '이 수업을 들은 이웃'], ['elder', '동네 어르신'], ['owner', '가게 주인·상인'],
        ['young', '학생·청년'], ['family', '가족'],
      ] },
      { type: 'number', key: 'count', label: '모두 몇 명?', suffix: '명', ph: '10' },
    ],
  },
  {
    n: 5, icon: 'camera', title: '어떤 방법으로 모으나요?', sub: '다섯 묶음', to: ['기록 방법'],
    example: '간판 찍고, 사장님 이야기 듣기',
    parts: [
      { type: 'multi', key: 'methods', label: '해 볼 방법 (여러 개)', options: [
        ['eye', '눈으로 찍기', '간판·골목 색·바닥 무늬·풀꽃'], ['hand', '손으로 남기기', '문질러 본뜨기·그리기'],
        ['ear', '귀로 듣기', '동네 소리·동네 말·이웃 이야기'], ['body', '몸으로 느끼기', '걸은 길·볕과 그늘·고양이'],
        ['find', '찾아서 담기', '옛 신문·옛 하늘사진·예전 사진'],
      ] },
      { type: 'text', key: 'how', lines: 1, label: '가장 해 보고 싶은 것', ph: '예) 간판 사진 찍고 이야기 듣기' },
    ],
  },
  {
    n: 6, icon: 'cal', title: '언제, 몇 번 하나요?', to: ['추진 일정'],
    example: '4월부터 6개월 동안, 한 달에 2번 모여요',
    parts: [
      { type: 'number', key: 'start', label: '몇 월에 시작?', suffix: '월', ph: '4', min: 1, max: 12 },
      { type: 'single', key: 'dur', label: '얼마 동안?', cols: 2, options: [['3', '3개월'], ['6', '6개월'], ['10', '10개월']] },
      { type: 'single', key: 'freq', label: '얼마나 자주?', options: [['m1', '한 달에 1번'], ['m2', '한 달에 2번'], ['w1', '매주 1번']] },
    ],
  },
  {
    n: 7, icon: 'book', title: '무엇이 만들어지나요?', to: ['결과물'],
    example: '진 100부, 작은 전시 1번, 골목 지도 300장',
    parts: [
      { type: 'multi', key: 'outputs', label: '만들 것 (여러 개)', options: [
        ['zine', '진 (작은 책)'], ['show', '작은 전시'], ['map', '동네 지도'],
        ['card', '사진 엽서'], ['sound', '소리·영상 기록'], ['web', '웹 진 (온라인)'],
      ] },
      { type: 'text', key: 'outDetail', lines: 2, label: '얼마나? (몇 부·몇 번)', ph: '예) 진 100부, 전시 1번' },
    ],
  },
  {
    n: 8, icon: 'house', title: '동네에 무엇이 좋아지나요?', to: ['기대효과'],
    example: '사장님들 이야기가 책으로 남고, 골목에 다시 사람이 와요',
    parts: [
      { type: 'multi', key: 'effects', label: '좋아지는 것', options: [
        ['know', '이웃끼리 더 알게 돼요'], ['keep', '동네 이야기가 남아요'], ['shop', '가게에 손님이 와요'],
        ['kids', '아이들이 동네를 배워요'], ['proud', '동네가 자랑스러워져요'],
      ] },
      { type: 'text', key: 'good', lines: 2, label: '한 줄로 더 적으면', ph: '예) 골목에 다시 사람이 와요' },
    ],
  },
  {
    n: 9, icon: 'coin', title: '무엇이 필요한가요?', sub: '대략 금액', to: ['예산'],
    example: '출력비 60만원, 사례비 30만원 (대략이면 돼요)',
    parts: [
      { type: 'budget', key: 'budget', label: '필요한 것에 표시하고 금액 (만원)', options: [
        ['print', '출력·인쇄비', '진·지도 인쇄'], ['material', '재료비', '종이·문구·액자'], ['fee', '사례비', '이야기 들려주신 분'],
        ['teach', '강사비', '전문가 도움'], ['show', '전시·설치비', '현수막·거치대'], ['meet', '모임비', '간식·음료'],
      ] },
    ],
  },
  {
    n: 10, icon: 'pen', title: '우리 사업을 한 문장으로!', sub: '한 줄 요약', to: ['사업명', '한 줄 요약'],
    example: '송정동 단골가게와 간판을 이웃 10명이 기록해 책·전시·지도로 남깁니다.',
    parts: [
      { type: 'text', key: 'title', lines: 1, label: '사업 이름 (안 지으면 ①로 자동)', ph: '예) 송정동 간판 이야기' },
      { type: 'textarea', key: 'summary', lines: 3, label: '(어디)에서 (무엇)을 (누구)와 기록해 (무엇)으로 남깁니다.', ph: '한 문장으로 적어 보세요' },
    ],
  },
];

// The one-page plan, in reading order. `q` = question numbers it is copied from.
export const FIELDS = [
  { key: 'title', label: '사업명', q: [1, 10] },
  { key: 'summary', label: '한 줄 요약', q: [10] },
  { key: 'background', label: '추진 배경', q: [2] },
  { key: 'purpose', label: '목적', q: [3] },
  { key: 'target', label: '기록 대상·장소', q: [1] },
  { key: 'people', label: '참여 대상·인원', q: [4] },
  { key: 'methods', label: '기록 방법', q: [5] },
  { key: 'schedule', label: '추진 일정', q: [6] },
  { key: 'outputs', label: '결과물', q: [7] },
  { key: 'effects', label: '기대효과', q: [8] },
  { key: 'budget', label: '예산', q: [9] },
];

export const SAMPLE = {
  name: '김순자',
  place: '광산구 송정동 골목',
  kinds: ['shop', 'people'],
  what: '40년 단골가게와 간판',
  whyPicks: ['gone', 'fewer'],
  why: '간판이 하나둘 바뀌는데, 이 가게들은 언제부터 여기 있었을까?',
  keepPicks: ['story', 'look'],
  aha: '아하, 간판 하나에 한 집안의 40년이 들어 있구나!',
  who: ['class', 'owner'],
  count: '10',
  methods: ['eye', 'hand', 'ear'],
  how: '간판 찍고, 사장님 이야기 듣기',
  start: '4',
  dur: '6',
  freq: 'm2',
  outputs: ['zine', 'show', 'map'],
  outDetail: '진 100부, 작은 전시 1번, 골목 지도 300장',
  effects: ['know', 'keep', 'shop'],
  good: '사장님들 이야기가 책으로 남고, 골목에 다시 사람이 와요',
  budget: { print: '60', material: '20', fee: '30', show: '25', meet: '15' },
  title: '송정동 간판 이야기',
  summary: '송정동 골목 40년 단골가게와 간판을 이웃 10명이 기록해 책·전시·지도로 남깁니다.',
};

const QBY = Object.fromEntries(QUESTIONS.flatMap((q) => q.parts.map((p) => [p.key, p])));
export const partOf = (key) => QBY[key];

const str = (v) => (v == null ? '' : String(v)).trim();
const list = (v) => (Array.isArray(v) ? v : []);
const optLabel = (key, id) => (partOf(key).options.find((o) => o[0] === id) || [])[1];
const optHint = (key, id) => (partOf(key).options.find((o) => o[0] === id) || [])[2];
const labels = (a, key) => list(a[key]).map((id) => optLabel(key, id)).filter(Boolean);
const bullets = (arr) => arr.map((s) => '· ' + s);
const join = (lines) => { const t = lines.filter((l) => str(l)).join('\n'); return t || PH; };
const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && String(v ?? '').match(/[0-9]/) ? n : null; };

export const won = (manwon) => `${manwon.toLocaleString('ko-KR')}만원`;

// Budget rows: every ticked item (amount may still be empty) plus any item with an amount.
export function budgetRows(a) {
  const b = (a && typeof a.budget === 'object' && a.budget) || {};
  return partOf('budget').options
    .filter(([id]) => id in b)
    .map(([id, label, hint]) => ({ id, label, hint, amount: num(b[id]) }));
}

function monthRange(start, len) {
  const m = (k) => ((start - 1 + k) % 12) + 1;
  return len <= 1 ? `${m(0)}월` : `${m(0)}~${m(len - 1)}월`;
}

// Simple stage plan from start month + length, e.g. 4월 계획 / 5~7월 기록 / 8월 만들기 / 9월 나누기.
export function schedulePhases(start, dur) {
  if (!start || !dur || start < 1 || start > 12 || dur < 3) return [];
  const steps = dur >= 6 ? [1, dur - 3, 1, 1] : [1, Math.max(1, dur - 2), 1, 0];
  const names = ['모여서 계획 세우기', '동네 걸으며 기록하기', '진·전시·지도 만들기', '동네에 나누기'];
  if (dur < 6) names[2] = '정리해서 만들고 나누기';
  const out = []; let at = start;
  steps.forEach((len, i) => {
    if (!len) return;
    out.push(`${monthRange(at, len)} ${names[i]}`);
    at = ((at - 1 + len) % 12) + 1;
  });
  return out;
}

// answers -> { field: text } (multi-line, "· " bullets). Empty fields get PH.
export function buildPlan(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const place = str(a.place), what = str(a.what);
  const p = {};

  p.title = str(a.title) || (place && what ? `${place} ‘${what}’ 기록` : (place || what) ? `${place || what} 기록` : PH);
  p.summary = str(a.summary) || PH;
  p.background = join([str(a.why), ...bullets(labels(a, 'whyPicks'))]);
  p.purpose = join([str(a.aha), ...bullets(labels(a, 'keepPicks').map((l) => l + ' 남기기'))]);

  const kinds = labels(a, 'kinds');
  p.target = join([place && what ? `${place}의 ${what}` : place || what, kinds.length ? '· ' + kinds.join(', ') : '']);

  const cnt = num(a.count);
  p.people = join([...bullets(labels(a, 'who')), cnt ? `모두 ${cnt}명` : '']);

  p.methods = join([...list(a.methods).map((id) => `· ${optLabel('methods', id)} — ${optHint('methods', id)}`).filter((l) => !l.includes('undefined')), str(a.how) ? `→ ${str(a.how)}` : '']);

  const start = num(a.start), dur = num(a.dur), freq = optLabel('freq', a.freq);
  const head = [start ? `${start}월부터` : '', dur ? `${dur}개월` : '', freq ? `${freq} 모임` : ''].filter(Boolean);
  const range = start && dur ? `${monthRange(start, dur)} (${dur}개월)` : '';
  p.schedule = join([range ? [range, freq ? `${freq} 모임` : ''].filter(Boolean).join(', ') : head.join(', '), ...bullets(schedulePhases(start, dur))]);

  p.outputs = join([...bullets(labels(a, 'outputs')), str(a.outDetail) ? `→ ${str(a.outDetail)}` : '']);
  p.effects = join([...bullets(labels(a, 'effects')), str(a.good) ? `→ ${str(a.good)}` : '']);

  const rows = budgetRows(a);
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  p.budget = rows.length
    ? join([...rows.map((r) => `· ${r.label} ${r.amount != null ? won(r.amount) : '(금액)'}`), total ? `합계 ${won(total)}` : ''])
    : PH;
  p.budgetRows = rows;
  p.budgetTotal = total;
  p.name = str(a.name);
  return p;
}

// Has the learner touched this question at all?
export function answered(q, a) {
  return q.parts.some((p) => {
    const v = a[p.key];
    if (p.type === 'multi') return list(v).length > 0;
    if (p.type === 'budget') return v && Object.keys(v).length > 0;
    return !!str(v);
  });
}

/* ------------------------------------------------------------------ web UI (plan.html only) */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safe = (fn, fb = null) => { try { return fn(); } catch { return fb; } };

function load() { return safe(() => JSON.parse(localStorage.getItem(STORE_KEY)), null) || {}; }
function save(st) { safe(() => localStorage.setItem(STORE_KEY, JSON.stringify(st))); }
function sessionName() { return str(safe(() => JSON.parse(localStorage.getItem(SESSION_KEY)), null)?.name); }

export function planSheetHtml(plan, { sample = false } = {}) {
  const box = (key, cls = '') => {
    const f = FIELDS.find((x) => x.key === key);
    const v = plan[key];
    const empty = v === PH;
    let body;
    if (key === 'budget' && plan.budgetRows.length) {
      body = `<table class="bud"><tbody>${plan.budgetRows.map((r) => `<tr><th>${esc(r.label)} <small>${esc(r.hint)}</small></th><td>${r.amount != null ? esc(won(r.amount)) : '<span class="ph">(금액)</span>'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>합계</th><td>${esc(won(plan.budgetTotal))}</td></tr></tfoot></table>`;
    } else body = `<p class="${empty ? 'ph' : ''}">${esc(v)}</p>`;
    return `<section class="pf pf-${key} ${cls}"><h3><span>${esc(f.label)}</span><em>질문 ${f.q.map((n) => CIRCLED[n]).join('')}</em></h3>${body}</section>`;
  };
  return `<article class="sheet${sample ? ' is-sample' : ''}" id="sheet">
    <header class="sh-head">
      <p class="sh-kicker">내년 기록화 사업 원페이퍼</p>
      <h2 class="${plan.title === PH ? 'ph' : ''}">${esc(plan.title)}</h2>
      <p class="sh-sum ${plan.summary === PH ? 'ph' : ''}">${esc(plan.summary)}</p>
      <p class="sh-by">작성 ${plan.name ? esc(plan.name) : '__________'} · 시민기록교육 3차시</p>
    </header>
    <div class="sh-grid">
      ${box('background')}${box('purpose')}
      ${box('target')}${box('people')}
      ${box('methods')}${box('schedule')}
      ${box('outputs')}${box('effects')}
      ${box('budget', 'wide')}
    </div>
  </article>`;
}

function partHtml(p, a) {
  const v = a[p.key];
  if (p.type === 'multi' || p.type === 'single') {
    const on = p.type === 'multi' ? list(v) : [v];
    return `<fieldset class="part"><legend>${esc(p.label)}</legend><div class="opts ${p.type}">
      ${p.options.map(([id, label, hint]) => `<button type="button" class="opt" data-key="${p.key}" data-id="${id}" data-type="${p.type}" aria-pressed="${on.includes(id)}">
        <span class="box">${icon('check', 22, 3)}</span><span class="ol">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></button>`).join('')}
    </div></fieldset>`;
  }
  if (p.type === 'budget') {
    const b = (v && typeof v === 'object') ? v : {};
    return `<fieldset class="part"><legend>${esc(p.label)}</legend><div class="buds">
      ${p.options.map(([id, label, hint]) => `<div class="bud-row${id in b ? ' on' : ''}">
        <button type="button" class="opt" data-key="budget" data-id="${id}" data-type="budget" aria-pressed="${id in b}"><span class="box">${icon('check', 22, 3)}</span><span class="ol">${esc(label)}<small>${esc(hint)}</small></span></button>
        <label class="amt"><input class="in" inputmode="numeric" data-bud="${id}" value="${esc(b[id] ?? '')}" placeholder="0" aria-label="${esc(label)} 금액"><span>만원</span></label>
      </div>`).join('')}
    </div><p class="bud-total" id="budTotal"></p></fieldset>`;
  }
  const id = 'f-' + p.key;
  const field = p.type === 'textarea'
    ? `<textarea class="in" id="${id}" data-key="${p.key}" rows="3" placeholder="${esc(p.ph)}">${esc(v ?? '')}</textarea>`
    : `<span class="in-wrap"><input class="in${p.suffix ? ' short' : ''}" id="${id}" data-key="${p.key}" ${p.type === 'number' ? 'inputmode="numeric"' : ''} value="${esc(v ?? '')}" placeholder="${esc(p.ph)}" autocomplete="off">${p.suffix ? `<span class="suf">${esc(p.suffix)}</span>` : ''}</span>`;
  return `<div class="part"><label for="${id}" class="lab">${esc(p.label)}</label>${field}</div>`;
}

export function startApp(root) {
  let st = load(); // { answers, step }
  if (!st.answers) st = { answers: {}, step: -1 };
  const A = () => st.answers;
  if (!str(A().name) && sessionName()) A().name = sessionName();
  const total = QUESTIONS.length;
  const persist = () => save(st);

  function intro() {
    const any = QUESTIONS.some((q) => answered(q, A()));
    root.innerHTML = `<section class="screen intro">
      <p class="kicker">시민기록교육 3차시</p>
      <h1>내년 기록화 사업<br>원페이퍼 만들기</h1>
      <p class="lead">쉬운 질문 ${total}개에 답하면<br>한 장짜리 사업계획서가 만들어져요.</p>
      <ol class="steps"><li>${icon('pen', 26)} 질문에 답하기</li><li>${icon('arrow', 26)} 계획서로 옮겨지기</li><li>${icon('book', 26)} 인쇄해서 발표</li></ol>
      <div class="part"><label class="lab" for="f-name">내 이름 (또는 우리 테이블)</label>
        <input class="in" id="f-name" data-key="name" value="${esc(A().name || '')}" placeholder="예) 김순자 / 3번 테이블" autocomplete="off"></div>
      <div class="btns col">
        <button type="button" class="bt primary big" data-go="${any ? Math.max(0, st.step) : 0}">${any ? '이어서 하기' : '시작하기'} ${icon('arrow', 26, 2.4)}</button>
        ${any ? `<button type="button" class="bt" data-go="result">원페이퍼 보기</button>` : ''}
        <button type="button" class="bt ghost" id="sample">${icon('bang', 22)} 예시로 채워 보기</button>
      </div>
    </section>`;
    root.querySelector('#sample').onclick = () => {
      if (QUESTIONS.some((q) => answered(q, A())) && !confirm('지금 적은 답이 예시로 바뀌어요. 괜찮을까요?')) return;
      st = { answers: JSON.parse(JSON.stringify(SAMPLE)), step: 0, sample: true }; persist(); go(0);
    };
  }

  function question(i) {
    const q = QUESTIONS[i];
    root.innerHTML = `<section class="screen q">
      <div class="prog" aria-label="진행"><span class="count"><b>${i + 1}</b> / ${total}</span><span class="bar"><i style="width:${((i + 1) / total) * 100}%"></i></span></div>
      <header class="qh"><span class="qi">${icon(q.icon, 34, 1.8)}</span>
        <div><p class="qn">질문 ${CIRCLED[q.n]}${q.sub ? ` · ${esc(q.sub)}` : ''}</p><h2>${esc(q.title)}</h2></div></header>
      <p class="ex">예) ${esc(q.example)}</p>
      ${q.parts.map((p) => partHtml(p, A())).join('')}
      <p class="to">${icon('arrow', 20)} 계획서의 <b>${q.to.map(esc).join('</b>, <b>')}</b> 칸으로 옮겨져요</p>
      <nav class="btns nav">
        <button type="button" class="bt" data-go="${i === 0 ? 'intro' : i - 1}">이전</button>
        <button type="button" class="bt primary" data-go="${i === total - 1 ? 'result' : i + 1}">${i === total - 1 ? '원페이퍼 보기' : '다음'} ${icon('arrow', 24, 2.4)}</button>
      </nav>
    </section>`;
    updateTotal();
  }

  function updateTotal() {
    const el = root.querySelector('#budTotal');
    if (!el) return;
    const p = buildPlan(A());
    el.textContent = p.budgetRows.length ? `합계 ${won(p.budgetTotal)}` : '';
  }

  function result() {
    const plan = buildPlan(A());
    const missing = FIELDS.filter((f) => plan[f.key] === PH).length;
    root.innerHTML = `<section class="screen result">
      <div class="res-top no-print">
        <h1>원페이퍼가 만들어졌어요</h1>
        <p class="lead">${missing ? `빈칸 <b>${missing}</b>곳은 <span class="ph-chip">(적어 주세요)</span>로 보여요. 질문으로 돌아가 채울 수 있어요.` : '모든 칸이 채워졌어요. 인쇄해서 발표해 보세요!'}</p>
        <div class="btns">
          <button type="button" class="bt primary" id="print">${icon('book', 24)} 인쇄하기</button>
          <button type="button" class="bt" data-go="0">질문 고치기</button>
          <button type="button" class="bt ghost" id="reset">처음부터</button>
        </div>
      </div>
      ${planSheetHtml(plan, { sample: !!st.sample })}
    </section>`;
    root.querySelector('#print').onclick = () => window.print();
    root.querySelector('#reset').onclick = () => {
      if (!confirm('적은 답을 모두 지우고 처음부터 할까요?')) return;
      const name = sessionName();
      st = { answers: name ? { name } : {}, step: -1 }; persist(); go('intro');
    };
  }

  function go(to) {
    if (to === 'intro') { st.step = -1; intro(); }
    else if (to === 'result') { st.step = total; result(); }
    else { st.step = Number(to); question(st.step); }
    persist();
    root.querySelector('h1, h2')?.focus?.();
    window.scrollTo(0, 0);
    document.body.dataset.screen = to === 'intro' || to === 'result' ? to : 'q';
  }

  root.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    const o = e.target.closest('.opt');
    if (!o) return;
    const { key, id, type } = o.dataset;
    const a = A();
    if (type === 'multi') {
      const cur = list(a[key]);
      a[key] = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      o.setAttribute('aria-pressed', String(a[key].includes(id)));
    } else if (type === 'single') {
      a[key] = a[key] === id ? '' : id;
      o.parentElement.querySelectorAll('.opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === a[key])));
    } else if (type === 'budget') {
      const b = (a.budget && typeof a.budget === 'object') ? a.budget : (a.budget = {});
      const row = o.closest('.bud-row');
      if (id in b) { delete b[id]; row.querySelector('input').value = ''; } else { b[id] = ''; row.querySelector('input').focus(); }
      row.classList.toggle('on', id in b);
      o.setAttribute('aria-pressed', String(id in b));
      updateTotal();
    }
    persist();
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    const a = A();
    if (t.dataset.bud) {
      const b = (a.budget && typeof a.budget === 'object') ? a.budget : (a.budget = {});
      const id = t.dataset.bud;
      const row = t.closest('.bud-row');
      if (str(t.value)) b[id] = t.value; else if (id in b) b[id] = '';
      row.classList.toggle('on', id in b);
      row.querySelector('.opt').setAttribute('aria-pressed', String(id in b));
      updateTotal();
    } else if (t.dataset.key) a[t.dataset.key] = t.value;
    persist();
  });

  const s = st.step;
  if (s >= 0 && s < total) go(s); else if (s === total) go('result'); else go('intro');
  return { go, get state() { return st; } };
}

if (typeof document !== 'undefined' && document.getElementById('plan-app')) {
  window.planApp = startApp(document.getElementById('plan-app'));
}
