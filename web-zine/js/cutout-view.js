// Full-screen "make a sticker" view: trace around the subject with a finger (freehand lasso), or place a
// circle / heart / rounded-square shape. 완성 gives a transparent PNG: the inside of the outline with a white
// sticker border and a soft shadow, cropped to its bounding box, long edge <= 900 px.
// openCutout({ src }) -> Promise<{ blob, w, h } | null>   (null = cancelled)
import { loadImg } from './crop-view.js';

export const STICKER_MAX = 900;
const PAD = 18;
const HANDLE_R = 26; // touch radius of the shape's resize handle (css px)
const MODES = [['lasso', '따라 그리기'], ['circle', '동그라미'], ['heart', '하트'], ['rect', '네모']];

const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n; };

// Chaikin corner cutting on a closed polygon (2 rounds): turns a shaky finger line into a smooth outline.
export function smoothClosed(pts, rounds = 2) {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}

// Drop points closer than `min` to the previous kept point (keeps paths light).
function thin(pts, min) {
  const out = [];
  for (const q of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= min) out.push(q);
  }
  return out;
}

export function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Heart outline in a unit box (cubic segments: [c1x, c1y, c2x, c2y, x, y]).
const HEART_START = [0.5, 0.18];
const HEART = [
  [0.5, 0.14, 0.44, 0, 0.26, 0], [0.04, 0, 0, 0.2, 0, 0.3], [0, 0.52, 0.18, 0.72, 0.5, 1],
  [0.82, 0.72, 1, 0.52, 1, 0.3], [1, 0.2, 0.96, 0, 0.74, 0], [0.56, 0, 0.5, 0.14, 0.5, 0.18],
];

// Adds an outline (in image px) to ctx's current path, mapped with scale s and offset (ox, oy).
export function traceOutline(ctx, o, s = 1, ox = 0, oy = 0) {
  const X = (x) => ox + x * s, Y = (y) => oy + y * s;
  if (o.kind === 'lasso') {
    const p = o.pts;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(p[p.length - 1], p[0]);
    ctx.moveTo(X(m0[0]), Y(m0[1]));
    for (let i = 0; i < p.length; i++) {
      const m = mid(p[i], p[(i + 1) % p.length]);
      ctx.quadraticCurveTo(X(p[i][0]), Y(p[i][1]), X(m[0]), Y(m[1]));
    }
    ctx.closePath();
    return;
  }
  const { x, y, w, h } = o;
  if (o.kind === 'circle') {
    ctx.moveTo(X(x + w), Y(y + h / 2));
    ctx.ellipse(X(x + w / 2), Y(y + h / 2), (w / 2) * s, (h / 2) * s, 0, 0, Math.PI * 2);
  } else if (o.kind === 'rect') {
    const r = Math.min(w, h) * 0.16;
    ctx.moveTo(X(x + r), Y(y));
    ctx.arcTo(X(x + w), Y(y), X(x + w), Y(y + h), r * s);
    ctx.arcTo(X(x + w), Y(y + h), X(x), Y(y + h), r * s);
    ctx.arcTo(X(x), Y(y + h), X(x), Y(y), r * s);
    ctx.arcTo(X(x), Y(y), X(x + w), Y(y), r * s);
  } else if (o.kind === 'heart') {
    const U = (u, v) => [X(x + u * w), Y(y + v * h)];
    ctx.moveTo(...U(...HEART_START));
    for (const [a, b, c2, d, e, f] of HEART) ctx.bezierCurveTo(...U(a, b), ...U(c2, d), ...U(e, f));
  }
  ctx.closePath();
}

export const outlineBox = (o) => (o.kind === 'lasso' ? bboxOf(o.pts) : { x: o.x, y: o.y, w: o.w, h: o.h });

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// The sticker: white border (outline stroked + filled, so it grows evenly), soft shadow, photo clipped inside.
export function renderSticker(im, o, max = STICKER_MAX) {
  const b = outlineBox(o);
  const long = Math.max(b.w, b.h);
  const border = long * 0.03;
  const blur = long * 0.025;
  const pad = border + blur * 1.6;
  const k = Math.min(1, max / (long + pad * 2));
  const cw = Math.max(1, Math.round((b.w + pad * 2) * k)), ch = Math.max(1, Math.round((b.h + pad * 2) * k));
  const place = (ctx) => { ctx.scale(k, k); ctx.translate(pad - b.x, pad - b.y); };

  const sil = newCanvas(cw, ch);
  const sctx = sil.getContext('2d');
  place(sctx);
  sctx.beginPath(); traceOutline(sctx, o);
  sctx.fillStyle = '#ffffff'; sctx.strokeStyle = '#ffffff';
  sctx.lineWidth = border * 2; sctx.lineJoin = 'round';
  sctx.fill(); sctx.stroke();

  const out = newCanvas(cw, ch);
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = blur * k; // shadow sizes are in canvas px (not transformed)
  ctx.shadowOffsetY = border * 0.5 * k;
  ctx.drawImage(sil, 0, 0);
  ctx.restore();
  ctx.save();
  place(ctx);
  ctx.beginPath(); traceOutline(ctx, o); ctx.clip();
  ctx.drawImage(im, 0, 0);
  ctx.restore();
  sil.width = sil.height = 0;
  return out;
}

