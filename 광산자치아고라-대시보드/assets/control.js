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
  $('#topics').innerHTML = '<button data-t="all">전체 12개</button><button data-t="auto">자동 순환</button>' +
    TOPIC_ORDER.map(k => '<button data-t="' + k + '" style="' + tv(k) + '">' + TOPICS[k].name + '<small>' + A.tablesOf(k).map(t => t.no).join('·') + '</small></button>').join('');
  $('#topics').onclick = e => { const b = e.target.closest('button'); if (b) act(() => A.setState({ topic: b.dataset.t })); };

  $('#slogan-go').onclick = () => act(() => A.setState({ stage: 'slogan', sloganCue: Date.now(), auto: false }), '구호 카운트다운 시작!');

  function renderState() {
    const st = A.state, eff = A.effective(), sched = A.scheduledStage();
    document.querySelectorAll('#stages .stg').forEach(b => { b.classList.toggle('on', b.dataset.k === eff.stage); b.classList.toggle('sched', b.dataset.k === sched.stage); });
    document.querySelectorAll('#subs .stg').forEach(b => b.classList.toggle('on', eff.stage === 'talk' && Number(b.dataset.i) === eff.sub));
    document.querySelectorAll('#topics button').forEach(b => b.classList.toggle('on', b.dataset.t === (st.topic || 'all')));
    $('#auto').checked = !!st.auto;
    $('#polished').checked = !!st.polished;
    $('#sim').checked = !!st.sim;
    $('#sim-speed').value = String(st.simSpeed || 1);
    $('#like-open').disabled = !!st.likeOpen;
    $('#like-close').disabled = !st.likeOpen;
    $('#now-label').textContent = '스크린: ' + (STAGES.find(s => s.key === eff.stage) || {}).label + (eff.stage === 'talk' ? ' · ' + SUBSTEPS[eff.sub].label : '') + (st.auto ? ' (자동)' : '');
    $('#sync').textContent = st.updated ? '마지막 변경 ' + hhmm(st.updated) : '';
    renderCards();
  }
  A.onState(renderState);

  // ── 기록 현황 ──
  let items = [];
  async function pollFeed() {
    try { items = await A.loadFeed(); } catch (e) { $('#feed-sum').textContent = '기록을 불러오지 못했어요: ' + e.message; return; }
    $('#feed-sum').textContent = '총 ' + items.length + '줄';
    $('#docs').innerHTML = A.tables.map(t => {
      const d = A.tableData(items, t.no);
      const mine = items.filter(i => i.table === t.no);
      const last = mine[mine.length - 1];
      const steps = [d.good.length + d.bad.length + d.better.length, '주' + d.us.length + '·외' + d.ext.length, d.picks.length, A.filled(d.tasks[0]) + A.filled(d.tasks[1]), d.done ? '✓' : d.check.length];
      const link = t.docId ? '<a href="https://docs.google.com/document/d/' + esc(t.docId) + '/edit" target="_blank" rel="noopener">문서 열기</a>' : '';
      return '<div class="doc ' + (A.docOk[t.no] ? 'ok' : '') + '" style="' + tv(t.topic) + '"><div class="doc-hd"><b>T' + t.no + ' ' + TOPICS[t.topic].name + '</b><i></i></div>' +
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
  async function loadSummary() {
    if (dirty) return;
    try {
      const next = await A.loadSummary();
      if (next.at !== summary.at) { summary = next; renderSummary(); }
    } catch (e) { $('#sum-status').textContent = '불러오기 실패'; }
  }
  $('#run-ai').onclick = async () => {
    if (dirty && !confirm('저장하지 않은 수정 내용이 있어요. AI 결과로 덮어쓸까요?')) return;
    const btn = $('#run-ai');
    btn.disabled = true; $('#ai-msg').textContent = A.MODE === 'live' ? 'Gemini가 12개 테이블 제안서를 다듬는 중… 보통 1~3분. 대형 화면 ⑤에는 「AI가 다듬는 중」이 떠요.' : '데모: 원문으로 정리하는 중…';
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
    await Promise.all([pollFeed(), loadSummary(), pollLikes()]);
    const ms = A.MODE === 'live' ? 5000 : 1500;
    setInterval(pollFeed, ms);
    setInterval(loadSummary, ms * 2);
    setInterval(pollLikes, A.MODE === 'live' ? 4000 : 1000);
    if (A.MODE === 'live') setInterval(() => A.pullState().catch(() => {}), 4000);
    setInterval(renderState, 30000);
  })();
})();
