// Zine editor (edit.html?page=N): state, history, autosave, photo uploads, thumbnails, toolbar.
import { call, getSession, clearSession, fetchPhoto } from './api.js';
import { createSaver, backupKeyFor } from './saver.js';
import { createUploadQueue } from './upload-queue.js';
import { resizeImage } from './image-resize.js';
import { createPhotoLoader } from './photo-cache.js';
import { createHistory } from './history.js';
import { ensureFonts, zineText } from './pdf.js';
import { renderPage } from './render.js';
import * as M from './model.js';
import { createStage, fitTextHeight, PAGE_RATIO } from './editor-stage.js';
import { createSheets } from './editor-sheets.js';
import { openCrop } from './crop-view.js';
import { openCutout } from './cutout-view.js';

const $ = (id) => document.getElementById(id);
const BADGE = {
  saving: '저장 중…',
  saved: '저장됨',
  error: '저장 실패 · 다시 시도',
  conflict: '다른 곳에서 수정됨 · 새로고침',
  auth: '다시 입장해 주세요',
};
const THUMB_W = 120;
const THUMB_H = Math.round(THUMB_W / PAGE_RATIO);

const session = getSession();
const loadImage = createPhotoLoader({ fetchPhoto });
const history = createHistory(50);

let zine = null;
let pageIndex = 0;
let selectedId = null;
let currentEntry = null; // last history entry applied: { zine, page }
let currentRev = 0;
let stage = null;
let sheets = null;
let saver = null;

// photo uploads (in memory only; never saved)
const localUrls = new Map(); // element id -> blob URL while pending
const localBySrc = new Map(); // photoId -> blob URL after upload (avoids re-downloading our own photo)
const blobs = new Map(); // element id -> resized Blob (kept for retry)
const uploaded = new Map(); // element id -> photoId
const failed = new Set(); // element ids whose upload gave up
const discarded = new Set(); // pending photos the student deleted: upload skipped, never shown again
const madeStickers = new Map(); // element id -> { w, h } for a sticker made from a photo (added to myStickers once uploaded)
let leaving = false; // set when we navigate away on purpose (no unload prompt)

// ---------- helpers ----------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}

const page = () => zine.pages[pageIndex];
const findEl = (id) => page().elements.find((e) => e.id === id);

// Pending photos: swap in the photoId once uploaded; drop the ones whose local data was discarded.
function normalize(z) {
  if (!uploaded.size && !discarded.size) return z;
  let changed = false;
  const pages = z.pages.map((p) => {
    if (!p.elements.some((e) => e.pending && (uploaded.has(e.id) || discarded.has(e.id)))) return p;
    changed = true;
    return {
      ...p,
      elements: p.elements.filter((e) => !(e.pending && discarded.has(e.id))).map((e) => {
        if (!e.pending || !uploaded.has(e.id)) return e;
        const { pending, ...rest } = e;
        return { ...rest, src: uploaded.get(e.id) };
      }),
    };
  });
  return changed ? { ...z, pages } : z;
}

// What the server and the local backup see: no pending (blob-backed) photos.
function strip(z) {
  if (!z.pages.some((p) => p.elements.some((e) => e.pending))) return z;
  return { ...z, pages: z.pages.map((p) => ({ ...p, elements: p.elements.filter((e) => !e.pending) })) };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

function imageAspect(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve((im.naturalWidth || 1) / (im.naturalHeight || 1));
    im.onerror = () => resolve(1);
    im.src = url;
  });
}

function newestId(z) {
  const els = z.pages[pageIndex].elements;
  return els.reduce((a, b) => (b.z > a.z ? b : a), els[0]).id;
}

const jitter = () => (Math.random() - 0.5) * 0.06;

