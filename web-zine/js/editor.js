// Zine editor (edit.html?page=N): state, history, autosave, photo uploads, thumbnails, toolbar.
import { call, getSession, clearSession, fetchPhoto } from './api.js';
import { createSaver } from './saver.js';
import { createUploadQueue } from './upload-queue.js';
import { resizeImage } from './image-resize.js';
import { createPhotoLoader } from './photo-cache.js';
import { createHistory } from './history.js';
import { ensureFonts } from './pdf.js';
import { renderPage } from './render.js';
import * as M from './model.js';
import { createStage, fitTextHeight, PAGE_RATIO } from './editor-stage.js';
import { createSheets } from './editor-sheets.js';

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

// ---------- state changes ----------
function commit(next, opts = {}) {
  zine = normalize(next);
  currentEntry = { zine, page: pageIndex };
  history.push(currentEntry);
  if ('select' in opts) selectedId = opts.select;
  if (selectedId && !findEl(selectedId)) selectedId = null;
  saver.schedule(strip(zine));
  refresh();
}

function applyEntry(entry, focusPage) {
  zine = normalize(entry.zine);
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
  const changedPage = currentEntry.page; // the change being undone happened on this page
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

// ---------- uploads ----------
const cancelled = () => Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
const queue = createUploadQueue({
  upload: async ({ id, blob }) => {
    if (discarded.has(id)) throw cancelled(); // deleted before its turn came
    const data = await blobToBase64(blob);
    const res = await call('uploadPhoto', { token: session.token, data, mime: blob.type || 'image/jpeg' });
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
    const next = normalize(zine);
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

async function addPhotos(files) {
  let k = 0;
  for (const file of files) {
    let blob;
    try { blob = await resizeImage(file); } catch (e) { toast(e.message || '이 사진 형식은 열 수 없어요'); continue; }
    const url = URL.createObjectURL(blob);
    const a = await imageAspect(url);
    let w = 0.6;
    let h = (1.15 * w * PAGE_RATIO) / a; // polaroid: inner 92% x 80% keeps the photo's aspect
    if (h > 0.62) { w *= 0.62 / h; h = 0.62; }
    const off = (k++ % 5) * 0.04 - 0.08;
    const next = M.addElement(zine, pageIndex, {
      type: 'photo', src: '', pending: true, frame: 'polaroid', w, h,
      x: 0.5 - w / 2 + off, y: 0.5 - h / 2 + off,
    });
    const id = newestId(next);
    localUrls.set(id, url);
    blobs.set(id, blob);
    commit(next, { select: id });
    startUpload(id);
  }
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
  addSticker(src, aspect) {
    const w = 0.25;
    const h = Math.min(1.5, (w * PAGE_RATIO) / (aspect || 1));
    const next = M.addElement(zine, pageIndex, { type: 'sticker', src, w, h, x: 0.5 - w / 2 + jitter(), y: 0.5 - h / 2 + jitter() });
    commit(next, { select: newestId(next) });
  },
  addText(text, style) {
    const w = 0.8;
    const el = { type: 'text', text, style: { ...style }, w, x: 0.1 };
    el.h = fitTextHeight(el);
    el.y = Math.max(0.05, 0.62 - el.h / 2);
    const next = M.addElement(zine, pageIndex, el);
    commit(next, { select: newestId(next) });
  },
  updateText(id, text, style) {
    const el = findEl(id);
    if (!el) return;
    const upd = { ...el, text, style: { ...el.style, ...style } };
    commit(M.updateElement(zine, pageIndex, id, { text, style: upd.style, h: fitTextHeight(upd) }));
  },
  removeElement: deleteElement,
  setTitle(title, hl) {
    let next = M.setPageTitle(zine, pageIndex, title);
    if (hl) next = M.setTitleHighlight(next, pageIndex, hl);
    if (JSON.stringify(next.pages[pageIndex]) !== JSON.stringify(page())) commit(next);
  },
  setBackground(k) { if (page().background !== k) commit(M.setBackground(zine, pageIndex, k)); },
  setPattern(p) { if (page().pattern !== p) commit(M.setPattern(zine, pageIndex, p)); },
  setFrameLine(on) { if (!!page().frameLine !== !!on) commit(M.setFrameLine(zine, pageIndex, on)); },
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
    show('edit', el.type === 'text');
    show('retry', isFailed);
    show('duplicate', !el.pending);
    const fb = btns.querySelector('[data-act="frame"]');
    fb.setAttribute('aria-pressed', String(el.frame === 'polaroid'));
    fb.querySelector('span').textContent = el.frame === 'polaroid' ? '틀 빼기' : '폴라로이드 틀';
  }
  $('undo').disabled = !history.canUndo();
  $('redo').disabled = !history.canRedo();
  const t = (page().title || '').trim();
  $('pageName').textContent = t ? `${pageLabel(pageIndex)} · ${t}` : pageLabel(pageIndex);
  document.title = `${pageLabel(pageIndex)} 꾸미기 · 나만의 진`;
}

// Thumbnails: each rendered off-screen then copied, so a slow photo load cannot overwrite a newer one.
const thumbKeys = [];
const thumbTokens = [];
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
  });
}
function renderThumbs() {
  const z = strip(zine);
  const btns = $('thumbs').children;
  for (let i = 0; i < M.PAGE_COUNT; i++) {
    const b = btns[i];
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
  const cur = $('thumbs').children[pageIndex];
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function wireUi() {
  $('badge').addEventListener('click', () => {
    const s = $('badge').dataset.state;
    if (s === 'error') saver.flush();
    else if (s === 'conflict') location.reload();
    else if (s === 'auth') {
      const n = unsentPhotos();
      if (n > 0 && !window.confirm(`올리지 못한 사진 ${n}장은 다시 골라야 해요. 계속할까요?`)) return;
      leaving = true;
      clearSession();
      location.href = 'index.html';
    }
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
      case 'duplicate': { const next = M.duplicateElement(zine, pageIndex, id); commit(next, { select: newestId(next) }); break; }
      case 'delete': deleteElement(id); break;
      case 'frame': commit(M.updateElement(zine, pageIndex, id, { frame: el.frame === 'polaroid' ? 'none' : 'polaroid' })); break;
      case 'edit': sheets.open('text', el); break;
      case 'retry': startUpload(id); break;
      default:
    }
  });

  document.addEventListener('keydown', (e) => {
    if (sheets.isOpen() || e.target.closest('input, textarea, [contenteditable]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteElement(selectedId); }
    else if (e.key === 'Escape' && selectedId) select(null);
  });

  window.addEventListener('beforeunload', (e) => {
    if (!leaving && (queue.pending() > 0 || unsentPhotos() > 0)) { e.preventDefault(); e.returnValue = ''; }
  });

  // keep bottom sheets above the iOS keyboard
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => document.documentElement.style.setProperty('--kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px');
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }
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
    commit({ ...stale.zine, rev: currentRev });
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
    save: (z) => call('save', { token: session.token, zine: z }).then((r) => ({ rev: r.rev })),
    backupKey: 'webzine.backup.' + (session.name || 'me'),
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

  // Fonts first so on-screen text wraps exactly like the PDF; don't hang forever offline.
  await Promise.race([ensureFonts().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);

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
