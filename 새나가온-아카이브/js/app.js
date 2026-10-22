(() => {
  const CONFIG = window.SAENAGAON_CONFIG || {};
  const app = document.getElementById('app');

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const headers = (rows.shift() || []).map(h => h.trim());
    return rows
      .filter(r => r.some(v => v.trim()))
      .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
  }

  const cache = {};
  function load(name) {
    if (!cache[name]) {
      const sheet = CONFIG.SHEETS && CONFIG.SHEETS[name];
      const fetchCSV = url => fetch(url, { cache: 'no-cache' }).then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      });
      cache[name] = (sheet ? fetchCSV(sheet).catch(() => fetchCSV(`data/${name}.csv`)) : fetchCSV(`data/${name}.csv`))
        .then(parseCSV)
        .catch(() => []);
    }
    return cache[name];
  }

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 시트 칸 안에서 줄바꿈(Alt+Enter)으로 나눠 써도 같은 목록으로 읽어요
  const list = (s, sep = ';') => String(s || '').split(sep === '|' ? /[|\n]/ : /[;\n]/).map(v => v.trim()).filter(Boolean);
  function img(code) {
    if (!code) return '';
    // 구글 드라이브 공유 링크는 바로 보이는 이미지 주소로 바꿔요
    const drive = code.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
    if (drive) return `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1600`;
    if (/^https?:\/\//.test(code)) return code;
    if (/^p\d+$/.test(code)) return `images/photos/${code}.jpg`;
    return `images/${code}${/\.\w+$/.test(code) ? '' : '.jpg'}`;
  }
  const statusBadge = s => s ? `<span class="badge-status status-${esc(s)}">${esc(s)}</span>` : '';
  const BLUR_NOTE = '아이들의 초상권 보호를 위해 사진 속 얼굴은 흐리게 처리했어요.';

  /* ---------- modal & lightbox ---------- */
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  let lastFocus = null;
  function openModal(html) {
    lastFocus = document.activeElement;
    modalBody.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.modal-panel').scrollTop = 0;
    modal.querySelector('.modal-close').focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });

  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  let lbList = [], lbIdx = 0;
  function openLightbox(srcs, i) {
    lbList = srcs; lbIdx = i; showLb(); lb.hidden = false;
  }
  function showLb() { lbImg.src = lbList[lbIdx]; lbImg.alt = `사진 ${lbIdx + 1} / ${lbList.length}`; }
  function stepLb(d) { lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); }
  lb.querySelector('.lb-close').onclick = () => { lb.hidden = true; };
  lb.querySelector('.lb-prev').onclick = () => stepLb(-1);
  lb.querySelector('.lb-next').onclick = () => stepLb(1);
  lb.addEventListener('click', e => { if (e.target === lb) lb.hidden = true; });

  document.addEventListener('keydown', e => {
    if (!lb.hidden) {
      if (e.key === 'Escape') lb.hidden = true;
      if (e.key === 'ArrowLeft') stepLb(-1);
      if (e.key === 'ArrowRight') stepLb(1);
      return;
    }
    if (!modal.hidden && e.key === 'Escape') closeModal();
  });

  function gallery(photos) {
    if (!photos.length) return '';
    return `<div class="gallery">${photos.map((p, i) =>
      `<button data-lb="${i}" aria-label="사진 크게 보기 ${i + 1}"><img src="${esc(img(p))}" alt="" loading="lazy"></button>`).join('')}</div>
      <p class="blur-note">${BLUR_NOTE}</p>`;
  }
  function bindGallery(photos) {
    modalBody.querySelectorAll('[data-lb]').forEach(b => {
      b.onclick = () => openLightbox(photos.map(img), +b.dataset.lb);
    });
  }

  /* ---------- shared cards ---------- */
  function actCard(a) {
    const photos = list(a.photos);
    const thumb = photos.length
      ? `<img src="${esc(img(photos[0]))}" alt="" loading="lazy">${photos.length > 1 ? `<span class="count">사진 ${photos.length}</span>` : ''}`
      : `<div class="thumb-empty">${window.SAENAGAON_CHARS ? window.SAENAGAON_CHARS.single(a.status === '예정' ? 'joy' : 'wink', a.status === '예정' ? '#ffd166' : '#b9a3f0') : ''}<span>${esc(a.date || a.year)} · ${a.status === '예정' ? '곧 만나요' : '기록 정리 중'}</span></div>`;
    return `<button class="card act-card" data-act="${esc(a.id)}">
      <div class="thumb">${thumb}</div>
      <div class="body">
        <div class="meta"><span class="tag">${esc(a.category)}</span>${statusBadge(a.status === '완료' ? '' : a.status)}<span>${esc(a.date || a.year)}</span></div>
        <h3>${esc(a.title)}</h3>
        <p class="summary">${esc(a.summary)}</p>
      </div>
    </button>`;
  }

  async function showActivity(id) {
    const [acts, tools] = await Promise.all([load('activities'), load('tools')]);
    const a = acts.find(x => x.id === id);
    if (!a) return;
    const photos = list(a.photos);
    const usedTools = list(a.tools).map(t => tools.find(x => x.id === t)).filter(Boolean);
    openModal(`
      <div class="meta"><span class="tag">${esc(a.category)}</span> ${statusBadge(a.status)}</div>
      <h2 id="modal-title">${esc(a.title)}</h2>
      <p>${esc(a.summary)}</p>
      <dl class="meta-list">
        <dt>언제</dt><dd>${esc(a.date || a.year)}</dd>
        ${a.place ? `<dt>어디서</dt><dd>${esc(a.place)}</dd>` : ''}
        ${a.partners ? `<dt>함께한 곳</dt><dd>${list(a.partners).map(esc).join(', ')}</dd>` : ''}
      </dl>
      ${gallery(photos)}
      ${usedTools.length ? `<h3>이 활동에서 쓴 교구</h3><div class="mini-links">${usedTools.map(t => `<button data-tool="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div>` : ''}
    `);
    bindGallery(photos);
  }

  async function showTool(id) {
    const [tools, books, acts] = await Promise.all([load('tools'), load('books'), load('activities')]);
    const t = tools.find(x => x.id === id);
    if (!t) return;
    const photos = list(t.photos);
    const relBooks = list(t.books).map(b => books.find(x => x.id === b)).filter(Boolean);
    const relActs = acts.filter(a => list(a.tools).includes(t.id));
    openModal(`
      <div class="tool-detail-top">
        <img src="${esc(img(t.image))}" alt="${esc(t.name)}">
        <div>
          <div class="meta"><span class="tag tag-pink">${esc(t.topic)}</span> <span class="tag tag-sky">${esc(t.year)}년 개발</span></div>
          <h2 id="modal-title">${esc(t.name)}</h2>
          <p>${esc(t.summary)}</p>
          <dl class="meta-list"><dt>추천 대상</dt><dd>${esc(t.target)}</dd></dl>
        </div>
      </div>
      ${t.howto ? `<h3>이렇게 놀아요</h3><ol class="steps">${list(t.howto, '|').map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${t.questions ? `<h3>함께 나눌 이야기</h3><ul class="question-list">${list(t.questions, '|').map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${relBooks.length ? `<h3>함께 읽으면 좋은 그림책</h3><div class="mini-links">${relBooks.map(b => `<button data-book="${esc(b.id)}">『${esc(b.title)}』</button>`).join('')}</div>` : ''}
      ${photos.length ? `<h3>활동 속 모습</h3>${gallery(photos)}` : ''}
      ${relActs.length ? `<h3>이 교구로 한 활동</h3><div class="mini-links">${relActs.map(a => `<button data-act="${esc(a.id)}">${esc(a.year)} · ${esc(a.title)}</button>`).join('')}</div>` : ''}
    `);
    bindGallery(photos);
  }

  async function showBook(id) {
    const [books, tools] = await Promise.all([load('books'), load('tools')]);
    const b = books.find(x => x.id === id);
    if (!b) return;
    const relTools = tools.filter(t => list(t.books).includes(b.id));
    openModal(`
      <div class="book-detail">
        <img src="${esc(img(b.image))}" alt="『${esc(b.title)}』 표지">
        <div>
          <span class="tag tag-pink">${esc(b.theme)}</span>
          <h2 id="modal-title">${esc(b.title)}</h2>
          <p class="muted">새나가온 성인지·성평등 공통 교안 그림책</p>
          ${b.question ? `<h3>읽고 나서 물어봐요</h3><ul class="question-list"><li>${esc(b.question)}</li></ul>` : ''}
          ${relTools.length ? `<h3>함께 쓰는 교구</h3><div class="mini-links">${relTools.map(t => `<button data-tool="${esc(t.id)}">${esc(t.name)}</button>`).join('')}</div>` : ''}
        </div>
      </div>
    `);
  }

  // 페이지와 모달 어디서든 카드 클릭 처리
  document.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    const tool = e.target.closest('[data-tool]');
    const book = e.target.closest('[data-book]');
    if (act) showActivity(act.dataset.act);
    else if (tool) showTool(tool.dataset.tool);
    else if (book) showBook(book.dataset.book);
  });

  /* ---------- pages ---------- */
  const CHARS = window.SAENAGAON_CHARS || {};
  const AXES = [
    { hl: 'hl-sky', label: '함께 만들자!', title: '성평등 콘텐츠 디지털화', items: ['월 2회 정기회의', '기존 교구·교안 점검과 보완', '디지털 콘텐츠 5종 이상', '성평등 책상자 기획'], href: '#tools', more: '교구 보러 가기 →' },
    { hl: 'hl-purple', label: '함께 해보자!', title: '체험형 가족 성평등 캠프', items: ['1차 ‘함께 시작해요’ 8/30', '2차 ‘함께 나눠요’ 11/29', '가족 10~15팀', '일상 속 실천 기록'], href: '#activities', more: '활동 보러 가기 →' },
    { hl: 'hl-pink', label: '함께 나누자!', title: '마을 성평등 확산', items: ['책상자 활용 교육 10회 이상', '온라인 책상자 체험단', '가정·기관·마을단체로 확산', '스마트스토어 기반 확산'], href: '#apply', more: '체험단 신청하기 →' }
  ];
  const DIFF = [
    { hl: 'hl-sky', label: '마을에서 시작해요', img: 'p017', alt: '치평동 주민자치위원회와 함께한 마을 행사', text: '작은도서관, 학교, 주민자치회까지 <b>치평동 17개 단체·기관</b>과 함께해요.<br>성평등을 교실 밖, 우리 동네 일상에서 만나요.' },
    { hl: 'hl-purple', label: '직접 만든 교구로 놀아요', img: 'tools/tools-display', alt: '새나가온이 만든 교구와 그림책 전시', text: 'STACK IT UP, 감정 주사위, 손인형 퍼펫까지<br><b>회원들이 공부하고 직접 만든 교구</b>로 놀면서 이야기해요.' },
    { hl: 'hl-pink', label: '가족이 함께 실천해요', img: 'p030', alt: '2023 퍼플데이 성인지 가족캠프 단체 사진', text: '2022년부터 이어 온 가족캠프에서 <b>부모와 아이가 함께</b><br>집에서 바로 해 볼 수 있는 작은 실천을 찾아요.' }
  ];

  async function pageHome() {
    const acts = await load('activities');
    const recent = acts.filter(a => list(a.photos).length && /^\d{4}$/.test(a.year))
      .sort((a, b) => b.year.localeCompare(a.year)).slice(0, 6);
    return `
    <section class="hero"><div class="wrap">
      <h1 class="slogan"><span>우리 집은 다정하게</span><span class="l2">우리 마을은 평등하게</span></h1>
      <p class="hero-sub">광주 서구 치평동 마을공동체 새나가온</p>
      <div class="hero-chars">${CHARS.hero ? CHARS.hero() : ''}</div>
    </div></section>

    <section class="identity"><div class="wrap">
      <p>새나가온은 그림책과 놀이로 가족의 일상에<br><span class="em">성평등</span>을 심는 마을공동체입니다</p>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="feed-head"><h2>새나가온 소식 💜</h2><a href="#activities">전체 보기 →</a></div>
      <div class="feed">${recent.map(actCard).join('')}</div>
      <p class="blur-note">${BLUR_NOTE}</p>
    </div></section>

    <section class="section diff"><div class="wrap">
      <div class="diff-head"><span class="quote" aria-hidden="true">”</span><h2>새나가온, 뭐가 다를까요?</h2></div>
      <div class="diff-list">${DIFF.map(d => `
        <div class="diff-item">
          <span class="hl ${d.hl}">${d.label}</span>
          <img src="${esc(img(d.img))}" alt="${esc(d.alt)}" loading="lazy">
          <p>${d.text}</p>
        </div>`).join('')}
      </div>
    </div></section>

    <section class="section"><div class="wrap">${applyBanner()}</div></section>`;
  }

  function nowItem(a) {
    return `<button class="now-item" data-act="${esc(a.id)}">
      <span>${statusBadge(a.status)}</span>
      <span class="date">${esc(a.date)}</span>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.summary)}</p>
    </button>`;
  }

  function applyBanner() {
    return `<div class="banner">
      <div>
        <h2>우리 집에<br>성평등 책상자가 찾아가요</h2>
        <p>그림책과 STACK IT UP 카드게임과 활동지를 한 상자에 담았어요. 가정과 기관 모두 신청할 수 있어요.</p>
        <a class="btn btn-dark" href="#apply">책상자 체험단 신청하기</a>
      </div>
      <div class="banner-art">${CHARS.bookbox ? CHARS.bookbox() : ''}</div>
    </div>`;
  }

  const TIMELINE = [
    ['2017', ['새나가온 결성 – 동아리 모임으로 시작']],
    ['2018', ['고유번호증 발급 (12.11)', '광주 서구 마을공동체 씨앗공모사업', '서구 마을자랑대회 우수상', '회원·주민 성인지·성폭력 예방 역량강화 교육 시작']],
    ['2019', ['서구 마을자랑대회 모범상', '광주 서구 좋은마을 만들기 마을공동체 사업 (~2021)', '서구마을네트워크 ‘이락’ 활동 시작']],
    ['2020', ['서구형 여성친화마을 사업 (~2023)', '치평동 네트워크 · 주민자치위원회 연계활동 시작']],
    ['2022', ['그림책으로 만나는 성평등 가족캠프 시작']],
    ['2023', ['사회적경제 로컬크리에이터 아카데미 경진대회 우수상', '성인지·성평등 그림책 지도사 10명 양성', '찾았다! 5R 보드게임 개발 · 초등학교 3곳 전달']],
    ['2024', ['광주광역시 여성친화마을 사업 (~2025)', '성인지 보드게임 STACK IT UP 개발', '광주마을네트워크 활동 시작']],
    ['2025', ['성인지·성평등 그림책 공통 교안과 활용 교구 마련', '손인형 퍼펫 · 감정 주사위 · 갈등상황 카드 제작']],
    ['2026', ['광주광역시 여성친화마을 조성 공모 선정 – 마을 성평등 실천 확산 프로젝트 ‘우리동네 성평등이야기’']]
  ];
  const PARTNERS = ['온가족그림책작은도서관', '보나담작은도서관', '서구청소년문화의집 시소센터', '꿈꾸는터전작은도서관', '라인동산아파트', '아사따사모', '치평난타', '신나는 자연탐험대', '서구마을네트워크 이락', '미리내', '차오름', '화삼골 띠:앗', '한양바라기', '시아', '화이커', '서창맘', '줌마리봉스'];

  async function pageAbout() {
    const [acts, tools, books] = await Promise.all([load('activities'), load('tools'), load('books')]);
    const address = '광주광역시 서구 상무평화로 62';
    return `
    <section class="page-head"><div class="wrap">
      <p class="eyebrow">새나가온이란?</p>
      <h1>우리 마을에서<br>시작하는 성평등</h1>
      <p>새나가온은 광주 서구 치평동 주민들이 만든 마을공동체예요. 2017년 동아리 모임으로 시작해 성인지 그림책, 보드게임, 가족캠프로 참여형 성평등 교육을 이어 오고 있어요.</p>
    </div></section>

    <section class="section-tight"><div class="wrap">
      <div class="stats">
        <div class="stat"><b>2017</b><span>동아리로 시작</span></div>
        <div class="stat"><b>6년</b><span>여성친화마을 사업</span></div>
        <div class="stat"><b>${acts.length}</b><span>기록된 활동</span></div>
        <div class="stat"><b>${tools.length}종</b><span>직접 만든 교구</span></div>
        <div class="stat"><b>${books.length}권</b><span>성평등 그림책 교안</span></div>
        <div class="stat"><b>17곳</b><span>함께하는 단체·기관</span></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="intro">
        <div class="text">
          <blockquote>내가 만드는 우리 가족,<span class="em">나와 네가 함께 만드는 우리 마을</span></blockquote>
          <div>
            <p>우리는 성평등이 지식을 전하는 일이 아니라 <b>경험과 관계 속에서 자라나는 과정</b>이라는 것을 활동으로 확인했어요.</p>
            <p>치평동은 가족 단위로 사는 이웃이 많고 학교와 돌봄기관과 작은도서관이 가까이 모여 있는 동네예요. 그래서 성평등도 거창한 교육보다 일상 속 대화와 작은 실천에서 시작하려 해요.</p>
          </div>
        </div>
        <div><img src="images/photos/p082.jpg" alt="권리를 품은 하루 – 인권놀이터 단체 사진"><p class="blur-note">${BLUR_NOTE}</p></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap grid grid-2" style="align-items:start;gap:48px">
      <div>
        <span class="hl">우리가 걸어온 길</span>
        <div class="timeline" style="margin-top:24px">${TIMELINE.map(([y, items]) => `
          <div class="tl-item${y === '2026' ? ' hl-year' : ''}"><div class="tl-year">${y}</div><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}
        </div>
      </div>
      <div class="grid" style="gap:28px">
        <figure class="figure"><img src="images/graphics/since-2020.jpg" alt="SINCE 2020 with 새나가온 – 연도별 성평등 활동" loading="lazy"><figcaption>2022~2025 성평등 활동의 흐름</figcaption></figure>
        <figure class="figure"><img src="images/graphics/award-2023.jpg" alt="2023 사회적경제 로컬크리에이터 경진대회 우수상" loading="lazy"><figcaption>2023 사회적경제 로컬크리에이터 아카데미 경진대회 우수상</figcaption></figure>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="center">
        <p class="eyebrow">2026 사업</p>
        <h2 class="section-title">우리동네 성평등이야기</h2>
        <p class="section-lead">기존 성평등 교육 콘텐츠를 디지털화하고 체험형 프로그램으로 다시 엮어, 가족 단위 실천 경험으로 넓히고 지역사회로 나누는 프로젝트예요. (2026년 6월~12월, 광주광역시 여성친화마을 조성 공모 선정사업)</p>
      </div>
      <div class="axis-list">${AXES.map(x => `
        <div class="axis"><span class="hl ${x.hl}" style="align-self:flex-start">${x.label}</span><h3>${x.title}</h3>
          <ul>${x.items.map(i => `<li>${i}</li>`).join('')}</ul><a href="${x.href}">${x.more}</a></div>`).join('')}
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="center"><p class="eyebrow">3개년 계획</p><h2 class="section-title" style="margin-bottom:32px">기반 구축에서 마을 모델로</h2></div>
      <div class="roadmap">
        <div class="road now"><span class="tag tag-pink" style="align-self:flex-start">지금 여기</span><div class="yr">1차년도</div><h3>만들고 실험하고 기반 만들기</h3><ul><li>기존 성평등 콘텐츠 디지털화와 고도화</li><li>가족 단위 실천 사례 쌓기</li><li>지역 협력 네트워크 만들기</li><li>스마트스토어 구축</li></ul></div>
        <div class="road"><div class="yr">2차년도</div><h3>넓히고 연결하고 시스템 만들기</h3><ul><li>학교·돌봄기관·작은도서관으로 참여 확대</li><li>성평등 프로그램 실행자(활동가) 양성</li><li>기관 간 교류와 협력 네트워크</li><li>스마트스토어 활용과 확산</li></ul></div>
        <div class="road"><div class="yr">3차년도</div><h3>정착하고 이어가고 모델화하기</h3><ul><li>가족·기관 사례 아카이빙과 사례집</li><li>성평등 실천 프로그램 매뉴얼</li><li>성과 공유회와 전시</li><li>다른 지역으로의 확산</li></ul></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap center">
      <p class="eyebrow">함께하는 이웃</p>
      <h2 class="section-title">마을 곳곳의 단체·기관과 함께해요</h2>
      <p class="section-lead">새나가온은 혼자 하지 않아요. 치평동의 작은도서관, 마을공동체, 동네 모임 17곳이 서로 이어져 함께 알리고, 함께 만들어요.</p>
      <div class="network" id="network">
        <div class="partners">${PARTNERS.map(p => `<span class="partner">${esc(p)}</span>`).join('')}</div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="center"><p class="eyebrow">오시는 길</p><h2 class="section-title" style="margin-bottom:28px">새나가온 사무실</h2></div>
      <div class="map-box">
        <div class="info"><dl>
          <dt>주소</dt><dd>광주광역시 서구 상무평화로 62<br>라인동산상가 1동 302호 (치평동)</dd>
          <dt>문의</dt><dd><a href="mailto:${esc(CONFIG.CONTACT_EMAIL)}">${esc(CONFIG.CONTACT_EMAIL)}</a></dd>
          <dt>모임</dt><dd>매월 2회 정기회의</dd>
        </dl></div>
        <iframe title="새나가온 사무실 지도" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed"></iframe>
      </div>
    </div></section>`;
  }

  const toolFilter = { topic: '전체', theme: '전체' };
  async function pageTools() {
    return `
    <section class="page-head"><div class="wrap">
      <p class="eyebrow">교구 소개</p>
      <h1>놀면서 배우는<br>성평등 교구</h1>
      <p>회원들이 공부하고 직접 만든 교구와, 새나가온 공통 교안에 담긴 성평등 그림책을 소개해요. 카드를 누르면 놀이 방법과 함께 나눌 질문을 볼 수 있어요.</p>
    </div></section>
    <section class="section"><div class="wrap">
      <p class="eyebrow">직접 만든 교구</p>
      <h2 class="section-title">새나가온표 교구</h2>
      <div class="chips" id="tool-chips"></div>
      <div class="grid grid-4" id="tool-grid"></div>
    </div></section>
    <section class="section"><div class="wrap">
      <figure class="figure" style="margin:0"><img src="images/tools/tools-display.jpg" alt="새나가온 교구와 그림책 전시"><figcaption>그림책으로 떠나는 성평등 놀이터 – 새나가온 교구 전시</figcaption></figure>
    </div></section>
    <section class="section"><div class="wrap">
      <p class="eyebrow">성인지·성평등 공통 교안</p>
      <h2 class="section-title">함께 읽는 그림책</h2>
      <p class="section-lead">2025년에 마련한 공통 교안의 그림책이에요. 책을 누르면 읽고 나서 나눌 질문을 볼 수 있어요.</p>
      <div class="chips" id="book-chips"></div>
      <div class="books" id="book-grid"></div>
    </div></section>`;
  }
  async function afterTools() {
    const [tools, books] = await Promise.all([load('tools'), load('books')]);
    const renderTools = () => {
      const topics = ['전체', ...new Set(tools.map(t => t.topic))];
      document.getElementById('tool-chips').innerHTML = topics.map(t =>
        `<button class="chip${t === toolFilter.topic ? ' active' : ''}" data-topic="${esc(t)}">${esc(t)}</button>`).join('');
      document.getElementById('tool-grid').innerHTML = tools
        .filter(t => toolFilter.topic === '전체' || t.topic === toolFilter.topic)
        .map(t => `<button class="card tool-card" data-tool="${esc(t.id)}">
          <div class="thumb"><img src="${esc(img(t.image))}" alt="" loading="lazy"></div>
          <div class="body"><span class="tag tag-pink">${esc(t.topic)}</span> <span class="tag tag-sky">${esc(t.year)}</span>
          <h3>${esc(t.name)}</h3><p>${esc(t.target)}</p></div></button>`).join('');
    };
    const renderBooks = () => {
      const themes = ['전체', ...new Set(books.map(b => b.theme))];
      document.getElementById('book-chips').innerHTML = themes.map(t =>
        `<button class="chip${t === toolFilter.theme ? ' active' : ''}" data-theme="${esc(t)}">${esc(t)}</button>`).join('');
      document.getElementById('book-grid').innerHTML = books
        .filter(b => toolFilter.theme === '전체' || b.theme === toolFilter.theme)
        .map(b => `<button class="book" data-book="${esc(b.id)}">
          <div class="cover"><img src="${esc(img(b.image))}" alt="『${esc(b.title)}』 표지" loading="lazy"></div>
          <div class="t">${esc(b.title)}</div><div class="th">${esc(b.theme)}</div></button>`).join('');
    };
    renderTools(); renderBooks();
    document.getElementById('tool-chips').onclick = e => {
      const c = e.target.closest('[data-topic]'); if (!c) return;
      toolFilter.topic = c.dataset.topic; renderTools();
    };
    document.getElementById('book-chips').onclick = e => {
      const c = e.target.closest('[data-theme]'); if (!c) return;
      toolFilter.theme = c.dataset.theme; renderBooks();
    };
  }

  const actFilter = { year: '전체', cat: '전체' };
  async function pageActivities() {
    const acts = await load('activities');
    const now = acts.filter(a => a.year === '2026');
    return `
    <section class="page-head"><div class="wrap">
      <p class="eyebrow">활동 소개</p>
      <h1>함께한 시간을<br>모아 두었어요</h1>
      <p>2020년부터 이어 온 가족캠프, 그림책 북나들이, 인권놀이터, 교구 개발, 마을 네트워크 활동을 연도와 분야별로 모았어요.</p>
    </div></section>
    ${now.length ? `<section class="section"><div class="wrap">
      <p class="eyebrow">2026 우리동네 성평등이야기</p>
      <h2 class="section-title">올해 진행 중인 활동</h2>
      <div class="now-list">${now.map(nowItem).join('')}</div>
    </div></section>` : ''}
    <section class="section"><div class="wrap">
      <p class="eyebrow">아카이브</p>
      <h2 class="section-title">지난 활동 둘러보기</h2>
      <div class="year-tabs" id="year-tabs" role="tablist" aria-label="연도"></div>
      <div class="chips" id="cat-chips"></div>
      <p class="result-count" id="result-count"></p>
      <div class="feed" id="act-grid"></div>
      <p class="blur-note">${BLUR_NOTE}</p>
    </div></section>
    <section class="section"><div class="wrap">
      <p class="eyebrow">가족 실천 이야기</p>
      <h2 class="section-title">우리 집에서 시작한 작은 변화</h2>
      <p class="section-lead">가족캠프와 책상자 체험 뒤에 가정에서 실천한 이야기를 모아요. 모인 이야기는 3차년도 사례집으로 엮을 예정이에요.</p>
      <div id="stories"></div>
    </div></section>`;
  }
  async function afterActivities() {
    const [acts, stories] = await Promise.all([load('activities'), load('stories')]);
    const years = ['전체', ...[...new Set(acts.map(a => a.year))].sort((a, b) => (a === '상시') - (b === '상시') || b.localeCompare(a))];
    const cats = ['전체', ...new Set(acts.map(a => a.category))];
    const render = () => {
      document.getElementById('year-tabs').innerHTML = years.map(y =>
        `<button class="chip${y === actFilter.year ? ' active' : ''}" role="tab" aria-selected="${y === actFilter.year}" data-year="${esc(y)}">${esc(y)}</button>`).join('');
      document.getElementById('cat-chips').innerHTML = cats.map(c =>
        `<button class="chip${c === actFilter.cat ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
      // 2026 활동은 위 '올해 진행 중인 활동'에 있으므로 전체 보기에서는 사진이 있는 것만 보여요
      const shown = acts.filter(a =>
        (actFilter.year === '전체' ? a.year !== '2026' || list(a.photos).length : a.year === actFilter.year) &&
        (actFilter.cat === '전체' || a.category === actFilter.cat));
      document.getElementById('result-count').textContent = `활동 ${shown.length}건`;
      document.getElementById('act-grid').innerHTML = shown.length
        ? shown.map(actCard).join('')
        : '<div class="empty" style="grid-column:1/-1">이 조건에 맞는 활동이 아직 없어요.</div>';
    };
    render();
    document.getElementById('year-tabs').onclick = e => {
      const c = e.target.closest('[data-year]'); if (!c) return;
      actFilter.year = c.dataset.year; render();
    };
    document.getElementById('cat-chips').onclick = e => {
      const c = e.target.closest('[data-cat]'); if (!c) return;
      actFilter.cat = c.dataset.cat; render();
    };
    document.getElementById('stories').innerHTML = stories.length
      ? `<div class="grid grid-3">${stories.map(s => `
          <article class="card story">
            ${s.photo ? `<img src="${esc(img(s.photo))}" alt="" style="border-radius:12px;margin-bottom:10px">` : ''}
            <div class="meta"><span class="tag">${esc(s.family)}</span> <span class="muted">${esc(s.date)}</span></div>
            ${s.tool ? `<p class="muted" style="font-size:13px">함께한 교구: ${esc(s.tool)}</p>` : ''}
            <p>${esc(s.text)}</p>
          </article>`).join('')}</div>`
      : `<div class="empty">${CHARS.single ? CHARS.single('smile', '#f7a8c8') : ''}<p>아직 등록된 이야기가 없어요. 책상자 체험이나 가족캠프 뒤에 우리 가족의 이야기를 들려주세요!</p><a class="btn btn-dark" href="#apply">책상자 체험단 신청하기</a></div>`;
  }

  async function pageApply() {
    const open = CONFIG.APPLY_OPEN !== false;
    return `
    <section class="page-head"><div class="wrap">
      <p class="eyebrow">책상자 체험단 신청하기</p>
      <h1>성평등 책상자가<br>찾아가요</h1>
      <p>집이나 기관에서 바로 펼쳐 볼 수 있는 성평등 실천 키트예요. 그림책을 읽고 놀이하며 가족과 이웃이 함께 이야기를 나눠 보세요.</p>
    </div></section>

    <section class="section"><div class="wrap box-hero">
      <div>
        <p class="eyebrow">책상자 안에는</p>
        <h2 class="section-title">이런 것들이 들어 있어요</h2>
        <div class="box-items">
          <div class="box-item"><span class="ico">📚</span><div><b>성평등 그림책</b><span>공통 교안 그림책</span></div></div>
          <div class="box-item"><span class="ico">🃏</span><div><b>STACK IT UP 카드게임</b><span>새나가온이 만든 보드게임</span></div></div>
          <div class="box-item"><span class="ico">✏️</span><div><b>활동지</b><span>가족이 함께 쓰는 실천 기록</span></div></div>
          <div class="box-item"><span class="ico">🌟</span><div><b>붙임딱지 · 스티커</b><span>실천 약속 꾸미기</span></div></div>
        </div>
        <p class="muted" style="margin-top:12px;font-size:14px">※ 회차에 따라 구성이 달라질 수 있어요.</p>
      </div>
      <div class="box-art">${CHARS.bookbox ? CHARS.bookbox() : ''}</div>
    </div></section>

    <section class="section"><div class="wrap">
      <p class="eyebrow">참여 방법</p>
      <h2 class="section-title">가정도, 기관도 신청할 수 있어요</h2>
      <div class="tracks">
        <div class="track"><span class="tag tag-pink">가정</span><h3>온라인 가정 체험단</h3>
          <dl><dt>대상</dt><dd>광주광역시에 사는 가족</dd><dt>방식</dt><dd>책상자를 받아 집에서 활동하고 실천 이야기를 나눠요</dd><dt>규모</dt><dd>회차별 모집 (2026년 125명)</dd></dl></div>
        <div class="track"><span class="tag tag-sky">기관 · 단체</span><h3>찾아가는 책상자 교육</h3>
          <dl><dt>대상</dt><dd>작은도서관, 학교 학부모회, 돌봄기관, 마을단체</dd><dt>방식</dt><dd>새나가온 활동가가 찾아가 책상자로 교육을 진행해요</dd><dt>규모</dt><dd>2026년 10회 이상</dd></dl></div>
      </div>
    </div></section>

    <section class="section"><div class="wrap">
      <div class="flow">
        <div class="flow-step"><div class="n">STEP 1</div><div class="ico">📝</div><b>신청</b><span>아래 신청서 작성</span></div>
        <div class="flow-step"><div class="n">STEP 2</div><div class="ico">📩</div><b>선정 안내</b><span>문자·메일로 알려 드려요</span></div>
        <div class="flow-step"><div class="n">STEP 3</div><div class="ico">📦</div><b>책상자 활동</b><span>받아서 함께 읽고 놀아요</span></div>
        <div class="flow-step"><div class="n">STEP 4</div><div class="ico">💬</div><b>이야기 나누기</b><span>실천 기록과 후기 공유</span></div>
      </div>
    </div></section>

    <section class="section" id="apply-form"><div class="wrap">
      <div class="form-card">
        <h2 class="section-title">책상자 체험단 신청서</h2>
        <p class="form-status${open ? '' : ' closed'}">${open ? '● 모집 중' : '● 모집 마감'} · ${esc(CONFIG.APPLY_ROUND || '')}</p>
        ${open ? applyForm() : `<p class="muted">지금은 모집 기간이 아니에요. 다음 회차 소식은 <a href="mailto:${esc(CONFIG.CONTACT_EMAIL)}">${esc(CONFIG.CONTACT_EMAIL)}</a>로 문의해 주세요.</p>`}
      </div>
    </div></section>

    <section class="section"><div class="wrap faq" style="max-width:760px">
      <p class="eyebrow">자주 묻는 질문</p>
      <h2 class="section-title">궁금한 점이 있나요?</h2>
      <details><summary>비용이 드나요?</summary><p>책상자 체험단은 광주광역시 여성친화마을 사업으로 운영되어 별도 참가비가 없어요. 수령 방법에 따라 달라지는 부분은 선정 안내 때 함께 알려 드려요.</p></details>
      <details><summary>아이가 몇 살이면 할 수 있나요?</summary><p>그림책과 카드게임은 유아부터 초등학생 가족이 함께하기 좋아요. 신청서에 자녀 연령대를 적어 주시면 그에 맞춰 안내해 드려요.</p></details>
      <details><summary>광주 밖에 살아도 신청할 수 있나요?</summary><p>2026년 사업은 광주광역시민을 대상으로 해요. 다른 지역은 스마트스토어가 열리면 그곳에서 만나 주세요.</p></details>
      <details><summary>체험 후에는 무엇을 하나요?</summary><p>가족이 실천한 이야기를 짧게 기록해 나눠 주세요. 동의해 주신 이야기는 ‘가족 실천 이야기’에 소개되고 마을 성평등 사례로 쌓여요.</p></details>
      <details><summary>기관 교육은 어떻게 진행되나요?</summary><p>희망 일정과 인원, 대상 연령을 알려 주시면 새나가온 활동가가 찾아가 책상자 그림책과 교구로 교육을 진행해요.</p></details>
    </div></section>`;
  }

  function applyForm() {
    return `<form id="apply" data-type="family" novalidate>
      <div class="seg" role="radiogroup" aria-label="신청 유형">
        <label><input type="radio" name="type" value="family" checked><span>가정 체험단<small>우리 집으로 책상자 받기</small></span></label>
        <label><input type="radio" name="type" value="org"><span>기관 · 단체<small>찾아가는 책상자 교육</small></span></label>
      </div>

      <div data-for="org">
        <div class="field-row">
          <div class="field"><label for="f-org">기관·단체 이름 <span class="req">*</span></label><input id="f-org" name="org" data-req="org"></div>
          <div class="field"><label for="f-headcount">예상 참여 인원</label><input id="f-headcount" name="headcount" inputmode="numeric" placeholder="예: 15명"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="f-orgtarget">대상 연령</label><input id="f-orgtarget" name="orgTarget" placeholder="예: 초등 저학년, 학부모"></div>
          <div class="field"><label for="f-when">희망 일정</label><input id="f-when" name="when" placeholder="예: 11월 둘째 주 평일 오후"></div>
        </div>
      </div>

      <div class="field-row">
        <div class="field"><label for="f-name"><span data-for="family" class="inline">신청자</span><span data-for="org" class="inline">담당자</span> 이름 <span class="req">*</span></label><input id="f-name" name="name" autocomplete="name" required></div>
        <div class="field"><label for="f-phone">연락처 <span class="req">*</span></label><input id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="010-0000-0000" required></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="f-email">이메일</label><input id="f-email" name="email" type="email" autocomplete="email"></div>
        <div class="field"><label for="f-area">사는 동네 / 기관 위치 <span class="req">*</span></label><input id="f-area" name="area" placeholder="예: 서구 치평동" required></div>
      </div>

      <div data-for="family">
        <div class="field"><label>함께할 자녀 연령대</label>
          <div class="checks">${['유아(5~7세)', '초등 저학년', '초등 고학년', '중학생 이상', '자녀 없음'].map(v =>
            `<label><input type="checkbox" name="kids" value="${v}">${v}</label>`).join('')}</div>
        </div>
        <div class="field"><label for="f-receive">수령 방법</label>
          <select id="f-receive" name="receive"><option>새나가온 사무실 방문 수령</option><option>택배 수령</option></select>
          <span class="hint">택배 주소는 선정 후 따로 여쭤봐요.</span>
        </div>
      </div>

      <div class="field"><label for="f-why">신청 동기 · 하고 싶은 말</label><textarea id="f-why" name="message" rows="4" placeholder="책상자로 가족과 어떤 이야기를 나누고 싶은지 자유롭게 적어 주세요."></textarea></div>

      <div class="agree">
        <label><input type="checkbox" name="agreePrivacy" value="Y" required> <span><b>[필수]</b> 개인정보 수집·이용에 동의합니다.</span></label>
        <details><summary>자세히 보기</summary>수집 항목: 이름, 연락처, 이메일, 동네(기관 위치), 자녀 연령대 / 이용 목적: 책상자 체험단 선정과 안내, 사업 결과 보고 통계 / 보유 기간: 2026년 사업 종료 후 1년. 동의하지 않으면 신청할 수 없어요.</details>
        <label><input type="checkbox" name="agreeStory" value="Y"> <span>[선택] 체험 후기와 사진을 누리집과 사례집에 소개하는 데 동의합니다. (아이 얼굴은 흐리게 처리해요)</span></label>
      </div>
      <button class="btn btn-primary" type="submit" style="width:100%;justify-content:center">신청하기</button>
      <div id="form-msg" aria-live="polite"></div>
    </form>`;
  }

  function afterApply() {
    const form = document.getElementById('apply');
    if (!form) return;
    form.addEventListener('change', e => {
      if (e.target.name === 'type') form.dataset.type = e.target.value;
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = document.getElementById('form-msg');
      const type = form.dataset.type;
      const missing = [...form.querySelectorAll('[required], [data-req]')]
        .filter(el => (!el.dataset.req || el.dataset.req === type))
        .filter(el => el.type === 'checkbox' ? !el.checked : !el.value.trim());
      if (missing.length) {
        msg.className = 'form-msg err';
        msg.textContent = '필수 항목(*)과 개인정보 동의를 확인해 주세요.';
        missing[0].focus();
        return;
      }
      const fd = new FormData(form);
      const data = new URLSearchParams();
      data.append('submittedAt', new Date().toLocaleString('ko-KR'));
      data.append('typeLabel', type === 'org' ? '기관·단체' : '가정');
      for (const [k, v] of fd) {
        if (k === 'kids') continue;
        data.append(k, v);
      }
      data.append('kids', fd.getAll('kids').join(', '));
      if (!CONFIG.APPLY_ENDPOINT) {
        msg.className = 'form-msg err';
        msg.innerHTML = `온라인 접수를 준비하고 있어요. 지금은 <a href="mailto:${esc(CONFIG.CONTACT_EMAIL)}?subject=${encodeURIComponent('책상자 체험단 신청')}">${esc(CONFIG.CONTACT_EMAIL)}</a>로 신청해 주세요.`;
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '보내는 중…';
      try {
        await fetch(CONFIG.APPLY_ENDPOINT, { method: 'POST', mode: 'no-cors', body: data });
        form.reset(); form.dataset.type = 'family';
        msg.className = 'form-msg ok';
        msg.textContent = '신청이 접수되었어요! 선정 결과는 문자나 메일로 알려 드릴게요. 고맙습니다 💜';
      } catch {
        msg.className = 'form-msg err';
        msg.textContent = '전송에 실패했어요. 잠시 뒤 다시 시도하거나 메일로 신청해 주세요.';
      } finally {
        btn.disabled = false; btn.textContent = '신청하기';
      }
    });
  }

  /* ---------- router ---------- */
  const ROUTES = {
    home: [pageHome],
    about: [pageAbout, () => window.renderNetwork && window.renderNetwork(document.getElementById('network'))],
    tools: [pageTools, afterTools],
    activities: [pageActivities, afterActivities],
    apply: [pageApply, afterApply]
  };
  async function route() {
    const key = (location.hash.replace('#', '').split('/')[0]) || 'home';
    const [page, after] = ROUTES[key] || ROUTES.home;
    if (!modal.hidden) closeModal();
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.route === key));
    document.getElementById('float-cta').hidden = key === 'apply';
    app.innerHTML = '<div class="loading">불러오는 중…</div>';
    app.innerHTML = await page();
    if (after) await after();
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', route);

  if (window.SAENAGAON_CHARS) document.getElementById('logo-mark').innerHTML = window.SAENAGAON_CHARS.logo();
  document.getElementById('footer-sns').innerHTML = [['BAND_URL', '밴드'], ['INSTAGRAM_URL', '인스타'], ['YOUTUBE_URL', '유튜브']]
    .filter(([k]) => CONFIG[k])
    .map(([k, name]) => `<a href="${esc(CONFIG[k])}" target="_blank" rel="noopener" aria-label="새나가온 ${name}">${name.slice(0, 2)}</a>`).join('');
  const footerMail = document.getElementById('footer-mail');
  footerMail.textContent = CONFIG.CONTACT_EMAIL;
  footerMail.href = `mailto:${CONFIG.CONTACT_EMAIL}`;
  route();
})();
