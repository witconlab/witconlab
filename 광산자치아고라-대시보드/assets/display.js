/* 대형 스크린 V2 — 진행흐름도 「화면에 담을 내용과 구성」 기준 */
(function () {
  'use strict';
  const A = window.Agora;
  const { TOPICS, TOPIC_ORDER, FIELDS, TASK_FIELDS, STAGES, SUBSTEPS, esc, pad, toMin, nowMin, topicIcon, ICONS } = A;
  const $ = s => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const PREVIEW = qs.has('preview');

  const stage = $('#stage');
  function fit() { stage.style.transform = 'translate(-50%, -50%) scale(' + Math.min(innerWidth / 1920, innerHeight / 1080) + ')'; }
  addEventListener('resize', fit); fit();
  if (!PREVIEW) document.addEventListener('dblclick', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); });

  const tv = k => '--c:' + TOPICS[k].color;
  const tLabel = t => t.no + ' · ' + TOPICS[t.topic].name;

  // ── 정적 요소 ──
  $('#hd-mark').innerHTML = TOPIC_ORDER.map(k => '<i style="background:' + TOPICS[k].color + '"></i>').join('');
  $('#hd-steps').innerHTML = STAGES.map(s => '<li data-k="' + s.key + '">' + s.label + '</li>').join('');
  $('#wait-meta').innerHTML = esc(A.EVENT.dateLabel) + '<br>' + esc(A.EVENT.place) + ' · 주최 ' + esc(A.EVENT.host);
  $('#slo-icons').innerHTML = TOPIC_ORDER.map(k => '<span style="' + tv(k) + '">' + topicIcon(k) + '</span>').join('');
  $('#key-q').textContent = '공통질문 · “' + A.EVENT.question + '”';
  $('#talk-steps').innerHTML = SUBSTEPS.map((s, i) => '<div class="ts" data-i="' + i + '"><div class="fill"></div><b>' + s.label + '</b><small>' + s.min + '분 · ' + s.start + '</small></div>').join('');
  const live = $('#hd-live');
  if (A.MODE === 'demo') { live.classList.add('demo'); live.innerHTML = '<i></i>DEMO'; }
  $('#mode-badge').textContent = A.MODE === 'demo' ? '시뮬레이션 모드 · 화면을 두 번 누르면 전체화면' : '';

  function buildStatic() {
    $('#open-icons').innerHTML = TOPIC_ORDER.map(k => '<div class="oi" style="' + tv(k) + '"><div class="ic">' + topicIcon(k) + '</div><b>' + TOPICS[k].name + '</b><small>' + TOPICS[k].place + '<br>테이블 ' + A.tablesOf(k).map(t => t.no).join('·') + '</small></div>').join('');
    $('#key-cats').innerHTML = TOPIC_ORDER.map(k => '<div class="kc" style="' + tv(k) + '"><div class="ic">' + topicIcon(k) + '</div><div><b>' + TOPICS[k].name + ' · ' + TOPICS[k].place + '</b><small>테이블 ' + A.tablesOf(k).map(t => t.no).join(' · ') + '</small></div></div>').join('');
    $('#wait-grid').innerHTML = A.tables.map(t => '<div class="wt" data-no="' + t.no + '" style="' + tv(t.topic) + '"><b>' + t.no + '</b><span>' + esc(TOPICS[t.topic].name + (t.dongs ? ' · ' + t.dongs : '')) + '</span><i></i></div>').join('');
  }
  buildStatic();

  // ── 상태 ──
  let cur = { stage: null };
  let items = [];
  let summary = { tables: {}, topics: {}, at: 0 };
  let likeCounts = null;
  let voteCounts = {}, voteMeta = { tables: {}, done: {} };

  // 보여 줄 주제: null = 전체, 'auto' = 15초마다 돌아가며
  const ROTATE_MS = 15000;
  const rotIdx = () => Math.floor(Date.now() / ROTATE_MS) % TOPIC_ORDER.length;
  function viewTopic() {
    const t = cur.topic || 'all';
    if (t === 'all') return null;
    if (t === 'auto') return TOPIC_ORDER[rotIdx()];
    const one = oneTable(); if (one) return one.topic;
    return TOPICS[t] ? t : null;
  }
  // 관제 「테이블 하나 크게」: topic = 'T5' 처럼
  const oneTable = () => { const m = String(cur.topic || '').match(/^T(\d+)$/); return m ? A.tableByNo(Number(m[1])) : null; };
  const viewTables = () => { const one = oneTable(); if (one) return [one]; const k = viewTopic(); return k ? A.tablesOf(k) : A.tables; };

  function qbarHtml(question, k) {
    const dots = cur.topic === 'auto' ? '<div class="rot">' + TOPIC_ORDER.map(x => '<i class="' + (x === k ? 'on' : '') + '" style="' + tv(x) + '"></i>').join('') + '</div>' : '';
    const who = k
      ? '<div class="qb-topic" style="' + tv(k) + '"><span class="ic">' + topicIcon(k) + '</span><b>' + TOPICS[k].name + '</b><small>' + TOPICS[k].place + ' · 테이블 ' + A.tablesOf(k).map(t => t.no).join(' · ') + '</small></div>'
      : '<div class="qb-topic all"><b>' + A.tables.length + '개 테이블</b><small>' + TOPIC_ORDER.map(x => '<i style="background:' + TOPICS[x].color + '"></i>' + TOPICS[x].name).join(' ') + '</small></div>';
    return who + '<div class="qb-q"><b>“' + esc(question) + '”</b><small>공통질문 · ' + esc(A.EVENT.question) + '</small></div>' + dots;
  }

  // ── 시계 · 헤더 ──
  let lastRot = -1;
  function tick() {
    const d = new Date();
    $('#hd-clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const left = toMin('14:00') * 60 - nowMin() * 60;
    $('#wait-count').innerHTML = left > 0 && left < 3 * 3600 ? '시작까지<b>' + pad(Math.floor(left / 60)) + ':' + pad(Math.floor(left % 60)) + '</b>' : '';
    if (cur.stage === 'talk') renderSubsteps();
    if (cur.topic === 'auto' && rotIdx() !== lastRot) { lastRot = rotIdx(); renderBody(true); }
  }
  function renderDocs() {
    const ok = A.tables.filter(t => A.docOk[t.no]).length;
    $('#hd-docs').innerHTML = '<div class="dots">' + A.tables.map(t => '<i class="' + (A.docOk[t.no] ? 'ok' : '') + '"></i>').join('') + '</div>기록 <b>' + ok + '/' + A.tables.length + '</b>';
    $('#wait-ok').textContent = ok + ' / ' + A.tables.length;
    document.querySelectorAll('.wt').forEach(el => el.classList.toggle('ok', !!A.docOk[el.dataset.no]));
  }

  // ── 장면 전환 ──
  function render() {
    const st = A.effective();
    const changed = st.stage !== cur.stage;
    cur = st;
    document.querySelectorAll('.scene').forEach(el => el.classList.toggle('on', el.dataset.scene === st.stage));
    const idx = STAGES.findIndex(s => s.key === st.stage);
    document.querySelectorAll('#hd-steps li').forEach((li, i) => { li.className = i === idx ? 'on' : i < idx ? 'done' : ''; });
    stage.classList.toggle('full', st.stage === 'slogan' || st.stage === 'open');
    if (st.stage === 'talk') renderSubsteps();
    renderBody(true);
    if (st.stage === 'slogan') runSlogan(changed); else if (changed) sloStop();
    if (changed) refreshSlow();
    const sl = A.slideOn(st), deck = $('#deck');
    deck.hidden = !sl;
    if (sl) { const src = 'assets/slides/s' + String(sl).padStart(2, '0') + '.jpg'; if (deck.firstChild.getAttribute('src') !== src) deck.firstChild.src = src; }
  }
  A.onState(render);

  let subChangedAt = Date.now(), lastSub = -1;
  function renderSubsteps() {
    if (cur.sub !== lastSub) { lastSub = cur.sub; subChangedAt = Date.now(); }
    document.querySelectorAll('.ts').forEach((el, i) => {
      el.classList.toggle('on', i === cur.sub);
      el.classList.toggle('done', i < cur.sub);
      let p = i < cur.sub ? 100 : 0;
      const s = SUBSTEPS[i];
      if (i === cur.sub) {
        const elapsed = cur.auto ? (nowMin() - toMin(s.start)) : (Date.now() - subChangedAt) / 60000;
        p = Math.max(0, Math.min(100, elapsed / s.min * 100));
        const remain = Math.max(0, s.min - elapsed);
        el.querySelector('small').textContent = remain > 0 ? '남은 시간 약 ' + Math.ceil(remain) + '분' : s.min + '분 · 마무리 중';
      } else el.querySelector('small').textContent = s.min + '분 · ' + s.start;
      el.querySelector('.fill').style.width = p + '%';
    });
  }

  // 같은 내용이면 다시 그리지 않음(애니메이션 유지)
  let lastSig = '';
  function renderBody() {
    const sig = [cur.stage, cur.sub, viewTopic(), cur.topic, cur.polished, items.map(i => i.id).join(','), summary.at, JSON.stringify(cur.cards || []), cur.voteOpen, JSON.stringify(cur.ballot || {}), JSON.stringify(voteCounts), JSON.stringify(voteMeta)].join('|');
    if (sig === lastSig) return;
    lastSig = sig;
    if (cur.stage === 'talk') renderTalk();
    if (cur.stage === 'share') renderShare();
    if (cur.stage === 'like') renderLike();
  }

  // ── 의제공론화 ──
  const enter = it => it.isNew && Date.now() - it.time < 6000 ? ' enter' : '';
  const card = (it, withTable = true) => { const t = A.tableByNo(it.table); return '<div class="cd' + enter(it) + '" style="' + tv(t.topic) + '">' + (withTable ? '<span class="cd-t">' + tLabel(t) + '</span>' : '') + '<p>' + esc(it.text) + '</p></div>'; };
  const ofField = (f, ts) => { const nos = new Set(ts.map(t => t.no)); return items.filter(i => i.field === f && nos.has(i.table)).slice().reverse(); };

  function renderTalk() {
    const k = viewTopic(), ts = viewTables();
    $('#qbar').innerHTML = qbarHtml(SUBSTEPS[cur.sub].q, k);
    const body = $('#talk-body');
    body.className = 'talk-body s' + cur.sub + (k ? ' one' : ' all');
    const renderers = [step1, step2, step3, step4, step5];
    body.innerHTML = renderers[cur.sub](ts, k);
    $('#ai-overlay').classList.toggle('on', cur.sub === 4 && !!(summary.job && summary.job.status === 'running' && Date.now() - summary.job.started < 8 * 60000));
  }

  // ① 좋았던 점 · 불편한 점 · 개선점
  function step1(ts, k) {
    const max = k ? 9 : 8;
    return '<div class="cols3">' + [['good', '좋았던 점', '😊'], ['bad', '불편한 점', '😣'], ['better', '개선점', '💡']].map(([f, label, ic]) => {
      const list = ofField(f, ts);
      return '<div class="col3 ' + f + '"><div class="col3-hd"><span>' + ic + '</span><b>' + label + '</b><em>' + list.length + '</em></div><div class="col3-list">' +
        (list.slice(0, max).map(it => card(it, !k || ts.length > 1)).join('') || '<div class="empty">기록을 기다리고 있어요</div>') + '</div></div>';
    }).join('') + '</div>';
  }

  // ② 테이블·주제 | 우리 | 외부 협력
  // 「짧은 제목 — 핵심」이면 제목을 굵게
  const titled = text => { const [h, b] = A.splitTitle(text); return h ? '<strong>' + esc(h) + '</strong> ' + esc(b) : esc(b); };
  function step2(ts, k) {
    const n = k ? (ts.length > 3 ? 3 : ts.length > 2 ? 4 : 8) : 2;  // 한 주제 테이블이 많을수록 칸마다 적게
    // 최신 제안이 앞에. 번호는 ③ 투표 때 부르는 번호
    const chips = (list, cls) => list.slice().reverse().slice(0, n).map(it => '<span class="chip ' + cls + enter(it) + '"><b class="no">' + it.no + '</b>' + titled(it.text) + '</span>').join('') + (list.length > n ? '<span class="more">+' + (list.length - n) + '</span>' : '');
    return '<div class="tbl2"><div class="tr th"><div>테이블 · 주제</div><div><i class="dot us"></i>[주민실천] 우리가 함께 할 일</div><div><i class="dot ext"></i>[외부협력] 협력·지원이 필요한 일</div></div>' +
      ts.map(t => { const d = A.tableData(items, t.no); return '<div class="tr" style="' + tv(t.topic) + '"><div class="tn"><b>' + t.no + '</b>' + TOPICS[t.topic].name + '</div><div class="cl">' + (chips(A.numbered(d).filter(x => x.kind === 'us'), 'us') || '<span class="wait">…</span>') + '</div><div class="cl">' + (chips(A.numbered(d).filter(x => x.kind === 'ext'), 'ext') || '<span class="wait">…</span>') + '</div></div>'; }).join('') + '</div>';
  }

  // ③ 테이블별 제안 목록 + 선정 과제
  const kindTag = kd => kd === 'us' ? '<span class="kind us">주민실천</span>' : kd === 'ext' ? '<span class="kind ext">외부협력</span>' : '';
  // 휴대폰 투표 막대: 🟢 주민 / 🔵 외부 각각 가장 많은 표가 ★
  function voteBars(bt, k) {
    const c = voteCounts || {};
    const part = (list, cls, label) => {
      const max = Math.max(1, ...list.map(o => c[o.id] || 0)), top = Math.max(0, ...list.map(o => c[o.id] || 0));
      return '<div class="vb ' + cls + '"><div class="vb-hd">' + label + '</div>' + ((k ? list : list.slice().sort((a, b) => (c[b.id] || 0) - (c[a.id] || 0))).slice(0, k ? 6 : 2).map(o => { const n = c[o.id] || 0; return '<div class="vr' + (n && n === top ? ' top' : '') + '"><b class="no">' + o.no + '</b><span class="vt">' + esc(o.text) + '</span><span class="vbar"><i style="width:' + (n / max * 100) + '%"></i></span><em>' + n + '</em></div>'; }).join('') || '<div class="empty">제안 없음</div>') + '</div>';
    };
    return part(bt.us, 'us', '🟢 주민') + part(bt.ext, 'ext', '🔵 외부');
  }
  function step3(ts, k) {
    const ballot = cur.ballot || {};
    if (Object.keys(ballot).length) {
      return '<div class="vwrap"><div class="grid3 vote n' + ts.length + '">' + ts.map(t => '<div class="pc' + (voteMeta.done[t.no] ? ' vdone' : '') + '" style="' + tv(t.topic) + '"><div class="pc-hd"><b>' + t.no + '</b>' + TOPICS[t.topic].name + '<span class="vppl">' + (voteMeta.done[t.no] ? '✅ 완료 · ' : '') + (voteMeta.tables[t.no] || 0) + '명</span></div>' + (ballot[t.no] ? voteBars(ballot[t.no], k) : '<div class="empty">투표할 제안이 없어요</div>') + '</div>').join('') + '</div>' +
        (cur.voteOpen ? '<div class="vote-qr"><div class="vq-card">📱</div><p><b>테이블 위 QR 카드를 찍어 투표</b>「③ 우선 과제」 칸<br>🟢 주민 1개 · 🔵 외부 1개<br>한 사람 한 번</p></div>' : '') + '</div>';
    }
    return '<div class="grid3 n' + ts.length + '">' + ts.map(t => {
      const d = A.tableData(items, t.no);
      const others = A.numbered(d);
      return '<div class="pc" style="' + tv(t.topic) + '"><div class="pc-hd"><b>' + t.no + '</b>' + TOPICS[t.topic].name + (d.picks.length ? '<span class="ok">선정 ' + d.picks.length + '</span>' : '') + '</div>' +
        (d.picks.map((p, i) => '<div class="pick"><i>★</i><span>' + (d.picks.length > 1 ? (p.task + 1) + '. ' : '') + esc(p.text) + '</span>' + kindTag(p.kind) + '</div>').join('') || '<div class="empty">🟢 주민 1개 · 🔵 외부 1개를 고르는 중</div>') +
        (d.tally.length ? '<div class="tally">🗳 ' + esc(d.tally.map(i => i.text).join(' ')) + '</div>' : '') +
        '<div class="others">' + (others.length ? '<span class="o-hd">투표할 제안 ' + others.length + '</span>' : '') + others.slice(0, k ? 9 : 4).map(i => { const [h, b] = A.splitTitle(i.text); return '<span class="o ' + i.kind + '"><b class="no">' + i.no + '</b>' + esc(h || b) + '</span>'; }).join('') +
        (d.rest.length ? '<span class="o-hd">선정되지 않은 의견 ' + d.rest.length + '</span>' + d.rest.slice(0, k ? 6 : 2).map(i => '<span class="o rest ' + i.kind + '">' + esc(i.text) + '</span>').join('') : '') + '</div></div>';
    }).join('') + '</div>';
  }

  // ④ 실행방법 5개 항목
  const LABELS = { bg: '현황·제안배경', want: '우리가 바라는 모습', prop: '우리의 제안', first: '우리가 시작할 첫걸음', with: '함께하고 싶은 이웃' };
  function fieldsHtml(task, compact) {
    return '<dl class="f5' + (compact ? ' c' : '') + '">' + TASK_FIELDS.map(f => '<div class="' + (task[f] ? 'on' : '') + '"><dt>' + LABELS[f] + '</dt><dd>' + (task[f] ? esc(task[f]) : '<span class="wait">…</span>') + '</dd></div>').join('') + '</dl>';
  }
  function step4(ts, k) {
    if (!k || ts.length > 3) {  // 전체 또는 테이블 4개 주제: 카드로 간단히
      return '<div class="grid4">' + ts.map(t => {
        const d = A.tableData(items, t.no), task = d.tasks[0], pick = d.picks[0];
        return '<div class="pc" style="' + tv(t.topic) + '"><div class="pc-hd"><b>' + t.no + '</b>' + TOPICS[t.topic].name + '<span class="prog">' + TASK_FIELDS.map(f => '<i class="' + (task[f] ? 'on' : '') + '"></i>').join('') + '</span></div>' +
          '<div class="pick"><i>★</i><span>' + esc(pick ? pick.text : '선정 과제') + '</span>' + kindTag(pick && pick.kind) + '</div>' +
          (task.prop ? '<p class="line"><b>제안</b>' + esc(task.prop) + '</p>' : '') + (task.first ? '<p class="line"><b>첫걸음</b>' + esc(task.first) + '</p>' : '') +
          (d.picks[1] ? '<p class="t2">+ 과제 2 · ' + esc(d.picks[1].text) + ' (' + A.filled(d.tasks[1]) + '/5)</p>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return '<div class="sheets n' + ts.length + '">' + ts.map(t => {
      const d = A.tableData(items, t.no);
      const tasks = [0, 1].filter(i => i === 0 || d.picks[1] || A.filled(d.tasks[1]));
      return '<div class="sheet" style="' + tv(t.topic) + '"><div class="sh-hd"><b>테이블 ' + t.no + '</b><span>' + TOPICS[t.topic].name + '</span></div>' +
        tasks.map(i => '<div class="sh-task"><div class="pick"><i>★</i><span>' + (tasks.length > 1 ? '과제 ' + (i + 1) + ' · ' : '') + esc(d.picks[i] ? d.picks[i].text : '선정 과제') + '</span>' + kindTag(d.picks[i] && d.picks[i].kind) + '</div>' + fieldsHtml(d.tasks[i], tasks.length > 1) + '</div>').join('') + '</div>';
    }).join('') + '</div>';
  }

  // ⑤ 테이블별 의제 제안서 (AI 다듬은 문장 적용 가능)
  const CHECKS = ['정리내용 함께 읽기', '누락·오해 확인', '역할·협력 확인', '표현 다듬기', '최종 확인·제출'];
  function propSheet(t, compact) {
    const d = A.tableData(items, t.no);
    const ps = A.proposals(t.no, items, summary, cur.polished);
    const head = '<div class="sh-hd"><b>테이블 ' + t.no + '</b><span>' + TOPICS[t.topic].name + (d.dongs ? ' · ' + esc(d.dongs) : '') + ' · 의제 제안서</span>' + (d.done ? '<em class="done">✓ 제출</em>' : '') + (ps.some(p => p.polished) ? '<em class="ai">✨ 표현 다듬음</em>' : '') + '</div>';
    if (!ps.length) return '<div class="sheet" style="' + tv(t.topic) + '">' + head + '<div class="empty">④에서 정리한 내용이 여기에 모여요</div></div>';
    return '<div class="sheet" style="' + tv(t.topic) + '">' + head + ps.map(p =>
      '<div class="sh-task"><h3>' + esc(p.title) + kindTag(p.kind) + '</h3>' +
      (compact ? '<p class="line"><b>제안</b>' + esc(p.prop || '추후 협의') + '</p><p class="line"><b>첫걸음</b>' + esc(p.first || '추후 협의') + '</p>'
        : fieldsHtml(p, ps.length > 1) + ((p.us || p.ext) ? '<div class="roles">' + (p.us ? '<span class="chip us">우리 · ' + esc(p.us) + '</span>' : '') + (p.ext ? '<span class="chip ext">외부 · ' + esc(p.ext) + '</span>' : '') + '</div>' : '')) +
      '</div>').join('') + '</div>';
  }
  function step5(ts, k) {
    return '<div class="checks">' + CHECKS.map((c, i) => '<span><b>' + (i + 1) + '</b>' + c + '</span>').join('') + '</div>' +
      (k && (ts.length <= 3 || oneTable()) ? '<div class="sheets n' + ts.length + '">' + ts.map(t => propSheet(t, false)).join('') + '</div>'
         : '<div class="grid4 props">' + ts.map(t => propSheet(t, true)).join('') + '</div>');
  }

  // ── ⑥ 주제별 결과 공유 ──
  function renderShare() {
    const k = viewTopic();
    $('#share-bar').innerHTML = qbarHtml('같은 공간에 대해 어떤 의견이 나왔을까요?', k);
    const body = $('#share-body');
    const tsum = x => (summary.topics || {})[x];
    if (!k) {
      body.className = 'share-body all';
      body.innerHTML = '<div class="topics4">' + TOPIC_ORDER.map(x => {
        const s = tsum(x);
        const titles = A.tablesOf(x).flatMap(t => A.proposals(t.no, items, summary, cur.polished).map(p => ({ t: t.no, p })));
        return '<div class="tp" style="' + tv(x) + '"><div class="tp-hd"><span class="ic">' + topicIcon(x) + '</span><b>' + TOPICS[x].name + '</b><small>' + TOPICS[x].place + ' · 테이블 ' + A.tablesOf(x).map(t => t.no).join('·') + '</small></div>' +
          (s && s.summary ? '<p class="tp-sum">' + esc(s.summary) + '</p>' : '') +
          '<ul>' + (titles.slice(0, 4).map(({ t, p }) => '<li><small>T' + t + '</small>' + esc(p.title) + kindTag(p.kind) + '</li>').join('') || '<li class="empty">결과를 기다리고 있어요</li>') + '</ul></div>';
      }).join('') + '</div>';
      return;
    }
    const s = tsum(k);
    body.className = 'share-body one';
    body.style.cssText = tv(k);
    body.innerHTML = '<div class="tf-hd">' +
      (s && s.summary ? '<div class="tf-sum"><small>✨ 주제별 결과 요약</small><p>' + esc(s.summary) + '</p>' + (s.points && s.points.length ? '<div class="tf-pts">' + s.points.map(p => '<span>' + esc(p) + '</span>').join('') + '</div>' : '') + '</div>' : '<div class="tf-sum"><p class="dim">주제별 요약은 관제반이 AI 정리 후 띄워요</p></div>') + '</div>' +
      (viewTables().length > 3 ? '<div class="grid4 props">' + viewTables().map(t => propSheet(t, true)).join('') + '</div>'
        : '<div class="sheets n' + viewTables().length + '">' + viewTables().map(t => propSheet(t, false)).join('') + '</div>');
  }

  // ── ⑦ 공감·응원 ──
  let qrUrl = '';
  function renderLike() {
    const url = new URL('vote.html', location.href).href;
    if (url !== qrUrl && window.QRCode) { qrUrl = url; $('#qr').innerHTML = ''; new QRCode($('#qr'), { text: url, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M }); }
    $('.like-left').classList.toggle('closed', !cur.likeOpen && (cur.cards || []).length > 0 && likeCounts != null && Object.keys(likeCounts).length > 0);
    const cards = cur.cards || [];
    $('#like-board').innerHTML = TOPIC_ORDER.map(x => {
      const mine = cards.filter(c => c.topic === x);
      return '<div class="lb" style="' + tv(x) + '"><div class="lb-hd"><span class="ic">' + topicIcon(x) + '</span><b>' + TOPICS[x].name + '</b><small>' + TOPICS[x].place + '</small></div>' +
        (mine.map(c => '<div class="lc" data-id="' + c.id + '"><small>T' + c.table + '</small><b>' + esc(c.text) + '</b>' + (c.sub ? '<p>' + esc(c.sub) + '</p>' : '') + '<span class="hb"></span></div>').join('') || '<div class="empty">제안 카드 준비 중</div>') + '</div>';
    }).join('');
  }
  // 숫자 없이 하트만 떠오르게
  function burst(id, n) {
    const el = document.querySelector('.lc[data-id="' + id + '"]');
    if (!el) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    for (let i = 0; i < Math.min(n, 6); i++) {
      const h = document.createElement('i');
      h.className = 'heart'; h.innerHTML = ICONS.heart;
      h.style.left = (15 + Math.random() * 70) + '%';
      h.style.animationDelay = (i * 160) + 'ms';
      h.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
      el.querySelector('.hb').appendChild(h);
      setTimeout(() => h.remove(), 2600 + i * 160);
    }
  }

  // ── 데이터 ──
  async function pollFeed() {
    try { items = await A.loadFeed(); } catch (e) { console.warn('feed', e); return; }
    renderDocs();
    renderBody(false);
  }
  async function refreshSlow() {
    const s = cur.stage;
    try {
      if (s === 'share' || s === 'like' || (s === 'talk' && cur.sub === 4)) {
        const next = await A.loadSummary();
        const changed = next.at !== summary.at || JSON.stringify(next.job) !== JSON.stringify(summary.job);
        summary = next;
        if (changed) renderBody(true);
      }
      if (s === 'talk' && cur.sub === 2 && Object.keys(cur.ballot || {}).length) {
        const r = await A.loadVotes();
        const meta = { tables: r.tables || {}, done: r.done || {} };
        if (JSON.stringify(r.counts || {}) !== JSON.stringify(voteCounts) || JSON.stringify(meta) !== JSON.stringify(voteMeta)) { voteCounts = r.counts || {}; voteMeta = meta; renderBody(true); }
      }
      if (s === 'like') {
        const r = await A.loadLikes();
        const counts = r.counts || {};
        if (likeCounts) Object.keys(counts).forEach(id => { const d = counts[id] - (likeCounts[id] || 0); if (d > 0) burst(id, d); });
        likeCounts = counts;
      }
    } catch (e) { console.warn('slow', e); }
  }

  // ── 구호 모션그래픽 (21개 동 → 여섯 줄기 → 고리 → 구호) ──
  const DONGS = ['송정1', '송정2', '도산', '신흥', '어룡', '우산', '월곡1', '월곡2', '운남', '하남', '임곡', '동곡', '평동', '삼도', '본량', '신가', '신창', '수완', '비아', '첨단1', '첨단2'];
  const FLOWS = [
    ['river', 'M -80 250 C 200 120 380 420 640 330 S 880 400 960 540'],
    ['stream', 'M 2000 130 C 1720 250 1560 110 1360 300 S 1080 360 960 540'],
    ['mount', 'M -80 990 C 260 1010 420 770 650 790 S 890 650 960 540'],
    ['stream', 'M 2000 950 C 1720 1030 1580 820 1350 830 S 1060 700 960 540'],
    ['park', 'M 960 -80 C 820 120 1100 260 980 380 S 940 470 960 540'],
    ['mount', 'M 960 1160 C 1120 980 820 860 960 720 S 980 600 960 540']
  ];
  let sloAnims = [], sloTimers = [], sloRaf = 0;
  let lastCue = Number(A.LS.get('agora-last-cue', 0));
  const slo = (el, kf, opt) => { const a = el.animate(kf, Object.assign({ fill: 'both' }, opt)); sloAnims.push(a); return a; };
  const sloLater = (fn, ms) => sloTimers.push(setTimeout(fn, ms));
  const anim = slo, later = sloLater;
  function sloStop() { sloAnims.forEach(a => a.cancel()); sloAnims = []; sloTimers.forEach(clearTimeout); sloTimers = []; cancelAnimationFrame(sloRaf); }
  function sloBuild() {
    const svg = $('#slo-lines');
    svg.innerHTML = FLOWS.map(([c, d]) => '<path class="glow" d="' + d + '" stroke="' + TOPICS[c].color + '"/><path class="main" d="' + d + '" stroke="' + TOPICS[c].color + '"/>').join('') +
      FLOWS.map(([c]) => [0, 1, 2].map(() => '<circle r="9" fill="' + TOPICS[c].color + '" color="' + TOPICS[c].color + '" opacity="0"/>').join('')).join('');
    $('#slo-dongs').innerHTML = DONGS.map((d, i) => {
      const a = i / DONGS.length * Math.PI * 2 - Math.PI / 2;
      const x = 960 + Math.cos(a) * 780, y = 540 + Math.sin(a) * 400;
      return '<div class="dg" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px;' + tv(TOPIC_ORDER[i % TOPIC_ORDER.length]) + '" data-dx="' + (960 - x).toFixed(0) + '" data-dy="' + (540 - y).toFixed(0) + '"><span>' + d + '</span></div>';
    }).join('');
    $('#slo-rings').innerHTML = TOPIC_ORDER.concat(TOPIC_ORDER).map(c => '<i style="' + tv(c) + '"></i>').join('');
    svg.querySelectorAll('path').forEach(p => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
    const split = t => [...t].map(ch => '<span class="ch">' + (ch === ' ' ? '&nbsp;' : ch) + '</span>').join('');
    const ln = t => '<span class="ln">' + split(t) + '</span>';
    $('#slo').innerHTML = ln('함께 걷고!') + ln('함께 가꾸고!') + ln('함께 만드는!') + '<span class="big">광산!</span>';
  }
  function sloCountdown() {
    const box = $('#slo-count'), num = $('#slo-num'), arc = $('#slo-arc');
    anim(box, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
    [3, 2, 1].forEach((n, i) => later(() => {
      num.textContent = n;
      anim(num, [{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1.3,.4,1)' });
      anim(arc, [{ strokeDashoffset: 0 }, { strokeDashoffset: 1131 }], { duration: 1000, easing: 'linear' });
    }, i * 1000));
    later(() => anim(box, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 350, easing: 'ease-in' }), 2950);
  }
  // 구호 연출 속도: 1 = 원래, 클수록 느리게 (3·2·1 카운트다운은 그대로 1초씩)
  const SLO_SLOW = 2;
  function sloSequence() {
    const anim = (el, kf, o) => slo(el, kf, Object.assign({}, o, { duration: o.duration * SLO_SLOW, delay: (o.delay || 0) * SLO_SLOW }));
    const later = (fn, ms) => sloLater(fn, ms * SLO_SLOW);
    [...document.querySelectorAll('#slo-lines path')].forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      anim(p, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1900, delay: 200 + Math.floor(i / 2) * 120, easing: 'cubic-bezier(.55,0,.2,1)' });
      anim(p, [{ opacity: 1 }, { opacity: .3 }], { duration: 900, delay: 3300, fill: 'forwards' });
    });
    document.querySelectorAll('.dg').forEach((el, i) => {
      anim(el.firstChild, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 520, delay: 120 + i * 45, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      anim(el, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + el.dataset.dx + 'px,' + el.dataset.dy + 'px) scale(.15)', opacity: 0 }], { duration: 950, delay: 1750 + (i % 7) * 70, easing: 'cubic-bezier(.7,0,.84,0)', fill: 'forwards' });
    });
    anim($('#slo-core'), [{ transform: 'scale(0) rotate(0deg)' }, { transform: 'scale(.7) rotate(90deg)', offset: .45 }, { transform: 'scale(1.25) rotate(220deg)', offset: .9 }, { transform: 'scale(0) rotate(260deg)' }], { duration: 1900, delay: 1600, easing: 'cubic-bezier(.4,0,.2,1)' });
    document.querySelectorAll('.slo-rings i').forEach((r, i) => {
      const half = TOPIC_ORDER.length, first = i < half;
      anim(r, [{ transform: 'scale(.3)', opacity: first ? .95 : .35 }, { transform: 'scale(' + (first ? 7.5 : 4.5) + ')', opacity: 0 }],
        first ? { duration: 1700, delay: 3250 + i * 100, easing: 'cubic-bezier(.1,.7,.3,1)' } : { duration: 2400, delay: 6200 + (i - half) * 140, iterations: Infinity, easing: 'cubic-bezier(.2,.6,.4,1)' });
    });
    // 함께 걷고! → (외칠 틈) → 함께 가꾸고! → … 한 줄씩. LINE_GAP = 한 줄 외치는 시간
    const LINE_GAP = 1400, BIG_AT = 3450 + 3 * LINE_GAP;  // ×SLO_SLOW(2) → 실제 한 줄에 약 2.8초
    document.querySelectorAll('#slo .ln').forEach((ln, li) => { [...ln.children].forEach((ch, j) => anim(ch, [{ transform: 'translateY(115%)' }, { transform: 'none' }], { duration: 760, delay: 3450 + li * LINE_GAP + j * 55, easing: 'cubic-bezier(.2,.9,.25,1.08)' })); });
    const big = document.querySelector('#slo .big');
    big.classList.remove('flow');
    anim(big, [{ opacity: 0, transform: 'scale(1.9)', filter: 'blur(28px)' }, { opacity: 1, transform: 'scale(.95)', filter: 'blur(0)', offset: .7 }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 1100, delay: BIG_AT, easing: 'cubic-bezier(.2,.8,.2,1)' });
    later(() => big.classList.add('flow'), BIG_AT + 1150);
    anim($('#slo-sub'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: BIG_AT + 2400, easing: 'ease-out' });
    document.querySelectorAll('#slo-icons span').forEach((el, i) => anim(el, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 600, delay: BIG_AT + 2750 + i * 110, easing: 'cubic-bezier(.2,1.5,.4,1)' }));
    later(sloPulses, 3400);
  }
  function sloPulses() {
    const mains = [...document.querySelectorAll('#slo-lines path.main')];
    const dots = [...document.querySelectorAll('#slo-lines circle')];
    const lens = mains.map(p => p.getTotalLength());
    const t0 = performance.now();
    (function frame(t) {
      dots.forEach((c, k) => {
        const i = Math.floor(k / 3), ph = ((t - t0) / (2600 * SLO_SLOW) + (k % 3) / 3 + i * .17) % 1;
        const pt = mains[i].getPointAtLength(lens[i] * ph);
        c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
        c.setAttribute('opacity', (Math.sin(ph * Math.PI) * .95).toFixed(2));
      });
      sloRaf = requestAnimationFrame(frame);
    })(t0);
  }
  function playSlogan(withCount) { sloStop(); sloBuild(); if (withCount) { sloCountdown(); later(sloSequence, 3100); } else sloSequence(); }
  function runSlogan(entered) {
    const cue = cur.sloganCue || 0;
    if (cue > lastCue && Date.now() - cue < 30000) { lastCue = cue; A.LS.set('agora-last-cue', cue); playSlogan(true); }
    else if (entered) playSlogan(false);
  }

  // ── 시뮬레이터 (DEMO, 메인 스크린에서만) ──
  let simTimer = 0;
  function simLoop() {
    clearTimeout(simTimer);
    const st = A.effective();
    let wait = 1500;
    if (A.MODE === 'demo' && st.sim && !PREVIEW) {
      if (st.stage === 'talk' && st.sub === 2 && st.voteOpen && Object.keys(A.LS.get('agora-tvotes-v1', {})).length < 140) { A.simVote(); wait = 300 + Math.random() * 500; }
      else if (st.stage === 'talk') { A.simTick(st); wait = (900 + Math.random() * 1400) / (st.simSpeed || 1); }
      if (st.stage === 'like' && st.likeOpen && Object.keys(A.LS.get('agora-likes-v2', {})).length < 140) { A.simLike(); wait = 400 + Math.random() * 600; }
    }
    simTimer = setTimeout(simLoop, wait);
  }

  async function boot() {
    try { await A.loadTables(); buildStatic(); } catch (e) { console.warn('tables', e); }
    try { await A.pullState(); } catch (e) { console.warn('state', e); }
    render();
    setInterval(tick, 1000); tick();
    const feedMs = A.MODE === 'live' ? 5000 : 1000;
    (async function feedLoop() { await pollFeed(); setTimeout(feedLoop, feedMs); })();
    setInterval(refreshSlow, A.MODE === 'live' ? 3000 : 1000);
    if (A.MODE === 'live') setInterval(() => A.pullState().catch(() => {}), 2500);
    setInterval(() => { if (cur.auto) render(); }, 15000);
    simLoop();
  }
  boot();
})();
