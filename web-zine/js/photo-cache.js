// Photo loader: memory Map + IndexedDB cache (webzine-photos/photos). IndexedDB failures fall back to memory only.
import { getSticker } from './stickers.js';

const DB = 'webzine-photos';
const STORE = 'photos';

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

export function createPhotoLoader({ fetchPhoto }) {
  const mem = new Map();
  let dbp = null;
  const db = () => (dbp ||= openDb());

  async function load(src) {
    if (src.startsWith('builtin:')) {
      const s = getSticker(src.slice(8));
      if (!s || !s.svg) return null; // draw-based stickers are rendered by the renderer itself
      return toImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg));
    }
    let rec = await idbOp(db(), 'readonly', (st) => st.get(src));
    if (!rec || !rec.data) {
      const r = await fetchPhoto(src);
      rec = { data: r.data, mime: r.mime };
      idbOp(db(), 'readwrite', (st) => st.put(rec, src)); // best effort, not awaited
    }
    return toImage(`data:${rec.mime};base64,${rec.data}`);
  }

  return (src) => {
    if (!mem.has(src)) {
      const p = load(src);
      mem.set(src, p);
      p.catch(() => mem.delete(src)); // don't cache failures
    }
    return mem.get(src);
  };
}
