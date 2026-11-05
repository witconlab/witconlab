// E-book viewer (view.html): flip through the zine, mark it done, download the PDF.
import { call, getSession, clearSession, getAdminToken, fetchPhoto } from './api.js';
import { createPhotoLoader } from './photo-cache.js';
import { ensureFonts, buildPagesPdf, JSPDF_URL, zineText, zineTitle } from './pdf.js';
import { renderPage } from './render.js';
import { newSaveId, backupKeyFor } from './saver.js';

const PAGE_COUNT = 8;
const RATIO = 105 / 148;
const SWIPE_PX = 40;
const TURN_MS = 650;
const FADE_MS = 160;

// The editor's unsaved-work backup for this student (see saver.js).
export function hasUnsavedBackup(storage, name) {
  try { return !!(storage && storage.getItem(backupKeyFor(name))); } catch (e) { return false; }
}

// Same on every screen: front cover alone, inner pages as spreads, back cover alone.
export function spreadsFor() {
  const out = [[1]];
  for (let p = 2; p < PAGE_COUNT; p += 2) out.push([p, p + 1]);
  out.push([PAGE_COUNT]);
  return out;
}

// Which half of the open book each page sits on. A closed book shows the
// front cover on the right half and the back cover on the left half.
export function sidesOf(spread) {
  if (spread.length > 1) return { L: spread[0], R: spread[1] };
  return spread[0] === 1 ? { L: null, R: 1 } : { L: spread[0], R: null };
}

// One page turn from spread `from` to `to` (neighbours only).
// front: the page that lifts; back: what its other side shows once it lands;
// under: the page revealed beneath it; stays: the page on the other half that does not move.
export function turnPlan(spreads, from, to) {
  if (!spreads[from] || !spreads[to] || Math.abs(to - from) !== 1) return null;
  const a = sidesOf(spreads[from]), b = sidesOf(spreads[to]);
  return to > from ? { front: a.R, back: b.L, under: b.R, stays: a.L } : { front: a.L, back: b.R, under: b.L, stays: a.R };
}

if (typeof document !== 'undefined') main();