export async function openCutout({ src }) {
  let im;
  try { im = await loadImg(src); } catch { return null; }
  const iw = im.naturalWidth || 1, ih = im.naturalHeight || 1;

  return new Promise((resolve) => {
    const root = mk('div', 'cv cv-cut');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '스티커 만들기');
    root.innerHTML = `
      <div class="cv-head"><button type="button" class="cv-cancel" data-cv="cancel">취소</button><b class="hand">스티커 만들기</b><span class="cv-head-sp"></span></div>
      <p class="cv-tip" aria-live="polite"></p>
      <div class="cv-area"><canvas class="cv-canvas"></canvas></div>
      <div class="cv-chips" role="group" aria-label="모양">
        ${MODES.map(([k, label]) => `<button type="button" class="cv-chip" data-mode="${k}">${label}</button>`).join('')}
      </div>
      <div class="cv-actions">
        <button type="button" class="btn" data-cv="clear">다시 그리기</button>
        <button type="button" class="btn btn-primary" data-cv="ok">완성</button>
      </div>`;
    const area = root.querySelector('.cv-area');
    const cv = root.querySelector('.cv-canvas');
    const tip = root.querySelector('.cv-tip');
    const okBtn = root.querySelector('[data-cv="ok"]');

    let mode = 'lasso';
    let pts = []; // lasso points while drawing / raw, image px
    let lasso = null; // closed + smoothed outline { kind: 'lasso', pts }
    let shape = null; // { kind, x, y, w, h } image px
    let view = null; // { s, ox, oy, aw, ah, dpr }
    let g = null;
    let busy = false;

    const TIPS = {
      lasso: '손가락으로 오려 낼 부분을 빙 둘러 그려 보세요',
      shape: '모양을 끌어서 옮기고, 동그란 점을 끌어서 크기를 바꿔요',
    };
    const setTip = (t) => { tip.textContent = t; };

    function layout() {
      const aw = area.clientWidth, ah = area.clientHeight;
      if (!aw || !ah) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const s = Math.min((aw - PAD * 2) / iw, (ah - PAD * 2) / ih);
      view = { s, ox: (aw - iw * s) / 2, oy: (ah - ih * s) / 2, aw, ah, dpr };
      cv.width = Math.round(aw * dpr); cv.height = Math.round(ah * dpr);
      cv.style.width = aw + 'px'; cv.style.height = ah + 'px';
      draw();
    }

    const current = () => (mode === 'lasso' ? lasso : shape);

    function draw() {
      if (!view) return;
      const { s, ox, oy, aw, ah, dpr } = view;
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, aw, ah);
      ctx.drawImage(im, ox, oy, iw * s, ih * s);
      const o = current();
      if (o) {
        // dim everything outside the outline
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, iw * s, ih * s);
        traceOutline(ctx, o, s, ox, oy);
        ctx.fillStyle = 'rgba(20,16,12,.55)';
        ctx.fill('evenodd');
        ctx.restore();
        ctx.save();
        ctx.beginPath(); traceOutline(ctx, o, s, ox, oy);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
        if (o !== lasso) {
          const hx = ox + (o.x + o.w) * s, hy = oy + (o.y + o.h) * s;
          ctx.beginPath(); ctx.arc(hx, hy, 13, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = '#2f6fb3'; ctx.stroke();
        }
      } else if (mode === 'lasso' && pts.length > 1) {
        ctx.save();
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * s, oy + y * s) : ctx.moveTo(ox + x * s, oy + y * s)));
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3.5; ctx.stroke();
        ctx.restore();
      }
      okBtn.disabled = !o || busy;
    }

    function defaultShape(kind) {
      const d = Math.min(iw, ih) * 0.62;
      const w = d, h = kind === 'heart' ? d * 0.9 : d;
      return { kind, x: (iw - w) / 2, y: (ih - h) / 2, w, h };
    }
    function clampShape(o) {
      o.w = Math.min(o.w, iw); o.h = Math.min(o.h, ih);
      o.x = Math.max(0, Math.min(iw - o.w, o.x)); o.y = Math.max(0, Math.min(ih - o.h, o.y));
      return o;
    }

    function setMode(k) {
      mode = k;
      root.querySelectorAll('.cv-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === k)));
      if (k === 'lasso') { setTip(TIPS.lasso); }
      else {
        const keep = shape && { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2, w: shape.w, h: shape.h };
        shape = defaultShape(k);
        if (keep) { shape.w = keep.w; shape.h = k === 'heart' ? keep.w * 0.9 : keep.h; shape.x = keep.x - shape.w / 2; shape.y = keep.y - shape.h / 2; }
        clampShape(shape);
        setTip(TIPS.shape);
      }
      draw();
    }

    const pt = (e) => { const r = area.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const toImg = (p) => [Math.max(0, Math.min(iw, (p.x - view.ox) / view.s)), Math.max(0, Math.min(ih, (p.y - view.oy) / view.s))];

    function onDown(e) {
      if (g || !view || busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try { area.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const p = pt(e);
      if (mode === 'lasso') {
        lasso = null;
        pts = [toImg(p)];
        g = { kind: 'draw', id: e.pointerId };
        draw();
        return;
      }
      const { s, ox, oy } = view;
      const hx = ox + (shape.x + shape.w) * s, hy = oy + (shape.y + shape.h) * s;
      if (Math.hypot(p.x - hx, p.y - hy) <= HANDLE_R) {
        g = { kind: 'resize', id: e.pointerId, cx: shape.x + shape.w / 2, cy: shape.y + shape.h / 2, ratio: shape.w / shape.h };
        return;
      }
      const [ix, iy] = toImg(p);
      if (!(ix >= shape.x && ix <= shape.x + shape.w && iy >= shape.y && iy <= shape.y + shape.h)) {
        shape.x = ix - shape.w / 2; shape.y = iy - shape.h / 2; clampShape(shape); draw(); // jump to the tap
      }
      g = { kind: 'move', id: e.pointerId, start: [ix, iy], base: { ...shape } };
    }
    function onMove(e) {
      if (!g || e.pointerId !== g.id) return;
      const p = pt(e);
      const q = toImg(p);
      if (g.kind === 'draw') {
        const l = pts[pts.length - 1];
        if (Math.hypot((q[0] - l[0]) * view.s, (q[1] - l[1]) * view.s) >= 2.5) { pts.push(q); draw(); }
      } else if (g.kind === 'move') {
        shape.x = g.base.x + q[0] - g.start[0]; shape.y = g.base.y + q[1] - g.start[1];
        clampShape(shape); draw();
      } else if (g.kind === 'resize') {
        const min = 44 / view.s;
        let w = Math.max(min, Math.abs(q[0] - g.cx) * 2), h = Math.max(min, Math.abs(q[1] - g.cy) * 2);
        if (shape.kind === 'heart') { w = Math.max(w, h * g.ratio); h = w / g.ratio; }
        const fitW = Math.min(g.cx, iw - g.cx) * 2, fitH = Math.min(g.cy, ih - g.cy) * 2;
        if (shape.kind === 'heart') { const f = Math.min(1, fitW / w, fitH / h); w *= f; h *= f; } else { w = Math.min(w, fitW); h = Math.min(h, fitH); }
        Object.assign(shape, { w, h, x: g.cx - w / 2, y: g.cy - h / 2 });
        draw();
      }
    }
    function onUp(e) {
      if (!g || e.pointerId !== g.id) return;
      const cur = g;
      g = null;
      if (cur.kind !== 'draw') return;
      const raw = thin(pts, 2 / view.s);
      const b = bboxOf(raw);
      pts = [];
      if (raw.length < 6 || b.w * view.s < 40 || b.h * view.s < 40) {
        lasso = null;
        setTip('조금 더 크게, 빙 둘러서 그려 주세요');
      } else {
        lasso = { kind: 'lasso', pts: smoothClosed(raw) };
        setTip('좋아요! 완성을 누르거나, 다시 그려도 돼요');
      }
      draw();
    }

    function done(result) {
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      document.body.classList.remove('cv-open');
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(null); } }

    async function finish() {
      const o = current();
      if (!o || busy) return;
      busy = true;
      okBtn.textContent = '만드는 중…';
      draw();
      try {
        const out = renderSticker(im, o);
        const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
        const w = out.width, h = out.height;
        out.width = out.height = 0;
        if (!blob) throw new Error('png');
        done({ blob, w, h });
      } catch {
        busy = false;
        okBtn.textContent = '완성';
        setTip('스티커를 만들지 못했어요. 다시 해 볼까요?');
        draw();
      }
    }

    area.addEventListener('pointerdown', onDown);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerup', onUp);
    area.addEventListener('pointercancel', onUp);
    area.addEventListener('contextmenu', (e) => e.preventDefault());
    root.querySelectorAll('.cv-chip').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cv]');
      if (!b) return;
      const act = b.dataset.cv;
      if (act === 'cancel') done(null);
      else if (act === 'clear') { if (mode === 'lasso') { lasso = null; pts = []; setTip(TIPS.lasso); } else { shape = null; setMode(mode); } draw(); }
      else if (act === 'ok') finish();
    });
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', onKey, true);

    document.body.classList.add('cv-open');
    document.body.append(root);
    setMode('lasso');
    layout();
    requestAnimationFrame(layout);
  });
}
