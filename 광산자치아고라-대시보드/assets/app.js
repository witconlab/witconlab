/* 2026 광산자치아고라 · 공통 코어 (대형 스크린·관제 패널·투표 페이지가 함께 사용)
 *
 * 데이터 소스는 두 가지입니다.
 *  - LIVE : Apps Script 웹앱 URL이 설정된 경우. 12개 Google Docs → Apps Script → 브라우저
 *  - DEMO : URL이 없거나 ?demo 가 붙은 경우. 같은 브라우저의 localStorage를 "가상 Docs"로 사용하고,
 *           시뮬레이터가 기록자처럼 한 줄씩 입력합니다. (리허설·시연용)
 */
(function () {
  'use strict';

  // ── 행사 기본 정보 ────────────────────────────────────────────
  const EVENT = {
    title: '2026 광산자치아고라',
    theme: '하천·공원·맨발길, 동네를 잇고 변화를 만들다',
    slogan: '함께 걷고, 함께 가꾸는 광산',
    date: '2026-11-19',
    dateLabel: '2026. 11. 19.(목) 14:00 – 16:00',
    place: '광산구청 7층 윤상원홀',
    host: '광산구 도시재생공동체센터',
    keynote: { title: '생활공간을 잇고, 함께 만드는 변화', speaker: '더가능연구소 엄관용 연구실장' }
  };

  const CATS = {
    river:  { name: '하천·수변공간',      lane: '하천·수변공간', short: '하천',   color: '#0ea5e9', deep: '#0284c7', icon: 'wave' },
    park:   { name: '공원·정원·쉼터',     lane: '공원·정원·쉼터', short: '공원',   color: '#22c55e', deep: '#16a34a', icon: 'tree' },
    road:   { name: '산책길·둘레길·골목길', lane: '산책길·골목길', short: '길',     color: '#f97316', deep: '#ea580c', icon: 'foot' },
    common: { name: '공동공간 활용활동',   lane: '공동공간 활용', short: '공동공간', color: '#a855f7', deep: '#9333ea', icon: 'home' }
  };
  const CAT_ORDER = ['river', 'park', 'road', 'common'];

  const TYPES = {
    exp:    { label: '경험',     tone: 'neutral' },
    pain:   { label: '불편',     tone: 'warn' },
    res:    { label: '지역자원', tone: 'neutral' },
    idea:   { label: '아이디어', tone: 'idea' },
    action: { label: '실천과제', tone: 'action' },
    admin:  { label: '행정협력', tone: 'admin' }
  };

  // Apps Script tables 시트와 같은 초안. LIVE 모드에서는 시트 값이 우선합니다.
  const DEFAULT_TABLES = [
    { no: 1,  cat: 'river',  dongs: '도산·임곡',             space: '황룡강 제방길·산막동 구간' },
    { no: 2,  cat: 'river',  dongs: '수완·동곡·본량',         space: '풍영정천·평동천·석계마을 천변길' },
    { no: 3,  cat: 'park',   dongs: '송정2·우산·월곡1·월곡2', space: '생활권 쉼터·한빛동산·영천마을 근린공원' },
    { no: 4,  cat: 'park',   dongs: '하남·첨단1·첨단2',       space: '경암근린공원·아미둘레길 유휴공간·무양공원' },
    { no: 5,  cat: 'park',   dongs: '신가·신창·삼도',         space: '초록어린이공원·역사문화공원·오운제 꽃동산' },
    { no: 6,  cat: 'road',   dongs: '송정1·도산',            space: '광산로67번길 골목·송정초~미르채 골목' },
    { no: 7,  cat: 'road',   dongs: '신흥·어룡·월곡1',        space: '골목 방개산 산책로·어등산 등산로·월곡중 담장' },
    { no: 8,  cat: 'road',   dongs: '운남·하남·수완',         space: '완충녹지 금구육교·지실마을·데크길 둘레길' },
    { no: 9,  cat: 'road',   dongs: '신가·신창·비아',         space: '사거리 보행로·신창 이야기길·비아 먹자골목' },
    { no: 10, cat: 'common', dongs: '첨단1·운남·신가',        space: '아미둘레길·운남근린공원·신가2근린공원' },
    { no: 11, cat: 'common', dongs: '도산·수완·송정1',        space: '도루메어린이공원·원당산공원·문화예술회관 야외무대' },
    { no: 12, cat: 'common', dongs: '비아·동곡·신창',         space: '담은정·호가정·수완동 유휴부지' }
  ];

  // 2026 추진 변경계획(외부) 당일 진행표 기준
  const STAGES = [
    { key: 'wait',    label: '참석 등록',        start: '13:30', end: '14:00' },
    { key: 'open',    label: '1부 여는마당',     start: '14:00', end: '14:20' },
    { key: 'keynote', label: '주제 발제',        start: '14:20', end: '14:30' },
    { key: 'talk',    label: '의제공론화',       start: '14:30', end: '15:30' },
    { key: 'share',   label: '공론 결과 공유',   start: '15:30', end: '15:45' },
    { key: 'vote',    label: '우선순위 투표',    start: '15:45', end: '15:51' },
    { key: 'result',  label: '투표 결과',        start: '15:51', end: '15:55' },
    { key: 'slogan',  label: '슬로건 · 마무리',  start: '15:55', end: '16:00' }
  ];

  // 의제공론화 60분 안의 세부 단계 (테이블별 숙의 운영방법)
  const SUBSTEPS = [
    { label: '주제 및 사례공유',   min: 10, start: '14:30', hint: '공간별 이용현황과 주민 실천사례를 나누고 있어요', types: ['exp', 'res'] },
    { label: '이용 경험 나누기',   min: 15, start: '14:40', hint: '불편했던 점, 개선이 필요한 점, 우리 동네 자원을 이야기해요', types: ['exp', 'pain', 'res'] },
    { label: '공동 활용방안 논의', min: 20, start: '14:55', hint: '이웃 동과 함께 활용·관리할 방법을 찾고 있어요', types: ['idea'] },
    { label: '우선 실천과제 선정', min: 10, start: '15:15', hint: '주민 공동 실천과제 1~2개와 행정 협력사항을 고르고 있어요', types: ['action', 'admin'] },
    { label: '결과 정리',         min: 5,  start: '15:25', hint: 'AI가 12개 테이블의 기록을 정리하고 있어요', types: ['action', 'admin'] }
  ];

  const DEFAULT_STATE = {
    stage: 'wait', sub: 0, auto: false,
    view: 'category', focus: 1,
    sim: false, simSpeed: 1,
    voteOpen: false, votePicks: 3, candidates: [],
    updated: 0
  };

  // ── 설정 ───────────────────────────────────────────────────
  const qs = new URLSearchParams(location.search);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
  };

  if (qs.get('api')) LS.set('agora-api', qs.get('api'));
  const API = qs.has('demo') ? '' : (LS.get('agora-api', '') || window.AGORA_API || '');
  const MODE = API ? 'live' : 'demo';

  // ── 유틸 ───────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const pad = n => String(n).padStart(2, '0');
  const hhmm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── 테이블 ─────────────────────────────────────────────────
  let tables = LS.get('agora-tables-cache', null) || DEFAULT_TABLES;
  const tableByNo = no => tables.find(t => t.no === Number(no)) || { no, cat: 'common', dongs: '', space: '' };

  async function loadTables() {
    if (MODE !== 'live') return tables;
    const r = await apiGet('config');
    if (r && r.tables && r.tables.length) { tables = r.tables; LS.set('agora-tables-cache', tables); }
    return tables;
  }

  // ── 서버 통신 ───────────────────────────────────────────────
  async function apiGet(action) {
    const res = await fetch(API + (API.includes('?') ? '&' : '?') + 'action=' + action, { cache: 'no-store' });
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    return j;
  }
  async function apiPost(body) {
    // text/plain 으로 보내야 Apps Script 웹앱에서 CORS 사전요청이 생기지 않습니다.
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    return j;
  }
  const adminKey = () => LS.get('agora-admin-key', '');

  // ── 화면 상태 (관제 → 스크린) ─────────────────────────────────
  let state = Object.assign({}, DEFAULT_STATE, LS.get('agora-state', {}));
  const stateListeners = [];
  function emitState() { stateListeners.forEach(fn => fn(state)); }
  function applyState(next) {
    if (!next) return;
    if (next.updated && state.updated && next.updated < state.updated) return;
    state = Object.assign({}, DEFAULT_STATE, next);
    LS.set('agora-state', state);
    emitState();
  }
  async function setState(patch) {
    const next = Object.assign({}, state, patch, { updated: Date.now() });
    applyState(next);
    if (MODE === 'live') await apiPost({ action: 'setState', key: adminKey(), state: next });
  }
  async function pullState() {
    if (MODE !== 'live') return state;
    const r = await apiGet('state');
    if (r.state) applyState(r.state);
    return state;
  }
  window.addEventListener('storage', e => {
    if (e.key === 'agora-state' && e.newValue) {
      const s = JSON.parse(e.newValue);
      state = Object.assign({}, DEFAULT_STATE, s);
      emitState();
    }
  });

  // 자동(타임테이블) 모드: 시계 기준으로 단계·세부단계를 계산
  function scheduledStage(m = nowMin()) {
    let stage = STAGES[0].key;
    STAGES.forEach(s => { if (m >= toMin(s.start)) stage = s.key; });
    let sub = 0;
    SUBSTEPS.forEach((s, i) => { if (m >= toMin(s.start)) sub = i; });
    return { stage, sub };
  }
  function effective() {
    return state.auto ? Object.assign({}, state, scheduledStage()) : state;
  }

  // ── 기록 파싱 ───────────────────────────────────────────────
  function typeFromLabel(l) {
    if (/실천/.test(l)) return 'action';
    if (/협력|행정|요청|건의/.test(l)) return 'admin';
    if (/아이디어|활용|방안|제안/.test(l)) return 'idea';
    if (/불편|문제|개선|걱정/.test(l)) return 'pain';
    if (/자원|사례|모임/.test(l)) return 'res';
    if (/경험|이야기|발언/.test(l)) return 'exp';
    return null;
  }

  /** Google Docs 텍스트 한 장 → 발언 목록. 한 줄 = 발언 하나. */
  function parseDoc(text) {
    const out = [];
    let sec = 'exp';
    String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((raw, idx) => {
      let line = raw.trim().replace(/^[-–•·*▪◦○●]\s*/, '');
      if (!line || /^(※|#|\/\/)/.test(line)) return;
      if (idx < 3 && /^테이블\s*\d+/.test(line)) return;
      let type = null, body = line;
      const tag = line.match(/^[\[【(]([^\]】)]{1,8})[\]】)]\s*(.*)$/);
      if (tag && typeFromLabel(tag[1])) {
        type = typeFromLabel(tag[1]); body = tag[2];
        if (!body) { sec = type; return; }
      } else {
        const head = line.match(/^[■□▶▷◆◇]\s*(.+)$/);
        if (head) { const t = typeFromLabel(head[1]); if (t) sec = t; return; }
      }
      let dong = '';
      const m = body.match(/^([가-힣]{1,4}\d?동?)\s*[:：]\s*(.+)$/);
      if (m) { dong = m[1].replace(/동$/, ''); body = m[2]; }
      body = body.replace(/^\(예시\)\s*/, '');
      if (body.length < 2 || /\(예시\)/.test(line)) return;
      if (type) sec = type;
      out.push({ type: type || sec, dong, text: body });
    });
    return out;
  }

  // ── 실시간 피드 ─────────────────────────────────────────────
  // 처음 본 시각을 발언 시각으로 씁니다(Docs에는 줄 단위 시각이 없음).
  const seen = LS.get('agora-seen', {});
  let seenDirty = false;
  const docOk = {};

  async function loadFeedRaw() {
    if (MODE === 'live') return apiGet('feed');
    const vdocs = LS.get('agora-vdocs', {});
    const docs = {};
    tables.forEach(t => { docs[t.no] = { ok: true, text: vdocs[t.no] || '' }; });
    return { docs, manual: LS.get('agora-manual', []) };
  }

  /** 피드 전체를 [{id,table,cat,dong,type,text,time,isNew}] 로. 새로 들어온 항목은 isNew=true */
  async function loadFeed() {
    const raw = await loadFeedRaw();
    const now = Date.now();
    const items = [];
    tables.forEach(t => {
      const d = raw.docs[t.no] || { ok: false, text: '' };
      docOk[t.no] = d.ok;
      const counts = {};
      parseDoc(d.text).forEach(it => {
        const base = t.no + '|' + it.text;
        counts[base] = (counts[base] || 0) + 1;
        const id = hash(base + '|' + counts[base]);
        let isNew = false;
        if (!seen[id]) { seen[id] = now; isNew = true; seenDirty = true; }
        items.push(Object.assign({ id, table: t.no, cat: t.cat, time: seen[id], isNew }, it));
      });
    });
    (raw.manual || []).forEach(m => {
      const t = tableByNo(m.table);
      const id = 'm' + hash(m.time + '|' + m.text);
      let isNew = false;
      if (!seen[id]) { seen[id] = now; isNew = true; seenDirty = true; }
      items.push({ id, table: t.no, cat: t.cat, dong: m.dong || '', type: m.type || 'exp', text: m.text, time: seen[id], isNew, manual: true });
    });
    if (seenDirty) { LS.set('agora-seen', seen); seenDirty = false; }
    items.sort((a, b) => a.time - b.time);
    return items;
  }

  async function pushManual(entry) {
    if (MODE === 'live') return apiPost(Object.assign({ action: 'push', key: adminKey() }, entry));
    const list = LS.get('agora-manual', []);
    list.push(Object.assign({ time: Date.now() }, entry));
    LS.set('agora-manual', list);
  }

  // ── 키워드 ─────────────────────────────────────────────────
  const STOP = new Set('우리 너무 정말 진짜 그리고 그래서 하는 있는 없는 있어요 없어요 해요 같아요 좋겠어요 좋겠다 좋아요 합니다 했어요 하고 하면 때문에 그런 이런 저런 많이 조금 같이 함께 주민 동네 마을 사람 사람들 생각 정도 부분 경우 지금 요즘 여기 거기 위해 통해 대한 이제 다시 매일 항상 가끔 하기 만들기 있으면 되면 해서 하는데 한번 모두 서로 아이들 어르신'.split(' '));
  const JOSA = /(으로|에서|에게|까지|부터|처럼|이라|이나|하고|라고|에는|에도|으로는|이랑|랑|을|를|이|가|은|는|에|엔|의|도|와|과|로|만)$/;
  const KEEP = /(마을|가을|겨울|하늘|공간|도로|공원|정원|놀이|거리|자리)$/;
  function keywords(items, n = 24) {
    const c = {};
    items.forEach(it => {
      it.text.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/).forEach(w => {
        let k = KEEP.test(w) ? w : w.replace(JOSA, '').replace(/들$/, '');
        if (k.length < 2 || STOP.has(k) || /^\d+$/.test(k) || /(요|다|고|며|서|면|죠|네)$/.test(w) && k === w) return;
        c[k] = (c[k] || 0) + 1;
      });
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  // ── AI 요약 ────────────────────────────────────────────────
  async function loadSummary() {
    if (MODE === 'live') return apiGet('summary');
    return LS.get('agora-summary', { tables: {}, at: 0, source: '' });
  }
  async function saveSummary(tablesObj) {
    if (MODE === 'live') return apiPost({ action: 'saveSummary', key: adminKey(), tables: tablesObj });
    const s = { tables: tablesObj, at: Date.now(), source: (LS.get('agora-summary', {}).source || 'edited') };
    LS.set('agora-summary', s);
    return s;
  }
  async function summarize() {
    if (MODE === 'live') return apiPost({ action: 'summarize', key: adminKey() });
    // DEMO: Gemini 대신 규칙 기반 정리(태그가 붙은 줄에서 뽑음)
    await sleep(2200);
    const items = await loadFeed();
    const out = ruleSummary(items);
    const s = { tables: out, at: Date.now(), source: 'rule' };
    LS.set('agora-summary', s);
    return s;
  }
  function ruleSummary(items) {
    const out = {};
    tables.forEach(t => {
      const mine = items.filter(i => i.table === t.no);
      const pick = type => mine.filter(i => i.type === type).map(i => i.text);
      const acts = pick('action'), ideas = pick('idea'), admin = pick('admin'), pains = pick('pain'), exps = pick('exp');
      const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
      out[t.no] = {
        summary: mine.length ? trim([pains[0] || exps[0], ideas[0]].filter(Boolean).join(' / '), 90) : '기록 대기 중',
        actions: (acts.length ? acts : ideas).slice(0, 2).map(s => trim(s, 40)),
        admin: trim(admin[0] || '', 50),
        keywords: keywords(mine, 4).map(k => k[0])
      };
    });
    return out;
  }

  // ── 투표 ───────────────────────────────────────────────────
  function deviceId() {
    let id = LS.get('agora-device', '');
    if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); LS.set('agora-device', id); }
    return id;
  }
  async function loadVotes() {
    if (MODE === 'live') return apiGet('votes');
    return { ballots: LS.get('agora-votes', {}) };
  }
  async function vote(picks) {
    if (MODE === 'live') return apiPost({ action: 'vote', device: deviceId(), picks });
    if (!state.voteOpen) throw new Error('지금은 투표 시간이 아니에요.');
    const b = LS.get('agora-votes', {});
    b[deviceId()] = picks.slice(0, state.votePicks || 3);
    LS.set('agora-votes', b);
    return { ok: true };
  }
  async function resetVotes() {
    if (MODE === 'live') return apiPost({ action: 'resetVotes', key: adminKey() });
    LS.set('agora-votes', {});
  }
  function tally(ballots, candidates) {
    const c = {}; candidates.forEach(x => { c[x.id] = 0; });
    Object.values(ballots || {}).forEach(picks => picks.forEach(id => { if (id in c) c[id]++; }));
    const voters = Object.keys(ballots || {}).length;
    return { voters, rows: candidates.map(x => Object.assign({ votes: c[x.id] }, x)).sort((a, b) => b.votes - a.votes || a.table - b.table) };
  }
  function buildCandidates(summary, perTable = 1) {
    const out = [];
    tables.forEach(t => {
      const s = summary.tables && summary.tables[t.no];
      if (!s) return;
      s.actions.slice(0, perTable).forEach((a, i) => { if (a) out.push({ id: 't' + t.no + 'a' + i, table: t.no, cat: t.cat, text: a }); });
    });
    return out;
  }

  // ── 시뮬레이터 (DEMO) ───────────────────────────────────────
  const SAMPLE = {
    river: {
      exp: ['아침마다 {p} 걷는데 물소리 들으면서 걷는 게 하루 낙이에요', '여름엔 {p}에 아이들 데리고 자주 나가요', '저녁 7시쯤이면 {p}에 걷는 사람이 정말 많아요', '자전거 타고 출퇴근할 때 {p}를 지나가요'],
      pain: ['{p} 가로등이 드문드문해서 밤에는 무서워요', '비 오고 나면 산책로가 진흙탕이 돼요', '하천에 쓰레기가 걸려 있는데 치우는 사람이 없어요', '자전거랑 보행자가 섞여서 부딪힐 뻔한 적이 많아요', '화장실이 멀어서 어르신들이 오래 못 걸으세요'],
      res: ['동네 걷기 동아리가 이미 매주 화요일에 모여요', '하천 정화 봉사하던 통장님 모임이 있어요', '초등학교 생태 동아리가 하천 관찰을 해요'],
      idea: ['인접 동이 같이 하천 줍깅 데이를 정하면 어떨까요', '구간마다 동 이름 표지판을 같이 만들어요', '하천 따라 동별 릴레이 걷기 대회를 열어요', '물길 안내 지도를 주민이 직접 그려요'],
      action: ['매월 셋째 토요일 두 동 합동 하천 줍깅하기', '하천 산책로 주민 안전지킴이 순찰하기', '동별 하천 사진 기록단 운영하기'],
      admin: ['{p} 구간 가로등·CCTV 추가 설치 요청', '자전거·보행 분리 노면표시 정비 요청', '하천변 이동식 화장실 설치 검토 요청']
    },
    park: {
      exp: ['{p}에서 아이들이랑 매일 저녁 놀아요', '점심 먹고 {p} 벤치에서 쉬는 게 좋아요', '어르신들이 {p}에서 체조를 하세요', '주말엔 {p}에 가족 단위로 많이 와요'],
      pain: ['{p} 벤치가 부족하고 그늘이 없어요', '밤에 청소년들이 모여서 소음이 있어요', '운동기구가 낡아서 위험해 보여요', '반려견 배변을 안 치우는 경우가 많아요', '공원 화단 관리가 잘 안 돼요'],
      res: ['아파트 정원 가꾸기 모임이 있어요', '공원 앞 작은도서관이 있어요', '주민자치회 마을정원사 교육 수료자가 10명 있어요'],
      idea: ['동네 사람들이 같이 화단을 하나씩 맡아 가꿔요', '공원에서 계절마다 작은 마을장터를 열어요', '청소년이 직접 공원 이용 규칙을 만들어요', '공원 그늘막을 주민 손으로 만들어요'],
      action: ['마을정원사 화단 입양 프로그램 운영하기', '분기별 공원 마을장터 함께 열기', '반려견 산책 매너 캠페인 하기'],
      admin: ['{p} 노후 운동기구 교체와 그늘막 설치 요청', '공원 내 소음 관리 안내판 설치 요청', '주민 화단 관리용 물탱크·수도 설치 지원 요청']
    },
    road: {
      exp: ['{p}는 아이들 통학길이라 아침에 붐벼요', '맨발로 {p} 걷는 분들이 늘었어요', '퇴근길에 {p}로 돌아서 걸어가요', '{p} 골목에 오래된 가게들이 정겨워요'],
      pain: ['{p} 골목이 어두워서 밤에 다니기 겁나요', '불법주차 때문에 유모차가 못 지나가요', '보도블록이 깨져서 넘어질 뻔했어요', '맨발길에 돌멩이가 많아서 다쳐요', '담장에 낙서가 많아 분위기가 안 좋아요'],
      res: ['골목에 30년 넘은 방앗간이 있어요', '청소년 벽화 동아리가 활동하고 있어요', '맨발걷기 모임이 매일 새벽에 모여요'],
      idea: ['골목 이야기를 담은 벽화를 주민과 함께 그려요', '두 동을 잇는 둘레길 스탬프 투어를 만들어요', '맨발길 돌 고르기 행사를 같이 해요', '집 앞 화분 하나씩 내놓기 운동을 해요'],
      action: ['월 1회 맨발길 돌 고르기 주민 모임하기', '골목 화분 내놓기 릴레이 하기', '두 동 잇는 둘레길 스탬프 투어 만들기'],
      admin: ['{p} 보안등·바닥 조명 설치 요청', '통학로 불법주차 단속과 안전펜스 설치 요청', '맨발길 세족장 설치 검토 요청']
    },
    common: {
      exp: ['{p}에서 했던 작은 음악회가 정말 좋았어요', '{p}이 비어 있는 시간이 너무 많아요', '동네 행사를 할 장소가 마땅치 않아요', '{p}에서 어르신 모임이 가끔 열려요'],
      pain: ['공간 예약 방법을 몰라서 못 써요', '비어 있는 부지에 쓰레기가 쌓여요', '여러 동이 같이 쓰려니 관리 주체가 애매해요', '주차 공간이 없어서 행사하기 어려워요'],
      res: ['마을 풍물패가 연습 장소를 찾고 있어요', '청소년 밴드 동아리가 공연하고 싶어해요', '협동조합 카페가 같이 하고 싶어해요'],
      idea: ['동별로 돌아가며 한 달에 한 번 공동 문화마당을 열어요', '공간 사용 일정을 공유하는 마을 달력을 만들어요', '세대 공감 프로그램을 같이 기획해요', '빈 부지를 임시 마을 텃밭으로 써요'],
      action: ['세 동이 돌아가며 월 1회 문화마당 열기', '공동공간 이용 마을 달력 만들기', '세대공감 이야기 모임 운영하기'],
      admin: ['{p} 주민 공동 이용 예약 창구 마련 요청', '유휴부지 임시 활용 허가 절차 안내 요청', '공동공간 관리 협약 체결 지원 요청']
    }
  };
  const simCursor = LS.get('agora-sim-cursor', {});

  function simTick(stageInfo) {
    const st = stageInfo || effective();
    if (st.stage !== 'talk') return null;
    const sub = SUBSTEPS[st.sub] || SUBSTEPS[0];
    const t = tables[Math.floor(Math.random() * tables.length)];
    // 단계에 맞는 유형 위주로, 가끔 다른 유형도 섞어 실제 토론처럼
    const pool = Math.random() < 0.8 ? sub.types : ['exp', 'pain', 'idea'];
    const type = pool[Math.floor(Math.random() * pool.length)];
    const lines = SAMPLE[t.cat][type];
    const key = t.no + type;
    const i = simCursor[key] = ((simCursor[key] == null ? Math.floor(Math.random() * lines.length) : simCursor[key]) + 1) % lines.length;
    LS.set('agora-sim-cursor', simCursor);
    const places = t.space.split('·');
    const dongs = t.dongs.split('·');
    const text = lines[i].replace('{p}', places[Math.floor(Math.random() * places.length)]);
    const tag = { exp: '경험', pain: '불편', res: '자원', idea: '아이디어', action: '실천', admin: '협력' }[type];
    const line = '[' + tag + '] ' + dongs[Math.floor(Math.random() * dongs.length)] + ': ' + text;
    const vdocs = LS.get('agora-vdocs', {});
    vdocs[t.no] = (vdocs[t.no] || '') + line + '\n';
    LS.set('agora-vdocs', vdocs);
    return line;
  }
  function simVote() {
    if (!state.voteOpen || !state.candidates.length) return;
    const b = LS.get('agora-votes', {});
    const cands = state.candidates;
    // 앞쪽 후보가 조금 더 인기 있도록 가중치
    const w = cands.map((c, i) => 1 + ((hash(c.id).charCodeAt(0) + i * 7) % 5));
    const sum = w.reduce((a, b) => a + b, 0);
    const picks = new Set();
    while (picks.size < Math.min(state.votePicks || 3, cands.length)) {
      let r = Math.random() * sum;
      for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { picks.add(cands[i].id); break; } }
    }
    b['sim' + Object.keys(b).length] = [...picks];
    LS.set('agora-votes', b);
  }
  function resetDemo() {
    ['agora-vdocs', 'agora-manual', 'agora-summary', 'agora-votes', 'agora-seen', 'agora-sim-cursor'].forEach(LS.del);
    Object.keys(seen).forEach(k => delete seen[k]);
  }

  // ── 아이콘 ─────────────────────────────────────────────────
  const ICONS = {
    wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 13c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/><path d="M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/></svg>',
    tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-6"/><path d="M12 2C8.5 2 6 4.8 6 8c-1.8.8-3 2.5-3 4.5C3 15.5 5.5 17 8 17h8c2.5 0 5-1.5 5-4.5 0-2-1.2-3.7-3-4.5 0-3.2-2.5-6-6-6z"/></svg>',
    foot: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="8" cy="15.5" rx="3.2" ry="5"/><circle cx="5.2" cy="7.6" r="1.3"/><circle cx="7.6" cy="6.4" r="1.4"/><circle cx="10.2" cy="7" r="1.3"/><ellipse cx="16.5" cy="10.5" rx="3" ry="4.6"/><circle cx="14" cy="3.6" r="1.2"/><circle cx="16.3" cy="2.7" r="1.3"/><circle cx="18.7" cy="3.4" r="1.2"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><circle cx="12" cy="14.5" r="2.5"/></svg>'
  };
  const catIcon = cat => ICONS[CATS[cat].icon];

  window.Agora = {
    EVENT, CATS, CAT_ORDER, TYPES, STAGES, SUBSTEPS, DEFAULT_TABLES, API, MODE, LS, ICONS,
    get tables() { return tables; }, tableByNo, loadTables, docOk,
    get state() { return state; }, effective, setState, pullState, scheduledStage,
    onState: fn => stateListeners.push(fn),
    parseDoc, loadFeed, pushManual, keywords,
    loadSummary, saveSummary, summarize, ruleSummary,
    deviceId, loadVotes, vote, resetVotes, tally, buildCandidates,
    simTick, simVote, resetDemo,
    esc, hash, hhmm, pad, toMin, nowMin, sleep, catIcon, adminKey, apiGet
  };
})();
