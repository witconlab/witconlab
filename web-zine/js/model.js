// Zine data model: pure, immutable operations.
export const PAGE_COUNT = 8;
export const PAPERS = { cream: '#f6efdc', yellow: '#ffe9a8', sky: '#dbeefa', lime: '#e4f1d0', white: '#ffffff' };
export const TEXT_COLORS = { ink: '#2b2620', red: '#e8473a', blue: '#2f6fb3', white: '#ffffff' };
export const PATTERNS = ['dots', 'grid', 'none'];
export const HIGHLIGHTS = { lavender: '#c9b8e8', sky: '#a9cdf2', lemon: '#fbe58a', pink: '#f6b8c4', white: '#ffffff' };
export const FONTS = ['sans', 'hand']; // 'sans' = Pretendard (default when absent), 'hand' = Nanum Pen Script
// Optional page fields (absent in older zines and in the server's empty zine): titleFont, titleSize.
export const TITLE_SIZE = { def: 0.06, min: 0.04, max: 0.12 }; // fraction of page height
export const PAGE_LABELS = ['표지', '2', '3', '4', '5', '6', '7', '뒷표지'];

const PAGE_W_MM = 105;
const PAGE_H_MM = 148;
const SAFE_MM = 5;

export function createEmptyZine(name) {
  const pages = [];
  for (let i = 0; i < PAGE_COUNT; i++) {
    pages.push({
      title: '',
      titleBox: { x: 0.06, y: 0.04, w: 0.88 },
      titleHighlight: 'sky',
      background: i === 0 ? 'yellow' : 'cream',
      pattern: 'dots',
      frameLine: true,
      elements: [],
    });
  }
  return { version: 1, name, title: '', done: false, rev: 0, updatedAt: null, pages };
}

function withPage(zine, pageIndex, fn) {
  return { ...zine, pages: zine.pages.map((p, i) => (i === pageIndex ? fn(p) : p)) };
}
function withElements(zine, pageIndex, fn) {
  return withPage(zine, pageIndex, (p) => ({ ...p, elements: fn(p.elements) }));
}

function randomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'e_' + s;
}

export function addElement(zine, pageIndex, partial = {}) {
  return withElements(zine, pageIndex, (els) => {
    const maxZ = els.reduce((m, e) => Math.max(m, e.z), 0);
    const w = partial.w ?? 0.3;
    const h = partial.h ?? 0.2;
    const el = {
      type: 'sticker',
      x: 0.5 - w / 2,
      y: 0.5 - h / 2,
      w,
      h,
      rotate: 0,
      ...partial,
      id: randomId(),
      z: maxZ + 1,
    };
    if (el.type === 'photo' && el.frame === undefined) el.frame = 'polaroid';
    return [...els, el];
  });
}

export function updateElement(zine, pageIndex, id, patch) {
  return withElements(zine, pageIndex, (els) => els.map((e) => (e.id === id ? { ...e, ...patch, id: e.id } : e)));
}

export function removeElement(zine, pageIndex, id) {
  return withElements(zine, pageIndex, (els) => els.filter((e) => e.id !== id));
}

function swapZ(zine, pageIndex, id, dir) {
  return withElements(zine, pageIndex, (els) => {
    const cur = els.find((e) => e.id === id);
    if (!cur) return els;
    const others = els.filter((e) => e.id !== id && (dir > 0 ? e.z > cur.z : e.z < cur.z));
    if (!others.length) return els;
    const target = others.reduce((a, b) => (dir > 0 ? (b.z < a.z ? b : a) : (b.z > a.z ? b : a)));
    return els.map((e) => {
      if (e.id === cur.id) return { ...e, z: target.z };
      if (e.id === target.id) return { ...e, z: cur.z };
      return e;
    });
  });
}
export const bringForward = (zine, pageIndex, id) => swapZ(zine, pageIndex, id, 1);
export const sendBackward = (zine, pageIndex, id) => swapZ(zine, pageIndex, id, -1);

export function duplicateElement(zine, pageIndex, id) {
  return withElements(zine, pageIndex, (els) => {
    const src = els.find((e) => e.id === id);
    if (!src) return els;
    const maxZ = els.reduce((m, e) => Math.max(m, e.z), 0);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = randomId();
    copy.x = src.x + 0.03;
    copy.y = src.y + 0.03;
    copy.z = maxZ + 1;
    return [...els, copy];
  });
}

