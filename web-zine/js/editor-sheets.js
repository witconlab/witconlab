// Editor bottom sheets: stickers, caption text, page title, background.
import { BUILTIN_STICKERS, getSticker } from './stickers.js';
import { PAPERS, TEXT_COLORS, HIGHLIGHTS, fontOf, titleSizeOf } from './model.js';
import { DEFAULT_TEXT_SIZE } from './render.js';

const $ = (id) => document.getElementById(id);
const RECENT_KEY = 'webzine.recentStickers';
const RECENT_MAX = 12;
const TABS = [
  ['make', '만들기'], ['recent', '최근'], ['face', '얼굴'], ['doodle', '낙서'], ['star', '별'], ['number', '숫자'],
  ['alpha', '알파벳'], ['letter', '글자'],
];
const TAB_GROUPS = { face: ['face'], doodle: ['doodle', 'tape'], star: ['star'], number: ['number'], alpha: ['alpha'], letter: ['letter'] };
const PAPER_NAMES = { cream: '크림', yellow: '노랑', sky: '하늘', lime: '연두', white: '흰색' };
const COLOR_NAMES = { ink: '검정', red: '빨강', blue: '파랑', white: '흰색' };
const HL_NAMES = { lavender: '보라', sky: '하늘', lemon: '레몬', pink: '분홍', white: '흰색' };
const DEFAULT_SIZE = DEFAULT_TEXT_SIZE;

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
// Font pills ("기본" / "손글씨" / "명조"): the input previews the chosen font.
function fontPicker(host, input, onPick) {
  host.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.font)));
  return (font) => { mark(host, 'font', fontOf(font)); input.classList.toggle('hand', fontOf(font) === 'hand'); input.classList.toggle('serif', fontOf(font) === 'serif'); };
}
const mark = (host, attr, value) => host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(value))));

/**
 * app: { page(), loadImage(src), addSticker(src, aspect, { size, maxH }), myStickers(), makeSticker(file), addText(text, style), updateText(id, text, style),
 *        removeElement(id), setTitle(title, highlight, { font, size }), setBackground(k), setPattern(p),
 *        call(action, body), toast(msg) }
 */
export function createSheets(app) {
  const backdrop = $('backdrop');
  let openId = null;
  let lastFocus = null;

  // A tap on the page opens a sheet on pointerup; the browser then fires that tap's click at the same spot,
  // which is now the (just shown) backdrop. So the backdrop only closes for a press that started on it, and the
  // slide-in frame checks the sheet is still the open one (a close before that frame left it shown but inert).
  let pressOnBackdrop = false;
  function open(id) {
    if (openId) close();
    openId = id;
    lastFocus = document.activeElement;
    const s = $(id);
    s.removeAttribute('inert');
    backdrop.hidden = false;
    pressOnBackdrop = false;
    requestAnimationFrame(() => { if (openId !== id) return; backdrop.classList.add('show'); s.classList.add('open'); });
  }
  const focusLater = (id, input) => setTimeout(() => { if (openId === id) input.focus(); }, 240);
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
  backdrop.addEventListener('pointerdown', () => { pressOnBackdrop = true; });
  backdrop.addEventListener('click', () => { if (pressOnBackdrop) close(); pressOnBackdrop = false; });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) { e.stopPropagation(); close(); } }, true);

  // ---- stickers ----
  const tabs = $('stkTabs');
  const grid = $('stkGrid');
  let tab = null;

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

  function cell(src, label, aspect, { size, maxH, recent = true } = {}) {
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
      if (recent) pushRecent(src); // made stickers stay out of "최근" (that list is per device, not per student)
      close();
      app.addSticker(src, a, { size, maxH });
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
    if (key === 'make') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stk-make';
      b.textContent = '+ 내 사진으로 스티커 만들기';
      b.addEventListener('click', () => makeInput.click());
      grid.append(b);
      const mine = app.myStickers();
      if (!mine.length) return note('내 사진에서 오려 낸 스티커가 여기에 모여요.');
      const sub = document.createElement('p');
      sub.className = 'stk-sub';
      sub.textContent = '내가 만든 스티커';
      grid.append(sub);
      for (const m of mine) {
        const c = cell(m.id, '내가 만든 스티커', m.w / m.h, { size: 0.4, maxH: 0.55, recent: false });
        if (c) grid.append(c);
      }
      return;
    }
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
    for (const st of BUILTIN_STICKERS.filter((s) => TAB_GROUPS[key].includes(s.group))) {
      const c = cell('builtin:' + st.key, st.label, st.aspect);
      if (c) grid.append(c);
    }
  }

  const makeInput = $('stickerPhotoInput');
  makeInput.addEventListener('change', () => {
    const file = makeInput.files && makeInput.files[0];
    makeInput.value = '';
    if (!file) return;
    close();
    app.makeSticker(file);
  });

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
  const showTextFont = fontPicker($('textFont'), textInput, (f) => { textStyle = { ...textStyle, font: f }; showTextFont(f); });
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
    showTextFont(textStyle.font);
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
    focusLater('sheet-text', textInput);
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
  const titleSize = $('titleSize');
  let hl = 'sky';
  let tFont = 'sans';
  const showTitleFont = fontPicker($('titleFont'), titleInput, (f) => { tFont = f; showTitleFont(f); });
  swatches(titleHl, Object.entries(HIGHLIGHTS).map(([k, c]) => [k, c, HL_NAMES[k] || k]), 'hl', (k) => { hl = k; mark(titleHl, 'hl', k); });
  function openTitle() {
    const p = app.page();
    titleInput.value = p.title || '';
    hl = p.titleHighlight || 'sky';
    mark(titleHl, 'hl', hl);
    tFont = fontOf(p.titleFont);
    showTitleFont(tFont);
    titleSize.value = String(titleSizeOf(p));
    open('sheet-title');
    focusLater('sheet-title', titleInput);
  }
  const commitTitle = () => {
    const t = titleInput.value.trim().slice(0, 20);
    close();
    app.setTitle(t, hl, { font: tFont, size: Number(titleSize.value) });
  };
  $('titleOk').addEventListener('click', commitTitle);
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commitTitle(); } });
  $('titleClear').addEventListener('click', () => { titleInput.value = ''; titleInput.focus(); });

  // ---- background ----
  const bgPaper = $('bgPaper');
  const bgPattern = $('bgPattern');
  swatches(bgPaper, Object.entries(PAPERS).map(([k, c]) => [k, c, PAPER_NAMES[k] || k]), 'paper', (k) => { app.setBackground(k); syncBg(); });
  bgPattern.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { app.setPattern(b.dataset.pattern); syncBg(); }));
  function syncBg() {
    const p = app.page();
    mark(bgPaper, 'paper', p.background);
    mark(bgPattern, 'pattern', p.pattern);
  }
  function openBg() { syncBg(); open('sheet-bg'); }

  return {
    open: (name, arg) => ({ sticker: openStickers, text: openText, title: openTitle, bg: openBg }[name])(arg),
    close,
    isOpen: () => openId !== null,
  };
}
