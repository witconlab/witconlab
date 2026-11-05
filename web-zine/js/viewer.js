// E-book viewer (view.html): flip through the zine, mark it done, download the PDF.
import { call, getSession, clearSession, getAdminToken, fetchPhoto } from './api.js';
import { createPhotoLoader } from './photo-cache.js';
import { ensureFonts, buildPagesPdf, JSPDF_URL, zineText, zineTitle } from './pdf.js';
import { renderPage } from './render.js';
import { newSaveId, backupKeyFor } from './saver.js';

export const WIDE_MIN = 768;
const PAGE_COUNT = 8;
const RATIO = 105 / 148;
const SWIPE_PX = 40;

// The editor's unsaved-work backup for this student (see saver.js).
export function hasUnsavedBackup(storage, name) {
  try { return !!(storage && storage.getItem(backupKeyFor(name))); } catch (e) { return false; }
}

export function spreadsFor(wide) {
  if (!wide) return Array.from({ length: PAGE_COUNT }, (_, i) => [i + 1]);
  const out = [[1]];
  for (let p = 2; p < PAGE_COUNT; p += 2) out.push([p, p + 1]);
  out.push([PAGE_COUNT]);
  return out;
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
  let wide = false;
  let idx = 0;
  let dims = { w: 0, h: 0, dpr: 1 };
  let cache = new Map(); // page number -> canvas
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

  function sizes() {
    const st = $('stage');
    const aw = st.clientWidth, ah = st.clientHeight - 8;
    wide = window.innerWidth >= WIDE_MIN;
    const cols = wide ? 2 : 1;
    let h = Math.min(ah, aw / (cols * RATIO));
    let w = Math.floor(h * RATIO);
    h = Math.floor(w / RATIO);
    return { w: Math.max(w, 60), h: Math.max(h, 80), dpr: Math.min(window.devicePixelRatio || 1, 2) };
  }

  function rangeLabel() {
    const s = spreads[idx];
    return (s.length > 1 ? `${s[0]}–${s[1]}` : `${s[0]}`) + ` / ${PAGE_COUNT}쪽`;
  }

  async function pageCanvas(n) {
    if (cache.has(n)) return cache.get(n);
    const my = gen;
    const c = document.createElement('canvas');
    c.width = Math.round(dims.w * dims.dpr);
    c.height = Math.round(dims.h * dims.dpr);
    c.style.width = dims.w + 'px';
    c.style.height = dims.h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
    await renderPage(ctx, zine.pages[n - 1], { width: dims.w, height: dims.h, loadImage, pageNumber: n });
    if (my === gen) cache.set(n, c);
    return c;
  }

  async function spreadEl(i) {
    const el = document.createElement('div');
    const pages = spreads[i];
    el.className = 'vw-spread' + (pages.length > 1 ? ' two' : '');
    const cs = await Promise.all(pages.map((n) => pageCanvas(n)));
    // a cached canvas lives in one place only; clone pixels when it is already mounted
    for (const c of cs) {
      if (c.parentNode) {
        const k = document.createElement('canvas');
        k.width = c.width; k.height = c.height; k.style.width = c.style.width; k.style.height = c.style.height;
        k.getContext('2d').drawImage(c, 0, 0);
        el.append(k);
      } else el.append(c);
    }
    return el;
  }

  function updateChrome() {
    $('count').textContent = rangeLabel();
    $('prev').disabled = idx === 0;
    $('next').disabled = idx === spreads.length - 1;
  }

  async function show(i, dir = 0) {
    if (i < 0 || i >= spreads.length) return;
    const my = gen;
    const track = $('track');
    const next = await spreadEl(i);
    if (my !== gen) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const old = track.firstElementChild;
    idx = i;
    updateChrome();
    if (!dir || !old || reduce) { track.replaceChildren(next); return; }
    const w = $('stage').clientWidth;
    track.replaceChildren(old);
    track.style.position = 'relative';
    // slide: old goes out, new comes in from the side
    const inc = document.createElement('div');
    inc.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
    inc.append(next);
    inc.style.transform = `translateX(${dir * w}px)`;
    track.append(inc);
    old.style.transition = inc.style.transition = 'transform .3s ease';
    void inc.offsetWidth;
    old.style.transform = `translateX(${-dir * w}px)`;
    inc.style.transform = 'translateX(0)';
    await new Promise((r) => setTimeout(r, 310));
    if (my !== gen) return;
    track.style.position = '';
    next.style.transform = '';
    track.replaceChildren(next);
    // warm neighbours so the next flip is instant
    for (const j of [i - 1, i + 1]) if (spreads[j]) spreads[j].forEach((n) => pageCanvas(n).catch(() => {}));
  }

  function go(d) { if (!busy) { busy = true; show(idx + d, d).finally(() => { busy = false; }); } }

  async function layout(keepPage) {
    gen++;
    cache = new Map();
    dims = sizes();
    spreads = spreadsFor(wide);
    const target = keepPage ?? spreads[idx][0];
    idx = Math.max(0, spreads.findIndex((s) => s.includes(target)));
    $('track').replaceChildren();
    await show(idx, 0);
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
