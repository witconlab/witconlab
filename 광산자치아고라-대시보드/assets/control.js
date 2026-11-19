/* 관제 패널 V2 */
(function () {
  'use strict';
  const A = window.Agora;
  const { TOPICS, TOPIC_ORDER, FIELDS, TASK_FIELDS, STAGES, SUBSTEPS, esc, hhmm } = A;
  const $ = s => document.querySelector(s);
  const tv = k => '--c:' + TOPICS[k].color;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, err ? 7000 : 2600);
  }
  let pending = 0;
  async function act(fn, okMsg) {
    if (A.MODE === 'live') { pending++; $('#sync').textContent = '서버에 보내는 중…'; }
    try {
      await fn();
      $('#auth-warn').hidden = true;
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      const msg = e.message || String(e);
      if (/비밀번호/.test(msg)) $('#auth-warn').hidden = false;
      toast(msg, true);
      return false;
    } finally {
      if (A.MODE === 'live' && --pending === 0) renderState();
    }
  }

  // ── 상단 ──
  $('#mode').textContent = A.MODE === 'live' ? 'LIVE' : 'DEMO · 시뮬레이션';
  $('#mode').classList.toggle('live', A.MODE === 'live');
  if (A.MODE === 'live') $('#sim-card').style.display = 'none';
  const demoQs = new URLSearchParams(location.search).has('demo') ? '?demo' : '';
  $('#open-screen').onclick = () => window.open('index.html' + demoQs, 'agora-screen');
  $('#open-like').onclick = () => window.open('vote.html' + demoQs, 'agora-like');
  if (demoQs) $('#preview').src = 'index.html?preview&demo';
  $('#open-settings').onclick = () => { $('#set-api').value = A.LS.get('agora-api', '') || window.AGORA_API || ''; $('#set-key').value = A.adminKey(); $('#settings').showModal(); };
  $('#auth-fix').onclick = () => $('#open-settings').click();
  $('#set-save').onclick = () => { A.LS.set('agora-api', $('#set-api').value.trim()); A.LS.set('agora-admin-key', $('#set-key').value); setTimeout(() => location.reload(), 50); };
  if (A.MODE === 'live' && !A.adminKey()) setTimeout(() => $('#open-settings').click(), 300);

  // ── 진행 단계 ──
  $('#stages').innerHTML = STAGES.map(s => '<button class="stg" data-k="' + s.key + '"><b>' + s.label + '</b><small>' + s.start + '–' + s.end + '</small></button>').join('');
  $('#subs').innerHTML = SUBSTEPS.map((s, i) => '<button class="stg" data-i="' + i + '"><b>' + s.label + '</b><small>' + s.start + ' · ' + s.min + '분</small></button>').join('');
  $('#stages').onclick = e => {
    const b = e.target.closest('.stg'); if (!b) return;
    const patch = { stage: b.dataset.k, auto: false };
    if (b.dataset.k === 'like' && !(A.state.cards || []).length) patch.cards = makeCards();
    act(() => A.setState(patch));
  };
  $('#subs').onclick = e => { const b = e.target.closest('.stg'); if (b) act(() => A.setState({ stage: 'talk', sub: Number(b.dataset.i), auto: false })); };
  $('#auto').onchange = e => act(() => A.setState({ auto: e.target.checked }));

  // ── 주제 ──
  $('#topics').innerHTML = '<button data-t="all">전체 ' + A.tables.length + '개</button><button data-t="auto">자동 순환</button>' +
    TOPIC_ORDER.map(k => '<button data-t="' + k + '" style="' + tv(k) + '">' + TOPICS[k].name + '<small>' + TOPICS[k].place + ' · ' + A.tablesOf(k).map(t => t.no).join('·') + '</small></button>').join('');
  $('#one-tables').innerHTML = A.tables.map(t => '<button data-t="T' + t.no + '" style="' + tv(t.topic) + '">T' + t.no + '</button>').join('');
  $('#one-tables').onclick = e => { const b = e.target.closest('button'); if (b) act(() => A.setState({ topic: b.dataset.t })); };
  $('#topics').onclick = e => { const b = e.target.closest('button'); if (b) act(() => A.setState({ topic: b.dataset.t })); };

  $('#slogan-go').onclick = () => act(() => A.setState({ stage: 'slogan', sloganCue: Date.now(), sloganStill: false, auto: false }), '구호 카운트다운 시작!');
  $('#slogan-still').onclick = () => act(() => A.setState({ stage: 'slogan', sloganStill: true, auto: false }), '구호 화면(모션 없이)을 띄웠어요');

  // ── 발표 장표 (주제 발제 PDF 1–14쪽) ──
  const SLIDES = ['표지 · 생활공간을 잇고', '함께 쓰는 공간 6곳', '왜 동의 경계를 넘어야 할까', '함께 쓰는 공간은 왜 돌보기 어려울까', '2가지 처방과 세 번째 길', '오늘 공론의 방향, 3가지 연결', '이어야 할 관계', '제안의 힘 · 오늘의 약속', '오늘 공론장의 흐름', '테이블 결과, 5가지로 정리', '오늘의 공통질문', '⑥ 주제별 결과 공유하기', '⑦ 공감·응원 나누기', '마무리 구호'];
  const KEY_SLIDES = [[8, '테이블 숙의 시작 전'], [9, '① 시작 때'], [11, '숙의 중 언제든'], [10, '④ 시작 때'], [12, '⑥ 시작 때'], [13, '⑦ 시작 때']];
  const slideBtn = (n, when) => '<button data-s="' + n + '"><img src="assets/slides/t' + String(n).padStart(2, '0') + '.jpg" alt="" loading="lazy"><b>' + n + '. ' + esc(SLIDES[n - 1]) + '</b>' + (when ? '<small>' + esc(when) + '</small>' : '') + '</button>';
  $('#slides-key').innerHTML = KEY_SLIDES.map(([n, w]) => slideBtn(n, w)).join('');
  $('#slides-all').innerHTML = SLIDES.map((_, i) => slideBtn(i + 1)).join('');
  document.querySelectorAll('.slides').forEach(el => { el.onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; const eff = A.effective(), n = Number(b.dataset.s); act(() => A.setState({ slide: n, slideAt: eff.stage + '/' + (eff.sub || 0) }), '장표 ' + n + ' 띄움'); }; });
  $('#slide-off').onclick = () => act(() => A.setState({ slide: 0 }), '장표를 내렸어요');

  function renderState() {
    const st = A.state, eff = A.effective(), sched = A.scheduledStage();
    document.querySelectorAll('#stages .stg').forEach(b => { b.classList.toggle('on', b.dataset.k === eff.stage); b.classList.toggle('sched', b.dataset.k === sched.stage); });
    document.querySelectorAll('#subs .stg').forEach(b => b.classList.toggle('on', eff.stage === 'talk' && Number(b.dataset.i) === eff.sub));
    document.querySelectorAll('#topics button, #one-tables button').forEach(b => b.classList.toggle('on', b.dataset.t === (st.topic || 'all')));
    $('#auto').checked = !!st.auto;
    $('#polished').checked = !!st.polished;
    $('#sim').checked = !!st.sim;
    $('#sim-speed').value = String(st.simSpeed || 1);
    $('#like-open').disabled = !!st.likeOpen;
    $('#like-close').disabled = !st.likeOpen;
    $('#now-label').textContent = '스크린: ' + (STAGES.find(s => s.key === eff.stage) || {}).label + (eff.stage === 'talk' ? ' · ' + SUBSTEPS[eff.sub].label : '') + (st.auto ? ' (자동)' : '');
    $('#sync').textContent = st.updated ? '마지막 변경 ' + hhmm(st.updated) : '';
    const sl = A.slideOn(eff);
    document.querySelectorAll('.slides [data-s]').forEach(b => b.classList.toggle('on', Number(b.dataset.s) === sl));
    $('#slide-off').disabled = !sl;
    renderCards(); renderVotes();
  }
  A.onState(renderState);

  // ── 기록 현황 ──
  let items = [];
  let submSeen = null;
  async function pollFeed() {
    try { items = await A.loadFeed(); } catch (e) { $('#feed-sum').textContent = '기록을 불러오지 못했어요: ' + e.message; return; }
    // ④ 작성 완료 「제출」: 개수 + 새로 제출하면 소리·알림
    const subm = A.tables.filter(t => A.tableData(items, t.no).done).map(t => t.no);
    $('#feed-sum').textContent = '총 ' + items.length + '줄 · ④ 제출 ' + subm.length + '/' + A.tables.length;
    const freshSub = submSeen ? subm.filter(n => !submSeen.includes(n)) : [];
    submSeen = subm;
    if (freshSub.length) { toast('📝 테이블 ' + freshSub.join(', ') + ' ④ 작성 완료 제출 (' + subm.length + '/' + A.tables.length + ')'); ding(); }
    $('#docs').innerHTML = A.tables.map(t => {
      const d = A.tableData(items, t.no);
      const mine = items.filter(i => i.table === t.no);
      const last = mine[mine.length - 1];
      const steps = [d.good.length + d.bad.length + d.better.length, '주' + d.us.length + '·외' + d.ext.length, d.picks.length, A.filled(d.tasks[0]) + A.filled(d.tasks[1]), d.done ? '✓' : d.check.length];
      const link = t.docId ? '<a href="https://docs.google.com/document/d/' + esc(t.docId) + '/edit" target="_blank" rel="noopener">문서 열기</a>' : '';
      return '<div class="doc ' + (A.docOk[t.no] ? 'ok' : '') + '" style="' + tv(t.topic) + (d.done ? ';box-shadow:inset 0 0 0 2px #22c55e' : '') + '"><div class="doc-hd"><b>T' + t.no + ' ' + TOPICS[t.topic].name + (d.done ? ' <span style="color:#4ade80">📝 제출</span>' : '') + '</b><i></i></div>' +
        '<small class="steps">' + steps.map((n, i) => '<span>' + '①②③④⑤'[i] + n + '</span>').join('') + '</small>' +
        '<small>' + (last ? hhmm(last.time) + ' ' + esc(last.text) : '아직 기록 없음') + '</small>' +
        // 기록자가 남긴 확인 메모: AI 문장 이의, ⑥ 공유 화면 오류(‘확인’이 아니면), ⑦ 추가 의견
        d.aiCheck.map(i => '<small class="note ai">✨ ' + esc(i.text) + '</small>').join('') +
        d.shareCheck.filter(i => !/^확인/.test(i.text)).map(i => '<small class="note err">⑥ ' + esc(i.text) + '</small>').join('') +
        d.extra.map(i => '<small class="note">⑦ ' + esc(i.text) + '</small>').join('') + link + '</div>';
    }).join('');
  }

  // ── 수동 푸시 ──
  $('#push-table').innerHTML = A.tables.map(t => '<option value="' + t.no + '">T' + t.no + ' ' + TOPICS[t.topic].name + '</option>').join('');
  $('#push-field').innerHTML = Object.entries(FIELDS).map(([k, v]) => '<option value="' + k + '">' + (v.step >= 0 && v.step < 5 ? '①②③④⑤'[v.step] + ' ' : '') + v.label + '</option>').join('');
  $('#push').onsubmit = async e => {
    e.preventDefault();
    const text = $('#push-text').value.trim(); if (!text) return;
    const field = $('#push-field').value;
    const task = FIELDS[field].step === 3 || field === 'pick' ? Number($('#push-task').value) : 0;
    const ok = await act(() => A.pushManual({ table: Number($('#push-table').value), field, task, text }), '스크린에 푸시했어요');
    if (ok) { $('#push-text').value = ''; pollFeed(); }
  };

  // ── AI 다듬기 · 검수 ──
  const LBL = { title: '과제 이름', bg: '현황·제안배경', want: '바라는 모습', prop: '우리의 제안', first: '첫걸음', with: '함께할 이웃', us: '우리(주민)', ext: '외부 협력' };
  let summary = { tables: {}, topics: {}, at: 0 };
  let dirty = false;
  function renderSummary() {
    const src = summary.source || '';
    $('#sum-status').textContent = summary.at ? hhmm(summary.at) + ' · ' + (/^gemini/.test(src) ? 'Gemini' + (src.split(':')[1] ? ' (' + src.split(':')[1] + ')' : '') : { rule: '원문 정리(데모)', edited: '수정됨' }[src] || '저장됨') : '아직 실행 전';
    const tbl = A.tables.filter(t => summary.tables[t.no]).map(t => {
      const tasks = summary.tables[t.no].tasks || [];
      return '<div class="sum" data-no="' + t.no + '" style="' + tv(t.topic) + '"><div class="sum-hd"><b>테이블 ' + t.no + '</b><span class="muted small">' + TOPICS[t.topic].name + '</span></div>' +
        tasks.map((k, i) => '<div class="sum-task" data-k="' + i + '"><b class="small">과제 ' + (i + 1) + '</b>' +
          Object.keys(LBL).map(f => '<label>' + LBL[f] + '<textarea data-f="' + f + '" rows="1">' + esc(k[f] || '') + '</textarea></label>').join('') + '</div>').join('') + '</div>';
    }).join('');
    const top = TOPIC_ORDER.filter(k => summary.topics && summary.topics[k]).map(k => {
      const p = summary.topics[k];
      return '<div class="sum topic" data-topic="' + k + '" style="' + tv(k) + '"><div class="sum-hd"><b>⑥ ' + TOPICS[k].name + ' 주제별 요약</b></div>' +
        '<label>요약<textarea data-f="summary" rows="2">' + esc(p.summary || '') + '</textarea></label>' +
        '<label>주요 제안<input data-f="points" value="' + esc((p.points || []).join(', ')) + '"></label></div>';
    }).join('');
    $('#sumlist').innerHTML = tbl + top || '<p class="muted small">④ 실행방법이 채워진 뒤 「AI 다듬기 실행」을 누르세요.</p>';
    dirty = false; $('#save-sum').disabled = true;
  }
  $('#sumlist').oninput = () => { dirty = true; $('#save-sum').disabled = false; };
  function collectSummary() {
    const out = { tables: {}, topics: {} };
    document.querySelectorAll('.sum[data-no]').forEach(el => {
      out.tables[el.dataset.no] = { tasks: [...el.querySelectorAll('.sum-task')].map(tk => { const o = {}; Object.keys(LBL).forEach(f => { o[f] = tk.querySelector('[data-f="' + f + '"]').value.trim(); }); return o; }) };
    });
    document.querySelectorAll('.sum[data-topic]').forEach(el => {
      out.topics[el.dataset.topic] = { summary: el.querySelector('[data-f="summary"]').value.trim(), points: el.querySelector('[data-f="points"]').value.split(',').map(s => s.trim()).filter(Boolean) };
    });
    return out;
  }
  // ⑤ 퍼실 확정 칩 + 새로 확정되면 소리·알림
  let cfSeen = null;
  function renderConfirm(cf) {
    const nos = A.tables.map(t => t.no), n = nos.filter(no => cf[no]).length;
    $('#cf-chips').innerHTML = '<b>⑤ 퍼실 확정 ' + n + '/' + nos.length + '</b>' + nos.map(no => '<span class="' + (cf[no] ? 'on' : '') + '">' + (cf[no] ? (cf[no].use === 'ai' ? '✨' : '📄') + ' ' : '') + 'T' + no + '</span>').join('');
    const fresh = cfSeen ? Object.keys(cf).filter(no => !cfSeen[no]) : [];
    cfSeen = cf;
    if (fresh.length) { toast('✅ 테이블 ' + fresh.join(', ') + ' 결과 확정 (' + n + '/' + nos.length + ')' + (n >= nos.length ? ' · 모두 확정!' : '')); ding(); }
  }
  async function loadSummary() {
    if (dirty) return;
    try {
      const next = await A.loadSummary();
      renderConfirm(next.confirm || {});
      if (next.at !== summary.at) { summary = next; renderSummary(); }
    } catch (e) { $('#sum-status').textContent = '불러오기 실패'; }
  }
  $('#run-ai').onclick = async () => {
    if (dirty && !confirm('저장하지 않은 수정 내용이 있어요. AI 결과로 덮어쓸까요?')) return;
    const btn = $('#run-ai');
    btn.disabled = true; $('#ai-msg').textContent = A.MODE === 'live' ? 'Gemini가 ' + A.tables.length + '개 테이블 제안서를 다듬는 중… 보통 1~3분. 대형 화면 ⑤에는 「AI가 다듬는 중」이 떠요.' : '데모: 원문으로 정리하는 중…';
    const ok = await act(async () => { summary = await A.summarize(items); dirty = false; renderSummary(); }, 'AI 다듬기 완료. 검수 후 「화면에 다듬은 문장 쓰기」를 켜세요.');
    if (!ok && A.MODE === 'live' && confirm('AI 다듬기에 실패했어요. 기록자가 쓴 원문으로 제안서·주제 요약을 채울까요?')) {
      await act(async () => { summary = await A.saveSummary(A.ruleSummary(items)); renderSummary(); }, '원문으로 정리했어요');
    }
    btn.disabled = false; $('#ai-msg').textContent = '';
  };
  $('#save-sum').onclick = () => act(async () => { summary = await A.saveSummary(collectSummary()); renderSummary(); }, '저장했어요. 스크린에 바로 반영됩니다.');
  $('#polished').onchange = e => act(() => A.setState({ polished: e.target.checked }), e.target.checked ? '다듬은 문장으로 보여 줘요' : '원문으로 보여 줘요');

  // ── 공감 ──
  let pool = A.LS.get('agora-card-pool', []);
  let likeInfo = { counts: {}, people: 0 };
  function makeCards() {
    pool = A.buildCards(items, summary, A.state.polished);
    A.LS.set('agora-card-pool', pool);
    return pool;
  }
  $('#make-cards').onclick = () => {
    const cards = makeCards();
    if (!cards.length) { toast('아직 제안서가 없어요. ③·④ 기록이 쌓인 뒤 눌러 주세요', true); return; }
    act(() => A.setState({ cards }), '공감 카드 ' + cards.length + '장을 만들었어요');
  };
  $('#cards').onclick = e => {
    const li = e.target.closest('li[data-id]'); if (!li || A.state.likeOpen) return;
    const c = pool.find(x => x.id === li.dataset.id); if (!c) return;
    c.off = !c.off; A.LS.set('agora-card-pool', pool);
    act(() => A.setState({ cards: pool.filter(x => !x.off) }));
  };
  $('#like-open').onclick = () => {
    const cards = (A.state.cards || []).length ? A.state.cards : makeCards().filter(c => !c.off);
    if (!cards.length) { toast('공감 카드가 없어요. 「공감 카드 만들기」를 먼저 눌러 주세요', true); return; }
    act(() => A.setState({ stage: 'like', likeOpen: true, cards, auto: false }), '공감을 열었어요');
  };
  $('#like-close').onclick = () => act(() => A.setState({ likeOpen: false }), '공감을 마쳤어요');
  $('#like-reset').onclick = () => { if (confirm('모든 공감을 지울까요?')) act(async () => { await A.resetLikes(); await A.setState({ likeRound: Date.now() }); }, '공감을 초기화했어요'); };
  function renderCards() {
    const live = A.state.cards || [];
    const list = pool.length ? pool : live;
    $('#like-sum').textContent = (A.state.likeOpen ? '진행 중 · ' : '') + likeInfo.people + '명 참여';
    $('#cards').innerHTML = list.length ? list.map(c => '<li data-id="' + c.id + '" class="' + (c.off ? 'off' : '') + '" style="' + tv(c.topic) + '" title="눌러서 카드 빼기/넣기"><span>' + (c.off ? '☐' : '☑') + '</span><span class="t">T' + c.table + '</span><span>' + esc(c.text) + (c.sub ? ' <small class="muted">' + esc(c.sub) + '</small>' : '') + '</span><span class="v">' + (likeInfo.counts[c.id] ? '♥' + likeInfo.counts[c.id] : '') + '</span></li>').join('')
      : '<li class="empty">④·⑤가 끝나면 「공감 카드 만들기」를 눌러 주세요. 테이블마다 선정 과제가 카드가 됩니다.</li>';
  }
  async function pollLikes() {
    try { const r = await A.loadLikes(); if (JSON.stringify(r) !== JSON.stringify(likeInfo)) { likeInfo = { counts: r.counts || {}, people: r.people || 0 }; renderCards(); } } catch (e) { /* 다음 회차 */ }
  }

  // ── ③ 테이블별 투표 ──
  let voteInfo = { counts: {}, people: 0, tables: {}, done: {} }, doneSeen = null;
  // 테이블 퍼실이 「투표 완료」를 누르면 소리 + 알림(관제 노트북 화면 오른쪽 위)
  function ding() { try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.25, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .6); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + .6); } catch (e) { /* 소리 없이 */ } }
  function notifyDone(nos, total) {
    const all = Object.keys(voteInfo.done).length;
    const msg = '✅ 테이블 ' + nos.join(', ') + ' 투표 완료 (' + all + '/' + total + ')' + (all >= total ? ' · 모든 테이블 완료!' : '');
    toast(msg); ding();
    try { if (window.Notification && Notification.permission === 'granted') new Notification('③ 투표 완료 알림', { body: msg }); } catch (e) { /* 무시 */ }
  }
  $('#open-vote').onclick = () => window.open('tvote.html' + demoQs, 'agora-tvote');
  $('#vote-open').onclick = () => {
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* 무시 */ }
    const ballot = A.buildBallot(items);
    if (!Object.keys(ballot).length) { toast('아직 ② 제안이 없어요', true); return; }
    act(() => A.setState({ stage: 'talk', sub: 2, voteOpen: true, ballot, auto: false }), Object.keys(ballot).length + '개 테이블 투표를 열었어요');
  };
  $('#vote-close').onclick = () => act(() => A.setState({ voteOpen: false }), '투표를 마쳤어요');
  $('#vote-reset').onclick = () => { if (confirm('모든 투표를 지우고 후보도 비울까요?')) act(async () => { await A.resetVotes(); await A.setState({ voteOpen: false, ballot: {}, voteRound: Date.now() }); }, '투표를 초기화했어요'); };
  function renderVotes() {
    const ballot = A.state.ballot || {};
    const c = voteInfo.counts;
    const top = list => { const best = list.slice().sort((a, b) => (c[b.id] || 0) - (c[a.id] || 0))[0]; return best && c[best.id] ? best.no + '번 ' + best.text + ' · ' + c[best.id] + '표' : '—'; };
    const nos = Object.keys(ballot).map(Number).sort((a, b) => a - b), done = voteInfo.done || {}, nd = nos.filter(n => done[n]).length;
    $('#vote-sum').textContent = (A.state.voteOpen ? '진행 중 · ' : '') + voteInfo.people + '명 참여 · 완료 테이블 ' + nd + '/' + nos.length;
    const chips = nos.length ? '<li style="display:flex;flex-wrap:wrap;gap:6px;border:0;padding:4px 0">' + nos.map(no => '<span style="padding:4px 10px;border-radius:8px;font-weight:800;' + (done[no] ? 'background:#16a34a;color:#fff' : 'background:rgba(148,163,184,.15);color:#94a3b8') + '">' + (done[no] ? '✅ ' : '') + 'T' + no + '</span>').join('') + '</li>' : '';
    $('#vote-list').innerHTML = chips + (nos.length ? nos.map(no => { const t = A.tableByNo(no); return '<li style="' + tv(t.topic) + (done[no] ? ';background:rgba(34,197,94,.16)' : '') + '"><span></span><span class="t">T' + no + '</span><span>' + (done[no] ? '<b style="color:#4ade80">✅ 퍼실 완료 ' + esc(done[no]) + '</b><br>' : '') + '🟢 ' + esc(top(ballot[no].us)) + '<br>🔵 ' + esc(top(ballot[no].ext)) + '</span><span class="v">' + ((voteInfo.tables || {})[no] || 0) + '명</span></li>'; }).join('')
      : '<li class="empty">② 제안이 쌓이면 「투표 열기」를 눌러 주세요.</li>');
  }
  async function pollVotes() {
    try {
      const r = await A.loadVotes();
      if (JSON.stringify(r) === JSON.stringify(voteInfo)) return;
      voteInfo = { counts: r.counts || {}, people: r.people || 0, tables: r.tables || {}, done: r.done || {} };
      const fresh = doneSeen ? Object.keys(voteInfo.done).filter(n => !doneSeen[n]).map(Number).sort((a, b) => a - b) : [];
      doneSeen = voteInfo.done;
      if (fresh.length) notifyDone(fresh, Object.keys(A.state.ballot || {}).length);
      renderVotes();
    } catch (e) { /* 다음 회차 */ }
  }

  // ── 시뮬레이션 ──
  $('#sim').onchange = e => act(() => A.setState({ sim: e.target.checked }));
  $('#sim-speed').onchange = e => act(() => A.setState({ simSpeed: Number(e.target.value) }));
  $('#sim-reset').onclick = () => {
    if (!confirm('시뮬레이션 기록·요약·공감을 모두 지울까요?')) return;
    A.resetDemo(); pool = []; A.LS.del('agora-card-pool'); summary = { tables: {}, topics: {}, at: 0 }; renderSummary();
    A.setState({ cards: [], likeOpen: false, polished: false });
    const w = window.open('', 'agora-screen'); if (w && w.location.href !== 'about:blank') w.location.reload(); else if (w) w.close();
    $('#preview').contentWindow.location.reload();
    toast('시뮬레이션 데이터를 비웠어요');
  };

  (async function boot() {
    try { await A.loadTables(); } catch (e) { toast('테이블 설정을 불러오지 못했어요: ' + e.message, true); }
    try { await A.pullState(); } catch (e) { toast('상태를 불러오지 못했어요: ' + e.message, true); }
    renderState(); renderSummary();
    await Promise.all([pollFeed(), loadSummary(), pollLikes(), pollVotes()]);
    const ms = A.MODE === 'live' ? 5000 : 1500;
    setInterval(pollFeed, ms);
    setInterval(loadSummary, ms * 2);
    setInterval(pollLikes, A.MODE === 'live' ? 4000 : 1000);
    setInterval(pollVotes, A.MODE === 'live' ? 4000 : 1000);
    if (A.MODE === 'live') setInterval(() => A.pullState().catch(() => {}), 4000);
    setInterval(renderState, 30000);
  })();
})();
