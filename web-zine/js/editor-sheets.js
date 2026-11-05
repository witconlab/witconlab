// Editor bottom sheets: stickers, caption text, page title, background.
import { BUILTIN_STICKERS, getSticker } from './stickers.js';
import { PAPERS, TEXT_COLORS, HIGHLIGHTS } from './model.js';

const $ = (id) => document.getElementById(id);
const RECENT_KEY = 'webzine.recentStickers';
const RECENT_MAX = 12;
const TABS = [
  ['recent', '최근'], ['face', '얼굴'], ['doodle', '낙서'], ['star', '별'], ['number', '숫자'],
  ['alpha', '알파벳'], ['letter', '글자'], ['teacher', '선생님'],
];
const TAB_GROUPS = { face: ['face'], doodle: ['doodle', 'tape'], star: ['star'], number: ['number'], alpha: ['alpha'], letter: ['letter'] };
const PAPER_NAMES = { cream: '크림', yellow: '노랑', sky: '하늘', lime: '연두', white: '흰색' };
const COLOR_NAMES = { ink: '검정', red: '빨강', blue: '파랑', white: '흰색' };
const HL_NAMES = { lavender: '보라', sky: '하늘', lemon: '레몬', pink: '분홍' };
const DEFAULT_SIZE = 0.055;

function readRecent() {
  try {
    const a = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(a) ? a.filter((s) => typeof s === 'string') : [];
  } catch { return []; }
}
function pushRecent(src) {
  const a = [src, ...readRecent().filter((s) => s !== src)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(a)); } catch { /* private mode */ }
}

function swatches(host, entries, name, onPick) {
  host.textContent = '';
  for (const [key, color, label] of entries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset[name] = key;
    b.style.setProperty('--c', color);
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', () => onPick(key));
    host.append(b);
  }
}
const mark = (host, attr, value) => host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))));

/**
 * app: { page(), loadImage(src), addSticker(src, aspect), addText(text, style), updateText(id, text, style),
 *        removeElement(id), setTitle(title, highlight), setBackground(k), setPattern(p), setFrameLine(on),
 *        call(action, body), toast(msg) }
 */
