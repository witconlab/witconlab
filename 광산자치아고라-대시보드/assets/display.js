/* 대형 스크린 동작 */
(function () {
  'use strict';
  const A = window.Agora;
  const { CATS, CAT_ORDER, TYPES, STAGES, SUBSTEPS, esc, hhmm, pad, toMin, nowMin, catIcon } = A;
  const $ = s => document.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const PREVIEW = qs.has('preview'); // 관제 패널 안의 미리보기(시뮬레이터를 돌리지 않음)

  // ── 화면 맞춤 ──
  const stage = $('#stage');
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  addEventListener('resize', fit); fit();
  if (!PREVIEW) document.addEventListener('dblclick', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); });

  const catVar = cat => '--c:' + CATS[cat].color;

  // ── 정적 요소 ──
  $('#hd-mark').innerHTML = CAT_ORDER.map(c => '<i style="background:' + CATS[c].color + '"></i>').join('');
  $('#hd-steps').innerHTML = STAGES.map(s => '<li data-k="' + s.key + '">' + s.label + '</li>').join('');
  $('#wait-meta').innerHTML = esc(A.EVENT.dateLabel) + '<br>' + esc(A.EVENT.place) + ' · 주최 ' + esc(A.EVENT.host);
  $('#open-icons').innerHTML = [['river', '하천', '풍영정천·황룡강'], ['park', '공원', '근린공원·쉼터'], ['road', '맨발길', '산책길·골목길'], ['common', '공동공간', '함께 쓰는 마당']]
    .map(([c, n, s]) => '<div class="oi" style="' + catVar(c) + '"><div class="ic">' + catIcon(c) + '</div><b>' + n + '</b><small>' + s + '</small></div>').join('');
  // 참고3 공론 의제 분류 건수
  const AGENDA = { river: 5, park: 10, road: 11, common: 9 };
  $('#key-cats').innerHTML = CAT_ORDER.map(c => '<div class="kc" style="' + catVar(c) + '"><div class="ic">' + catIcon(c) + '</div><div><b>' + CATS[c].name + '</b><small>' + A.tables.filter(t => t.cat === c).length + '개 테이블</small></div><div class="n">' + AGENDA[c] + '<span>건</span></div></div>').join('');
  $('#slo-icons').innerHTML = CAT_ORDER.map(c => '<span style="' + catVar(c) + '">' + catIcon(c) + '</span>').join('');
  $('#talk-steps').innerHTML = SUBSTEPS.map((s, i) => '<div class="ts" data-i="' + i + '"><div class="fill"></div><b>' + (i + 1) + '. ' + s.label + '</b><small>' + s.min + '분 · ' + s.start + '</small></div>').join('');
  const live = $('#hd-live');
  if (A.MODE === 'demo') { live.classList.add('demo'); live.innerHTML = '<i></i>DEMO'; }
  $('#mode-badge').textContent = A.MODE === 'demo' ? '시뮬레이션 모드 · 화면을 두 번 누르면 전체화면' : '';

  function buildLanes() {
    $('#lanes').innerHTML = CAT_ORDER.map(c => '<div class="lane" data-cat="' + c + '" style="' + catVar(c) + '"><div class="lane-hd"><div class="ic">' + catIcon(c) + '</div><b>' + CATS[c].lane + '</b><span class="cnt">0</span></div><div class="lane-list"></div></div>').join('');
    $('#heat').innerHTML = A.tables.map(t => '<div class="hc" data-no="' + t.no + '" style="' + catVar(t.cat) + '"><small>T' + t.no + '</small><b>0</b></div>').join('');
    $('#ai-grid').innerHTML = A.tables.map(t => '<div class="ai-t" data-no="' + t.no + '" style="' + catVar(t.cat) + '">테이블 ' + t.no + '<small>정리 중…</small></div>').join('');
    $('#wait-grid').innerHTML = A.tables.map(t => '<div class="wt" data-no="' + t.no + '" style="' + catVar(t.cat) + '"><b>' + t.no + '</b><span>' + esc(CATS[t.cat].short + ' · ' + t.dongs) + '</span><i></i></div>').join('');
  }
  buildLanes();

  // ── 시계 · 헤더 ──
  function tick() {
    const d = new Date();
    $('#hd-clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    const left = toMin('14:00') * 60 - (nowMin() * 60);
    $('#wait-count').innerHTML = left > 0 && left < 3 * 3600
      ? '시작까지<b>' + pad(Math.floor(left / 60)) + ':' + pad(Math.floor(left % 60)) + '</b>'
      : '';
    if (cur.stage === 'talk') renderSubsteps();
  }

  function renderDocs() {
    const ok = A.tables.filter(t => A.docOk[t.no]).length;
    $('#hd-docs').innerHTML = '<div class="dots">' + A.tables.map(t => '<i class="' + (A.docOk[t.no] ? 'ok' : '') + '"></i>').join('') + '</div>기록 <b>' + ok + '/' + A.tables.length + '</b>';
    $('#wait-ok').textContent = ok + ' / ' + A.tables.length;
    document.querySelectorAll('.wt').forEach(el => el.classList.toggle('ok', !!A.docOk[el.dataset.no]));
  }

  // ── 장면 전환 ──
  let cur = { stage: null };
  function render() {
    const st = A.effective();
    const changed = st.stage !== cur.stage;
    const prev = cur;
    cur = st;
    document.querySelectorAll('.scene').forEach(el => el.classList.toggle('on', el.dataset.scene === st.stage));
    const idx = STAGES.findIndex(s => s.key === st.stage);
    document.querySelectorAll('#hd-steps li').forEach((li, i) => { li.className = i === idx ? 'on' : i < idx ? 'done' : ''; });
    stage.classList.toggle('full', st.stage === 'slogan' || st.stage === 'open');

    if (st.stage === 'talk') { renderSubsteps(); applyDim(); $('#ai-overlay').classList.toggle('on', st.sub === SUBSTEPS.length - 1); }
    if (st.stage === 'share') renderShare(changed || prev.view !== st.view || prev.focus !== st.focus);
    if (st.stage === 'vote') renderVote();
    if (st.stage === 'result' && changed) revealResult();
    if (st.stage === 'slogan') runSlogan(changed); else if (changed) sloStop();
    if (changed) refreshSlow();
  }
  A.onState(render);

  // ── 의제공론화 세부단계 ──
  let subChangedAt = Date.now(), lastSub = -1;
  function renderSubsteps() {
    if (cur.sub !== lastSub) { lastSub = cur.sub; subChangedAt = Date.now(); applyDim(); }
    document.querySelectorAll('.ts').forEach((el, i) => {
      el.classList.toggle('on', i === cur.sub);
      el.classList.toggle('done', i < cur.sub);
      let p = i < cur.sub ? 100 : 0;
      if (i === cur.sub) {
        const s = SUBSTEPS[i];
        const elapsed = cur.auto ? (nowMin() - toMin(s.start)) : (Date.now() - subChangedAt) / 60000;
        p = Math.max(0, Math.min(100, elapsed / s.min * 100));
        const remain = Math.max(0, s.min - elapsed);
        el.querySelector('small').textContent = remain > 0 ? '남은 시간 약 ' + Math.ceil(remain) + '분' : s.min + '분 · 마무리 중';
      } else {
        el.querySelector('small').textContent = SUBSTEPS[i].min + '분 · ' + SUBSTEPS[i].start;
      }
      el.querySelector('.fill').style.width = p + '%';
    });
  }
  function applyDim() {
    const types = (SUBSTEPS[cur.sub] || SUBSTEPS[0]).types;
    document.querySelectorAll('.lane-list .card').forEach(el => el.classList.toggle('dim', cur.stage === 'talk' && cur.sub >= 2 && !types.includes(el.dataset.type)));
  }

  // ── 실시간 피드 ──
  let items = [];
  const shown = new Set();
  const spotQueue = [];
  let spotTimer = 0, spotCurrent = null;
  const MAX_PER_LANE = 10;

  function cardHtml(it) {
    const t = A.tableByNo(it.table);
    return '<div class="meta"><span class="tno">T' + t.no + '</span><span>' + esc(it.dong || t.dongs.split('·')[0]) + '</span><span class="tag ' + it.type + '">' + TYPES[it.type].label + '</span><span class="time">' + hhmm(it.time) + '</span></div><p>' + esc(it.text) + '</p>';
  }

  async function pollFeed() {
    try {
      items = await A.loadFeed();
    } catch (e) { console.warn('feed', e); return; }
    renderDocs();
    const firstLoad = shown.size === 0 && items.length > 0;
    const fresh = items.filter(it => !shown.has(it.id));
    const pinged = new Set();
    fresh.forEach(it => {
      shown.add(it.id);
      const list = document.querySelector('.lane[data-cat="' + it.cat + '"] .lane-list');
      if (!list) return;
      const el = document.createElement('div');
      el.className = 'card' + (firstLoad ? '' : ' enter');
      el.dataset.type = it.type;
      el.style.cssText = catVar(it.cat);
      el.innerHTML = cardHtml(it);
      list.prepend(el);
      while (list.children.length > MAX_PER_LANE) list.lastElementChild.remove();
      if (!firstLoad) { setTimeout(() => el.classList.remove('enter'), 4500); spotQueue.push(it); pinged.add(it.table); }
    });
    if (firstLoad && items.length) spotQueue.push(items[items.length - 1]);
    // 많이 밀려 있으면 최근 것만 보여 줌
    while (spotQueue.length > 6) spotQueue.shift();

    CAT_ORDER.forEach(c => { const n = items.filter(i => i.cat === c).length; const el = document.querySelector('.lane[data-cat="' + c + '"] .cnt'); if (el) el.textContent = n; });
    A.tables.forEach(t => {
      const el = document.querySelector('.hc[data-no="' + t.no + '"]');
      if (!el) return;
      el.querySelector('b').textContent = items.filter(i => i.table === t.no).length;
      if (pinged.has(t.no)) { el.classList.remove('ping'); void el.offsetWidth; el.classList.add('ping'); }
    });
    $('#feed-total').textContent = '총 ' + items.length + '건';
    if (fresh.length) { renderCloud(); applyDim(); }
    if (!spotTimer) nextSpot();
  }

  function nextSpot() {
    spotTimer = 0;
    const it = spotQueue.shift();
    if (it) {
      spotCurrent = it;
      const t = A.tableByNo(it.table);
      const card = $('#spot-card');
      card.style.cssText = catVar(it.cat);
      card.innerHTML = '<div class="spot-who"><span class="ic">' + catIcon(it.cat) + '</span>테이블 ' + t.no + ' · ' + esc(it.dong || t.dongs) + ' <span class="tag ' + it.type + '">' + TYPES[it.type].label + '</span></div><div class="spot-text">' + esc(it.text) + '</div>';
      card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
      const hold = spotQueue.length > 2 ? 3000 : 4800;
      const bar = $('#spot-bar');
      bar.style.background = CATS[it.cat].color;
      bar.animate([{ width: '0%' }, { width: '100%' }], { duration: hold, easing: 'linear', fill: 'forwards' });
      spotTimer = setTimeout(nextSpot, hold);
    }
  }

  function renderCloud() {
    const kws = A.keywords(items, 16);
    if (!kws.length) { $('#cloud').innerHTML = '<span style="font-size:20px;color:var(--dim)">기록이 쌓이면 키워드가 나타나요</span>'; return; }
    const max = kws[0][1];
    // 키워드가 많이 나온 분야 색으로
    const catOf = w => { const c = {}; items.forEach(i => { if (i.text.includes(w)) c[i.cat] = (c[i.cat] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };
    $('#cloud').innerHTML = kws.map(([w, n]) => {
      const size = 18 + Math.round((n / max) * 24);
      return '<span style="font-size:' + size + 'px;color:' + CATS[catOf(w)].color + ';opacity:' + (0.55 + 0.45 * n / max).toFixed(2) + '">' + esc(w) + '</span>';
    }).join('');
  }

  // ── 요약 · 투표 데이터 ──
  let summary = { tables: {}, at: 0 };
  let ballots = {};
  async function refreshSlow() {
    const s = cur.stage;
    try {
      if (s === 'share' || s === 'vote' || s === 'result' || (s === 'talk' && cur.sub === SUBSTEPS.length - 1)) {
        const next = await A.loadSummary();
        const changed = JSON.stringify(next.tables) !== JSON.stringify(summary.tables);
        summary = next;
        if (changed) { if (s === 'share') renderShare(true); renderAi(); }
      }
      if (s === 'vote' || s === 'result') {
        const v = await A.loadVotes();
        const changed = JSON.stringify(v.ballots) !== JSON.stringify(ballots);
        ballots = v.ballots || {};
        if (changed && s === 'vote') renderVote();
      }
    } catch (e) { console.warn('slow', e); }
  }
  function renderAi() {
    document.querySelectorAll('.ai-t').forEach(el => {
      const s = summary.tables[el.dataset.no];
      const done = s && (s.actions.length || s.admin);
      el.classList.toggle('done', !!done);
      el.querySelector('small').textContent = done ? '정리 완료' : '정리 중…';
    });
  }
  const candidates = () => (cur.candidates && cur.candidates.length) ? cur.candidates : A.buildCandidates(summary);

  // ── 결과 공유 ──
  const seenFocus = new Set();
  function tableBlock(t, opts = {}) {
    const s = summary.tables[t.no];
    const acts = s ? s.actions.filter(Boolean) : [];
    const body = s && (acts.length || s.admin)
      ? acts.map(a => '<div class="li action"><i>✓</i><span>' + esc(a) + '</span></div>').join('') +
        (s.admin ? '<div class="li admin"><i>行</i><span>' + esc(s.admin) + '</span></div>' : '') +
        (opts.kw && s.keywords.length ? '<div class="kw">' + s.keywords.slice(0, 4).map(k => '<span>#' + esc(k) + '</span>').join('') + '</div>' : '')
      : '<div class="empty">AI 정리 결과를 기다리고 있어요</div>';
    return '<div class="st" style="' + catVar(t.cat) + '"><div class="st-hd"><b>테이블 ' + t.no + '</b><span>' + esc(t.dongs) + '</span></div>' + body + '</div>';
  }
  function renderShare(force) {
    if (!force) return;
    const body = $('#share-body');
    const view = cur.view || 'category';
    if (view === 'category') {
      $('#share-title').textContent = '생활공간별로 모은 우리의 실천과제';
      body.innerHTML = '<div class="sc-cols">' + CAT_ORDER.map(c => {
        const ts = A.tables.filter(t => t.cat === c);
        return '<div class="sc-col" style="' + catVar(c) + '"><div class="sc-col-hd"><span class="ic">' + catIcon(c) + '</span><b>' + CATS[c].name + '</b><span>' + ts.length + '개 테이블</span></div>' + ts.map(t => tableBlock(t)).join('') + '</div>';
      }).join('') + '</div>';
    } else if (view === 'table') {
      $('#share-title').textContent = '12개 테이블이 제안하는 실천과제';
      body.innerHTML = '<div class="sg">' + A.tables.map(t => tableBlock(t, { kw: true })).join('') + '</div>';
    } else {
      const t = A.tableByNo(cur.focus || 1);
      seenFocus.add(t.no);
      const s = summary.tables[t.no] || { summary: '', actions: [], admin: '', keywords: [] };
      $('#share-title').textContent = '테이블 ' + t.no + ' 발표';
      body.innerHTML = '<div class="sf" style="' + catVar(t.cat) + '">' +
        '<div class="sf-left"><span class="ic">' + catIcon(t.cat) + '</span><div class="sf-no">' + t.no + '<small>테이블</small></div><div class="sf-cat">' + CATS[t.cat].name + '</div><div class="sf-dong">' + esc(t.dongs.split('·').join(' · ')) + '동</div><div class="sf-space">' + esc(t.space) + '</div></div>' +
        '<div class="sf-right">' +
          (s.summary ? '<p class="sf-sum">' + esc(s.summary) + '</p>' : '') +
          '<div class="sf-block"><h3><i style="background:var(--action)"></i>주민 공동 실천과제</h3><div class="sf-acts">' + (s.actions.filter(Boolean).map(a => '<div class="sf-act">' + esc(a) + '</div>').join('') || '<div class="sf-admin" style="color:var(--dim)">정리 대기 중</div>') + '</div></div>' +
          '<div class="sf-block"><h3><i style="background:var(--admin)"></i>행정 협력 요청</h3><div class="sf-admin">' + esc(s.admin || '—') + '</div></div>' +
          (s.keywords.length ? '<div class="sf-kw kw">' + s.keywords.map(k => '<span>#' + esc(k) + '</span>').join('') + '</div>' : '') +
          '<div class="sf-nav">' + A.tables.map(x => '<i class="' + (x.no === t.no ? 'on' : seenFocus.has(x.no) ? 'seen' : '') + '"></i>').join('') + '</div>' +
        '</div></div>';
    }
  }

  // ── 투표 ──
  let qrUrl = '';
  const prevVotes = {};
  function voteUrl() {
    const base = cur.voteUrl || new URL('vote.html', location.href).href;
    return base;
  }
  function renderVote() {
    const url = voteUrl();
    if (url !== qrUrl && window.QRCode) {
      qrUrl = url;
      $('#qr').innerHTML = '';
      new QRCode($('#qr'), { text: url, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.M });
    }
    $('#vote-picks').textContent = cur.votePicks || 3;
    $('.vote-left').classList.toggle('closed', !cur.voteOpen && Object.keys(ballots).length > 0);
    const { voters, rows } = A.tally(ballots, candidates());
    $('#vote-voters').textContent = voters;
    const wrap = $('#vote-bars');
    const H = wrap.clientHeight || 900;
    const pitch = Math.min(80, H / Math.max(rows.length, 1));
    const max = Math.max(1, rows[0] ? rows[0].votes : 1);
    const ids = new Set(rows.map(r => r.id));
    [...wrap.children].forEach(el => { if (!ids.has(el.dataset.id)) el.remove(); });
    rows.forEach((r, i) => {
      let el = wrap.querySelector('[data-id="' + r.id + '"]');
      if (!el) {
        el = document.createElement('div');
        el.className = 'vb'; el.dataset.id = r.id; el.style.cssText = catVar(r.cat);
        el.innerHTML = '<div class="rk"></div><div class="bar"><div class="fill"></div><div class="lbl"><small>T' + r.table + '</small><span></span></div></div><div class="num"></div>';
        wrap.appendChild(el);
      }
      el.style.height = (pitch - 12) + 'px';
      el.style.transform = 'translateY(' + (i * pitch) + 'px)';
      el.classList.toggle('top', i < 3 && r.votes > 0);
      el.querySelector('.rk').textContent = i + 1;
      el.querySelector('.lbl span').textContent = r.text;
      el.querySelector('.fill').style.width = (r.votes / max * 100) + '%';
      el.querySelector('.num').innerHTML = r.votes + '<small>표</small>';
      if (prevVotes[r.id] != null && prevVotes[r.id] !== r.votes) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      prevVotes[r.id] = r.votes;
    });
  }

  // ── 투표 결과 ──
  let revealTimers = [];
  async function revealResult() {
    revealTimers.forEach(clearTimeout); revealTimers = [];
    try { summary = await A.loadSummary(); ballots = (await A.loadVotes()).ballots || {}; } catch (e) { /* 마지막 값 사용 */ }
    const { voters, rows } = A.tally(ballots, candidates());
    const total = voters || 1;
    $('#res-sub').textContent = voters + '명이 참여했어요 · 1인 ' + (cur.votePicks || 3) + '표';
    const top = rows.slice(0, 3);
    const order = [1, 0, 2]; // 2위 · 1위 · 3위 배치
    $('#podium').innerHTML = order.map(i => {
      const r = top[i];
      if (!r) return '<div></div>';
      const t = A.tableByNo(r.table);
      return '<div class="pd r' + (i + 1) + '" style="' + catVar(r.cat) + '"><div class="medal">' + (i + 1) + '</div><div class="who"><span>' + CATS[t.cat].name + '</span><small>테이블 ' + t.no + ' · ' + esc(t.dongs) + '</small></div><h3>' + esc(r.text) + '</h3><div class="v"><b>' + r.votes + '</b>표 · 참여자의 ' + Math.round(r.votes / total * 100) + '%</div></div>';
    }).join('');
    $('#res-rest').innerHTML = rows.slice(3, 7).map((r, i) => '<div class="rr" style="' + catVar(r.cat) + '"><b>' + (i + 4) + '</b><span>' + esc(r.text) + '</span><em>T' + r.table + ' · ' + r.votes + '표</em></div>').join('');
    const pds = document.querySelectorAll('.pd');
    // 3위 → 2위 → 1위 순서로 공개
    [[2, 600], [0, 2000], [1, 3600]].forEach(([k, ms]) => { if (pds[k]) revealTimers.push(setTimeout(() => pds[k].classList.add('show'), ms)); });
    document.querySelectorAll('.rr').forEach((el, i) => revealTimers.push(setTimeout(() => el.classList.add('show'), 5000 + i * 250)));
  }

  // ── 슬로건 모션그래픽 ──
  // 21개 동 이름이 화면 가장자리에 떠올랐다가 → 하천·공원·길·공동공간 네 줄기를 따라 가운데로 모이고
  // → 하나의 고리가 되어 퍼져 나간 뒤 → 「함께 걷고, 함께 가꾸는 광산!」이 글자 단위로 올라옵니다.
  const DONGS = ['송정1', '송정2', '도산', '신흥', '어룡', '우산', '월곡1', '월곡2', '운남', '하남', '임곡', '동곡', '평동', '삼도', '본량', '신가', '신창', '수완', '비아', '첨단1', '첨단2'];
  const FLOWS = [
    ['river', 'M -80 250 C 200 120 380 420 640 330 S 880 400 960 540'],
    ['park', 'M 2000 130 C 1720 250 1560 110 1360 300 S 1080 360 960 540'],
    ['road', 'M -80 990 C 260 1010 420 770 650 790 S 890 650 960 540'],
    ['common', 'M 2000 950 C 1720 1030 1580 820 1350 830 S 1060 700 960 540']
  ];
  let sloAnims = [], sloTimers = [], sloRaf = 0;
  let lastCue = Number(A.LS.get('agora-last-cue', 0));
  const anim = (el, kf, opt) => { const a = el.animate(kf, Object.assign({ fill: 'both' }, opt)); sloAnims.push(a); return a; };
  const later = (fn, ms) => sloTimers.push(setTimeout(fn, ms));

  function sloStop() {
    sloAnims.forEach(a => a.cancel()); sloAnims = [];
    sloTimers.forEach(clearTimeout); sloTimers = [];
    cancelAnimationFrame(sloRaf);
  }

  function sloBuild() {
    const svg = $('#slo-lines');
    svg.innerHTML = FLOWS.map(([c, d]) => '<path class="glow" d="' + d + '" stroke="' + CATS[c].color + '"/><path class="main" d="' + d + '" stroke="' + CATS[c].color + '"/>').join('') +
      FLOWS.map(([c]) => [0, 1, 2].map(() => '<circle r="9" fill="' + CATS[c].color + '" color="' + CATS[c].color + '" opacity="0"/>').join('')).join('');
    $('#slo-dongs').innerHTML = DONGS.map((d, i) => {
      const a = i / DONGS.length * Math.PI * 2 - Math.PI / 2;
      const x = 960 + Math.cos(a) * 780, y = 540 + Math.sin(a) * 400;
      return '<div class="dg" style="left:' + x.toFixed(0) + 'px;top:' + y.toFixed(0) + 'px;' + catVar(CAT_ORDER[i % 4]) + '" data-dx="' + (960 - x).toFixed(0) + '" data-dy="' + (540 - y).toFixed(0) + '"><span>' + d + '</span></div>';
    }).join('');
    $('#slo-rings').innerHTML = CAT_ORDER.concat(CAT_ORDER).map(c => '<i style="' + catVar(c) + '"></i>').join('');
    // 그리기 전에는 선이 보이지 않도록
    svg.querySelectorAll('path').forEach(p => { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
    const split = t => [...t].map(ch => '<span class="ch">' + (ch === ' ' ? '&nbsp;' : ch) + '</span>').join('');
    $('#slo').innerHTML = '<span class="ln">' + split('함께 걷고,') + '</span><span class="ln">' + split('함께 가꾸는') + '</span><span class="big">광산!</span>';
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

  function sloSequence() {
    // ① 네 줄기 선이 가장자리에서 가운데로 그려짐
    const paths = [...document.querySelectorAll('#slo-lines path')];
    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      anim(p, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1900, delay: 200 + Math.floor(i / 2) * 140, easing: 'cubic-bezier(.55,0,.2,1)' });
      anim(p, [{ opacity: 1 }, { opacity: .3 }], { duration: 900, delay: 3300, fill: 'forwards' });
    });
    // ② 21개 동 이름이 떠오름 → 가운데로 빨려 들어감
    document.querySelectorAll('.dg').forEach((el, i) => {
      anim(el.firstChild, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 520, delay: 120 + i * 45, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      anim(el, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + el.dataset.dx + 'px,' + el.dataset.dy + 'px) scale(.15)', opacity: 0 }],
        { duration: 950, delay: 1750 + (i % 7) * 70, easing: 'cubic-bezier(.7,0,.84,0)', fill: 'forwards' });
    });
    // ③ 가운데 고리가 차오르고 → 네 색 물결로 터짐
    const core = $('#slo-core');
    anim(core, [{ transform: 'scale(0) rotate(0deg)' }, { transform: 'scale(.7) rotate(90deg)', offset: .45 }, { transform: 'scale(1.25) rotate(220deg)', offset: .9 }, { transform: 'scale(0) rotate(260deg)' }],
      { duration: 1900, delay: 1600, easing: 'cubic-bezier(.4,0,.2,1)' });
    document.querySelectorAll('.slo-rings i').forEach((r, i) => {
      const first = i < 4;
      anim(r, [{ transform: 'scale(.3)', opacity: first ? .95 : .35 }, { transform: 'scale(' + (first ? 7.5 : 4.5) + ')', opacity: 0 }],
        first ? { duration: 1700, delay: 3250 + i * 120, easing: 'cubic-bezier(.1,.7,.3,1)' }
              : { duration: 2400, delay: 6200 + (i - 4) * 160, iterations: Infinity, easing: 'cubic-bezier(.2,.6,.4,1)' });
    });
    // ④ 슬로건 글자가 아래에서 올라옴
    document.querySelectorAll('#slo .ln').forEach((ln, li) => {
      [...ln.children].forEach((ch, j) => anim(ch, [{ transform: 'translateY(115%)' }, { transform: 'none' }], { duration: 760, delay: 3450 + li * 620 + j * 55, easing: 'cubic-bezier(.2,.9,.25,1.08)' }));
    });
    const big = document.querySelector('#slo .big');
    big.classList.remove('flow');
    anim(big, [{ opacity: 0, transform: 'scale(1.9)', filter: 'blur(28px)' }, { opacity: 1, transform: 'scale(.95)', filter: 'blur(0)', offset: .7 }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }],
      { duration: 1100, delay: 4750, easing: 'cubic-bezier(.2,.8,.2,1)' });
    later(() => big.classList.add('flow'), 5900);
    anim($('#slo-sub'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 5800, easing: 'ease-out' });
    document.querySelectorAll('#slo-icons span').forEach((el, i) => anim(el, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 600, delay: 6150 + i * 110, easing: 'cubic-bezier(.2,1.5,.4,1)' }));
    // ⑤ 선을 따라 빛이 계속 가운데로 흘러 들어감
    later(sloPulses, 3400);
  }

  function sloPulses() {
    const mains = [...document.querySelectorAll('#slo-lines path.main')];
    const dots = [...document.querySelectorAll('#slo-lines circle')];
    const lens = mains.map(p => p.getTotalLength());
    const t0 = performance.now();
    (function frame(t) {
      dots.forEach((c, k) => {
        const i = Math.floor(k / 3), ph = ((t - t0) / 2600 + (k % 3) / 3 + i * .17) % 1;
        const pt = mains[i].getPointAtLength(lens[i] * ph);
        c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
        c.setAttribute('opacity', (Math.sin(ph * Math.PI) * .95).toFixed(2));
      });
      sloRaf = requestAnimationFrame(frame);
    })(t0);
  }

  function playSlogan(withCount) {
    sloStop(); sloBuild();
    if (withCount) { sloCountdown(); later(sloSequence, 3100); } else sloSequence();
  }
  function runSlogan(entered) {
    const cue = cur.sloganCue || 0;
    if (cue > lastCue && Date.now() - cue < 30000) {
      lastCue = cue; A.LS.set('agora-last-cue', cue);
      playSlogan(true);
    } else if (entered) {
      playSlogan(false);
    }
  }

  // ── 시뮬레이터 (DEMO, 메인 스크린에서만) ──
  let simTimer = 0;
  function simLoop() {
    clearTimeout(simTimer);
    const st = A.effective();
    let wait = 1500;
    if (A.MODE === 'demo' && st.sim && !PREVIEW) {
      if (st.stage === 'talk' && st.sub < SUBSTEPS.length - 1) { A.simTick(st); wait = (1400 + Math.random() * 1800) / (st.simSpeed || 1); }
      if (st.stage === 'vote' && st.voteOpen && Object.keys(A.LS.get('agora-votes', {})).length < 142) { A.simVote(); wait = 350 + Math.random() * 500; }
    }
    simTimer = setTimeout(simLoop, wait);
  }

  // ── 루프 ──
  async function boot() {
    try { await A.loadTables(); buildLanes(); } catch (e) { console.warn('tables', e); }
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
