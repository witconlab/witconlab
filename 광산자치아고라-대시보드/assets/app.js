/* 2026 광산자치아고라 · 공통 코어 V2 (대형 스크린·관제 패널·공감 페이지·연습장이 함께 사용)
 *
 * V2: 진행흐름도 ①~⑦ 기준. 기록자는 Google 문서의 표에서 「우리 테이블 답」 칸에 씁니다.
 *  - LIVE : Apps Script 웹앱 URL이 설정된 경우. 12개 Docs(표) → Apps Script → 브라우저
 *  - DEMO : ?demo. localStorage를 "가상 문서"로 쓰고 시뮬레이터가 기록자처럼 채웁니다.
 */
(function () {
  'use strict';

  const EVENT = {
    title: '2026 광산자치아고라',
    theme: '하천·공원·길, 생활권 의제를 잇고 함께 해결해요',
    slogan: '함께 걷고, 함께 가꾸는 광산',
    question: '이 공간을 더 잘 이용하고 바꾸기 위해 우리가 함께 할 수 있는 일은 무엇일까요?',
    date: '2026-11-19',
    dateLabel: '2026. 11. 19.(목) 14:00 – 16:00',
    place: '광산구청 7층 윤상원홀',
    host: '광산구 도시재생공동체센터',
    keynote: { title: '생활공간을 잇고, 함께 만드는 변화', speaker: '더가능연구소 엄관용 연구실장' }
  };

  // 6개 공간 주제
  const TOPICS = {
    hwang:   { name: '황룡강',       color: '#38bdf8', icon: 'wave' },
    pung:    { name: '풍영정천',     color: '#2dd4bf', icon: 'wave' },
    eodeung: { name: '어등산',       color: '#a3e635', icon: 'mount' },
    malmi:   { name: '말미산',       color: '#facc15', icon: 'mount' },
    sinchon: { name: '신촌근린공원', color: '#fb923c', icon: 'tree' },
    daesang: { name: '대상공원',     color: '#f472b6', icon: 'tree' }
  };
  const TOPIC_ORDER = ['hwang', 'pung', 'eodeung', 'malmi', 'sinchon', 'daesang'];
  const defaultTopic = no => TOPIC_ORDER[(Number(no) - 1) % 6];

  // 기록 칸(문서 표의 행)
  const FIELDS = {
    good:   { step: 0, label: '좋았던 점' },
    bad:    { step: 0, label: '불편한 점' },
    better: { step: 0, label: '개선점' },
    us:     { step: 1, label: '우리가 함께 할 일' },
    ext:    { step: 1, label: '외부 협력·지원' },
    pick:   { step: 2, label: '선정 과제' },
    tally:  { step: 2, label: '투표 결과' },
    rest:   { step: 2, label: '선정되지 않은 의견' },
    bg:     { step: 3, label: '현황·제안배경' },
    want:   { step: 3, label: '우리가 바라는 모습' },
    prop:   { step: 3, label: '우리의 제안' },
    first:  { step: 3, label: '우리가 시작할 첫걸음' },
    with:   { step: 3, label: '함께하고 싶은 이웃' },
    check:  { step: 4, label: '빠진 의견·고칠 표현' },
    done:   { step: 4, label: '최종 제출' }
  };
  const TASK_FIELDS = ['bg', 'want', 'prop', 'first', 'with'];

  // 문서 표 양식 (apps-script/Code.gs 의 DOC_SECTIONS 와 같게 유지)
  const TEMPLATE = [
    { head: '① 이용 경험 나누기', q: '우리는 이곳에서 어떤 경험을 하고 있나요?', rows: [
      ['good', '좋았던 점', '아침마다 강변을 걸으면 물소리가 좋아요'],
      ['bad', '불편한 점', '밤에 조명이 어두워 혼자 걷기 무서워요'],
      ['better', '개선점', '쉬어 갈 벤치가 더 있으면 좋겠어요']] },
    { head: '② 함께 할 일 제안하기', q: '이 공간이 더 좋게 바뀌려면 어떤 변화가 필요할까요?', rows: [
      ['us', '우리가 함께 할 일 (주민 실천)', '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기'],
      ['ext', '외부 협력·지원이 필요한 일', '연결길 안내표지 정비 (구청)']] },
    { head: '③ 우선 과제 선정하기', q: '여러 제안 중 무엇을 먼저 이야기해 볼까요? (외부 협력만 2개 고르지 않기)', rows: [
      ['pick0', '선정 과제 1', '함께 걷기·길 살피기 (우리)'],
      ['pick1', '선정 과제 2', '연결길 안내표지 정비 (외부)'],
      ['tally', '투표 결과', '함께 걷기 7표, 안내표지 5표, 쓰레기통 2표'],
      ['rest', '선정되지 않은 의견', '쓰레기통 늘리기 — 지우지 말고 남겨 두기']] },
    { head: '④ 과제 1 실행방법', q: '이 일을 실제로 추진하려면 어떻게 시작하면 좋을까요? (못 정하면 ‘추후 협의’)', task: 0, rows: [
      ['bg', '현황·제안배경', '아파트 사이를 길게 잇는 공원이라 두 동 주민이 만날 기회가 더해지면 좋겠음'],
      ['want', '우리가 바라는 모습', '첨단1·2동 주민들이 아파트 경계를 넘어 인사하고 어울리는 모습'],
      ['prop', '우리의 제안', '취미를 이웃과 나누는 ‘공원에서 만나는 이웃’'],
      ['first', '우리가 시작할 첫걸음', '각 동에서 취미를 나눌 주민을 찾아 공원 한 구간에서 시범 운영하기'],
      ['with', '함께하고 싶은 이웃', '인근 아파트 주민모임, 주민자치회, 공원 관리부서']] },
    { head: '④ 과제 2 실행방법', q: '선정 과제가 하나뿐이면 비워 두세요', task: 1, rows: [
      ['bg', '현황·제안배경', ''], ['want', '우리가 바라는 모습', ''], ['prop', '우리의 제안', ''], ['first', '우리가 시작할 첫걸음', ''], ['with', '함께하고 싶은 이웃', '']] },
    { head: '⑤ 테이블 결과 확인', q: '우리의 의견이 잘 담겼나요?', rows: [
      ['check', '빠진 의견·고칠 표현', '“밤길” 대신 “저녁 산책길”로 고쳐 주세요'],
      ['done', '최종 제출', '모두 동의하면 ‘제출’이라고 쓰기']] }
  ];

  const DEFAULT_TABLES = Array.from({ length: 12 }, (_, i) => ({ no: i + 1, topic: defaultTopic(i + 1), dongs: '', space: '' }));

  // 시각은 기본값입니다(확정되면 여기 숫자만 바꾸면 됨). 단계는 관제반이 버튼으로 넘깁니다.
  const STAGES = [
    { key: 'wait',    label: '참석 등록',          start: '13:30', end: '14:00' },
    { key: 'open',    label: '1부 여는마당',       start: '14:00', end: '14:20' },
    { key: 'keynote', label: '주제 발제',          start: '14:20', end: '14:30' },
    { key: 'talk',    label: '의제공론화 ①~⑤',    start: '14:30', end: '15:30' },
    { key: 'share',   label: '⑥ 주제별 결과 공유', start: '15:30', end: '15:45' },
    { key: 'like',    label: '⑦ 공감·응원',        start: '15:45', end: '15:55' },
    { key: 'slogan',  label: '구호 · 마무리',      start: '15:55', end: '16:00' }
  ];
  const SUBSTEPS = [
    { label: '① 이용 경험 나누기',   min: 15, start: '14:30', q: '우리는 이곳에서 어떤 경험을 하고 있나요?' },
    { label: '② 함께 할 일 제안하기', min: 15, start: '14:45', q: '이 공간의 경험이 더 좋은 변화로 바뀌려면 어떤 변화가 필요할까요?' },
    { label: '③ 우선 과제 선정하기', min: 5,  start: '15:00', q: '여러 제안 중 무엇을 먼저 이야기해 볼까요?' },
    { label: '④ 실행방법 구체화하기', min: 20, start: '15:05', q: '이 일을 실제로 추진하려면 어떻게 시작하면 좋을까요?' },
    { label: '⑤ 테이블 결과 확인하기', min: 5, start: '15:25', q: '우리의 의견이 잘 담겼나요?' }
  ];

  const DEFAULT_STATE = {
    stage: 'wait', sub: 0, auto: false,
    topic: 'all',            // 'all' | 'auto'(주제 돌아가며) | 주제 키
    sim: false, simSpeed: 1,
    polished: false,         // ⑤·⑥·⑦에서 AI가 다듬은 문장을 쓸지
    likeOpen: false, cards: [], likeRound: 0,
    sloganCue: 0, updated: 0
  };

  // ── 설정 ──
  const qs = new URLSearchParams(location.search);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };
  if (qs.get('api')) LS.set('agora-api', qs.get('api'));
  const API = qs.has('demo') ? '' : (LS.get('agora-api', '') || window.AGORA_API || '');
  const MODE = API ? 'live' : 'demo';

  // ── 유틸 ──
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const pad = n => String(n).padStart(2, '0');
  const hhmm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const trim = (s, n) => (s = String(s || '')).length > n ? s.slice(0, n - 1) + '…' : s;

  // ── 테이블 ──
  let tables = LS.get('agora-tables-cache-v2', null) || DEFAULT_TABLES;
  const tableByNo = no => tables.find(t => t.no === Number(no)) || { no: Number(no), topic: defaultTopic(no), dongs: '', space: '' };
  const tablesOf = topic => tables.filter(t => t.topic === topic);
  async function loadTables() {
    if (MODE !== 'live') return tables;
    const r = await apiGet('config');
    if (r && r.tables && r.tables.length) {
      tables = r.tables.map(t => Object.assign({}, t, { topic: TOPICS[t.topic] ? t.topic : defaultTopic(t.no) }));
      LS.set('agora-tables-cache-v2', tables);
    }
    return tables;
  }

  // ── 서버 통신 (붐빔·네트워크 오류만 간격을 늘려 다시 보냄) ──
  async function call(doFetch, tries) {
    let last;
    for (let n = 0; n < tries; n++) {
      if (n) await sleep(600 * Math.pow(2, n - 1) + Math.random() * 900);
      let j;
      try { j = await (await doFetch()).json(); } catch (e) { last = e; continue; }
      if (j.error) throw new Error(j.error);
      return j;
    }
    throw new Error('서버가 붐벼요. 잠시 후 다시 시도해 주세요.' + (last ? ' (' + last.message + ')' : ''));
  }
  const apiGet = action => call(() => fetch(API + (API.includes('?') ? '&' : '?') + 'action=' + action, { cache: 'no-store' }), 4);
  // text/plain 으로 보내야 CORS 사전요청이 생기지 않습니다.
  const apiPost = (body, tries = 5) => call(() => fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }), tries);
  const adminKey = () => LS.get('agora-admin-key', '');

  // ── 화면 상태 (관제 → 스크린) ──
  let state = Object.assign({}, DEFAULT_STATE, LS.get('agora-state-v2', {}));
  const stateListeners = [];
  const emitState = () => stateListeners.forEach(fn => fn(state));
  function applyState(next) {
    if (!next) return;
    if (next.updated && state.updated && next.updated < state.updated) return;
    state = Object.assign({}, DEFAULT_STATE, next);
    LS.set('agora-state-v2', state);
    emitState();
  }
  async function setState(patch) {
    const next = Object.assign({}, state, patch, { updated: Date.now() });
    // LIVE는 서버가 받아들인 뒤에만 바꿈(비밀번호가 틀리면 그대로)
    if (MODE === 'live') { const r = await apiPost({ action: 'setState', key: adminKey(), state: next }); applyState(r.state || next); }
    else applyState(next);
  }
  async function pullState() {
    if (MODE !== 'live') return state;
    const r = await apiGet('state');
    if (r.state) applyState(r.state);
    else if (state.updated) { state = Object.assign({}, DEFAULT_STATE); LS.set('agora-state-v2', state); emitState(); }
    return state;
  }
  window.addEventListener('storage', e => {
    if (e.key === 'agora-state-v2' && e.newValue) { state = Object.assign({}, DEFAULT_STATE, JSON.parse(e.newValue)); emitState(); }
  });
  function scheduledStage(m = nowMin()) {
    let stage = STAGES[0].key, sub = 0;
    STAGES.forEach(s => { if (m >= toMin(s.start)) stage = s.key; });
    SUBSTEPS.forEach((s, i) => { if (m >= toMin(s.start)) sub = i; });
    return { stage, sub };
  }
  const effective = () => state.auto ? Object.assign({}, state, scheduledStage()) : state;

  // ── 문서 표 파싱 ──
  function fieldOf(label) {
    const l = label.replace(/\s+/g, '');
    if (/좋았/.test(l)) return 'good';
    if (/불편/.test(l)) return 'bad';
    if (/개선/.test(l)) return 'better';
    if (/외부/.test(l)) return 'ext';
    if (/우리가함께|주민실천/.test(l)) return 'us';
    if (/선정되지|미선정/.test(l)) return 'rest';
    if (/선정과제/.test(l)) return 'pick';
    if (/투표/.test(l)) return 'tally';
    if (/현황|배경/.test(l)) return 'bg';
    if (/바라는/.test(l)) return 'want';
    if (/첫걸음/.test(l)) return 'first';
    if (/이웃|주체/.test(l)) return 'with';
    if (/제안/.test(l)) return 'prop';
    if (/빠진|고칠|수정/.test(l)) return 'check';
    if (/제출/.test(l)) return 'done';
    return null;
  }

  /** 문서 표 행 [[칸 줄들]] → [{field, task, text, cell, last}]. 답 칸의 한 줄 = 카드 하나 */
  function parseDoc(rows) {
    const out = [];
    let task = 0;
    (rows || []).forEach(cells => {
      if (!cells || cells.length < 2) return;
      const label = (cells[0] || []).join(' ').trim();
      if (/^[①②③④⑤]/.test(label)) { const m = label.match(/과제\s*(\d)/); task = m ? Number(m[1]) - 1 : 0; return; }
      const field = fieldOf(label);
      if (!field) return;
      const ans = cells.length >= 3 ? cells[cells.length - 1] : cells[1];
      const t = field === 'pick' ? Math.max(0, Number((label.match(/\d/) || ['1'])[0]) - 1) : FIELDS[field].step === 3 ? task : 0;
      const lines = (ans || []).map(s => String(s).replace(/^[-–•·*▪◦○●]\s*/, '').trim())
        .filter(s => s && !/\(예시\)|✍️/.test(s) && (s.length >= 2 || field === 'done'));
      lines.forEach((text, i) => out.push({ field, task: t, text, cell: field + t, last: i === lines.length - 1 }));
    });
    return out;
  }

  /** 칸별 줄 {cellKey: [줄]} → 문서와 같은 표 행 (데모·연습장용) */
  function rowsFromCells(cells) {
    const rows = [];
    TEMPLATE.forEach(s => {
      rows.push([[s.head], ['예시 (이렇게 쓰면 돼요)'], ['우리 테이블 답 ✍️']]);
      s.rows.forEach(([key, label, ex]) => {
        const k = /^pick/.test(key) ? key : FIELDS[key].step === 3 ? key + s.task : key + '0';
        rows.push([[label], ex ? [ex] : [], (cells[k] || []).slice()]);
      });
    });
    return rows;
  }

  // ── 실시간 피드 ──
  const seen = LS.get('agora-seen-v2', {});
  let seenDirty = false;
  const docOk = {};
  async function loadFeedRaw() {
    if (MODE === 'live') return apiGet('feed');
    const vdocs = LS.get('agora-vdocs-v2', {});
    const docs = {};
    tables.forEach(t => { docs[t.no] = { ok: true, rows: rowsFromCells(vdocs[t.no] || {}) }; });
    return { docs, manual: LS.get('agora-manual-v2', []) };
  }

  const SETTLE_MS = 8000;
  const lastLine = {};
  /** 현재 문서 내용 전체 → [{id, table, topic, field, task, text, time, isNew}] (문서를 고치면 화면도 고쳐짐) */
  async function loadFeed() {
    const raw = await loadFeedRaw();
    const now = Date.now();
    const items = [];
    tables.forEach(t => {
      const d = raw.docs[t.no] || { ok: false, rows: [] };
      docOk[t.no] = d.ok;
      const counts = {};
      parseDoc(d.rows).forEach(it => {
        const base = t.no + '|' + it.cell + '|' + it.text;
        counts[base] = (counts[base] || 0) + 1;
        const id = hash(base + '|' + counts[base]);
        // 칸의 마지막 줄은 아직 치는 중일 수 있어, 처음 본 뒤 SETTLE_MS 동안 그대로일 때만 올림
        if (MODE === 'live' && it.last && !seen[id]) {
          const key = t.no + it.cell, p = lastLine[key];
          if (!p || p.id !== id) { lastLine[key] = { id, since: now }; return; }
          if (now - p.since < SETTLE_MS) return;
        }
        let isNew = false;
        if (!seen[id]) { seen[id] = now; isNew = true; seenDirty = true; }
        items.push({ id, table: t.no, topic: t.topic, field: it.field, task: it.task, text: it.text, time: seen[id], isNew });
      });
    });
    (raw.manual || []).forEach(m => {
      const t = tableByNo(m.table);
      const id = 'm' + hash(m.time + '|' + m.text);
      let isNew = false;
      if (!seen[id]) { seen[id] = now; isNew = true; seenDirty = true; }
      items.push({ id, table: t.no, topic: t.topic, field: FIELDS[m.field] ? m.field : 'good', task: Number(m.task) || 0, text: m.text, time: seen[id], isNew, manual: true });
    });
    if (seenDirty) { LS.set('agora-seen-v2', seen); seenDirty = false; }
    items.sort((a, b) => a.time - b.time);
    return items;
  }

  async function pushManual(entry) {
    if (MODE === 'live') return apiPost(Object.assign({ action: 'push', key: adminKey() }, entry));
    const list = LS.get('agora-manual-v2', []);
    list.push(Object.assign({ time: Date.now() }, entry));
    LS.set('agora-manual-v2', list);
  }

  // ── 테이블별 정리 ──
  const kindOf = s => /\(\s*외부|\[\s*외부|외부\s*\)$/.test(s) ? 'ext' : /\(\s*(우리|주민)|\[\s*(우리|주민)/.test(s) ? 'us' : '';
  const stripKind = s => s.replace(/\s*[\(\[]\s*(우리|주민|외부)[^\)\]]*[\)\]]\s*/g, ' ').trim();

  /** 한 테이블의 현재 기록을 칸별로 */
  function tableData(items, no) {
    const mine = items.filter(i => i.table === Number(no));
    const of = (f, k) => mine.filter(i => i.field === f && (k == null || i.task === k));
    const join = (f, k) => of(f, k).map(i => i.text).join(' ');
    const picks = [0, 1].map(k => of('pick', k)[0]).filter(Boolean).map(i => ({ text: stripKind(i.text), kind: kindOf(i.text), task: i.task }));
    return {
      good: of('good'), bad: of('bad'), better: of('better'), us: of('us'), ext: of('ext'),
      picks, tally: of('tally'), rest: of('rest'),
      tasks: [0, 1].map(k => { const o = {}; TASK_FIELDS.forEach(f => { o[f] = join(f, k); }); return o; }),
      check: of('check'), done: of('done').some(i => /제출|완료|동의/.test(i.text)),
      count: mine.length
    };
  }
  const filled = task => TASK_FIELDS.filter(f => task[f]).length;

  /** 화면에 쓸 의제 제안서: 과제별 {title, bg, want, prop, first, with, us, ext, polished} */
  function proposals(no, items, summary, usePolished) {
    const d = tableData(items, no);
    const ai = usePolished && summary && summary.tables && summary.tables[no] && summary.tables[no].tasks || [];
    const out = [];
    [0, 1].forEach(k => {
      const raw = d.tasks[k], pick = d.picks.find(p => p.task === k);
      if (ai[k] && ai[k].title) { out.push(Object.assign({ polished: true, kind: pick ? pick.kind : '' }, ai[k])); return; }
      if (!filled(raw) && !pick) return;
      out.push(Object.assign({ title: pick ? pick.text : trim(raw.prop, 24), us: pick && pick.kind === 'us' ? pick.text : '', ext: pick && pick.kind === 'ext' ? pick.text : '', kind: pick ? pick.kind : '', polished: false }, raw));
    });
    return out;
  }

  /** AI에 보낼 테이블별 정리 */
  function aiInput(items) {
    return tables.map(t => {
      const d = tableData(items, t.no);
      return { no: t.no, topic: t.topic, picks: d.picks.map(p => p.text + (p.kind ? ' (' + (p.kind === 'us' ? '우리' : '외부') + ')' : '')),
        us: d.us.map(i => i.text), ext: d.ext.map(i => i.text), tasks: d.tasks.filter((k, i) => i === 0 || filled(k)), check: d.check.map(i => i.text) };
    }).filter(t => t.picks.length || t.us.length || t.tasks.some(filled));
  }

  // ── AI 다듬기 · 주제별 요약 ──
  async function loadSummary() {
    if (MODE === 'live') return apiGet('summary');
    return LS.get('agora-summary-v2', { tables: {}, topics: {}, at: 0, source: '' });
  }
  async function saveSummary(data) {
    if (MODE === 'live') return apiPost({ action: 'saveSummary', key: adminKey(), data });
    const s = Object.assign({}, data, { at: Date.now(), source: LS.get('agora-summary-v2', {}).source || 'edited' });
    LS.set('agora-summary-v2', s);
    return s;
  }
  async function summarize(items) {
    const input = aiInput(items);
    if (!input.length) throw new Error('아직 정리할 기록이 없어요. ③·④ 칸이 채워진 뒤 실행해 주세요.');
    if (MODE === 'live') {
      const start = await apiPost({ action: 'summarize', key: adminKey(), input }, 1);
      const since = start.job ? start.job.started : Date.now();
      for (let waited = 0; waited < 8 * 60000; waited += 4000) {
        await sleep(4000);
        const s = await apiGet('summary');
        const job = s.job;
        if (job && job.started >= since && job.status === 'done') return s;
        if (job && job.started >= since && job.status === 'failed') throw new Error(job.error || 'AI 다듬기에 실패했어요.');
      }
      throw new Error('AI가 8분 넘게 끝나지 않았어요. 원문 그대로 진행해 주세요.');
    }
    await sleep(1800);
    const s = Object.assign(ruleSummary(items), { at: Date.now(), source: 'rule' });
    LS.set('agora-summary-v2', s);
    return s;
  }
  // AI 없이(데모·실패 시) 원문을 그대로 정리
  function ruleSummary(items) {
    const out = { tables: {}, topics: {} };
    tables.forEach(t => {
      const ps = proposals(t.no, items, null, false);
      if (!ps.length) return;
      out.tables[t.no] = { tasks: ps.map(p => ({ title: trim(p.title, 20), bg: trim(p.bg, 60) || '추후 협의', want: trim(p.want, 60) || '추후 협의', prop: trim(p.prop, 60) || '추후 협의', first: trim(p.first, 60) || '추후 협의', with: trim(p.with, 60) || '추후 협의', us: p.us, ext: p.ext })) };
    });
    TOPIC_ORDER.forEach(k => {
      const ts = tablesOf(k).filter(t => out.tables[t.no]);
      if (!ts.length) return;
      const titles = ts.flatMap(t => out.tables[t.no].tasks.map(x => x.title));
      out.topics[k] = { summary: TOPICS[k].name + '에서 ' + ts.map(t => '테이블 ' + t.no).join('·') + '이(가) ' + titles.slice(0, 3).join(', ') + '을(를) 제안했어요.', points: titles.slice(0, 4) };
    });
    return out;
  }

  // ── 공감(좋아요) ──
  function deviceId() {
    let id = LS.get('agora-device', '');
    if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); LS.set('agora-device', id); }
    return id;
  }
  /** 공감 카드: 테이블별 과제 (상태에 담겨 휴대폰으로 전달되므로 짧게) */
  function buildCards(items, summary, usePolished) {
    const out = [];
    tables.forEach(t => proposals(t.no, items, summary, usePolished).forEach((p, k) => {
      out.push({ id: 't' + t.no + 'k' + k, table: t.no, topic: t.topic, text: trim(p.title, 24), sub: trim(p.prop && p.prop !== p.title ? p.prop : p.first, 40) });
    }));
    return out;
  }
  async function loadLikes() {
    if (MODE === 'live') return apiGet('likes');
    const b = LS.get('agora-likes-v2', {});
    const counts = {};
    Object.values(b).forEach(ids => ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    return { counts, people: Object.keys(b).length };
  }
  async function like(ids) {
    if (MODE === 'live') return apiPost({ action: 'like', device: deviceId(), ids });
    if (!state.likeOpen) throw new Error('지금은 공감 시간이 아니에요.');
    const b = LS.get('agora-likes-v2', {});
    if (ids.length) b[deviceId()] = ids; else delete b[deviceId()];
    LS.set('agora-likes-v2', b);
    return { ok: true };
  }
  async function resetLikes() {
    if (MODE === 'live') return apiPost({ action: 'resetLikes', key: adminKey() });
    LS.set('agora-likes-v2', {});
  }

  // ── 시뮬레이터 (DEMO) ──
  const SAMPLE = {
    good: ['아침마다 {p} 걸으면 공기가 좋아요', '주말엔 {p}에 가족 단위로 많이 와요', '{p}에서 이웃을 자주 만나요', '아이들이 {p}에서 뛰어놀기 좋아요'],
    bad: ['{p} 가로등이 드문드문해 밤엔 무서워요', '비 오고 나면 산책로가 진흙탕이 돼요', '쓰레기가 쌓여도 치우는 사람이 없어요', '화장실이 멀어서 어르신들이 오래 못 계세요', '자전거랑 보행자가 섞여 위험해요'],
    better: ['쉬어 갈 벤치가 더 있었으면 해요', '안내 표지판을 알아보기 쉽게 바꿨으면', '밤에도 걸을 수 있게 조명이 필요해요', '두 동이 함께 쓰는 모임 공간이 있으면 좋겠어요'],
    us: ['두 동 주민이 한 달에 한 번 함께 걷기', '{p} 줍깅 데이 함께 열기', '주민 안전지킴이 순찰하기', '산책로 사진 기록단 운영하기'],
    ext: ['{p} 조명·CCTV 점검', '안내표지 정비', '쉼터·벤치 설치 지원', '위험 구간 안전시설 보완'],
    tally: ['함께 걷기 7표, 줍깅 5표, 표지판 3표'],
    rest: ['쓰레기통 늘리기', '반려견 산책 매너 캠페인']
  };
  const TASK_SAMPLE = [
    { pick: '{p} 함께 걷고 살피기 (우리)', bg: '{p}를 따로 걷는 주민은 많지만 함께 살피는 활동은 없음', want: '두 동 주민이 같이 걸으며 인사하고 길을 함께 돌보는 모습', prop: '한 달에 한 번 ‘{p} 함께 걷기’', first: '12월 첫 토요일 오전 10시, 동 행정복지센터 앞에서 시작', with: '걷기 동아리, 주민자치회, 추후 협의' },
    { pick: '{p} 조명·안내표지 정비 (외부)', bg: '저녁 산책객이 늘었지만 어두운 구간이 많음', want: '저녁에도 안심하고 걷는 {p}', prop: '어두운 구간 조명 보완과 안내표지 정비 요청', first: '주민이 어두운 구간 지도를 함께 그려 구청에 전달', with: '구청 공원녹지과, 통장단' }
  ];
  function simTick(stageInfo) {
    const st = stageInfo || effective();
    if (st.stage !== 'talk') return null;
    const t = tables[Math.floor(Math.random() * tables.length)];
    const p = TOPICS[t.topic].name;
    const vdocs = LS.get('agora-vdocs-v2', {});
    const cells = vdocs[t.no] = vdocs[t.no] || {};
    const add = (k, line) => { (cells[k] = cells[k] || []).push(line.replace(/\{p\}/g, p)); };
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    let line = '';
    if (st.sub === 0) { const f = rnd(['good', 'bad', 'better']); line = rnd(SAMPLE[f]); add(f + '0', line); }
    else if (st.sub === 1) { const f = rnd(['us', 'ext']); line = rnd(SAMPLE[f]); add(f + '0', line); }
    else if (st.sub === 2) {
      if (!cells.pick0) { line = TASK_SAMPLE[0].pick; add('pick0', line); }
      else if (!cells.pick1 && Math.random() < .6) { line = TASK_SAMPLE[1].pick; add('pick1', line); }
      else if (!cells.tally0) { line = SAMPLE.tally[0]; add('tally0', line); }
      else if (!cells.rest0) { line = rnd(SAMPLE.rest); add('rest0', line); }
    } else if (st.sub === 3) {
      const k = cells.pick1 && TASK_FIELDS.every(f => cells[f + '0']) ? 1 : 0;
      const f = TASK_FIELDS.find(x => !cells[x + k]);
      if (f) { line = TASK_SAMPLE[k][f]; add(f + k, line); }
    } else if (st.sub === 4) {
      if (!cells.check0 && Math.random() < .5) { line = '첫걸음 날짜는 추후 협의로 고쳐 주세요'; add('check0', line); }
      else if (!cells.done0) { line = '제출'; add('done0', line); }
    }
    LS.set('agora-vdocs-v2', vdocs);
    return line;
  }
  function simLike() {
    if (!state.likeOpen || !state.cards.length) return;
    const b = LS.get('agora-likes-v2', {});
    const ids = state.cards.filter(() => Math.random() < .25).map(c => c.id);
    b['sim' + Object.keys(b).length] = ids.length ? ids : [state.cards[0].id];
    LS.set('agora-likes-v2', b);
  }
  function resetDemo() {
    ['agora-vdocs-v2', 'agora-manual-v2', 'agora-summary-v2', 'agora-likes-v2', 'agora-seen-v2'].forEach(LS.del);
    Object.keys(seen).forEach(k => delete seen[k]);
  }

  // ── 아이콘 ──
  const ICONS = {
    wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 13c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/></svg>',
    tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"/><path d="M12 2C8.5 2 6 4.8 6 8c-1.8.8-3 2.5-3 4.5C3 15.5 5.5 17 8 17h8c2.5 0 5-1.5 5-4.5 0-2-1.2-3.7-3-4.5 0-3.2-2.5-6-6-6z"/></svg>',
    mount: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20 9 7l4 7 3-4 6 10z"/><path d="m7.5 10 1.5 1.5L10.5 10"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4 6.3 4c2.2 0 3.9 1.3 5.7 3.4C13.8 5.3 15.5 4 17.7 4c4 0 5.9 4.4 4.3 7.7C19.5 16.4 12 21 12 21z"/></svg>'
  };
  const topicIcon = k => ICONS[TOPICS[k].icon];

  window.Agora = {
    EVENT, TOPICS, TOPIC_ORDER, FIELDS, TASK_FIELDS, TEMPLATE, STAGES, SUBSTEPS, DEFAULT_TABLES, API, MODE, LS, ICONS,
    get tables() { return tables; }, tableByNo, tablesOf, loadTables, docOk,
    get state() { return state; }, effective, setState, pullState, scheduledStage,
    onState: fn => stateListeners.push(fn),
    parseDoc, rowsFromCells, loadFeed, pushManual, tableData, proposals, filled, aiInput,
    loadSummary, saveSummary, summarize, ruleSummary,
    deviceId, buildCards, loadLikes, like, resetLikes,
    simTick, simLike, resetDemo,
    esc, hash, hhmm, pad, toMin, nowMin, sleep, trim, topicIcon, adminKey, apiGet
  };
})();
