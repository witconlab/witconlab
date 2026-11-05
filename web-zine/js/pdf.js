// PDF output: page-order A6 PDF and A3 fold-imposed PDF (one sheet per zine).
import { renderPage } from './render.js';
import { IMPOSITION, panelRect, A3, A6, CUT_LINE, FOLD_LINES } from './imposition.js';

export const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

const PAGE_PX = { w: 1240, h: 1748 };   // A6 105x148 at 300dpi
const PANEL_PX = { w: 1240, h: 1754 };  // 105x148.5 at 300dpi
const JPEG_Q = 0.92;

const BASE_SAMPLE = '가나다진0123456789';

// Every string that gets drawn: zine titles, page titles and text (caption) elements.
export function zineText(zines) {
  const out = [];
  for (const z of [].concat(zines || [])) {
    if (!z) continue;
    if (z.title) out.push(z.title);
    for (const p of z.pages || []) {
      if (p.title) out.push(p.title);
      for (const e of p.elements || []) if (e.type === 'text' && e.text) out.push(e.text);
    }
  }
  return out.join('\n');
}

// Title to show/name files with: zine title, else page 1's title, else '진'.
export function zineTitle(z) {
  const t = (z && z.title || '').trim();
  if (t) return t;
  const p1 = (z && z.pages && z.pages[0] && z.pages[0].title || '').trim();
  return p1 || '진';
}

// Page text: Pretendard 700 (titles), 500 (captions), 600 (page numbers), or Nanum Pen Script (손글씨 choice).
// Web fonts are split into many unicode-range files (Nanum Pen Script has ~90 for Hangul). The browser only
// downloads the files covering the text passed to fonts.load(), so pass everything that will be drawn;
// otherwise syllables outside the sample render in a fallback font and wrap differently.
export async function ensureFonts(doc = document, text = '') {
  const sample = [...new Set(BASE_SAMPLE + String(text || '').replace(/\s+/g, ''))].join('');
  await Promise.all([
    doc.fonts.load('40px "Nanum Pen Script"', sample),
    doc.fonts.load('500 40px Pretendard', sample),
    doc.fonts.load('600 40px Pretendard', sample),
    doc.fonts.load('700 40px Pretendard', sample),
    doc.fonts.load('900 40px Pretendard', sample),
  ]);
  await doc.fonts.ready;
}

function defaultCreateCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// One scratch canvas is reused for every page/panel (memory cap on Safari); cleared before each use.
function clear(canvas, w, h) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function release(...canvases) {
  for (const c of canvases) if (c) { c.width = 0; c.height = 0; }
}

async function renderOnto(canvas, page, w, h, pageNumber, loadImage) {
  const ctx = clear(canvas, w, h);
  const res = await renderPage(ctx, page, { width: w, height: h, loadImage, pageNumber });
  return res?.failed || [];
}

function rotate180Onto(out, src, w, h) {
  const ctx = clear(out, w, h);
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  return out;
}

export async function buildPagesPdf(zine, opts = {}) {
  const { loadImage, jsPDF, ensureFonts: fonts = ensureFonts, createCanvas = defaultCreateCanvas, onProgress } = opts;
  await fonts(undefined, zineText([zine]));
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [105, 148] });
  const failed = [];
  const total = zine.pages.length;
  const canvas = createCanvas(PAGE_PX.w, PAGE_PX.h);
  try {
    for (let i = 0; i < total; i++) {
      const f = await renderOnto(canvas, zine.pages[i], PAGE_PX.w, PAGE_PX.h, i + 1, loadImage);
      for (const x of f) failed.push({ ...x, pageNumber: i + 1 });
      if (i > 0) pdf.addPage([105, 148], 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_Q), 'JPEG', 0, 0, 105, 148);
      onProgress?.(i + 1, total);
    }
  } finally { release(canvas); }
  return { blob: pdf.output('blob'), failed };
}

// loaderFor(zine) (optional) gives a photo loader per zine, e.g. one that tells the server whose photos these are.
export async function buildA3Pdf(zines, opts = {}) {
  const { loadImage, loaderFor, jsPDF, ensureFonts: fonts = ensureFonts, guides = true, createCanvas = defaultCreateCanvas, onProgress } = opts;
  await fonts(undefined, zineText(zines));
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [A3.w, A3.h] });
  const failed = [];
  const total = zines.length * IMPOSITION.length;
  let done = 0;
  const canvas = createCanvas(PANEL_PX.w, PANEL_PX.h);
  const rotCanvas = createCanvas(PANEL_PX.w, PANEL_PX.h);
  try {
    for (let z = 0; z < zines.length; z++) {
      const zine = zines[z];
      const load = loaderFor ? loaderFor(zine) : loadImage;
      if (z > 0) pdf.addPage([A3.w, A3.h], 'landscape');
      for (const slot of IMPOSITION) {
        const f = await renderOnto(canvas, zine.pages[slot.page - 1], PANEL_PX.w, PANEL_PX.h, slot.page, load);
        for (const x of f) failed.push({ ...x, pageNumber: slot.page, name: zine.name });
        const src = slot.rotate === 180 ? rotate180Onto(rotCanvas, canvas, PANEL_PX.w, PANEL_PX.h) : canvas;
        const r = panelRect(slot);
        pdf.addImage(src.toDataURL('image/jpeg', JPEG_Q), 'JPEG', r.x, r.y, r.w, r.h);
        onProgress?.(++done, total);
      }
      if (guides) {
        pdf.setDrawColor('#cccccc');
        pdf.setLineWidth(0.2);
        pdf.setLineDashPattern([2, 2], 0);
        for (const l of FOLD_LINES) pdf.line(l.x1, l.y1, l.x2, l.y2);
        pdf.setLineDashPattern([], 0);
        pdf.setDrawColor('#e8473a');
        pdf.setLineWidth(0.3);
        pdf.line(CUT_LINE.x1, CUT_LINE.y, CUT_LINE.x2, CUT_LINE.y);
      }
    }
  } finally { release(canvas, rotCanvas); }
  return { blob: pdf.output('blob'), failed };
}