function main() {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const adminName = params.get('name');
  const adminToken = adminName ? getAdminToken() : null;
  const session = getSession();
  const isAdmin = !!(adminName && adminToken);
  const loadImage = createPhotoLoader({ fetchPhoto: isAdmin ? (src) => fetchPhoto(src, { name: adminName }) : fetchPhoto });
  const unsaved = !isAdmin && hasUnsavedBackup(globalThis.localStorage, session && session.name);

  let zine = null;
  let spreads = [];
  let idx = 0;
  let dims = { w: 0, h: 0, dpr: 1 };
  let cache = new Map(); // page number -> Promise<canvas>
  let book = null; // { el, left, right }
  let gen = 0; // bumps on resize to drop stale renders
  let busy = false;

  const loading = (msg) => { $('loading').innerHTML = ''; const p = document.createElement('p'); p.className = 'hand'; p.textContent = msg; $('loading').append(p); };
  function fatal(msg, link) {
    $('loading').hidden = false;
    loading(msg);
    if (link) { const a = document.createElement('a'); a.className = 'btn'; a.href = link.href; a.textContent = link.text; $('loading').append(a); }
  }

  async function load() {
    if (isAdmin) return (await call('adminGetZine', { adminToken, name: adminName })).zine;
    return (await call('load', { token: session.token })).zine;
  }

  // page size: two pages side by side must fit the stage (phones: fill the width; wide screens: fit the height)
  function sizes() {
    const st = $('stage');
    const aw = st.clientWidth, ah = st.clientHeight - 8;
    const w = Math.floor(Math.min(aw / 2, ah * RATIO));
    const h = Math.floor(w / RATIO);
    return { w: Math.max(w, 60), h: Math.max(h, 80), dpr: Math.min(window.devicePixelRatio || 1, 2) };
  }

  function rangeLabel() {
    const s = spreads[idx];
    return (s.length > 1 ? `${s[0]}–${s[1]}` : `${s[0]}`) + ` / ${PAGE_COUNT}쪽`;
  }

  // Each page is drawn once per layout; the same canvas moves between the book halves and the turning leaf.
  function pageCanvas(n) {
    if (n == null) return Promise.resolve(null);
    if (cache.has(n)) return cache.get(n);
    const c = document.createElement('canvas');
    c.width = Math.round(dims.w * dims.dpr);
    c.height = Math.round(dims.h * dims.dpr);
    c.style.width = dims.w + 'px';
    c.style.height = dims.h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
    const p = renderPage(ctx, zine.pages[n - 1], { width: dims.w, height: dims.h, loadImage, pageNumber: n }).then(() => c);
    cache.set(n, p);
    p.catch(() => { if (cache.get(n) === p) cache.delete(n); });
    return p;
  }

  // closed on the front cover the book is shifted so the cover is centred; on the back cover the other way
  const shiftOf = (i) => { const s = sidesOf(spreads[i]); return s.L == null ? -dims.w / 2 : s.R == null ? dims.w / 2 : 0; };

  function fill(slot, canvas) {
    slot.replaceChildren(...(canvas ? [canvas] : []));
    slot.classList.toggle('has', !!canvas);
  }

  function buildBook() {
    const el = document.createElement('div');
    el.className = 'vw-book';
    el.style.width = dims.w * 2 + 'px';
    el.style.height = dims.h + 'px';
    const left = document.createElement('div'); left.className = 'vw-slot vw-left';
    const right = document.createElement('div'); right.className = 'vw-slot vw-right';
    el.append(left, right);
    $('track').replaceChildren(el);
    book = { el, left, right };
  }

  async function showStatic(i) {
    const my = gen;
    const s = sidesOf(spreads[i]);
    const [L, R] = await Promise.all([pageCanvas(s.L), pageCanvas(s.R)]);
    if (my !== gen) return;
    fill(book.left, L);
    fill(book.right, R);
    book.el.style.transform = `translateX(${shiftOf(i)}px)`;
  }

  function updateChrome() {
    $('count').textContent = rangeLabel();
    $('prev').disabled = idx === 0;
    $('next').disabled = idx === spreads.length - 1;
  }

  const reduceMotion = () => document.documentElement.classList.contains('vw-reduce-motion')
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function shade(parent, cls) {
    const d = document.createElement('div');
    d.className = 'vw-shade ' + cls;
    parent.append(d);
    return d;
  }

  // Turn one page like a real book: the leaf rotates around the spine, its back is the next page.
  async function turn(d) {
    const to = idx + d;
    const plan = turnPlan(spreads, idx, to);
    if (!plan) return;
    const my = gen;
    const from = idx;
    // draw every face the turn needs before it starts, so nothing flashes blank
    const [front, back, under] = await Promise.all([pageCanvas(plan.front), pageCanvas(plan.back), pageCanvas(plan.under)]);
    if (my !== gen) return;
    idx = to;
    updateChrome();
    const fwd = d > 0;
    const moving = fwd ? book.right : book.left; // half the leaf starts on
    const other = fwd ? book.left : book.right; // half the leaf lands on
    const finish = () => {
      fill(other, back);
      fill(moving, under);
      book.el.style.transform = `translateX(${shiftOf(to)}px)`;
    };

    if (reduceMotion()) {
      const out = book.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' });
      await out.finished.catch(() => {});
      if (my !== gen) return;
      finish();
      const fadeIn = book.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS });
      out.cancel();
      await fadeIn.finished.catch(() => {});
      warm(to);
      return;
    }

    const leaf = document.createElement('div');
    leaf.className = 'vw-leaf ' + (fwd ? 'vw-on-right' : 'vw-on-left');
    const fF = document.createElement('div'); fF.className = 'vw-face vw-front ' + (fwd ? 'sp-l' : 'sp-r');
    const fB = document.createElement('div'); fB.className = 'vw-face vw-back ' + (fwd ? 'sp-r' : 'sp-l');
    fF.append(front); // moves the canvas off the book half
    fB.append(back);
    const sF = shade(fF, fwd ? 'to-l' : 'to-r');
    const sB = shade(fB, fwd ? 'to-r' : 'to-l');
    leaf.append(fF, fB);
    fill(moving, under);
    book.el.append(leaf);
    const sUnder = moving.classList.contains('has') ? shade(moving, fwd ? 'to-l' : 'to-r') : null;
    const sOther = other.classList.contains('has') ? shade(other, fwd ? 'to-r' : 'to-l') : null;

    const opt = { duration: TURN_MS, easing: 'ease-in-out', fill: 'forwards' };
    const anims = [
      leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${fwd ? -180 : 180}deg)` }], opt),
      // the lifting page darkens as it stands up, its back lightens as it lies down
      sF.animate([{ opacity: 0 }, { opacity: 0.5 }], { ...opt, duration: TURN_MS / 2, easing: 'ease-in' }),
      sB.animate([{ opacity: 0.5, offset: 0 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0, offset: 1 }], opt),
    ];
    // revealed page comes out of the leaf's shadow; the covered page goes into it
    if (sUnder) anims.push(sUnder.animate([{ opacity: 0.6 }, { opacity: 0 }], opt));
    if (sOther) anims.push(sOther.animate([{ opacity: 0 }, { opacity: 0 , offset: 0.4 }, { opacity: 0.45 }], opt));
    const x0 = shiftOf(from), x1 = shiftOf(to);
    if (x0 !== x1) {
      // opening widens the closed book (cover moves off-centre), closing narrows it again
      book.el.style.transform = `translateX(${x1}px)`;
      anims.push(book.el.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { duration: TURN_MS, easing: 'ease-in-out' }));
    }
    await Promise.all(anims.map((a) => a.finished.catch(() => {})));
    if (my !== gen) return;
    leaf.remove();
    if (sUnder) sUnder.remove();
    if (sOther) sOther.remove();
    finish();
    warm(to);
  }

  // warm neighbours so the next turn starts instantly
  function warm(i) {
    for (const j of [i - 1, i + 1]) if (spreads[j]) spreads[j].forEach((n) => pageCanvas(n).catch(() => {}));
  }

  function go(d) { if (!busy) { busy = true; turn(d).catch(() => {}).finally(() => { busy = false; }); } }

  async function layout(keepPage) {
    gen++;
    cache = new Map();
    dims = sizes();
    spreads = spreadsFor();
    const target = keepPage ?? spreads[idx][0];
    idx = Math.max(0, spreads.findIndex((s) => s.includes(target)));
    buildBook();
    updateChrome();
    await showStatic(idx);
    warm(idx);
  }

  // ----- stamp / done toggle -----
  function paintDone() {
    const b = $('doneBtn');
    b.setAttribute('aria-pressed', String(!!zine.done));
    $('zineTitle').textContent = zineTitle(zine);
    let st = $('stage').querySelector('.vw-stamp');
    if (zine.done && !st) {
      st = document.createElement('span'); st.className = 'vw-stamp hand'; st.textContent = '완성!';
      $('stage').append(st);
    } else if (!zine.done && st) st.remove();
  }

  async function toggleDone() {
    const b = $('doneBtn');
    if (unsaved) return;
    b.disabled = true;
    const next = { ...zine, done: !zine.done };
    try {
      const res = await call('save', { token: session.token, zine: next, saveId: newSaveId() });
      zine = { ...next, rev: res.rev };
      paintDone();
    } catch (e) {
      if (e && e.code === 'CONFLICT') { location.reload(); return; }
      if (e && e.code === 'AUTH') { clearSession(); location.replace('index.html'); return; }
      $('pdfWarn').hidden = false;
      $('pdfWarn').textContent = '저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
    } finally { b.disabled = unsaved; }
  }

  // ----- PDF -----
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSPDF_URL;
      s.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF missing')));
      s.onerror = () => reject(new Error('jsPDF load failed'));
      document.head.append(s);
    });
  }
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();

  async function downloadPdf() {
    const btn = $('pdfBtn'), warn = $('pdfWarn');
    btn.disabled = true;
    warn.hidden = true;
    btn.textContent = 'PDF 만드는 중…';
    try {
      const jsPDF = await loadJsPdf();
      const { blob, failed } = await buildPagesPdf(zine, {
        loadImage, jsPDF, ensureFonts,
        onProgress: (d, t) => { btn.textContent = `PDF 만드는 중… ${d}/${t}`; },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName(zine.name || adminName || '진')}_${safeName(zineTitle(zine)) || '진'}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (failed.length > 0) {
        warn.textContent = `사진 ${failed.length}장을 불러오지 못해 PDF에서 빠졌어요. 인터넷 연결을 확인하고 다시 받아 주세요.`;
        warn.hidden = false;
      }
    } catch (e) {
      warn.textContent = 'PDF를 만들지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
      warn.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'PDF 내려받기';
    }
  }

  // ----- input -----
  function bindInput() {
    $('prev').addEventListener('click', () => go(-1));
    $('next').addEventListener('click', () => go(1));
    $('doneBtn').addEventListener('click', toggleDone);
    $('pdfBtn').addEventListener('click', downloadPdf);
    document.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,textarea,select')) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    });
    const st = $('stage');
    let sx = null, sy = 0;
    st.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    st.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        // a tap on the right page turns forward, on the left page backward
        const r = st.getBoundingClientRect();
        const f = (e.clientX - r.left) / r.width;
        if (f > 0.55) go(1); else if (f < 0.45) go(-1);
      }
    });
    st.addEventListener('pointercancel', () => { sx = null; });
    let timer = null;
    let lastW = window.innerWidth, lastH = window.innerHeight;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (window.innerWidth === lastW && window.innerHeight === lastH) return;
        lastW = window.innerWidth; lastH = window.innerHeight;
        layout();
      }, 200);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  (async () => {
    if (!isAdmin && !(session && session.token)) { location.replace('index.html'); return; }
    try {
      zine = await load();
    } catch (e) {
      if (e && e.code === 'AUTH') {
        if (!isAdmin) { clearSession(); location.replace('index.html'); return; }
        fatal('관리자로 다시 입장해 주세요.', { href: 'admin.html', text: '관리자 화면' });
        return;
      }
      fatal(e && e.code ? '진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' : '인터넷 연결을 확인해 주세요.');
      return;
    }
    if (!isAdmin) {
      $('editBtn').hidden = false;
      $('doneBtn').hidden = false;
      $('who').hidden = false;
      $('whoName').textContent = (session.name || '나') + '의 진';
      $('switchUser').addEventListener('click', () => {
        if (!window.confirm(`지금은 "${session.name || '나'}"(으)로 들어와 있어요.\n다른 이름으로 들어갈까요?`)) return;
        clearSession();
        location.href = 'index.html';
      });
      if (unsaved) {
        // the editor still holds changes the server has not confirmed: finish saving there first
        $('unsaved').hidden = false;
        $('doneBtn').disabled = true;
        $('doneBtn').title = '편집기에서 먼저 저장해 주세요';
      }
    } else {
      $('who').hidden = false;
      $('whoName').textContent = adminName + '의 진';
      $('switchUser').hidden = true;
    }
    paintDone();
    bindInput();
    await Promise.race([ensureFonts(document, zineText([zine])).catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    await layout(1);
    $('loading').hidden = true;
  })();
}