export const setPageTitle = (zine, i, title) => withPage(zine, i, (p) => ({ ...p, title }));
export const moveTitle = (zine, i, { x, y }) => withPage(zine, i, (p) => ({ ...p, titleBox: { ...p.titleBox, x, y } }));
export const setBackground = (zine, i, paperKey) => withPage(zine, i, (p) => ({ ...p, background: paperKey }));
export const setPattern = (zine, i, pattern) => withPage(zine, i, (p) => ({ ...p, pattern }));
export const setFrameLine = (zine, i, on) => withPage(zine, i, (p) => ({ ...p, frameLine: !!on }));
export const setTitleHighlight = (zine, i, key) => withPage(zine, i, (p) => ({ ...p, titleHighlight: key }));
export const fontOf = (f) => (f === 'hand' ? 'hand' : 'sans');
export const titleSizeOf = (page) => {
  const s = Number(page && page.titleSize);
  return Number.isFinite(s) && s > 0 ? Math.min(TITLE_SIZE.max, Math.max(TITLE_SIZE.min, s)) : TITLE_SIZE.def;
};
export const setTitleFont = (zine, i, font) => withPage(zine, i, (p) => ({ ...p, titleFont: fontOf(font) }));
export const setTitleSize = (zine, i, size) => withPage(zine, i, (p) => ({ ...p, titleSize: titleSizeOf({ titleSize: size }) }));

// Reorder inner pages (indexes 1..6, i.e. pages 2-7). Cover and back cover never move.
export function movePage(zine, from, to) {
  const ok = (n) => Number.isInteger(n) && n >= 1 && n <= PAGE_COUNT - 2;
  if (!ok(from) || !ok(to) || from === to) return zine;
  const pages = [...zine.pages];
  const [p] = pages.splice(from, 1);
  pages.splice(to, 0, p);
  return { ...zine, pages };
}

// ---- photo crop (optional el.crop: {x, y, w, h} as fractions of the source image; absent = whole photo) ----
export function cropOf(el) {
  const c = el && el.crop;
  if (!c || typeof c !== 'object') return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const x = Math.min(1, Math.max(0, n(c.x))), y = Math.min(1, Math.max(0, n(c.y)));
  const w = Math.min(n(c.w), 1 - x), h = Math.min(n(c.h), 1 - y);
  if (!(w > 0.001) || !(h > 0.001) || Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y, w, h };
}
// Where the picture sits inside a photo element (polaroid: 92% x 80% with a white frame).
export const photoInset = (frame) => (frame === 'polaroid' ? { x: 0.04, y: 0.04, w: 0.92, h: 0.8 } : { x: 0, y: 0, w: 1, h: 1 });
// Element height (page fraction) that shows a picture of pixel aspect `aspect` (w/h) uncut at width w.
// pageRatio = page width / page height.
export function photoHeight(w, frame, aspect, pageRatio) {
  const k = photoInset(frame);
  return (w * k.w * pageRatio) / (k.h * (aspect > 0 ? aspect : 1));
}
// Set (crop object) or remove (null) a photo's crop. Width and centre are kept; the height follows the new
// aspect (frame included). If that is taller than maxH the element shrinks to fit.
export function setPhotoCrop(zine, pageIndex, id, crop, aspect, pageRatio, maxH = 0.9) {
  return withElements(zine, pageIndex, (els) => els.map((e) => {
    if (e.id !== id) return e;
    const { crop: _old, ...rest } = e;
    let w = e.w;
    let h = photoHeight(w, e.frame, aspect, pageRatio);
    if (h > maxH) { w *= maxH / h; h = maxH; }
    const out = { ...rest, w, h, x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2 };
    const c = cropOf({ crop });
    if (c) out.crop = c;
    return out;
  }));
}

// ---- stickers the student made from a photo (optional top-level zine.myStickers: [{id, w, h}], newest first) ----
export const MY_STICKERS_MAX = 30;
export function myStickersOf(zine) {
  const a = zine && Array.isArray(zine.myStickers) ? zine.myStickers : [];
  return a.filter((s) => s && typeof s.id === 'string' && s.id && s.w > 0 && s.h > 0);
}
export function addMySticker(zine, s) {
  const list = [{ id: s.id, w: s.w, h: s.h }, ...myStickersOf(zine).filter((x) => x.id !== s.id)].slice(0, MY_STICKERS_MAX);
  return { ...zine, myStickers: list };
}

export const isPageFilled = (page) => (page.title || '').trim() !== '' || page.elements.length > 0;
export const filledCount = (zine) => zine.pages.filter(isPageFilled).length;

// Rotation ignored. Safe line: 5mm from each edge of a 105 x 148 mm page.
export function outsideSafeArea(el) {
  const sx = SAFE_MM / PAGE_W_MM;
  const sy = SAFE_MM / PAGE_H_MM;
  return el.x < sx || el.y < sy || el.x + el.w > 1 - sx || el.y + el.h > 1 - sy;
}
