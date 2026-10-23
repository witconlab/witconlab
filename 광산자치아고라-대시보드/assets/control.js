/* 관제 패널 */
(function () {
  'use strict';
  const A = window.Agora;
  const { CATS, TYPES, STAGES, SUBSTEPS, esc, hhmm } = A;
  const $ = s => document.querySelector(s);
  const catVar = cat => '--c:' + CATS[cat].color;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 2600);
  }
  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); return true; }
    catch (e) { toast(e.message || String(e), true); return false; }
  }

  // ── 상단 ──
  $('#mode').textContent = A.MODE === 'live' ? 'LIVE' : 'DEMO · 시뮬레이션';
  $('#mode').classList.toggle('live', A.MODE === 'live');
  if (A.MODE === 'live') $('#sim-card').style.display = 'none';
  $('#open-screen').onclick = () => window.open('index.html', 'agora-screen');
  $('#open-vote').onclick = () => window.open('vote.html', 'agora-vote');
  $('#open-settings').onclick = () => { $('#set-api').value = A.LS.get('agora-api', '') || window.AGORA_API || ''; $('#set-key').value = A.adminKey(); $('#settings').showModal(); };
  $('#set-save').onclick = () => { A.LS.set('agora-api', $('#set-api').value.trim()); A.LS.set('agora-admin-key', $('#set-key').value); setTimeout(() => location.reload(), 50); };
  if (A.MODE === 'live' && !A.adminKey()) setTimeout(() => $('#open-settings').click(), 300);

  // ── 진행 단계 ──
  $('#stages').innerHTML = STAGES.map(s => '<button class="stg" data-k="' + s.key + '"><b>' + s.label + '</b><small>' + s.start + '–' + s.end + '</small></button>').join('');
  $('#subs').innerHTML = SUBSTEPS.map((s, i) => '<button class="stg" data-i="' + i + '"><b>' + (i + 1) + '. ' + s.label + '</b><small>' + s.start + ' · ' + s.min + '분</small></button>').join('');
  $('#stages').onclick = e => {
    const b = e.target.closest('.stg'); if (!b) return;
    const patch = { stage: b.dataset.k, auto: false };
    if (b.dataset.k === 'vote' && !A.state.candidates.length) patch.candidates = pool.filter(c => !c.off);
    act(() => A.setState(patch));
  };
  $('#subs').onclick = e => { const b = e.target.closest('.stg'); if (b) act(() => A.setState({ stage: 'talk', sub: Number(b.dataset.i), auto: false })); };
  $('#auto').onchange = e => act(() => A.setState({ auto: e.target.checked }));

  // ── 결과 공유 ──
  $('#focus-nums').innerHTML = A.tables.map(t => '<button data-no="' + t.no + '" style="' + catVar(t.cat) + '">' + t.no + '</button>').join('');
  $('#views').onclick = e => { const b = e.target.closest('button'); if (b) act(() => A.setState({ stage: 'share', view: b.dataset.v, auto: false })); };
  $('#focus-nums').onclick = e => { const b = e.target.closest('button'); if (b) act(() => A.setState({ stage: 'share', view: 'focus', focus: Number(b.dataset.no), auto: false })); };
  const step = d => { const n = A.tables.length; const f = ((A.state.focus || 1) - 1 + d + n) % n + 1; act(() => A.setState({ stage: 'share', view: 'focus', focus: f, auto: false })); };
  $('#focus-prev').onclick = () => step(-1);
  $('#focus-next').onclick = () => step(1);

  $('#slogan-go').onclick = () => act(() => A.setState({ stage: 'slogan', sloganCue: Date.now(), auto: false }), '구호 카운트다운 시작!');

  function renderState() {
    const st = A.state;
    const eff = A.effective();
    const sched = A.scheduledStage();
    document.querySelectorAll('#stages .stg').forEach(b => { b.classList.toggle('on', b.dataset.k === eff.stage); b.classList.toggle('sched', b.dataset.k === sched.stage); });
    document.querySelectorAll('#subs .stg').forEach(b => b.classList.toggle('on', eff.stage === 'talk' && Number(b.dataset.i) === eff.sub));
    document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', eff.stage === 'share' && b.dataset.v === st.view));
    document.querySelectorAll('#focus-nums button').forEach(b => b.classList.toggle('on', eff.stage === 'share' && st.view === 'focus' && Number(b.dataset.no) === st.focus));
    $('#auto').checked = !!st.auto;
    $('#sim').checked = !!st.sim;
    $('#sim-speed').value = String(st.simSpeed || 1);
    $('#picks').value = String(st.votePicks || 3);
    $('#vote-open').disabled = !!st.voteOpen;
    $('#vote-close').disabled = !st.voteOpen;
    $('#now-label').textContent = '스크린: ' + (STAGES.find(s => s.key === eff.stage) || {}).label + (eff.stage === 'talk' ? ' · ' + SUBSTEPS[eff.sub].label : '') + (st.auto ? ' (자동)' : '');
    $('#sync').textContent = st.updated ? '마지막 변경 ' + hhmm(st.updated) : '';
    renderCands();
  }
  A.onState(renderState);

  // ── 기록 현황 ──
  let items = [];
  async function pollFeed() {
    try { items = await A.loadFeed(); } catch (e) { $('#feed-sum').textContent = '기록을 불러오지 못했어요: ' + e.message; return; }
    $('#feed-sum').textContent = '총 ' + items.length + '건';
    $('#docs').innerHTML = A.tables.map(t => {
      const mine = items.filter(i => i.table === t.no);
      const last = mine[mine.length - 1];
      const link = t.docId ? '<a href="https://docs.google.com/document/d/' + esc(t.docId) + '/edit" target="_blank" rel="noopener">문서 열기</a>' : '';
      return '<div class="doc ' + (A.docOk[t.no] ? 'ok' : '') + '" style="' + catVar(t.cat) + '"><div class="doc-hd"><b>T' + t.no + ' <span class="n">' + mine.length + '</span></b><i></i></div><small>' + esc(t.dongs) + '</small><small>' + (last ? hhmm(last.time) + ' ' + esc(last.text) : '아직 기록 없음') + '</small>' + link + '</div>';
    }).join('');
  }

  // ── 수동 푸시 ──
  $('#push-table').innerHTML = A.tables.map(t => '<option value="' + t.no + '">T' + t.no + ' ' + CATS[t.cat].short + '</option>').join('');
  $('#push-type').innerHTML = Object.entries(TYPES).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
  $('#push').onsubmit = async e => {
    e.preventDefault();
    const text = $('#push-text').value.trim(); if (!text) return;
    const ok = await act(() => A.pushManual({ table: Number($('#push-table').value), type: $('#push-type').value, dong: $('#push-dong').value.trim(), text }), '스크린에 푸시했어요');
    if (ok) { $('#push-text').value = ''; pollFeed(); }
  };

  // ── AI 요약 · 검수 ──
  let summary = { tables: {}, at: 0 };
  let dirty = false;
  function renderSummary() {
    $('#sum-status').textContent = summary.at ? hhmm(summary.at) + ' 정리 · ' + ({ gemini: 'Gemini', rule: '규칙 기반(데모)', edited: '수정됨' }[summary.source] || '시트') : '아직 실행 전';
    $('#sumlist').innerHTML = A.tables.map(t => {
      const s = summary.tables[t.no] || { summary: '', actions: [], admin: '', keywords: [] };
      return '<div class="sum" data-no="' + t.no + '" style="' + catVar(t.cat) + '"><div class="sum-hd"><b>테이블 ' + t.no + '</b><span class="muted small">' + esc(CATS[t.cat].short + ' · ' + t.dongs) + '</span></div>' +
        '<label>논의 요약<textarea data-f="summary" rows="2">' + esc(s.summary) + '</textarea></label>' +
        '<label>실천과제 1<input data-f="a0" value="' + esc(s.actions[0] || '') + '"></label>' +
        '<label>실천과제 2<input data-f="a1" value="' + esc(s.actions[1] || '') + '"></label>' +
        '<label>행정 협력<input data-f="admin" value="' + esc(s.admin) + '"></label>' +
        '<label>키워드<input data-f="kw" value="' + esc((s.keywords || []).join(', ')) + '"></label></div>';
    }).join('');
    dirty = false; $('#save-sum').disabled = true;
  }
  $('#sumlist').oninput = () => { dirty = true; $('#save-sum').disabled = false; };
  function collectSummary() {
    const out = {};
    document.querySelectorAll('.sum').forEach(el => {
      const v = f => el.querySelector('[data-f="' + f + '"]').value.trim();
      out[el.dataset.no] = { summary: v('summary'), actions: [v('a0'), v('a1')].filter(Boolean), admin: v('admin'), keywords: v('kw').split(',').map(s => s.trim()).filter(Boolean) };
    });
    return out;
  }
  async function loadSummary() {
    if (dirty) return;
    try {
      const next = await A.loadSummary();
      if (next.at !== summary.at || JSON.stringify(next.tables) !== JSON.stringify(summary.tables)) { summary = next; renderSummary(); }
    } catch (e) { $('#sum-status').textContent = '불러오기 실패'; }
  }
  $('#run-ai').onclick = async () => {
    if (dirty && !confirm('저장하지 않은 수정 내용이 있어요. AI 요약으로 덮어쓸까요?')) return;
    const btn = $('#run-ai');
    btn.disabled = true; $('#ai-msg').textContent = A.MODE === 'live' ? 'Gemini가 12개 테이블 기록을 읽는 중… (20~60초)' : '데모: 태그가 붙은 줄로 정리하는 중…';
    const ok = await act(async () => { summary = await A.summarize(); dirty = false; renderSummary(); }, 'AI 요약이 완료됐어요. 검수 후 저장해 주세요.');
    if (!ok && A.MODE === 'live' && confirm('Gemini 요약에 실패했어요. 기록의 [실천]/[협력] 태그로 대신 정리할까요?')) {
      const out = A.ruleSummary(items);
      await act(async () => { summary = await A.saveSummary(out); renderSummary(); }, '태그 기반으로 정리했어요');
    }
    btn.disabled = false; $('#ai-msg').textContent = '';
  };
  $('#save-sum').onclick = () => act(async () => { summary = await A.saveSummary(collectSummary()); renderSummary(); }, '저장했어요. 스크린에 바로 반영됩니다.');

  // ── 투표 ──
  let pool = A.LS.get('agora-cand-pool', []);
  let ballots = {};
  function makePool(per) {
    if (!Object.keys(summary.tables).length) { toast('먼저 AI 요약을 실행해 주세요', true); return; }
    pool = A.buildCandidates(summary, per);
    A.LS.set('agora-cand-pool', pool);
    act(() => A.setState({ candidates: pool }), '후보 ' + pool.length + '개를 만들었어요');
  }
  $('#cand-1').onclick = () => makePool(1);
  $('#cand-2').onclick = () => makePool(2);
  $('#cands').onclick = e => {
    const li = e.target.closest('li[data-id]'); if (!li || A.state.voteOpen) return;
    const c = pool.find(x => x.id === li.dataset.id); if (!c) return;
    c.off = !c.off; A.LS.set('agora-cand-pool', pool);
    act(() => A.setState({ candidates: pool.filter(x => !x.off) }));
  };
  $('#picks').onchange = e => act(() => A.setState({ votePicks: Number(e.target.value) }));
  $('#vote-open').onclick = () => {
    const cands = A.state.candidates.length ? A.state.candidates : pool.filter(c => !c.off);
    if (!cands.length) { toast('투표 후보가 없어요. 후보 만들기를 먼저 눌러 주세요', true); return; }
    act(() => A.setState({ stage: 'vote', voteOpen: true, candidates: cands, auto: false }), '투표를 열었어요');
  };
  $('#vote-close').onclick = () => act(() => A.setState({ voteOpen: false }), '투표를 마감했어요');
  $('#vote-reset').onclick = () => { if (confirm('모든 투표를 지울까요?')) act(async () => { await A.resetVotes(); await A.setState({ voteRound: Date.now() }); ballots = {}; renderCands(); }, '투표를 초기화했어요'); };
  function renderCands() {
    const live = A.state.candidates || [];
    const list = pool.length ? pool : live;
    const { voters, rows } = A.tally(ballots, live);
    const votes = {}; rows.forEach(r => { votes[r.id] = r.votes; });
    $('#vote-sum').textContent = (A.state.voteOpen ? '진행 중 · ' : '') + voters + '명 참여';
    $('#cands').innerHTML = list.length ? list.map(c => '<li data-id="' + c.id + '" class="' + (c.off ? 'off' : '') + '" style="' + catVar(c.cat) + '" title="눌러서 후보 제외/포함"><span>' + (c.off ? '☐' : '☑') + '</span><span class="t">T' + c.table + '</span><span>' + esc(c.text) + '</span><span class="v">' + (votes[c.id] != null ? votes[c.id] + '표' : '') + '</span></li>').join('')
      : '<li class="empty">AI 요약 후 "후보 만들기"를 누르면 각 테이블의 실천과제가 후보가 됩니다.</li>';
  }
  async function pollVotes() {
    try { const v = await A.loadVotes(); if (JSON.stringify(v.ballots) !== JSON.stringify(ballots)) { ballots = v.ballots || {}; renderCands(); } } catch (e) { /* 다음 회차 */ }
  }

  // ── 시뮬레이션 ──
  $('#sim').onchange = e => act(() => A.setState({ sim: e.target.checked }));
  $('#sim-speed').onchange = e => act(() => A.setState({ simSpeed: Number(e.target.value) }));
  $('#sim-reset').onclick = () => {
    if (!confirm('시뮬레이션 기록·요약·투표를 모두 지울까요? (스크린 창은 새로고침됩니다)')) return;
    A.resetDemo(); pool = []; A.LS.del('agora-cand-pool'); summary = { tables: {}, at: 0 }; renderSummary();
    A.setState({ candidates: [], voteOpen: false });
    const w = window.open('', 'agora-screen'); if (w && w.location.href !== 'about:blank') w.location.reload(); else if (w) w.close();
    $('#preview').contentWindow.location.reload();
    toast('시뮬레이션 데이터를 비웠어요');
  };

  // ── 시작 ──
  (async function boot() {
    try { await A.loadTables(); } catch (e) { toast('테이블 설정을 불러오지 못했어요: ' + e.message, true); }
    try { await A.pullState(); } catch (e) { toast('상태를 불러오지 못했어요: ' + e.message, true); }
    renderState(); renderSummary();
    await Promise.all([pollFeed(), loadSummary(), pollVotes()]);
    const ms = A.MODE === 'live' ? 5000 : 1500;
    setInterval(pollFeed, ms);
    setInterval(loadSummary, ms * 2);
    setInterval(pollVotes, A.MODE === 'live' ? 3000 : 1000);
    if (A.MODE === 'live') setInterval(() => A.pullState().catch(() => {}), 4000);
    setInterval(renderState, 30000);
  })();
})();