// Load the font files for newly typed text before measuring it (the hand font is split per syllable range).
// Capped so a slow network never blocks editing; the text then wraps with whatever font is available.
// If the student switched pages meanwhile, go back to the page the text belongs to.
async function fontsFor(text) {
  const pi = pageIndex;
  await Promise.race([
    ensureFonts(document, text).catch(() => {}),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  if (pageIndex !== pi) setPage(pi);
}

// ---------- state changes ----------
function commit(next, opts = {}) {
  zine = normalize(next);
  currentEntry = { zine, page: pageIndex };
  if ('undoPage' in opts) currentEntry.undoPage = opts.undoPage; // page to show when this change is undone
  history.push(currentEntry);
  if ('select' in opts) selectedId = opts.select;
  if (selectedId && !findEl(selectedId)) selectedId = null;
  saver.schedule(strip(zine));
  refresh();
}

// The "my stickers" list is not part of undo/redo: history snapshots carry whatever list they had, so keep the current one.
const withMyStickers = (z) => (zine && zine.myStickers && z.myStickers !== zine.myStickers ? { ...z, myStickers: zine.myStickers } : z);

function applyEntry(entry, focusPage) {
  zine = normalize(withMyStickers(entry.zine));
  if (focusPage !== pageIndex) setPage(focusPage, false);
  if (selectedId && !findEl(selectedId)) selectedId = null;
  saver.schedule(strip(zine));
  refresh();
  renderThumbs();
}

function undo() {
  stage?.cancel();
  const prev = history.undo();
  if (!prev) return;
  const changedPage = currentEntry.undoPage ?? currentEntry.page; // the change being undone happened on this page
  currentEntry = prev;
  applyEntry(prev, changedPage);
}
function redo() {
  stage?.cancel();
  const next = history.redo();
  if (!next) return;
  currentEntry = next;
  applyEntry(next, next.page);
}

function select(id) {
  selectedId = id;
  refresh();
}

function setPage(i, rerender = true) {
  stage?.cancel();
  pageIndex = Math.max(0, Math.min(M.PAGE_COUNT - 1, i));
  selectedId = null;
  try { window.history.replaceState(null, '', `edit.html?page=${pageIndex + 1}`); } catch { /* file:// etc. */ }
  if (rerender) { refresh(); renderThumbs(); }
}

// Move the content of inner page `from` to position `to` (both 1..6); the moved page stays the one being edited.
function movePageTo(from, to) {
  const next = M.movePage(zine, from, to);
  if (next === zine) return;
  setPage(to, false);
  commit(next, { undoPage: from });
  renderThumbs();
}

// ---------- uploads ----------
const cancelled = () => Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
const queue = createUploadQueue({
  upload: async ({ id, blob }) => {
    if (discarded.has(id)) throw cancelled(); // deleted before its turn came
    const data = await blobToBase64(blob);
    const mime = blob.type || 'image/jpeg';
    const res = await call('uploadPhoto', { token: session.token, data, mime });
    loadImage.prime(res.photoId, { data, mime }); // we have the bytes already: never download our own photo
    return res.photoId;
  },
  shouldRetry: (err) => !(err && ['AUTH', 'BAD_INPUT', 'CANCELLED'].includes(err.code)),
});
queue.onChange((n) => {
  const chip = $('uploadChip');
  chip.hidden = n === 0;
  chip.textContent = `사진 올리는 중 · ${n}장 남음`;
});

function startUpload(id) {
  const blob = blobs.get(id);
  if (!blob) return;
  failed.delete(id);
  queue.add({ id, blob }).then((photoId) => {
    if (discarded.has(id)) return; // deleted while uploading
    const url = localUrls.get(id);
    uploaded.set(id, photoId);
    blobs.delete(id);
    localUrls.delete(id);
    localBySrc.set(photoId, url);
    let next = normalize(zine);
    const made = madeStickers.get(id);
    if (made) { madeStickers.delete(id); next = M.addMySticker(next, { id: photoId, w: made.w, h: made.h }); }
    if (next !== zine) {
      zine = next;
      saver.schedule(strip(zine));
    }
    refresh();
    // once the real image is loaded, stop using (and free) the local copy
    Promise.resolve(loadImage(photoId)).then((im) => {
      if (!im) return;
      localBySrc.delete(photoId);
      refresh();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(() => { /* keep showing the local copy */ });
  }, (err) => {
    if (discarded.has(id)) return;
    failed.add(id);
    if (err && err.code === 'AUTH') setBadge('auth');
    refresh();
    toast('사진을 올리지 못했어요. 사진을 눌러 다시 시도해 주세요.');
  });
  refresh();
}

// Pending photos (uploading or failed) anywhere in the zine: their only copy is in memory.
const unsentPhotos = () => zine.pages.reduce((n, p) => n + p.elements.filter((e) => e.pending).length, 0);

function discardPending(id) {
  discarded.add(id);
  madeStickers.delete(id);
  failed.delete(id);
  blobs.delete(id);
  const url = localUrls.get(id);
  localUrls.delete(id);
  if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function deleteElement(id) {
  stage?.cancel();
  const el = findEl(id);
  if (!el) return;
  commit(M.removeElement(zine, pageIndex, id), { select: null });
  if (el.pending) discardPending(id);
}

// One photo: offer the crop view first. Several at once: add them as they are (crop later from the menu).
async function addPhotos(files) {
  const single = files.length === 1;
  let k = 0;
  for (const file of files) {
    let blob;
    try { blob = await resizeImage(file); } catch (e) { toast(e.message || '이 사진 형식은 열 수 없어요'); continue; }
    const url = URL.createObjectURL(blob);
    let a;
    let crop = null;
    if (single) {
      stage?.cancel();
      const res = await openCrop({ src: url, mode: 'add', onError: cantOpen });
      if (!res) { URL.revokeObjectURL(url); return; } // cancelled
      crop = res.crop;
      a = res.aspect;
    } else {
      a = await imageAspect(url);
    }
    let w = 0.6;
    let h = M.photoHeight(w, 'polaroid', a, PAGE_RATIO); // polaroid: inner 92% x 80% keeps the photo's aspect
    if (h > 0.62) { w *= 0.62 / h; h = 0.62; }
    const off = (k++ % 5) * 0.04 - 0.08;
    const partial = {
      type: 'photo', src: '', pending: true, frame: 'polaroid', w, h,
      x: 0.5 - w / 2 + off, y: 0.5 - h / 2 + off,
    };
    if (crop) partial.crop = crop;
    const next = M.addElement(zine, pageIndex, partial);
    const id = newestId(next);
    localUrls.set(id, url);
    blobs.set(id, blob);
    commit(next, { select: id });
    startUpload(id);
  }
}

const MADE_MAX_H = 0.55;
const cantOpen = () => toast('사진을 열 수 없어요. 다른 사진을 골라 주세요.');

// 자르기 from the element menu: reopen the crop view on the full uploaded photo with the current crop.
async function recrop(id) {
  const el = findEl(id);
  if (!el || el.type !== 'photo' || el.pending) return;
  stage?.cancel();
  let src = app.localUrl(el);
  if (!src) {
    try { const im = await loadImage(el.src); src = im && im.src; } catch { src = null; }
    if (!src) { toast('사진을 불러오지 못했어요'); return; }
  }
  const pi = pageIndex;
  const res = await openCrop({ src, crop: M.cropOf(el), mode: 'edit', onError: cantOpen });
  if (!res || pi !== pageIndex || !findEl(id)) return;
  const r4 = (c) => JSON.stringify(c && [c.x, c.y, c.w, c.h].map((v) => Math.round(v * 10000)));
  if (r4(res.crop) === r4(M.cropOf(el))) return;
  commit(M.setPhotoCrop(zine, pageIndex, id, res.crop, res.aspect, PAGE_RATIO), { select: id });
}

// 스티커 > 만들기: cut a sticker out of one of my photos; uploaded as a PNG like any photo.
async function makeSticker(file) {
  let blob;
  try { blob = await resizeImage(file); } catch (e) { toast(e.message || '이 사진 형식은 열 수 없어요'); return; }
  const src = URL.createObjectURL(blob);
  stage?.cancel();
  const res = await openCutout({ src, onError: cantOpen });
  URL.revokeObjectURL(src);
  if (!res) return;
  const url = URL.createObjectURL(res.blob);
  const aspect = res.w / res.h;
  let w = 0.45;
  let h = (w * PAGE_RATIO) / aspect;
  if (h > MADE_MAX_H) { w *= MADE_MAX_H / h; h = MADE_MAX_H; }
  const next = M.addElement(zine, pageIndex, {
    type: 'sticker', src: '', pending: true, w, h, x: 0.5 - w / 2 + jitter(), y: 0.5 - h / 2 + jitter(),
  });
  const id = newestId(next);
  localUrls.set(id, url);
  blobs.set(id, res.blob);
  madeStickers.set(id, { w: res.w, h: res.h });
  commit(next, { select: id });
  startUpload(id);
}

// ---------- app facade for stage & sheets ----------
const app = {
  page,
  pageNumber: () => pageIndex + 1,
  get selectedId() { return selectedId; },
  select,
  findEl,
  loadImage,
  call: (action, body = {}) => call(action, body),
  toast,
  localUrl: (el) => (el.pending ? localUrls.get(el.id) : localBySrc.get(el.src)) || null,
  uploadState: (el) => (el.pending ? (failed.has(el.id) ? 'failed' : 'uploading') : null),
  commitElement(id, patch) { commit(M.updateElement(zine, pageIndex, id, patch)); },
  commitTitleBox(box) { commit(M.moveTitle(zine, pageIndex, box)); },
  commitTitleSize(size) { commit(M.setTitleSize(zine, pageIndex, size)); },
  tapTitle() { sheets.open('title'); },
  tapElement(id) {
    const el = findEl(id);
    if (!el) return;
    if (el.type === 'text') sheets.open('text', el);
    else if (el.pending && failed.has(id)) startUpload(id);
  },
  onRendered(els) {
    $('outChip').hidden = !els.some(M.outsideSafeArea);
  },
  myStickers: () => M.myStickersOf(zine),
  makeSticker,
  // size: width (page fraction); maxH: shrink so the height stays under it (made stickers use the same 0.55 as makeSticker)
  addSticker(src, aspect, { size = 0.25, maxH = 1.5 } = {}) {
    let w = size;
    let h = (w * PAGE_RATIO) / (aspect || 1);
    if (h > maxH) { w *= maxH / h; h = maxH; }
    const next = M.addElement(zine, pageIndex, { type: 'sticker', src, w, h, x: 0.5 - w / 2 + jitter(), y: 0.5 - h / 2 + jitter() });
    commit(next, { select: newestId(next) });
  },
  async addText(text, style) {
    await fontsFor(text);
    const w = 0.8;
    const el = { type: 'text', text, style: { ...style }, w, x: 0.1 };
    el.h = fitTextHeight(el);
    el.y = Math.max(0.05, 0.62 - el.h / 2);
    const next = M.addElement(zine, pageIndex, el);
    commit(next, { select: newestId(next) });
  },
  async updateText(id, text, style) {
    await fontsFor(text);
    const el = findEl(id);
    if (!el) return;
    const upd = { ...el, text, style: { ...el.style, ...style } };
    commit(M.updateElement(zine, pageIndex, id, { text, style: upd.style, h: fitTextHeight(upd) }));
  },
  removeElement: deleteElement,
  async setTitle(title, hl, { font, size } = {}) {
    await fontsFor(title);
    let next = M.setPageTitle(zine, pageIndex, title);
    if (hl) next = M.setTitleHighlight(next, pageIndex, hl);
    // only store font/size once they differ from the defaults, so untouched pages keep the server's shape
    const p0 = page();
    if (font && (p0.titleFont !== undefined || M.fontOf(font) !== 'sans')) next = M.setTitleFont(next, pageIndex, font);
    if (size && (p0.titleSize !== undefined || Math.abs(M.titleSizeOf({ titleSize: size }) - M.TITLE_SIZE.def) > 1e-6)) next = M.setTitleSize(next, pageIndex, size);
    if (JSON.stringify(next.pages[pageIndex]) !== JSON.stringify(page())) commit(next);
  },
  setBackground(k) { if (page().background !== k) commit(M.setBackground(zine, pageIndex, k)); },
  setPattern(p) { if (page().pattern !== p) commit(M.setPattern(zine, pageIndex, p)); },
};

// ---------- UI ----------
function setBadge(status) {
  const b = $('badge');
  b.dataset.state = status;
  b.textContent = BADGE[status] || BADGE.saved;
}

function pageLabel(i) {
  return i === 0 ? '표지' : i === M.PAGE_COUNT - 1 ? '뒷표지' : `${i + 1}쪽`;
}

function refresh() {
  if (!stage) return;
  stage.render();
  const el = selectedId ? findEl(selectedId) : null;
  $('ctxHint').hidden = !!el;
  $('ctxBtns').hidden = !el;
  if (el) {
    const btns = $('ctxBtns');
    const show = (act, on) => { btns.querySelector(`[data-act="${act}"]`).hidden = !on; };
    const isFailed = el.pending && failed.has(el.id);
    show('frame', el.type === 'photo');
    show('crop', el.type === 'photo' && !el.pending);
    show('edit', el.type === 'text');
    show('retry', isFailed);
    show('duplicate', !el.pending);
    const fb = btns.querySelector('[data-act="frame"]');
    fb.setAttribute('aria-pressed', String(el.frame === 'polaroid'));
    fb.querySelector('span').textContent = el.frame === 'polaroid' ? '틀 빼기' : '폴라로이드 틀';
  }
  const inner = pageIndex >= 1 && pageIndex <= M.PAGE_COUNT - 2;
  $('moveLeft').hidden = $('moveRight').hidden = !inner;
  $('moveLeft').disabled = pageIndex <= 1;
  $('moveRight').disabled = pageIndex >= M.PAGE_COUNT - 2;
  $('undo').disabled = !history.canUndo();
  $('redo').disabled = !history.canRedo();
  const t = (page().title || '').trim();
  $('pageName').textContent = t ? `${pageLabel(pageIndex)} · ${t}` : pageLabel(pageIndex);
  document.title = `${pageLabel(pageIndex)} 꾸미기 · 나만의 진`;
}

// Thumbnails: each rendered off-screen then copied, so a slow photo load cannot overwrite a newer one.
const thumbKeys = [];
const thumbTokens = [];
const thumbBtns = [];
function buildThumbs() {
  const host = $('thumbs');
  M.PAGE_LABELS.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ed-thumb' + (i === 0 || i === M.PAGE_COUNT - 1 ? ' ed-thumb-cover' : '');
    b.setAttribute('aria-label', pageLabel(i));
    const cv = document.createElement('canvas');
    cv.width = THUMB_W; cv.height = THUMB_H;
    const tag = document.createElement('span');
    tag.textContent = label;
    b.append(cv, tag);
    b.addEventListener('click', () => { if (i !== pageIndex) setPage(i); });
    host.append(b);
    thumbBtns.push(b);
  });
  wireThumbSort(host);
}

// Long-press (350 ms) an inner page's thumbnail, then drag it left/right; a dashed slot shows where it lands.
const LONG_PRESS_MS = 350;
function wireThumbSort(host) {
  let s = null; // { id, from, btn, x0, y0, timer, sorting, slots, to, slot, dx }
  let swallowClick = false;
  const inner = (i) => i >= 1 && i <= M.PAGE_COUNT - 2;

  function lift() {
    s.sorting = true;
    stage?.cancel();
    const rects = thumbBtns.map((b) => b.getBoundingClientRect());
    s.slots = rects.slice(1, M.PAGE_COUNT - 1).map((r) => r.left + r.width / 2); // centers of positions 1..6
    const r = rects[s.from];
    s.dx = s.x0 - r.left;
    s.slot = document.createElement('span');
    s.slot.className = 'ed-thumb-slot';
    host.insertBefore(s.slot, s.btn);
    Object.assign(s.btn.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    s.btn.classList.add('is-lifted');
    host.classList.add('is-sorting');
    s.to = s.from;
    if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* ignore */ }
  }
  function place(x) {
    s.btn.style.left = x - s.dx + 'px';
    let best = 0;
    s.slots.forEach((c, k) => { if (Math.abs(c - x) < Math.abs(s.slots[best] - x)) best = k; });
    s.to = best + 1;
    const others = thumbBtns.slice(1, M.PAGE_COUNT - 1).filter((b) => b !== s.btn);
    host.insertBefore(s.slot, others[s.to - 1] || thumbBtns[M.PAGE_COUNT - 1]);
  }
  function end(commitMove) {
    if (!s) return;
    clearTimeout(s.timer);
    const done = s;
    s = null;
    if (!done.sorting) return;
    done.slot.remove();
    done.btn.classList.remove('is-lifted');
    Object.assign(done.btn.style, { left: '', top: '', width: '', height: '' });
    host.classList.remove('is-sorting');
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 400);
    if (commitMove && done.to !== done.from) movePageTo(done.from, done.to);
  }

  host.addEventListener('pointerdown', (e) => {
    if (s || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const i = thumbBtns.indexOf(e.target.closest('.ed-thumb'));
    if (!inner(i)) return;
    s = { id: e.pointerId, from: i, btn: thumbBtns[i], x0: e.clientX, y0: e.clientY, sorting: false };
    s.timer = setTimeout(() => { if (s && !s.sorting) { lift(); try { host.setPointerCapture(s.id); } catch { /* ignore */ } } }, LONG_PRESS_MS);
  });
  host.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (!s.sorting) { if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) > (e.pointerType === 'touch' ? 14 : 8)) end(false); return; } // a held finger wobbles
    place(e.clientX);
  });
  host.addEventListener('pointerup', (e) => { if (s && e.pointerId === s.id) end(true); });
  host.addEventListener('pointercancel', (e) => { if (s && e.pointerId === s.id) end(false); });
  // while dragging, the strip must not scroll (and iOS must not show its long-press menu)
  host.addEventListener('touchmove', (e) => { if (s && s.sorting && e.cancelable) e.preventDefault(); }, { passive: false });
  host.addEventListener('contextmenu', (e) => e.preventDefault());
  host.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
}
function renderThumbs() {
  const z = strip(zine);
  for (let i = 0; i < M.PAGE_COUNT; i++) {
    const b = thumbBtns[i];
    b.classList.toggle('on', i === pageIndex);
    if (i === pageIndex) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    const key = JSON.stringify(z.pages[i]);
    if (thumbKeys[i] === key) continue;
    thumbKeys[i] = key;
    const token = (thumbTokens[i] = (thumbTokens[i] || 0) + 1);
    const off = document.createElement('canvas');
    off.width = THUMB_W; off.height = THUMB_H;
    renderPage(off.getContext('2d'), z.pages[i], { width: THUMB_W, height: THUMB_H, pageNumber: i + 1, loadImage })
      .then(() => {
        if (thumbTokens[i] !== token) return;
        const ctx = b.querySelector('canvas').getContext('2d');
        ctx.clearRect(0, 0, THUMB_W, THUMB_H);
        ctx.drawImage(off, 0, 0);
      })
      .catch(() => { thumbKeys[i] = null; })
      .finally(() => { off.width = off.height = 0; });
  }
  b0ScrollIntoView();
}
function b0ScrollIntoView() {
  const cur = thumbBtns[pageIndex];
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function wireUi() {
  $('badge').addEventListener('click', () => {
    const s = $('badge').dataset.state;
    if (s === 'error') saver.flush();
    else if (s === 'conflict') location.reload();
    else if (s === 'auth') leave('index.html', { switchUser: true });
  });
  $('backLink').addEventListener('click', (e) => { e.preventDefault(); leave('view.html'); });
  $('whoBtn').addEventListener('click', () => {
    if (!window.confirm(`지금은 "${session.name || '나'}"(으)로 들어와 있어요.\n다른 이름으로 들어갈까요?`)) return;
    leave('index.html', { switchUser: true });
  });

  const input = $('photoInput');
  input.addEventListener('change', () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (files.length) addPhotos(files);
  });
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.tool;
    if (t === 'photo') input.click();
    else if (t === 'text') sheets.open('text', null);
    else sheets.open(t);
  }));
  $('moveLeft').addEventListener('click', () => movePageTo(pageIndex, pageIndex - 1));
  $('moveRight').addEventListener('click', () => movePageTo(pageIndex, pageIndex + 1));
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);

  $('ctxBtns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    const el = selectedId && findEl(selectedId);
    if (!b || !el) return;
    const id = el.id;
    switch (b.dataset.act) {
      case 'forward': commit(M.bringForward(zine, pageIndex, id)); break;
      case 'backward': commit(M.sendBackward(zine, pageIndex, id)); break;
      case 'duplicate': { if (el.pending) break; const next = M.duplicateElement(zine, pageIndex, id); commit(next, { select: newestId(next) }); break; }
      case 'delete': deleteElement(id); break;
      case 'frame': commit(M.updateElement(zine, pageIndex, id, { frame: el.frame === 'polaroid' ? 'none' : 'polaroid' })); break;
      case 'edit': sheets.open('text', el); break;
      case 'crop': recrop(id); break;
      case 'retry': startUpload(id); break;
      default:
    }
  });

  document.addEventListener('keydown', (e) => {
    if (sheets.isOpen() || document.body.classList.contains('cv-open') || e.target.closest('input, textarea, [contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteElement(selectedId); }
    else if (e.key === 'Escape' && selectedId) select(null);
  });

  window.addEventListener('beforeunload', (e) => {
    if (!leaving && (queue.pending() > 0 || unsentPhotos() > 0)) { e.preventDefault(); e.returnValue = ''; }
  });

  // keep bottom sheets above the on-screen keyboard (iOS and Android) and no taller than the space left
  const vv = window.visualViewport;
  if (vv) {
    const root = document.documentElement.style;
    const fit = () => {
      root.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
      root.setProperty('--vvh', vv.height + 'px');
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }
}

// Leave the editor on purpose: warn about photos that only exist on this device, then make sure the
// latest changes reached the server. If they did not, stay and show the red badge.
let leavingNow = false;
async function leave(href, { switchUser = false } = {}) {
  if (leavingNow) return;
  stage?.cancel();
  const n = unsentPhotos();
  if (n > 0 || queue.pending() > 0) {
    const msg = n > 0
      ? `아직 올라가지 않은 사진 ${n}장은 사라져요. 그래도 나갈까요?`
      : '사진을 올리는 중이에요. 그래도 나갈까요?';
    if (!window.confirm(msg)) return;
  }
  leavingNow = true;
  try {
    const status = await saver.flush();
    // a dead session (auth) cannot save anyway; its work stays in this device's backup for that name
    const ok = status === 'saved' || (switchUser && status === 'auth');
    if (!ok) {
      setBadge(status === 'saving' ? 'error' : status);
      toast(status === 'conflict' ? '다른 곳에서 고친 내용이 있어요. 새로고침해 주세요.'
        : status === 'auth' ? '다시 입장해야 저장돼요. 위의 빨간 단추를 눌러 주세요.'
          : '저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
      return;
    }
    leaving = true;
    if (switchUser) clearSession();
    location.href = href;
  } finally { leavingNow = false; }
}

function showStale() {
  const stale = saver.getStaleBackup();
  if (!stale || !stale.zine || !Array.isArray(stale.zine.pages) || stale.zine.pages.length !== M.PAGE_COUNT) return;
  const bar = $('stale');
  bar.hidden = false;
  $('staleLoad').onclick = () => {
    bar.hidden = true;
    saver.discardStaleBackup();
    selectedId = null;
    const mine = M.mergeMyStickers(zine.myStickers, stale.zine.myStickers);
    const restored = { ...stale.zine, rev: currentRev };
    if (mine.length) restored.myStickers = mine; else delete restored.myStickers;
    commit(restored);
    renderThumbs();
  };
  $('staleDrop').onclick = () => { bar.hidden = true; saver.discardStaleBackup(); };
}

function fail(msg) {
  const l = $('loading');
  l.hidden = false;
  l.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = msg;
  const b = document.createElement('button');
  b.className = 'btn btn-primary';
  b.textContent = '다시 시도';
  b.addEventListener('click', () => location.reload());
  l.append(p, b);
}

async function main() {
  if (!session || !session.token) { location.replace('index.html'); return; }
  let res;
  try {
    res = await call('load', { token: session.token });
  } catch (e) {
    if (e && e.code === 'AUTH') { clearSession(); location.replace('index.html'); return; }
    fail(e && e.code ? '진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' : '인터넷 연결을 확인해 주세요.');
    return;
  }

  saver = createSaver({
    save: (z, { saveId } = {}) => call('save', { token: session.token, zine: z, saveId }).then((r) => ({ rev: r.rev })),
    backupKey: backupKeyFor(session.name),
  });
  saver.onStatus((status, info) => {
    if (info && typeof info.rev === 'number') currentRev = info.rev;
    setBadge(status);
    if (status === 'saved') renderThumbs();
  });
  currentRev = res.zine.rev;
  zine = saver.restore(res.zine);

  const q = Number(new URLSearchParams(location.search).get('page'));
  pageIndex = Number.isInteger(q) && q >= 1 && q <= M.PAGE_COUNT ? q - 1 : 0;
  currentEntry = { zine, page: pageIndex };
  history.push(currentEntry);

  // Fonts (for all text in this zine) first so on-screen text wraps exactly like the PDF; don't hang forever offline.
  await Promise.race([ensureFonts(document, zineText([zine])).catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  $('whoBtn').textContent = session.name || '나';
  $('whoBtn').setAttribute('aria-label', `${session.name || '나'} · 다른 이름으로 들어가기`);

  sheets = createSheets(app);
  stage = createStage($('stageInner'), app);
  buildThumbs();
  wireUi();
  setPage(pageIndex, false);
  refresh();
  renderThumbs();
  showStale();
  $('loading').hidden = true;
}

main();
