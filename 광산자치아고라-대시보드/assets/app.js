/* 2026 광산자치아고라 · 공통 코어 V2 (대형 스크린·관제 패널·공감 페이지·연습장이 함께 사용)
 *
 * V2: 진행흐름도 ①~⑦ 기준. 기록자는 Google 문서의 표에서 「우리 테이블 답」 칸에 씁니다.
 *  - LIVE : Apps Script 웹앱 URL이 설정된 경우. 13개 Docs(표) → Apps Script → 브라우저
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
    host: '광산구도시재생공동체센터',
    keynote: { title: '생활공간을 잇고, 함께 만드는 변화', speaker: '더가능연구소 엄관용 연구실장' }
  };

  // 4개 주제(강·산·하천·공원) · 13개 테이블 — 현장 배치도: 1–4 강, 5–7 산, 8–11 하천, 12–13 공원
  const TOPICS = {
    river:  { name: '강',   place: '황룡강',               color: '#38bdf8', icon: 'wave' },
    mount:  { name: '산',   place: '어등산·말미산',        color: '#a3e635', icon: 'mount' },
    stream: { name: '하천', place: '풍영정천·장수천',      color: '#2dd4bf', icon: 'wave' },
    park:   { name: '공원', place: '신촌근린공원·대상공원', color: '#fb923c', icon: 'tree' }
  };
  const TOPIC_ORDER = ['river', 'mount', 'stream', 'park'];
  const TABLE_COUNT = 13;
  const defaultTopic = no => (no = Number(no)) <= 4 ? 'river' : no <= 7 ? 'mount' : no <= 11 ? 'stream' : 'park';

  // 기록 칸(문서 표의 행)
  const FIELDS = {
    dongs:  { step: -1, label: '참여 동' },
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
    aiCheck: { step: 4, label: 'AI 문장 확인' },
    done:   { step: 4, label: '최종 제출' },
    shareCheck: { step: 5, label: '⑥ 공유 화면 확인' },
    extra:  { step: 6, label: '⑦ 추가 의견' }
  };
  const TASK_FIELDS = ['bg', 'want', 'prop', 'first', 'with'];

  // 문서 표 양식 — 단계마다 문서의 탭 하나 (apps-script/Code.gs 의 DOC_TABLES 와 같게 유지)
  //  cols: 참여자마다 한 줄(열 = 칸) / rows: [칸, 항목 이름, 무엇을 쓰면 좋은지, 예시]
  const US_DESC = '주민이 직접 할 수 있는 일 · 모임, 캠페인, 정화·돌봄 활동, 기록, 교육 등';
  const EXT_DESC = '구청·행정복지센터·기관의 도움이 필요한 일 · 시설 정비, 안전, 예산·제도 지원 등';
  const REST_DESC = '투표에서 뽑히지 않은 제안도 지우지 말고 하나씩';
  const WITH_DESC = '참여할 주민·모임 / 도움이 필요한 기관 · 현장에 없는 곳은 ‘참여 제안’·‘협조 요청’으로';
  const TEMPLATE = [
    { tab: '📌 쓰는 법', head: '📌 시작 전 준비', q: '테이블 정보를 확인해요',
      guide: '테이블 번호·주제는 문서 제목에 있어요. 참여 동을 적고, 진행자와 단계별 질문·시간·제출 방법(⑤에서 ‘제출’)을 맞춰요. 관제반에 「기록 연결」이 초록불인지 확인해요.',
      rows: [['dongs', '참여 동', '이 테이블 주민들의 동', '첨단1동, 첨단2동']] },
    { tab: '① 이용 경험', head: '① 이용 경험 나누기', q: '우리는 이곳에서 어떤 경험을 하고 있나요?',
      guide: '참여자 한 사람이 한 줄씩 써요(이름 대신 번호). 「장소·상황 — 핵심」으로 쓰고, 서로 다른 경험은 합치지 말고 따로 적어요. 말하지 않은 칸은 비워 두세요.',
      cols: ['good', 'bad', 'better'], ex: ['제방길 아침 — 물소리 들으며 걷기 좋아요', '제방길 저녁 — 조명이 어두워 혼자 걷기 무서워요', '산책로 중간 — 쉬어 갈 벤치가 더 있으면 좋겠어요'], people: 14 },
    { tab: '② 함께 할 일', head: '② 함께 할 일 제안하기', q: '우리의 경험을 바탕으로, 이곳이 어떻게 달라지면 좋을까요?',
      guide: '제안 하나에 한 줄. 주민이 직접 할 일은 🟢 초록 줄에, 기관 도움이 필요한 일은 🔵 파란 줄에 써요. 둘 다 필요하면 같은 제목으로 양쪽에 역할을 나눠 적어요. 화면에 번호가 자동으로 붙어요. 한 사람의 생각인지 테이블이 함께 확인한 것인지 구분해요.',
      pair: [['제안 제목 ✍️', '짧게, 이름처럼'], ['핵심 내용 ✍️', '무엇을 어떻게, 한 문장']],
      groups: [{ field: 'us', band: '🟢 주민이 직접 할 일', desc: '모임 · 캠페인 · 정화 · 돌봄 · 기록 · 교육', ex: ['함께 걷기', '두 동 주민이 한 달에 한 번 함께 걷고 길 살피기'] },
        { field: 'ext', band: '🔵 기관 도움이 필요한 일', desc: '구청 · 행정복지센터 · 기관 / 시설 정비 · 안전 · 예산 · 제도', ex: ['안내표지 정비', '연결길 안내표지를 새로 달아 주세요 (구청 공원녹지과)'] }],
      rows: [1, 2, 3, 4, 5].map(n => ['us', '🟢 주민 ' + n]).concat([1, 2, 3, 4].map(n => ['ext', '🔵 외부 ' + n])) },
    { tab: '③ 우선 과제', head: '③ 우선 과제 선정하기', q: '여러 제안 중 무엇을 먼저 이야기해 볼까요?',
      guide: '참가자가 휴대폰으로 투표해요(대형 화면 QR). 🟢 주민 중 가장 많은 표를 「선정 과제 1」, 🔵 외부 중 가장 많은 표를 「선정 과제 2」에 적고, 화면의 표 수를 「투표 결과」에 옮겨요. 뽑히지 않은 제안도 지우지 말고 남겨요.',
      rows: [['pick', '선정 과제 1 · 🟢 주민', '주민 제안 중 가장 많은 표', '함께 걷기·길 살피기'], ['pick', '선정 과제 2 · 🔵 외부', '외부 제안 중 가장 많은 표', '연결길 안내표지 정비'],
        ['tally', '투표 결과', '대형 화면의 번호별 표 수', '1번 7표, 3번 2표 / 6번 5표, 7번 1표'],
        ['rest', '선정되지 않은 의견', REST_DESC, '[주민실천] 쓰레기통 주변 함께 치우기 (2표)'], ['rest', '선정되지 않은 의견', '', ''], ['rest', '선정되지 않은 의견', '', ''], ['rest', '선정되지 않은 의견', '', ''], ['rest', '선정되지 않은 의견', '', ''], ['rest', '선정되지 않은 의견', '', '']] },
    { tab: '④ 실행방법', head: '④ 과제 1 실행방법', q: '이 제안을 실천하려면 무엇부터 시작하면 좋을까요?', task: 0,
      guide: '선정 과제 1을 다섯 칸에 정리해요. 정하지 못한 칸은 ‘추후 협의’라고 써요. ⑤에서 고칠 곳이 나오면 이 탭에서 바로 고쳐요.',
      rows: [['bg', '현황·제안배경', '지금 어떤 상황이고 왜 필요한지', '아파트 사이를 길게 잇는 공원이라 두 동 주민이 만날 기회가 더해지면 좋겠음'],
        ['want', '우리가 바라는 모습', '이 일이 이뤄지면 어떤 모습일지', '첨단1·2동 주민들이 아파트 경계를 넘어 인사하고 어울리는 모습'],
        ['prop', '우리의 제안', '바라는 모습을 위해 함께 할 일', '취미를 이웃과 나누는 ‘공원에서 만나는 이웃’'],
        ['first', '우리가 시작할 첫걸음', '처음 해 볼 활동 · 언제 · 어디서 · 동별 역할', '각 동에서 취미를 나눌 주민을 찾아 공원 한 구간에서 시범 운영하기'],
        ['with', '함께하고 싶은 이웃', WITH_DESC, '인근 아파트 주민모임(참여 제안), 주민자치회, 공원 관리부서(협조 요청)']] },
    { tab: '④ 실행방법', head: '④ 과제 2 실행방법', q: '선정 과제가 하나뿐이면 이 표는 비워 두세요', task: 1,
      rows: [['bg', '현황·제안배경', '', ''], ['want', '우리가 바라는 모습', '', ''], ['prop', '우리의 제안', '', ''], ['first', '우리가 시작할 첫걸음', '', ''], ['with', '함께하고 싶은 이웃', WITH_DESC, '']] },
    { tab: '⑤ 결과 확인', head: '⑤ 테이블 결과 확인', q: '정리된 내용이 우리가 이야기한 뜻과 맞나요?',
      guide: '진행자가 다섯 항목을 읽어 주면, 고칠 곳은 ④ 탭에서 바로 고쳐요(화면도 바로 바뀌어요). 기록과 화면이 같은지 확인하고, 진행자의 최종 확인 신호 뒤에 ‘제출’이라고 써요.',
      rows: [['check', '고친 곳·빠진 의견 메모', '무엇을 고쳤는지 짧게', '첫걸음 날짜를 ‘추후 협의’로 고침'],
        ['aiCheck', '✨ AI 다듬은 문장 확인', 'AI가 다듬은 문장이 화면에 뜨면 원래 발언과 비교해 다른 점을 적어요', '“줍깅”이 “환경정화”로 바뀜 → 원래 말로 되돌려 주세요'],
        ['done', '최종 제출', '진행자의 최종 확인 신호 뒤에', '제출']] }
  ];
  const TABS = [...new Set(TEMPLATE.map(t => t.tab))];

  const DEFAULT_TABLES = Array.from({ length: TABLE_COUNT }, (_, i) => ({ no: i + 1, topic: defaultTopic(i + 1), dongs: '', space: '' }));

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
    { label: '② 함께 할 일 제안하기', min: 15, start: '14:45', q: '우리의 경험을 바탕으로, 이곳이 어떻게 달라지면 좋을까요?' },
    { label: '③ 우선 과제 선정하기', min: 5,  start: '15:00', q: '여러 제안 중 무엇을 먼저 이야기해 볼까요?' },
    { label: '④ 실행방법 구체화하기', min: 20, start: '15:05', q: '이 제안을 실천하려면 무엇부터 시작하면 좋을까요?' },
    { label: '⑤ 테이블 결과 확인하기', min: 5, start: '15:25', q: '정리된 내용이 우리가 이야기한 뜻과 맞나요?' }
  ];

  const DEFAULT_STATE = {
    stage: 'wait', sub: 0, auto: false,
    topic: 'all',            // 'all' | 'auto'(주제 돌아가며) | 주제 키
    sim: false, simSpeed: 1,
    polished: false,         // ⑤·⑥·⑦에서 AI가 다듬은 문장을 쓸지
    likeOpen: false, cards: [], likeRound: 0,
    voteOpen: false, ballot: {}, voteRound: 0,  // ③ 테이블별 휴대폰 투표 (🟢 주민 1개 + 🔵 외부 1개)
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
  // 예전 버전이 저장해 둔 목록(12개·옛 주제 road 등)은 버리고 기본 13개로 (옛 주제 키가 남으면 관제 패널이 멈춤)
  const fixTopic = t => Object.assign({}, t, { topic: TOPICS[t.topic] ? t.topic : defaultTopic(t.no) });
  const cachedTables = LS.get('agora-tables-cache-v2', null);
  let tables = Array.isArray(cachedTables) && cachedTables.length === TABLE_COUNT ? cachedTables.map(fixTopic) : DEFAULT_TABLES;
  const tableByNo = no => tables.find(t => t.no === Number(no)) || { no: Number(no), topic: defaultTopic(no), dongs: '', space: '' };
  const tablesOf = topic => tables.filter(t => t.topic === topic);
  async function loadTables() {
    if (MODE !== 'live') return tables;
    const r = await apiGet('config');
    if (r && r.tables && r.tables.length) {
      tables = r.tables.map(fixTopic);
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
    const l = String(label || '').replace(/\s+/g, '');
    if (/참여동/.test(l)) return 'dongs';
    if (/AI|다듬/.test(l)) return 'aiCheck';
    if (/공유/.test(l)) return 'shareCheck';
    if (/추가의견/.test(l)) return 'extra';
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
    if (/빠진|고친|고칠|수정/.test(l)) return 'check';
    if (/제출/.test(l)) return 'done';
    return null;
  }
  const TAG_US = /^\[\s*주민\s*실천\s*\]\s*/, TAG_EXT = /^\[\s*외부\s*협력\s*\]\s*/;

  /** 문서 표 행 [[칸 문단들]] → [{field, task, text, cell, slot, last}]. 칸 안의 한 줄 = 카드 하나
   *  항목 칸은 첫 문단만 이름으로 봄(아래 설명 문단은 무시). ① 표는 열마다 칸이 다름. */
  function parseDoc(rows) {
    const out = [];
    let task = 0, colFields = null, pair = false;
    (rows || []).forEach((cells, ri) => {
      if (!cells || cells.length < 2) return;
      const label = String((cells[0] || [])[0] || '').trim();
      if (/^(?:[①-⑦]|📌)/u.test(label)) {
        const m = label.match(/과제\s*(\d)/); task = m ? Number(m[1]) - 1 : 0;
        const cf = cells.slice(1).map(c => fieldOf((c || [])[0]));
        colFields = cf.some(f => f && FIELDS[f].step === 0) ? cf : null;
        pair = /제안\s*제목/.test(String((cells[1] || [])[0] || ''));
        return;
      }
      if (/^예시/.test(label)) return;
      const push = (field, t, ans, ci) => {
        const lines = (ans || []).map(x => String(x).replace(/^[-–•·*▪◦○●]\s*/, '').trim())
          .filter(x => x && !/\(예시\)|✍️/.test(x) && !/^\[\s*(주민\s*실천|외부\s*협력)\s*\]$/.test(x) && (x.length >= 2 || field === 'done'));
        lines.forEach((text, i) => {
          let f = field;
          // ② 칸 안에서 [주민실천]/[외부협력]을 직접 붙였으면 그 표시를 따름
          if (f === 'us' || f === 'ext') { if (TAG_US.test(text)) { f = 'us'; text = text.replace(TAG_US, ''); } else if (TAG_EXT.test(text)) { f = 'ext'; text = text.replace(TAG_EXT, ''); } }
          if (text) out.push({ field: f, task: t, text, cell: f + t, slot: 'r' + ri + 'c' + ci, last: i === lines.length - 1 });
        });
      };
      if (colFields) { cells.slice(1).forEach((c, i) => { if (colFields[i]) push(colFields[i], 0, c, i + 1); }); return; }
      if (pair) {  // ② 한 줄 = 제안 하나: 「제안 제목 — 핵심 내용」으로 합침
        const f = /외부|기관/.test(label) ? 'ext' : /주민/.test(label) ? 'us' : null;
        if (!f) return;
        const j = c => (c || []).map(x => String(x).trim()).filter(Boolean).join(' ');
        const a = j(cells[1]), b = j(cells[2]);
        push(f, 0, [a && b ? a + ' — ' + b : a || b], 1);
        return;
      }
      const field = fieldOf(label);
      if (!field) return;
      const t = field === 'pick' ? Math.max(0, Number((label.match(/\d/) || ['1'])[0]) - 1) : FIELDS[field].step === 3 ? task : 0;
      push(field, t, cells.length >= 3 ? cells[cells.length - 1] : cells[1], cells.length - 1);
    });
    return out;
  }

  /** 칸 열쇠 목록 (데모·연습장용). 열쇠 = 'T표R줄C열' */
  function slotList() {
    const out = [];
    TEMPLATE.forEach((s, ti) => {
      if (s.cols) { for (let r = 0; r < s.people; r++) s.cols.forEach((f, ci) => out.push({ key: 'T' + ti + 'R' + r + 'C' + ci, field: f, task: 0, tab: s.tab, ti })); }
      else if (s.pair) s.rows.forEach(([f], ri) => [0, 1].forEach(ci => out.push({ key: 'T' + ti + 'R' + ri + 'C' + ci, field: f, task: 0, tab: s.tab, ti, col: ci })));
      else s.rows.forEach(([f, label], ri) => out.push({ key: 'T' + ti + 'R' + ri, field: f, task: f === 'pick' ? Number(label.match(/\d/)[0]) - 1 : FIELDS[f].step === 3 ? s.task : 0, tab: s.tab, ti }));
    });
    return out;
  }
  /** 칸별 줄 {열쇠: [줄]} → 문서와 같은 표 행 */
  function rowsFromCells(cells) {
    const rows = [];
    TEMPLATE.forEach((s, ti) => {
      if (s.cols) {
        rows.push([[s.head]].concat(s.cols.map(f => [FIELDS[f].label])));
        rows.push([['예시']].concat(s.ex.map(x => [x])));
        for (let r = 0; r < s.people; r++) rows.push([['참여자 ' + (r + 1)]].concat(s.cols.map((f, ci) => (cells['T' + ti + 'R' + r + 'C' + ci] || []).slice())));
      } else if (s.pair) {
        rows.push([[s.head]].concat(s.pair));
        s.groups.forEach(g => {
          rows.push([[g.band, g.desc], [], []]);
          rows.push([['예시'], [g.ex[0]], [g.ex[1]]]);
          s.rows.forEach(([f, label], ri) => { if (f === g.field) rows.push([[label]].concat([0, 1].map(ci => (cells['T' + ti + 'R' + ri + 'C' + ci] || []).slice()))); });
        });
      } else {
        rows.push([[s.head], ['예시 (이렇게 쓰면 돼요)'], ['우리 테이블 답 ✍️']]);
        s.rows.forEach(([, label, desc, ex], ri) => rows.push([desc ? [label, desc] : [label], ex ? [ex] : [], (cells['T' + ti + 'R' + ri] || []).slice()]));
      }
    });
    return rows;
  }

  // ── 실시간 피드 ──
  const seen = LS.get('agora-seen-v2', {});
  let seenDirty = false;
  const docOk = {};
  async function loadFeedRaw() {
    if (MODE === 'live') return apiGet('feed');
    const vdocs = LS.get('agora-vdocs-v2b', {});
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
          const key = t.no + it.slot, p = lastLine[key];
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
  // [주민실천]/[외부협력] (또는 (우리)/(외부)) 표시
  const kindOf = s => /[\(\[]\s*외부/.test(s) ? 'ext' : /[\(\[]\s*(우리|주민)/.test(s) ? 'us' : '';
  const stripKind = s => s.replace(/\s*[\(\[]\s*(우리|주민|외부)[^\)\]]*[\)\]]\s*/g, ' ').trim();

  /** 한 테이블의 현재 기록을 칸별로 */
  function tableData(items, no) {
    const mine = items.filter(i => i.table === Number(no));
    const of = (f, k) => mine.filter(i => i.field === f && (k == null || i.task === k));
    const join = (f, k) => of(f, k).map(i => i.text).join(' ');
    const picks = [0, 1].map(k => of('pick', k)[0]).filter(Boolean).map(i => ({ text: stripKind(i.text), kind: kindOf(i.text) || (i.task ? 'ext' : 'us'), task: i.task }));  // 과제 1 = 주민, 과제 2 = 외부(표시가 없으면)
    return {
      good: of('good'), bad: of('bad'), better: of('better'), us: of('us'), ext: of('ext'),
      picks, tally: of('tally'), rest: of('rest').map(i => Object.assign({}, i, { text: stripKind(i.text), kind: kindOf(i.text) })),
      tasks: [0, 1].map(k => { const o = {}; TASK_FIELDS.forEach(f => { o[f] = join(f, k); }); return o; }),
      check: of('check'), aiCheck: of('aiCheck'), shareCheck: of('shareCheck'), extra: of('extra'), dongs: of('dongs').map(i => i.text).join(', '),
      done: of('done').some(i => /제출|완료|동의/.test(i.text)),
      count: mine.length
    };
  }
  const filled = task => TASK_FIELDS.filter(f => task[f]).length;
  /** ② 제안 번호: [주민실천] 1.. 다음 [외부협력] 이어서 (③ 투표 때 이 번호로 부름) */
  const numbered = d => d.us.map((it, i) => Object.assign({ no: i + 1, kind: 'us' }, it)).concat(d.ext.map((it, i) => Object.assign({ no: d.us.length + i + 1, kind: 'ext' }, it)));
  /** 「짧은 제목 — 핵심」 → [제목, 핵심] (구분이 없으면 ['', 전체]) */
  function splitTitle(text) {
    const m = String(text).match(/^(.{1,24}?)\s+[—–-]\s+(.+)$/) || String(text).match(/^([^:：]{1,24})[:：]\s*(.+)$/);
    return m ? [m[1].trim(), m[2].trim()] : ['', String(text)];
  }

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
        us: d.us.map(i => i.text), ext: d.ext.map(i => i.text), tasks: d.tasks.filter((k, i) => i === 0 || filled(k)), check: d.check.concat(d.aiCheck).map(i => i.text) };
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
  // ── ③ 테이블별 투표: 관제가 열 때 ② 제안을 후보로 고정 → 휴대폰은 주민 1개·외부 1개 ──
  function buildBallot(items) {
    const out = {};
    tables.forEach(t => {
      const nums = numbered(tableData(items, t.no));
      const opt = i => { const [h, b] = splitTitle(i.text); return { id: 't' + t.no + 'n' + i.no, no: i.no, text: trim(h || b, 30), sub: h ? trim(b, 40) : '' }; };
      const us = nums.filter(i => i.kind === 'us').map(opt), ext = nums.filter(i => i.kind === 'ext').map(opt);
      if (us.length || ext.length) out[t.no] = { us, ext };
    });
    return out;
  }
  async function loadVotes() {
    if (MODE === 'live') return apiGet('votes');
    const b = LS.get('agora-tvotes-v1', {});
    const counts = {};
    Object.values(b).forEach(v => [v.us, v.ext].forEach(id => { if (id) counts[id] = (counts[id] || 0) + 1; }));
    return { counts, people: Object.keys(b).length };
  }
  /** 내 표 {table, us, ext} (us·ext 는 후보 id, 하나만 골라도 됨) */
  async function castVote(v) {
    if (MODE === 'live') return apiPost({ action: 'vote', device: deviceId(), table: v.table, us: v.us || '', ext: v.ext || '' });
    if (!state.voteOpen) throw new Error('지금은 투표 시간이 아니에요.');
    const b = LS.get('agora-tvotes-v1', {});
    b[deviceId()] = { table: v.table, us: v.us || '', ext: v.ext || '' };
    LS.set('agora-tvotes-v1', b);
    return { ok: true };
  }
  async function resetVotes() {
    if (MODE === 'live') return apiPost({ action: 'resetVotes', key: adminKey() });
    LS.set('agora-tvotes-v1', {});
  }
  function simVote() {
    const nos = Object.keys(state.ballot || {}); if (!state.voteOpen || !nos.length) return;
    const no = nos[Math.floor(Math.random() * nos.length)], bt = state.ballot[no];
    const pick = a => a.length ? a[Math.floor(Math.random() * Math.min(a.length, 3))].id : '';
    const b = LS.get('agora-tvotes-v1', {});
    b['sim' + Object.keys(b).length] = { table: Number(no), us: pick(bt.us), ext: pick(bt.ext) };
    LS.set('agora-tvotes-v1', b);
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
    us: ['함께 걷기 — 두 동 주민이 한 달에 한 번 함께 걷기', '줍깅 데이 — {p} 쓰레기 함께 줍기', '안전지킴이 — 저녁 산책로 주민 순찰하기', '사진 기록단 — 산책로 변화를 사진으로 남기기'],
    ext: ['조명 점검 — {p} 어두운 구간 조명·CCTV 점검', '안내표지 정비 — 연결길 표지판 새로 달기', '쉼터 지원 — 벤치·그늘막 설치', '안전시설 — 위험 구간 난간 보완'],
    tally: ['함께 걷기 7표, 줍깅 5표, 표지판 3표'],
    rest: ['[주민실천] 쓰레기통 주변 함께 치우기 (2표)', '[주민실천] 반려견 산책 매너 캠페인 (1표)', '[외부협력] 화장실 설치 (2표)', '[외부협력] 주차 공간 확보 (1표)']
  };
  const TASK_SAMPLE = [
    { pick: '[주민실천] {p} 함께 걷고 살피기', bg: '{p}를 따로 걷는 주민은 많지만 함께 살피는 활동은 없음', want: '두 동 주민이 같이 걸으며 인사하고 길을 함께 돌보는 모습', prop: '한 달에 한 번 ‘{p} 함께 걷기’', first: '12월 첫 토요일 오전 10시, 동 행정복지센터 앞에서 시작', with: '걷기 동아리, 주민자치회, 추후 협의' },
    { pick: '[외부협력] {p} 조명·안내표지 정비', bg: '저녁 산책객이 늘었지만 어두운 구간이 많음', want: '저녁에도 안심하고 걷는 {p}', prop: '어두운 구간 조명 보완과 안내표지 정비 요청', first: '주민이 어두운 구간 지도를 함께 그려 구청에 전달', with: '구청 공원녹지과, 통장단' }
  ];
  function simTick(stageInfo) {
    const st = stageInfo || effective();
    if (st.stage !== 'talk') return null;
    const t = tables[Math.floor(Math.random() * tables.length)];
    const p = TOPICS[t.topic].place.split('·')[0];
    const vdocs = LS.get('agora-vdocs-v2b', {});
    const cells = vdocs[t.no] = vdocs[t.no] || {};
    const slots = slotList();
    const has = (f, k = 0) => slots.some(x => x.field === f && x.task === k && (cells[x.key] || []).length);
    // 그 칸의 빈 자리(없으면 마지막 자리 아래로 이어 쓰기)
    const add = (f, k, line) => {
      if (f === 'us' || f === 'ext') {  // ② 표: 빈 줄에 제목·내용을 나눠 씀(다 차면 쉬기)
        const sl = slots.find(x => x.field === f && x.col === 0 && !(cells[x.key] || []).length && !(cells[x.key.replace(/C0$/, 'C1')] || []).length);
        if (!sl) return '';
        const [a, b] = splitTitle(line.replace(/\{p\}/g, p));
        cells[sl.key] = a ? [a] : []; cells[sl.key.replace(/C0$/, 'C1')] = [b];
        return line;
      }
      const mine = slots.filter(x => x.field === f && x.task === k);
      const sl = mine.find(x => !(cells[x.key] || []).length) || mine[mine.length - 1];
      (cells[sl.key] = cells[sl.key] || []).push(line.replace(/\{p\}/g, p));
      return line;
    };
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    let line = '';
    if (st.sub === 0) { const f = rnd(['good', 'bad', 'better']); line = add(f, 0, rnd(SAMPLE[f])); }
    else if (st.sub === 1) { const f = rnd(['us', 'ext']); line = add(f, 0, rnd(SAMPLE[f])); }
    else if (st.sub === 2) {
      if (!has('pick', 0)) line = add('pick', 0, TASK_SAMPLE[0].pick);
      else if (!has('pick', 1) && t.no % 3) line = add('pick', 1, TASK_SAMPLE[1].pick);  // 일부 테이블은 과제 하나만
      else if (!has('tally')) line = add('tally', 0, SAMPLE.tally[0]);
      else if (slots.filter(x => x.field === 'rest' && (cells[x.key] || []).length).length < 3) line = add('rest', 0, rnd(SAMPLE.rest));
    } else if (st.sub === 3) {
      const k = has('pick', 1) && TASK_FIELDS.every(f => has(f, 0)) ? 1 : 0;
      const f = TASK_FIELDS.find(x => !has(x, k));
      if (f) line = add(f, k, TASK_SAMPLE[k][f]);
    } else if (st.sub === 4) {
      if (!has('check') && Math.random() < .5) line = add('check', 0, '첫걸음 날짜는 추후 협의로 고쳐 주세요');
      else if (!has('done')) line = add('done', 0, '제출');
    }
    LS.set('agora-vdocs-v2b', vdocs);
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
    ['agora-vdocs-v2b', 'agora-manual-v2', 'agora-summary-v2', 'agora-likes-v2', 'agora-tvotes-v1', 'agora-seen-v2'].forEach(LS.del);
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
    EVENT, TOPICS, TOPIC_ORDER, TABLE_COUNT, FIELDS, TASK_FIELDS, TEMPLATE, TABS, slotList, STAGES, SUBSTEPS, DEFAULT_TABLES, API, MODE, LS, ICONS,
    get tables() { return tables; }, tableByNo, tablesOf, loadTables, docOk,
    get state() { return state; }, effective, setState, pullState, scheduledStage,
    onState: fn => stateListeners.push(fn),
    parseDoc, rowsFromCells, loadFeed, pushManual, tableData, proposals, filled, numbered, splitTitle, aiInput,
    loadSummary, saveSummary, summarize, ruleSummary,
    deviceId, buildCards, loadLikes, like, resetLikes,
    buildBallot, loadVotes, castVote, resetVotes,
    simTick, simLike, simVote, resetDemo,
    esc, hash, hhmm, pad, toMin, nowMin, sleep, trim, topicIcon, adminKey, apiGet
  };
})();
