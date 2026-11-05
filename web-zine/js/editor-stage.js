// Editor page canvas: print-matched background/title layers, element DOM, selection box and gestures.
import { renderPage, drawTitle, wrapText, HAND, LINE_HEIGHT } from './render.js';
import { TEXT_COLORS, outsideSafeArea } from './model.js';
import { getSticker } from './stickers.js';
import { dragDelta, pinch, applyTransform } from './gestures.js';

export const PAGE_RATIO = 105 / 148; // width / height
const MIN = 0.05;
const MAX = 1.5;
const TAP_SLOP = 6;
const TITLE_PX = 0.06; // title font size as a fraction of page height (matches render.js)

let measureCtx = null;
function measurer(px) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${px}px ${HAND}`;
  return (s) => measureCtx.measureText(s).width;
}

// Height (page fraction) that fits a text element's wrapped lines, using a print-sized reference page.
export function fitTextHeight(el) {
  const H = 1480, W = H * PAGE_RATIO;
  const px = (el.style?.size ?? 0.055) * H;
  const n = Math.max(1, wrapText(measurer(px), el.text || '', el.w * W).length);
  return Math.min(MAX, (n * px * LINE_HEIGHT) / H);
}

// Uniform scale factor clamped so neither w nor h leaves [MIN, MAX].
export function clampScale(el, s) {
  const lo = Math.max(MIN / el.w, MIN / el.h);
  const hi = Math.min(MAX / el.w, MAX / el.h);
  return Math.min(hi, Math.max(lo, s));
}

function normDeg(d) {
  let r = ((((d + 180) % 360) + 360) % 360) - 180;
  const snap = Math.round(r / 90) * 90;
  if (Math.abs(r - snap) < 3) r = snap;
  return r === -180 ? 180 : r;
}

function transformed(base, t) {
  const scale = clampScale(base, t.scale ?? 1);
  const r = applyTransform(base, { ...t, scale });
  const out = { ...base, ...r, rotate: normDeg(r.rotate) };
  if (base.type === 'text') out.style = { ...base.style, size: (base.style?.size ?? 0.055) * scale };
  return out;
}

const mk = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * app: { page(), pageNumber(), selectedId, select(id), findEl(id), commitElement(id, patch), commitTitleBox(box),
 *        tapElement(id), tapTitle(), localUrl(el), uploadState(el), loadImage(src), onRendered(els) }
 */
export function createStage(host, app) {
  const page = mk('div', 'ed-page');
  const bg = mk('canvas', 'ed-layer');
  const titleHit = mk('div', 'ed-title-hit');
  const elLayer = mk('div', 'ed-els');
  const titleCv = mk('canvas', 'ed-layer ed-title-layer');
  const sel = mk('div', 'ed-sel');
  sel.innerHTML = '<span class="ed-rot-stem"></span><span class="ed-h ed-h-rot" data-handle="rotate"></span>'
    + ['nw', 'ne', 'sw', 'se'].map((c) => `<span class="ed-h ed-h-${c}" data-handle="scale"></span>`).join('');
  titleHit.setAttribute('aria-label', '제목 (끌어서 옮기기)');
  page.append(bg, titleHit, elLayer, titleCv, sel);
  host.append(page);

  let W = 0, H = 0, dpr = 1;
  const nodes = new Map(); // id -> { node, key }
  let bgKey = '', titleKey = '';
  let live = null; // { id, el } while manipulating an element, or { titleBox } while moving the title
  let raf = 0;

  function layout() {
    const w0 = host.clientWidth, h0 = host.clientHeight;
    if (!w0 || !h0) return false;
    let w = w0, h = w / PAGE_RATIO;
    if (h > h0) { h = h0; w = h * PAGE_RATIO; }
    w = Math.floor(w); h = Math.floor(w / PAGE_RATIO);
    const d = Math.min(window.devicePixelRatio || 1, 3);
    if (w === W && h === H && d === dpr) return false;
    W = w; H = h; dpr = d;
    page.style.width = W + 'px';
    page.style.height = H + 'px';
    return true;
  }

  function sizeCanvas(cv) {
    const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    return { cw, ch };
  }

  function drawBg(p, n) {
    const { cw, ch } = sizeCanvas(bg);
    renderPage(bg.getContext('2d'), { ...p, title: '', elements: [] },
      { width: cw, height: ch, pageNumber: n, showSafeArea: true, loadImage: async () => null }).catch(() => {});
  }

  function drawTitleLayer(p) {
    const { cw, ch } = sizeCanvas(titleCv);
    const ctx = titleCv.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    drawTitle(ctx, p, cw, ch);
    const title = (p.title || '').trim();
    titleHit.hidden = !title;
    if (!title) return;
    const box = p.titleBox || { x: 0.06, y: 0.04, w: 0.88 };
    const px = TITLE_PX * H;
    const m = measurer(px);
    const lines = wrapText(m, p.title, box.w * W);
    const tw = Math.min(box.w * W, Math.max(...lines.map(m))) + W * 0.06;
    const cx = (box.x + box.w / 2) * W;
    Object.assign(titleHit.style, {
      left: cx - tw / 2 + 'px', top: box.y * H + 'px', width: tw + 'px', height: lines.length * px * LINE_HEIGHT + 'px',
    });
  }

  function contentKey(el, state) {
    const sized = el.type === 'text' || (el.src || '').startsWith('builtin:') || el.type === 'photo';
    return JSON.stringify([el.type, el.src, el.frame, el.text, el.style, !!el.pending, state, app.localUrl(el) || '',
      sized ? Math.round(el.w * W) : 0, sized ? Math.round(el.h * H) : 0, dpr]);
  }

  function setImg(img, el) {
    const local = app.localUrl(el);
    if (local) { img.src = local; return; }
    if (!el.src) return;
    Promise.resolve(app.loadImage(el.src)).then((im) => {
      if (im) img.src = im.src; else throw new Error('missing');
    }).catch(() => img.closest('.ed-el')?.classList.add('is-broken'));
  }

  function fillContent(node, el, state) {
    node.textContent = '';
    node.classList.remove('is-broken');
    if (el.type === 'text') {
      const px = (el.style?.size ?? 0.055) * H;
      const t = mk('div', 'ed-text');
      t.style.fontSize = px + 'px';
      t.style.color = TEXT_COLORS[el.style?.color] || el.style?.color || TEXT_COLORS.ink;
      t.style.textAlign = el.style?.align || 'center';
      t.textContent = wrapText(measurer(px), el.text || '', el.w * W).join('\n');
      node.append(t);
      return;
    }
    if (el.type === 'photo') {
      const pol = el.frame === 'polaroid';
      const box = mk('div', pol ? 'ed-photo ed-polaroid' : 'ed-photo');
      if (pol) box.style.boxShadow = `0 ${0.012 * el.w * W}px ${0.04 * el.w * W}px rgba(0,0,0,.15)`;
      const img = mk('img', 'ed-cover');
      img.alt = ''; img.draggable = false;
      box.append(img);
      node.append(box);
      setImg(img, el);
      if (state === 'uploading') node.append(Object.assign(mk('span', 'ed-el-badge'), { textContent: '올리는 중…' }));
      if (state === 'failed') node.append(Object.assign(mk('span', 'ed-el-fail'), { textContent: '올리기 실패 · 눌러서 다시' }));
      return;
    }
    const src = el.src || '';
    if (src.startsWith('builtin:')) {
      const st = getSticker(src.slice(8));
      if (!st) { node.classList.add('is-broken'); return; }
      if (st.draw) {
        const cv = mk('canvas', 'ed-fill');
        const w = Math.max(1, el.w * W), h = Math.max(1, el.h * H);
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        const ctx = cv.getContext('2d');
        ctx.scale(cv.width / w, cv.height / h);
        st.draw(ctx, w, h);
        node.append(cv);
        return;
      }
      const img = mk('img', 'ed-contain');
      img.alt = ''; img.draggable = false;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(st.svg);
      node.append(img);
      return;
    }
    const img = mk('img', 'ed-contain');
    img.alt = ''; img.draggable = false;
    node.append(img);
    setImg(img, el);
  }

  function place(n, el) {
    const s = n.style;
    s.left = el.x * 100 + '%';
    s.top = el.y * 100 + '%';
    s.width = el.w * 100 + '%';
    s.height = el.h * 100 + '%';
    s.transform = `rotate(${el.rotate || 0}deg)`;
  }

  function renderEl(el) {
    let rec = nodes.get(el.id);
    if (!rec) {
      const node = mk('div', 'ed-el');
      node.dataset.id = el.id;
      elLayer.append(node);
      rec = { node, key: '' };
      nodes.set(el.id, rec);
    }
    const { node } = rec;
    place(node, el);
    node.style.zIndex = el.z;
    const state = app.uploadState(el);
    node.classList.toggle('is-out', outsideSafeArea(el));
    node.classList.toggle('is-pending', !!el.pending);
    node.classList.toggle('is-selected', el.id === app.selectedId);
    const key = contentKey(el, state);
    if (key !== rec.key) { rec.key = key; fillContent(node, el, state); }
  }

  function render() {
    if (!W) return;
    const p = app.page();
    const n = app.pageNumber();
    const k = JSON.stringify([p.background, p.pattern, p.frameLine, n, W, H, dpr]);
    if (k !== bgKey) { bgKey = k; drawBg(p, n); }
    const tp = live && live.titleBox ? { ...p, titleBox: live.titleBox } : p;
    const tk = JSON.stringify([tp.title, tp.titleBox, tp.titleHighlight, W, H, dpr]);
    if (tk !== titleKey) { titleKey = tk; drawTitleLayer(tp); }
    const els = p.elements.map((e) => (live && live.id === e.id ? live.el : e));
    const seen = new Set();
    for (const el of els) { seen.add(el.id); renderEl(el); }
    for (const [id, rec] of nodes) if (!seen.has(id)) { rec.node.remove(); nodes.delete(id); }
    const s = els.find((e) => e.id === app.selectedId);
    sel.hidden = !s;
    if (s) place(sel, s);
    app.onRendered(els);
  }

  function requestRender() {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
  }

  // ---- gestures ----
  const pointers = new Map();
  let g = null;
  const pt = (e) => { const r = page.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const centerOf = (el) => ({ x: (el.x + el.w / 2) * W, y: (el.y + el.h / 2) * H });
  const setLive = (el) => { live = { id: el.id, el }; requestRender(); };

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { page.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, pt(e));
    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2) return;
    const p = pt(e);
    const handle = e.target.closest('[data-handle]');
    const cur = app.selectedId && app.findEl(app.selectedId);
    if (handle && cur) {
      g = { kind: handle.dataset.handle, base: cur, start: p, center: centerOf(cur) };
      return;
    }
    const node = e.target.closest('.ed-el');
    if (node) {
      const id = node.dataset.id;
      const wasSelected = app.selectedId === id;
      if (!wasSelected) app.select(id);
      g = { kind: 'drag', id, base: app.findEl(id), start: p, moved: false, wasSelected };
      return;
    }
    if (e.target.closest('.ed-title-hit')) {
      g = { kind: 'title', base: app.page().titleBox || { x: 0.06, y: 0.04, w: 0.88 }, start: p, moved: false };
      return;
    }
    g = { kind: 'empty', start: p, moved: false };
  }

  function startPinch() {
    const id = (g && g.id) || app.selectedId;
    if (!id || (g && g.kind === 'title')) { g = { kind: 'none' }; return; }
    const base = live && live.id === id ? live.el : app.findEl(id);
    if (!base) { g = { kind: 'none' }; return; }
    const ids = [...pointers.keys()];
    g = { kind: 'pinch', id, base, ids, a0: pointers.get(ids[0]), b0: pointers.get(ids[1]) };
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pt(e);
    pointers.set(e.pointerId, p);
    if (!g) return;
    if ((g.kind === 'drag' || g.kind === 'title' || g.kind === 'empty') && !g.moved) {
      if (dist(p, g.start) < TAP_SLOP) return;
      g.moved = true;
    }
    if (g.kind === 'drag') {
      const d = dragDelta(g.start, p, { w: W, h: H });
      setLive(transformed(g.base, { dx: d.dx, dy: d.dy }));
    } else if (g.kind === 'scale') {
      const d0 = dist(g.center, g.start);
      setLive(transformed(g.base, { scale: d0 > 0 ? dist(g.center, p) / d0 : 1 }));
    } else if (g.kind === 'rotate') {
      const a0 = Math.atan2(g.start.y - g.center.y, g.start.x - g.center.x);
      const a1 = Math.atan2(p.y - g.center.y, p.x - g.center.x);
      setLive(transformed(g.base, { rotateDeg: ((a1 - a0) * 180) / Math.PI }));
    } else if (g.kind === 'pinch') {
      const a = pointers.get(g.ids[0]), b = pointers.get(g.ids[1]);
      if (!a || !b) return;
      const { scale, rotateDeg } = pinch(g.a0, g.b0, a, b);
      const dx = ((a.x + b.x) / 2 - (g.a0.x + g.b0.x) / 2) / W;
      const dy = ((a.y + b.y) / 2 - (g.a0.y + g.b0.y) / 2) / H;
      setLive(transformed(g.base, { dx, dy, scale, rotateDeg }));
    } else if (g.kind === 'title') {
      const d = dragDelta(g.start, p, { w: W, h: H });
      const b = g.base;
      const x = Math.min(1 - b.w / 2, Math.max(-b.w / 2, b.x + d.dx));
      const y = Math.min(0.92, Math.max(0, b.y + d.dy));
      live = { titleBox: { ...b, x, y } };
      requestRender();
    }
  }

  function finish(cancelled) {
    const cur = g;
    g = null;
    const l = live;
    live = null;
    if (!cur) return;
    if (cur.kind === 'title') {
      if (cur.moved && l && l.titleBox && !cancelled) app.commitTitleBox({ x: l.titleBox.x, y: l.titleBox.y });
      else if (!cur.moved && !cancelled) app.tapTitle();
      render();
      return;
    }
    if (cur.kind === 'empty') {
      if (!cur.moved && !cancelled) app.select(null);
      return;
    }
    if (l && l.el && !cancelled) {
      const { x, y, w, h, rotate, style } = l.el;
      app.commitElement(l.id, l.el.type === 'text' ? { x, y, w, h, rotate, style } : { x, y, w, h, rotate });
    } else {
      render();
    }
    if (cur.kind === 'drag' && !cur.moved && cur.wasSelected && !cancelled) app.tapElement(cur.id);
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const cancelled = e.type === 'pointercancel';
    if (g && g.kind === 'pinch') { finish(cancelled); g = { kind: 'none' }; }
    if (pointers.size === 0) {
      if (g && g.kind === 'none') g = null;
      else finish(cancelled);
    }
  }

  page.addEventListener('pointerdown', onDown);
  page.addEventListener('pointermove', onMove);
  page.addEventListener('pointerup', onUp);
  page.addEventListener('pointercancel', onUp);
  page.addEventListener('lostpointercapture', (e) => { if (pointers.has(e.pointerId)) onUp(e); });
  page.addEventListener('contextmenu', (e) => e.preventDefault());

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (layout()) render(); }).observe(host);
  window.addEventListener('resize', () => { if (layout()) render(); });
  layout();

  return {
    render,
    busy: () => g !== null,
  };
}
