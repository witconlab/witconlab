// Zine data model: pure, immutable operations.
export const PAGE_COUNT = 8;
export const PAPERS = { cream: '#f6efdc', yellow: '#ffe9a8', sky: '#dbeefa', lime: '#e4f1d0', white: '#ffffff' };
export const TEXT_COLORS = { ink: '#2b2620', red: '#e8473a', blue: '#2f6fb3', white: '#ffffff' };
export const PATTERNS = ['dots', 'grid', 'none'];
export const HIGHLIGHTS = { lavender: '#c9b8e8', sky: '#a9cdf2', lemon: '#fbe58a', pink: '#f6b8c4' };
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

export const isPageFilled = (page) => (page.title || '').trim() !== '' || page.elements.length > 0;
export const filledCount = (zine) => zine.pages.filter(isPageFilled).length;

// Rotation ignored. Safe line: 5mm from each edge of a 105 x 148 mm page.
export function outsideSafeArea(el) {
  const sx = SAFE_MM / PAGE_W_MM;
  const sy = SAFE_MM / PAGE_H_MM;
  return el.x < sx || el.y < sy || el.x + el.w > 1 - sx || el.y + el.h > 1 - sy;
}
