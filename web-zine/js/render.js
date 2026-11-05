// Canvas page renderer shared by editor thumbnails, the e-book and 300dpi PDFs.
import { PAPERS, TEXT_COLORS, HIGHLIGHTS } from './model.js';
import { getSticker } from './stickers.js';

export const HAND = '"Nanum Pen Script", "Gamja Flower", cursive';
const PAGE_W_MM = 105;
const PAGE_H_MM = 148;
const SAFE_MM = 5;
export const LINE_HEIGHT = 1.25;
export const DEFAULT_TEXT_SIZE = 0.055; // caption size (fraction of page height) when style.size is missing

export function wrapText(measure, text, maxWidth) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let cur = '';
    const push = () => { out.push(cur); cur = ''; };
    for (const word of para.split(' ')) {
      const joined = cur === '' ? word : cur + ' ' + word;
      if (measure(joined) <= maxWidth) { cur = joined; continue; }
      if (cur !== '') push();
      if (measure(word) <= maxWidth) { cur = word; continue; }
      for (const ch of word) { // too long for one line: break by character
        if (cur !== '' && measure(cur + ch) > maxWidth) push();
        cur += ch;
      }
    }
    out.push(cur);
  }
  return out;
}

const svgCache = new Map();
function defaultLoadSvg(svg) {
  if (!svgCache.has(svg)) {
    svgCache.set(svg, new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }));
  }
  return svgCache.get(svg);
}

function drawCover(ctx, im, dx, dy, dw, dh) {
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  if (!iw || !ih) { ctx.drawImage(im, dx, dy, dw, dh); return; }
  const s = Math.max(dw / iw, dh / ih);
  const sw = dw / s, sh = dh / s;
  ctx.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
}

