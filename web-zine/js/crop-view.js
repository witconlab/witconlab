// Full-screen photo crop view (one finger: drag inside the box to move it, drag a corner to resize).
// openCrop({ src, crop, mode }) -> Promise<{ crop, aspect } | null>
//   crop: {x, y, w, h} fractions of the source image, or null for the whole photo; aspect: pixel w/h of the result.
//   Resolves null when cancelled. mode 'add' (adding a new photo) or 'edit' (자르기 from the element menu).
const RATIOS = [['free', '자유', 0], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['3:4', '3:4', 3 / 4], ['16:9', '16:9', 16 / 9]];
const MIN_PX = 44; // smallest crop box on screen
const PAD = 22; // room around the photo so corner handles stay reachable

export function loadImg(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image load failed'));
    im.src = src;
  });
}

const mk = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html) n.innerHTML = html; return n; };
const round4 = (v) => Math.round(v * 10000) / 10000;

export async function openCrop({ src, crop = null, mode = 'add' }) {
  let im;
  try { im = await loadImg(src); } catch { return null; }
  const iw = im.naturalWidth || 1, ih = im.naturalHeight || 1;

  return new Promise((resolve) => {
    const root = mk('div', 'cv');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '사진 자르기');
    root.innerHTML = `
      <div class="cv-head"><button type="button" class="cv-cancel" data-cv="cancel">취소</button><b class="hand">사진 자르기</b><span class="cv-head-sp"></span></div>
      <div class="cv-area"><img class="cv-img" alt="" draggable="false">
        <div class="cv-rect"><span class="cv-grid"></span>
          ${['nw', 'ne', 'sw', 'se'].map((c) => `<span class="cv-h cv-h-${c}" data-corner="${c}"></span>`).join('')}
        </div></div>
      <div class="cv-chips" role="group" aria-label="비율">
        ${RATIOS.map(([k, label]) => `<button type="button" class="cv-chip" data-ratio="${k}">${label}</button>`).join('')}
      </div>
      <div class="cv-actions">
        <button type="button" class="btn" data-cv="none">${mode === 'edit' ? '자르지 않기' : '그대로 넣기'}</button>
        <button type="button" class="btn btn-primary" data-cv="ok">자르기 완료</button>
      </div>`;
    const area = root.querySelector('.cv-area');
    const img = root.querySelector('.cv-img');
    const rectEl = root.querySelector('.cv-rect');
    img.src = im.src;

    let c = crop ? { ...crop } : { x: 0, y: 0, w: 1, h: 1 }; // crop in image fractions
    let ratio = 0; // 0 = free, else pixel w/h
    let box = null; // displayed photo { ox, oy, dw, dh } in area px
    let g = null;

    const toPx = () => ({ l: box.ox + c.x * box.dw, t: box.oy + c.y * box.dh, w: c.w * box.dw, h: c.h * box.dh });
    const fromPx = (r) => {
      c = { x: (r.l - box.ox) / box.dw, y: (r.t - box.oy) / box.dh, w: r.w / box.dw, h: r.h / box.dh };
      c.x = Math.max(0, Math.min(1 - c.w, c.x));
      c.y = Math.max(0, Math.min(1 - c.h, c.y));
    };

    function layout() {
      const aw = area.clientWidth, ah = area.clientHeight;
      if (!aw || !ah) return;
      const s = Math.min((aw - PAD * 2) / iw, (ah - PAD * 2) / ih);
      const dw = iw * s, dh = ih * s;
      box = { ox: (aw - dw) / 2, oy: (ah - dh) / 2, dw, dh };
      Object.assign(img.style, { left: box.ox + 'px', top: box.oy + 'px', width: dw + 'px', height: dh + 'px' });
      draw();
    }
    function draw() {
      if (!box) return;
      const r = toPx();
      Object.assign(rectEl.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    function markRatio(k) { root.querySelectorAll('.cv-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ratio === k))); }

    // Largest box of the ratio that fits the photo, centred where the current box is.
    function applyRatio(k) {
      const entry = RATIOS.find((r) => r[0] === k);
      ratio = entry ? entry[2] : 0;
      markRatio(k);
      if (!ratio || !box) return;
      const cur = toPx();
      const cx = cur.l + cur.w / 2, cy = cur.t + cur.h / 2;
      let w = Math.min(box.dw, box.dh * ratio), h = w / ratio;
      fromPx({ l: cx - w / 2, t: cy - h / 2, w, h });
      draw();
    }

    function pt(e) { const r = area.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    function onDown(e) {
      if (g || !box || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const p = pt(e);
      const h = e.target.closest('[data-corner]');
      const r = toPx();
      if (h) {
        const k = h.dataset.corner;
        const sx = k.includes('e') ? 1 : -1, sy = k.includes('s') ? 1 : -1;
        g = { kind: 'resize', id: e.pointerId, sx, sy, ax: sx > 0 ? r.l : r.l + r.w, ay: sy > 0 ? r.t : r.t + r.h };
      } else if (p.x >= r.l - 8 && p.x <= r.l + r.w + 8 && p.y >= r.t - 8 && p.y <= r.t + r.h + 8) {
        g = { kind: 'move', id: e.pointerId, start: p, base: r };
      } else return;
      e.preventDefault();
      try { area.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    function onMove(e) {
      if (!g || e.pointerId !== g.id) return;
      const p = pt(e);
      if (g.kind === 'move') {
        fromPx({ ...g.base, l: g.base.l + p.x - g.start.x, t: g.base.t + p.y - g.start.y });
      } else {
        const { sx, sy, ax, ay } = g;
        const maxW = sx > 0 ? box.ox + box.dw - ax : ax - box.ox;
        const maxH = sy > 0 ? box.oy + box.dh - ay : ay - box.oy;
        let w = Math.max(MIN_PX, sx * (p.x - ax)), h = Math.max(MIN_PX, sy * (p.y - ay));
        if (ratio) {
          if (w / h > ratio) h = w / ratio; else w = h * ratio;
          if (w > maxW) { w = maxW; h = w / ratio; }
          if (h > maxH) { h = maxH; w = h * ratio; }
        } else {
          w = Math.min(w, maxW); h = Math.min(h, maxH);
        }
        fromPx({ l: sx > 0 ? ax : ax - w, t: sy > 0 ? ay : ay - h, w, h });
      }
      draw();
    }
    function onUp(e) { if (g && e.pointerId === g.id) g = null; }

    function done(result) {
      window.removeEventListener('resize', layout);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      document.body.classList.remove('cv-open');
      resolve(result);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(null); } }

    area.addEventListener('pointerdown', onDown);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerup', onUp);
    area.addEventListener('pointercancel', onUp);
    area.addEventListener('contextmenu', (e) => e.preventDefault());
    root.querySelectorAll('.cv-chip').forEach((b) => b.addEventListener('click', () => applyRatio(b.dataset.ratio)));
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cv]');
      if (!b) return;
      const act = b.dataset.cv;
      if (act === 'cancel') return done(null);
      if (act === 'none') return done({ crop: null, aspect: iw / ih });
      const whole = c.w > 0.995 && c.h > 0.995;
      const out = whole ? null : { x: round4(c.x), y: round4(c.y), w: round4(c.w), h: round4(c.h) };
      done({ crop: out, aspect: whole ? iw / ih : (c.w * iw) / (c.h * ih) });
    });
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', onKey, true);

    document.body.classList.add('cv-open');
    document.body.append(root);
    markRatio('free');
    layout();
    requestAnimationFrame(layout);
    root.querySelector('[data-cv="ok"]').focus({ preventScroll: true });
  });
}