export function createSheets(app) {
  const backdrop = $('backdrop');
  let openId = null;
  let lastFocus = null;

  function open(id) {
    if (openId) close();
    openId = id;
    lastFocus = document.activeElement;
    const s = $(id);
    s.removeAttribute('inert');
    backdrop.hidden = false;
    requestAnimationFrame(() => { backdrop.classList.add('show'); s.classList.add('open'); });
  }
  function close() {
    if (!openId) return;
    const s = $(openId);
    s.classList.remove('open');
    s.setAttribute('inert', '');
    backdrop.classList.remove('show');
    backdrop.hidden = true;
    openId = null;
    if (document.activeElement && s.contains(document.activeElement)) document.activeElement.blur();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  backdrop.addEventListener('click', close);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) { e.stopPropagation(); close(); } }, true);

  // ---- stickers ----
  const tabs = $('stkTabs');
  const grid = $('stkGrid');
  let tab = null;
  let teacher = null; // cached listStickers result

  for (const [key, label] of TABS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stk-tab';
    b.dataset.tab = key;
    b.setAttribute('role', 'tab');
    b.textContent = label;
    b.addEventListener('click', () => showTab(key));
    tabs.append(b);
  }

  function preview(src) {
    if (src.startsWith('builtin:')) {
      const st = getSticker(src.slice(8));
      if (!st) return null;
      if (st.draw) {
        const a = st.aspect || 1;
        const cv = document.createElement('canvas');
        const cw = 132, ch = Math.round(132 / a);
        cv.width = cw; cv.height = ch;
        st.draw(cv.getContext('2d'), cw, ch);
        return cv;
      }
      const img = new Image();
      img.alt = '';
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(st.svg);
      return img;
    }
    const img = new Image();
    img.alt = '';
    Promise.resolve(app.loadImage(src)).then((im) => { if (im) img.src = im.src; }).catch(() => img.classList.add('broken'));
    return img;
  }

  function cell(src, label, aspect) {
    const node = preview(src);
    if (!node) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stk-cell';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(node);
    b.addEventListener('click', async () => {
      let a = aspect;
      if (!a) {
        try {
          const im = await app.loadImage(src);
          a = im ? (im.naturalWidth || 1) / (im.naturalHeight || 1) : 1;
        } catch { app.toast('스티커를 불러오지 못했어요'); return; }
      }
      pushRecent(src);
      close();
      app.addSticker(src, a);
    });
    return b;
  }

  function note(text) {
    const p = document.createElement('p');
    p.className = 'stk-empty';
    p.textContent = text;
    grid.append(p);
  }

  async function showTab(key) {
    tab = key;
    tabs.querySelectorAll('.stk-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === key)));
    grid.textContent = '';
    grid.scrollTop = 0;
    if (key === 'recent') {
      const items = readRecent();
      if (!items.length) return note('아직 쓴 스티커가 없어요. 다른 탭에서 골라 보세요.');
      for (const src of items) {
        const st = src.startsWith('builtin:') ? getSticker(src.slice(8)) : null;
        const c = st ? cell(src, st.label, st.aspect) : src.startsWith('custom:') ? cell(src, '선생님 스티커', 0) : null;
        if (c) grid.append(c);
      }
      return;
    }
    if (key === 'teacher') {
      if (!teacher) {
        note('불러오는 중…');
        try { teacher = (await app.call('listStickers')).stickers || []; } catch {
          if (tab === key) { grid.textContent = ''; note('선생님 스티커를 불러오지 못했어요.'); }
          return;
        }
        if (tab !== key) return;
        grid.textContent = '';
      }
      if (!teacher.length) return note('아직 선생님 스티커가 없어요.');
      for (const s of teacher) grid.append(cell('custom:' + s.id, s.name || '선생님 스티커', 0));
      return;
    }
    for (const st of BUILTIN_STICKERS.filter((s) => TAB_GROUPS[key].includes(s.group))) {
      const c = cell('builtin:' + st.key, st.label, st.aspect);
      if (c) grid.append(c);
    }
  }

  function openStickers() {
    open('sheet-sticker');
    showTab(tab || (readRecent().length ? 'recent' : 'face'));
  }

  // ---- caption text ----
  const textInput = $('textInput');
  const textSize = $('textSize');
  const textColor = $('textColor');
  let textEditing = null;
  let textStyle = { size: DEFAULT_SIZE, color: 'ink', align: 'center' };
  swatches(textColor, Object.entries(TEXT_COLORS).map(([k, c]) => [k, c, COLOR_NAMES[k] || k]), 'color', (k) => {
    textStyle = { ...textStyle, color: k };
    mark(textColor, 'color', k);
  });
  textSize.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    textStyle = { ...textStyle, size: Number(b.dataset.size) };
    mark(textSize, 'size', b.dataset.size);
  }));
  function syncTextUi() {
    mark(textColor, 'color', textStyle.color);
    const sizes = [...textSize.querySelectorAll('button')].map((b) => Number(b.dataset.size));
    const nearest = sizes.reduce((a, b) => (Math.abs(b - textStyle.size) < Math.abs(a - textStyle.size) ? b : a));
    mark(textSize, 'size', Math.abs(nearest - textStyle.size) < 0.004 ? nearest : '');
  }
  function openText(el) {
    textEditing = el ? el.id : null;
    textInput.value = el ? el.text || '' : '';
    textStyle = el ? { size: DEFAULT_SIZE, color: 'ink', align: 'center', ...el.style } : { size: DEFAULT_SIZE, color: 'ink', align: 'center' };
    $('textHead').textContent = el ? '자막 고치기' : '자막 넣기';
    $('textOk').textContent = el ? '고치기' : '넣기';
    syncTextUi();
    open('sheet-text');
    setTimeout(() => textInput.focus(), 240);
  }
  $('textOk').addEventListener('click', () => {
    const text = textInput.value.replace(/\s+$/, '');
    const id = textEditing;
    close();
    if (!text.trim()) { if (id) app.removeElement(id); return; }
    if (id) app.updateText(id, text, textStyle); else app.addText(text, textStyle);
  });

  // ---- title ----
  const titleInput = $('titleInput');
  const titleHl = $('titleHl');
  let hl = 'sky';
  swatches(titleHl, Object.entries(HIGHLIGHTS).map(([k, c]) => [k, c, HL_NAMES[k] || k]), 'hl', (k) => { hl = k; mark(titleHl, 'hl', k); });
  function openTitle() {
    const p = app.page();
    titleInput.value = p.title || '';
    hl = p.titleHighlight || 'sky';
    mark(titleHl, 'hl', hl);
    open('sheet-title');
    setTimeout(() => titleInput.focus(), 240);
  }
  const commitTitle = () => { const t = titleInput.value.trim().slice(0, 20); close(); app.setTitle(t, hl); };
  $('titleOk').addEventListener('click', commitTitle);
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commitTitle(); } });
  $('titleClear').addEventListener('click', () => { titleInput.value = ''; titleInput.focus(); });

  // ---- background ----
  const bgPaper = $('bgPaper');
  const bgPattern = $('bgPattern');
  const bgFrame = $('bgFrame');
  swatches(bgPaper, Object.entries(PAPERS).map(([k, c]) => [k, c, PAPER_NAMES[k] || k]), 'paper', (k) => { app.setBackground(k); syncBg(); });
  bgPattern.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { app.setPattern(b.dataset.pattern); syncBg(); }));
  bgFrame.addEventListener('change', () => { app.setFrameLine(bgFrame.checked); syncBg(); });
  function syncBg() {
    const p = app.page();
    mark(bgPaper, 'paper', p.background);
    mark(bgPattern, 'pattern', p.pattern);
    bgFrame.checked = !!p.frameLine;
  }
  function openBg() { syncBg(); open('sheet-bg'); }

  return {
    open: (name, arg) => ({ sticker: openStickers, text: openText, title: openTitle, bg: openBg }[name])(arg),
    close,
    isOpen: () => openId !== null,
  };
}