function drawContain(ctx, im, w, h, aspect) {
  const a = aspect || (im.naturalWidth || im.width || 1) / (im.naturalHeight || im.height || 1);
  let dw = w, dh = w / a;
  if (dh > h) { dh = h; dw = h * a; }
  ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawBackground(ctx, page, width, height) {
  ctx.fillStyle = PAPERS[page.background] || PAPERS.cream;
  ctx.fillRect(0, 0, width, height);
  const gap = width * 0.04;
  if (page.pattern === 'dots') {
    ctx.fillStyle = 'rgba(60,50,40,.18)';
    const r = (width * 0.0035) / 2;
    for (let y = gap; y < height; y += gap) {
      for (let x = gap; x < width; x += gap) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (page.pattern === 'grid') {
    ctx.strokeStyle = 'rgba(60,50,40,.18)';
    ctx.lineWidth = width * 0.0015;
    ctx.beginPath();
    for (let x = gap; x < width; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = gap; y < height; y += gap) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
  }
}

function drawText(ctx, el, width, height) {
  const px = (el.style?.size ?? DEFAULT_TEXT_SIZE) * height;
  const boxW = el.w * width;
  ctx.font = `${px}px ${HAND}`;
  ctx.fillStyle = TEXT_COLORS[el.style?.color] || el.style?.color || TEXT_COLORS.ink;
  ctx.textBaseline = 'top';
  const align = el.style?.align || 'center';
  ctx.textAlign = align;
  const x = align === 'left' ? 0 : align === 'right' ? boxW : boxW / 2;
  const lines = wrapText((s) => ctx.measureText(s).width, el.text || '', boxW);
  lines.forEach((l, i) => ctx.fillText(l, x, i * px * LINE_HEIGHT));
}

function drawPhoto(ctx, el, im, w, h) {
  if (el.frame === 'polaroid') {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.15)';
    ctx.shadowBlur = w * 0.04;
    ctx.shadowOffsetY = w * 0.012;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    const ix = w * 0.04, iy = h * 0.04;
    const iw = w * 0.92, ih = h * 0.8;
    ctx.save();
    ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
    drawCover(ctx, im, ix, iy, iw, ih);
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    drawCover(ctx, im, 0, 0, w, h);
    ctx.restore();
  }
}

// Page title with its highlighter band. Exported so the editor can draw it on its own layer.
export function drawTitle(ctx, page, width, height) {
  if ((page.title || '').trim() === '') return;
  const px = height * 0.06;
  const step = px * LINE_HEIGHT;
  const box = page.titleBox || { x: 0.06, y: 0.04, w: 0.88 };
  const boxW = box.w * width;
  ctx.font = `${px}px ${HAND}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lines = wrapText((s) => ctx.measureText(s).width, page.title, boxW);
  const cx = (box.x + box.w / 2) * width;
  const pad = width * 0.03;
  lines.forEach((l, i) => {
    const y = box.y * height + i * step;
    const bw = Math.min(boxW, ctx.measureText(l).width) + pad * 2;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = HIGHLIGHTS[page.titleHighlight] || HIGHLIGHTS.sky;
    ctx.fillRect(cx - bw / 2, y + step * 0.45, bw, step * 0.5);
    ctx.restore();
    ctx.fillStyle = TEXT_COLORS.ink;
    ctx.fillText(l, cx, y);
  });
}

// Resolve what an element needs to be drawn. Returns async () => source|null, or null when nothing to load.
async function loadSource(el, opts) {
  if (el.type === 'text') return { kind: 'text' };
  const src = el.src || '';
  if (src.startsWith('builtin:')) {
    const st = getSticker(src.slice(8));
    if (!st) return null;
    if (st.draw) return { kind: 'draw', st };
    return { kind: 'image', st, im: await (opts.loadSvg || defaultLoadSvg)(st.svg) };
  }
  return { kind: 'image', im: await opts.loadImage(src) };
}

/**
 * Draws one page. Callers must await font loading ("Nanum Pen Script" and 900 Pretendard)
 * before calling, or text is measured/drawn with fallback fonts.
 * Resolves to { failed: [{id, src, error}] } for elements that could not be loaded (skipped).
 */
export async function renderPage(ctx, page, opts) {
  const { width, height, showSafeArea = false, pageNumber } = opts;
  const sources = new Map();
  const failed = [];
  await Promise.all(page.elements.map(async (el) => {
    try {
      const info = await loadSource(el, opts);
      if (!info) failed.push({ id: el.id, src: el.src, error: new Error('unknown sticker') });
      sources.set(el.id, info);
    } catch (error) {
      failed.push({ id: el.id, src: el.src, error });
      sources.set(el.id, null);
    }
  }));

  ctx.save();
  try {
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  drawBackground(ctx, page, width, height);

  const sx = (SAFE_MM / PAGE_W_MM) * width;
  const sy = (SAFE_MM / PAGE_H_MM) * height;
  if (page.frameLine) {
    ctx.strokeStyle = TEXT_COLORS.ink;
    ctx.lineWidth = width * 0.004;
    ctx.lineJoin = 'round';
    ctx.strokeRect(sx, sy, width - 2 * sx, height - 2 * sy);
  }

  if (pageNumber >= 2 && pageNumber <= 7) {
    const px = height * 0.07;
    ctx.font = `${px}px ${HAND}`;
    ctx.fillStyle = TEXT_COLORS.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const label = String(pageNumber);
    const nx = sx + width * 0.05, ny = sy + height * 0.03;
    ctx.fillText(label, nx, ny);
    const tw = ctx.measureText(label).width;
    ctx.strokeStyle = TEXT_COLORS.ink;
    ctx.lineWidth = width * 0.004;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(nx - width * 0.01, ny + px * 1.0);
    ctx.lineTo(nx + tw + width * 0.01, ny + px * 1.0);
    ctx.stroke();
  }

  const sorted = [...page.elements].sort((a, b) => a.z - b.z);
  for (const el of sorted) {
    const srcInfo = sources.get(el.id);
    if (!srcInfo) continue;
    const w = el.w * width, h = el.h * height;
    ctx.save();
    ctx.translate(el.x * width + w / 2, el.y * height + h / 2);
    ctx.rotate(((el.rotate || 0) * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    if (srcInfo.kind === 'text') drawText(ctx, el, width, height);
    else if (srcInfo.kind === 'draw') srcInfo.st.draw(ctx, w, h);
    else if (el.type === 'photo') drawPhoto(ctx, el, srcInfo.im, w, h);
    else drawContain(ctx, srcInfo.im, w, h, srcInfo.st?.aspect);
    ctx.restore();
  }

  drawTitle(ctx, page, width, height);

  if (showSafeArea) {
    ctx.strokeStyle = 'rgba(232,71,58,.8)';
    ctx.lineWidth = Math.max(1, width * 0.003);
    ctx.setLineDash([width * 0.02, width * 0.015]);
    ctx.strokeRect(sx, sy, width - 2 * sx, height - 2 * sy);
    ctx.setLineDash([]);
  }
  } finally {
    ctx.restore();
  }
  return { failed };
}
