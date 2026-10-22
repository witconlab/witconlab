// 함께하는 이웃: 새나가온을 가운데 두고 단체들이 서로 이어진 네트워크 그림
(() => {
  const GROUPS = {
    lib: { name: '작은도서관 · 청소년 공간', color: '#2f8fd0', soft: '#e5f2fb' },
    net: { name: '마을공동체 · 네트워크', color: '#6b3fb0', soft: '#f0eafb' },
    club: { name: '동네 모임 · 주민 단체', color: '#e5458f', soft: '#fde9f2' }
  };

  // short: 그림 안에 보일 이름 (\n은 줄바꿈)
  const NODES = [
    { id: 'ongajok', name: '온가족그림책작은도서관', short: '온가족그림책\n작은도서관', g: 'lib' },
    { id: 'kkum', name: '꿈꾸는터전작은도서관', short: '꿈꾸는터전\n작은도서관', g: 'lib' },
    { id: 'bonadam', name: '보나담작은도서관', short: '보나담\n작은도서관', g: 'lib' },
    { id: 'siso', name: '서구청소년문화의집 시소센터', short: '시소센터', g: 'lib' },
    { id: 'irak', name: '서구마을네트워크 이락', short: '서구마을\n네트워크 이락', g: 'net' },
    { id: 'chaorum', name: '차오름', g: 'net' },
    { id: 'mirinae', name: '미리내', g: 'net' },
    { id: 'nature', name: '신나는 자연탐험대', short: '신나는\n자연탐험대', g: 'net' },
    { id: 'linedongsan', name: '라인동산아파트', g: 'club' },
    { id: 'asatta', name: '아사따사모', g: 'club' },
    { id: 'nanta', name: '치평난타', g: 'club' },
    { id: 'ttiat', name: '화삼골 띠:앗', g: 'club' },
    { id: 'hanyang', name: '한양바라기', g: 'club' },
    { id: 'sia', name: '시아', g: 'club' },
    { id: 'hwaiker', name: '화이커', g: 'club' },
    { id: 'seochang', name: '서창맘', g: 'club' },
    { id: 'jumma', name: '줌마리봉스', g: 'club' }
  ];

  // 교부신청서 '3년간 사업추진 실적'에 함께 이름이 오른 단체끼리 이어요
  const PROJECTS = [
    { id: 'viva', name: '삼삼오오 VIVA치평', when: '2023~2024', members: ['ongajok', 'siso', 'kkum', 'nature', 'irak'] },
    { id: 'rights', name: '주민주도 인권놀이터', when: '2024~2025', members: ['ongajok', 'chaorum', 'mirinae'] },
    { id: 'gamtan', name: '감탄마을 만들기', when: '2023', members: ['ongajok', 'chaorum', 'irak'] },
    { id: 'wfv', name: '여성친화마을', when: '2020~2025', members: ['ongajok', 'irak'] }
  ];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lines = n => (n.short || n.name).split('\n');

  // 이름표 크기 (한글 한 글자 ≈ 글자 크기)
  function pill(n, fs) {
    const ls = lines(n);
    const w = Math.max(...ls.map(l => [...l].length)) * fs * 0.98 + fs * 1.8;
    const h = ls.length * fs * 1.3 + fs * 0.9;
    return { w, h, ls };
  }

  /* ---------- 배치 ---------- */
  // 넓은 화면: 새나가온 둘레에 세 묶음이 꽃잎처럼 퍼져요
  function layoutWide() {
    const W = 1000, H = 820, cx = 500, cy = 330;
    const hubs = { lib: { a: 200, d: 215 }, net: { a: -20, d: 215 }, club: { a: 90, d: 205 } };
    const spread = { lib: { span: 150, r: [150, 150] }, net: { span: 150, r: [150, 150] }, club: { span: 196, r: [150, 238] } };
    const pos = {}, hubPos = {};
    for (const g of Object.keys(GROUPS)) {
      const a = hubs[g].a * Math.PI / 180;
      const hx = cx + Math.cos(a) * hubs[g].d * 1.25, hy = cy + Math.sin(a) * hubs[g].d;
      hubPos[g] = { x: hx, y: hy };
      const list = NODES.filter(n => n.g === g);
      list.forEach((n, i) => {
        const t = list.length === 1 ? 0 : i / (list.length - 1) - 0.5;
        const ang = a + t * spread[g].span * Math.PI / 180;
        const r = spread[g].r[i % 2];
        pos[n.id] = { x: hx + Math.cos(ang) * r * 1.2, y: hy + Math.sin(ang) * r };
      });
    }
    return { W, H, cx, cy, cr: 70, fs: 15, hubPos, pos, mode: 'wide' };
  }

  // 좁은 화면: 위에서 아래로 흐르는 줄기에 묶음이 매달려요
  function layoutNarrow() {
    const W = 360, cx = 180, cy = 78, fs = 13, gap = 12;
    const pos = {}, hubPos = {};
    let y = cy + 120;
    for (const g of Object.keys(GROUPS)) {
      const list = NODES.filter(n => n.g === g);
      // 두 줄 이름표는 더 높아서 이름표 높이만큼 띄워요
      let yy = y, prevH = 0;
      list.forEach((n, i) => {
        const h = pill(n, fs).h;
        if (i) yy += prevH / 2 + h / 2 + gap;
        pos[n.id] = { x: 196, y: yy };
        prevH = h;
      });
      hubPos[g] = { x: 44, y: (y + yy) / 2 };
      y = yy + 100;
    }
    return { W, H: y - 40, cx, cy, cr: 50, fs, hubPos, pos, mode: 'narrow' };
  }

  /* ---------- 그리기 ---------- */
  function curve(a, b, bend = 0.18) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  function draw(L) {
    const C = { x: L.cx, y: L.cy };
    const edges = [];
    // 새나가온 → 묶음
    Object.keys(GROUPS).forEach((g, i) => {
      const h = L.hubPos[g];
      // 좁은 화면에서는 왼쪽 줄기를 따라 내려가요
      const d = L.mode === 'wide' ? curve(C, h, 0.08)
        : `M${C.x - L.cr * 0.75} ${C.y + L.cr * 0.65} Q${h.x - 8 + i * 8} ${C.y + L.cr + 4} ${h.x - 8 + i * 8} ${C.y + L.cr + 70} L${h.x - 8 + i * 8} ${h.y - 14} Q${h.x - 8 + i * 8} ${h.y} ${h.x} ${h.y}`;
      edges.push(`<path class="nw-trunk" d="${d}" stroke="${GROUPS[g].color}" data-g="${g}"/>`);
    });
    // 묶음 → 단체
    for (const n of NODES) {
      edges.push(`<path class="nw-branch" d="${curve(L.hubPos[n.g], L.pos[n.id], 0.12)}" stroke="${GROUPS[n.g].color}" data-n="${n.id}"/>`);
    }
    // 같은 묶음 안의 이웃끼리 (옆자리끼리 느슨하게)
    for (const g of Object.keys(GROUPS)) {
      const list = NODES.filter(n => n.g === g);
      const order = list.map((_, i) => i);
      for (let k = 0; k < order.length - 1; k++) {
        const a = L.pos[list[order[k]].id], b = L.pos[list[order[k + 1]].id];
        edges.push(`<path class="nw-ring" d="${curve(a, b, L.mode === 'wide' ? -0.15 : 0)}" stroke="${GROUPS[g].color}"/>`);
      }
    }
    // 함께한 일로 이어진 단체끼리
    for (const p of PROJECTS) {
      for (let i = 0; i < p.members.length; i++) {
        for (let j = i + 1; j < p.members.length; j++) {
          const a = L.pos[p.members[i]], b = L.pos[p.members[j]];
          const bend = L.mode === 'narrow' ? (a.y < b.y ? -0.42 : 0.42) : 0.22;
          edges.push(`<path class="nw-link" d="${curve(a, b, bend)}" data-p="${p.id}" data-a="${p.members[i]}" data-b="${p.members[j]}"/>`);
        }
      }
    }

    const hubs = Object.entries(GROUPS).map(([g, v]) => {
      const h = L.hubPos[g];
      return `<g class="nw-hub" data-g="${g}"><circle cx="${h.x}" cy="${h.y}" r="${L.mode === 'wide' ? 9 : 8}" fill="${v.color}"/></g>`;
    }).join('');

    const nodes = NODES.map(n => {
      const p = L.pos[n.id], { w, h, ls } = pill(n, L.fs), g = GROUPS[n.g];
      const ty = p.y - (ls.length - 1) * L.fs * 0.65 + L.fs * 0.36;
      return `<g class="nw-node" data-n="${n.id}" data-g="${n.g}" tabindex="0" role="button" aria-label="${esc(n.name)} – ${g.name}">
        <rect x="${(p.x - w / 2).toFixed(1)}" y="${(p.y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(Math.min(h, 40) / 2).toFixed(1)}" fill="#fff" stroke="${g.color}"/>
        <text x="${p.x.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${L.fs}" text-anchor="middle">${ls.map((l, i) => `<tspan x="${p.x.toFixed(1)}" dy="${i ? L.fs * 1.3 : 0}">${esc(l)}</tspan>`).join('')}</text>
      </g>`;
    }).join('');

    const logo = window.SAENAGAON_CHARS ? window.SAENAGAON_CHARS.logo().replace('<svg ', `<svg x="${C.x - L.cr * 0.42}" y="${C.y - L.cr * 0.78}" width="${L.cr * 0.84}" height="${L.cr * 0.84}" `) : '';
    const center = `<g class="nw-center">
      <circle cx="${C.x}" cy="${C.y}" r="${L.cr + 14}" class="nw-ripple"/>
      <circle cx="${C.x}" cy="${C.y}" r="${L.cr}" fill="#2a2140"/>
      ${logo}
      <text x="${C.x}" y="${C.y + L.cr * 0.42}" text-anchor="middle" font-size="${L.mode === 'wide' ? 22 : 17}" class="nw-center-name">새나가온</text>
    </g>`;

    return `<svg class="nw-svg nw-${L.mode}" viewBox="0 0 ${L.W} ${L.H.toFixed(0)}" role="group" aria-label="새나가온과 함께하는 단체 네트워크">
      <g class="nw-edges">${edges.join('')}</g>${hubs}${center}<g class="nw-nodes">${nodes}</g>
    </svg>`;
  }

  /* ---------- 상호작용 ---------- */
  function projectsOf(id) { return PROJECTS.filter(p => p.members.includes(id)); }

  function infoHTML(sel) {
    if (!sel) return `<p class="nw-hint">단체 이름이나 아래 ‘함께한 일’을 눌러 보세요. 서로 이어진 이웃이 보여요.</p>`;
    if (sel.type === 'node') {
      const n = NODES.find(x => x.id === sel.id), ps = projectsOf(n.id), g = GROUPS[n.g];
      return `<p class="nw-info-title"><span class="nw-dot" style="background:${g.color}"></span>${esc(n.name)}</p>
        <p class="nw-info-sub">${g.name}${ps.length ? ` · 함께한 일: ${ps.map(p => `${esc(p.name)} (${p.when})`).join(', ')}` : ' · 새나가온 활동을 함께 알리고 있어요'}</p>`;
    }
    const p = PROJECTS.find(x => x.id === sel.id);
    return `<p class="nw-info-title">${esc(p.name)} <span class="nw-when">${p.when}</span></p>
      <p class="nw-info-sub">${p.members.map(m => esc(NODES.find(n => n.id === m).name)).join(' · ')}</p>`;
  }

  function apply(root, sel) {
    const svg = root.querySelector('.nw-svg');
    svg.classList.toggle('nw-focus', !!sel);
    svg.querySelectorAll('.on').forEach(e => e.classList.remove('on'));
    root.querySelectorAll('.nw-proj').forEach(b => b.setAttribute('aria-pressed', String(!!sel && sel.type === 'proj' && b.dataset.p === sel.id)));
    if (sel) {
      const on = new Set();
      if (sel.type === 'node') {
        on.add(sel.id);
        svg.querySelectorAll(`.nw-link[data-a="${sel.id}"], .nw-link[data-b="${sel.id}"]`).forEach(l => {
          l.classList.add('on'); on.add(l.dataset.a); on.add(l.dataset.b);
        });
      } else {
        svg.querySelectorAll(`.nw-link[data-p="${sel.id}"]`).forEach(l => l.classList.add('on'));
        PROJECTS.find(p => p.id === sel.id).members.forEach(m => on.add(m));
      }
      on.forEach(id => {
        svg.querySelector(`.nw-node[data-n="${id}"]`)?.classList.add('on');
        svg.querySelector(`.nw-branch[data-n="${id}"]`)?.classList.add('on');
        const g = NODES.find(n => n.id === id).g;
        svg.querySelector(`.nw-trunk[data-g="${g}"]`)?.classList.add('on');
      });
    }
    root.querySelector('.nw-info').innerHTML = infoHTML(sel);
  }

  window.renderNetwork = function (root) {
    if (!root) return;
    let sel = null, mode = null;
    const legend = `<div class="nw-legend">${Object.values(GROUPS).map(g =>
      `<span><span class="nw-dot" style="background:${g.color}"></span>${g.name}</span>`).join('')}
      <span><span class="nw-dash"></span>함께한 일로 이어진 사이</span></div>`;
    const projBtns = `<div class="nw-projects" role="group" aria-label="함께한 일">${PROJECTS.map(p =>
      `<button class="nw-proj" data-p="${p.id}" aria-pressed="false">${esc(p.name)}</button>`).join('')}</div>`;

    const render = () => {
      const m = root.clientWidth < 640 ? 'narrow' : 'wide';
      if (m === mode) return;
      mode = m;
      root.innerHTML = `${legend}<div class="nw-stage">${draw(m === 'wide' ? layoutWide() : layoutNarrow())}</div>
        <div class="nw-info" aria-live="polite"></div>${projBtns}`;
      apply(root, sel);
    };
    render();

    const pick = next => {
      sel = sel && next && sel.type === next.type && sel.id === next.id ? null : next;
      apply(root, sel);
    };
    root.addEventListener('click', e => {
      const n = e.target.closest('.nw-node'), p = e.target.closest('.nw-proj');
      if (n) pick({ type: 'node', id: n.dataset.n });
      else if (p) pick({ type: 'proj', id: p.dataset.p });
      else if (e.target.closest('.nw-svg')) pick(null);
    });
    root.addEventListener('keydown', e => {
      const n = e.target.closest('.nw-node');
      if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick({ type: 'node', id: n.dataset.n }); }
      if (e.key === 'Escape') pick(null);
    });
    // 마우스를 올리면 잠깐 미리 보여 줘요 (고른 것이 없을 때만)
    root.addEventListener('mouseover', e => {
      const n = e.target.closest('.nw-node');
      if (n && !sel) apply(root, { type: 'node', id: n.dataset.n });
    });
    root.addEventListener('mouseout', e => {
      if (e.target.closest('.nw-node') && !sel) apply(root, null);
    });

    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => root.isConnected ? render() : window.removeEventListener('resize', onResize), 150); };
    window.addEventListener('resize', onResize);
  };
})();
