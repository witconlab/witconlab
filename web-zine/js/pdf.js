// PDF output: page-order A6 PDF and A3 fold-imposed PDF (one sheet per zine).
import { renderPage } from './render.js';
import { IMPOSITION, panelRect, A3, A6, CUT_LINE, FOLD_LINES } from './imposition.js';

export const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

const PAGE_PX = { w: 1240, h: 1748 };   // A6 105x148 at 300dpi
const PANEL_PX = { w: 1240, h: 1754 };  // 105x148.5 at 300dpi
const JPEG_Q = 0.92;

export async function ensureFonts(doc = document) {
  await doc.fonts.load('40px "Nanum Pen Script"');
  await doc.fonts.load('700 40px Pretendard');
  await doc.fonts.ready;
}

function defaultCreateCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

async function renderToCanvas(createCanvas, page, w, h, pageNumber, loadImage) {
  const canvas = createCanvas(w, h);
  const res = await renderPage(canvas.getContext('2d'), page, { width: w, height: h, loadImage, pageNumber });
  return { canvas, failed: res?.failed || [] };
}

function rotate180(createCanvas, src, w, h) {
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  ctx.drawImage(src, 0, 0);
  return out;
}

export async function buildPagesPdf(zine, opts = {}) {
  const { loadImage, jsPDF, ensureFonts: fonts = ensureFonts, createCanvas = defaultCreateCanvas, onProgress } = opts;
  await fonts();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [105, 148] });
  const failed = [];
  const total = zine.pages.length;
  for (let i = 0; i < total; i++) {
    const { canvas, failed: f } = await renderToCanvas(createCanvas, zine.pages[i], PAGE_PX.w, PAGE_PX.h, i + 1, loadImage);
    for (const x of f) failed.push({ ...x, pageNumber: i + 1 });
    if (i > 0) pdf.addPage([105, 148], 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_Q), 'JPEG', 0, 0, 105, 148);
    onProgress?.(i + 1, total);
  }
  return { blob: pdf.output('blob'), failed };
}

export async function buildA3Pdf(zines, opts = {}) {
  const { loadImage, jsPDF, ensureFonts: fonts = ensureFonts, guides = true, createCanvas = defaultCreateCanvas, onProgress } = opts;
  await fonts();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [A3.w, A3.h] });
  const failed = [];
  const total = zines.length * IMPOSITION.length;
  let done = 0;
  for (let z = 0; z < zines.length; z++) {
    const zine = zines[z];
    if (z > 0) pdf.addPage([A3.w, A3.h], 'landscape');
    for (const slot of IMPOSITION) {
      const { canvas, failed: f } = await renderToCanvas(createCanvas, zine.pages[slot.page - 1], PANEL_PX.w, PANEL_PX.h, slot.page, loadImage);
      for (const x of f) failed.push({ ...x, pageNumber: slot.page, name: zine.name });
      const src = slot.rotate === 180 ? rotate180(createCanvas, canvas, PANEL_PX.w, PANEL_PX.h) : canvas;
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
  return { blob: pdf.output('blob'), failed };
}
