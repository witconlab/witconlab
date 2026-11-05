// Photo loader: memory Map + IndexedDB cache (webzine-photos/photos). IndexedDB failures fall back to memory only.
// At most 3 photo downloads run at once (all loaders share the limit) so a 30-photo zine does not fire 30
// server calls together. A network/parse failure is retried once; a server answer (ApiError, has .code) is not.
import { getSticker } from './stickers.js';

const DB = 'webzine-photos';
const STORE = 'photos';
export const MAX_FETCHES = 3;

export function createLimiter(max) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= max || !waiting.length) return;
    active++;
    const { fn, resolve, reject } = waiting.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { waiting.push({ fn, resolve, reject }); next(); });
}
const sharedLimit = createLimiter(MAX_FETCHES);

// One retry for errors without a server code (network, timeout, unreadable reply).
export async function fetchWithRetry(fetchPhoto, src) {
  try { return await fetchPhoto(src); } catch (e) {
    if (e && e.code) throw e;
    return fetchPhoto(src);
  }
}

function openDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

function idbOp(dbp, mode, fn) {
  return dbp.then((db) => new Promise((resolve) => {
    if (!db) return resolve(undefined);
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

// onload/onerror rather than img.decode(): decode() can stay pending forever in some browsers/contexts.
function toImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

export function createPhotoLoader({ fetchPhoto, limit = sharedLimit, toImg = toImage, useDb = typeof indexedDB !== 'undefined' }) {
  const mem = new Map();
  let dbp = null;
  const db = () => (dbp ||= useDb ? openDb() : Promise.resolve(null));

  async function load(src) {
    if (src.startsWith('builtin:')) {
      const s = getSticker(src.slice(8));
      if (!s || !s.svg) return null; // draw-based stickers are rendered by the renderer itself
      return toImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg));
    }
    let rec = await idbOp(db(), 'readonly', (st) => st.get(src));
    if (!rec || !rec.data) {
      const r = await limit(() => fetchWithRetry(fetchPhoto, src));
      rec = { data: r.data, mime: r.mime };
      idbOp(db(), 'readwrite', (st) => st.put(rec, src)); // best effort, not awaited
    }
    return toImg(`data:${rec.mime};base64,${rec.data}`);
  }

  const remember = (src, p) => {
    mem.set(src, p);
    p.catch(() => { if (mem.get(src) === p) mem.delete(src); }); // don't cache failures
    return p;
  };

  const loader = (src) => (mem.has(src) ? mem.get(src) : remember(src, load(src)));
  // Put bytes we already have (e.g. a photo we just uploaded) in the cache, so it is never downloaded again.
  loader.prime = (src, { data, mime }) => {
    const rec = { data, mime };
    idbOp(db(), 'readwrite', (st) => st.put(rec, src)); // best effort
    return remember(src, toImg(`data:${mime};base64,${data}`));
  };
  return loader;
}
