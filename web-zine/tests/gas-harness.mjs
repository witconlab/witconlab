// Minimal in-memory Google Apps Script runtime for testing Code.gs under Node.
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';

const toSigned = (b) => (b > 127 ? b - 256 : b);
const toUnsigned = (b) => (b + 256) % 256;

function makeBlob(bytes, mime, name) {
  const blob = {
    _bytes: Array.from(bytes, toSigned),
    _mime: mime || 'application/octet-stream',
    _name: name || '',
    getBytes() { return this._bytes.slice(); },
    getContentType() { return this._mime; },
    getDataAsString() { return Buffer.from(this._bytes.map(toUnsigned)).toString('utf8'); },
    getName() { return this._name; },
    setName(n) { this._name = n; return this; },
  };
  return blob;
}

function iterator(items) {
  let i = 0;
  return { hasNext: () => i < items.length, next: () => items[i++] };
}

export function createDrive() {
  let seq = 0;
  const byId = new Map();
  const drive = { sharingCalls: [], byId, counts: { getFilesByName: 0, getFoldersByName: 0 } };

  function makeFile(name, bytes, mime) {
    const f = {
      _id: 'file' + ++seq, _name: name, _bytes: Array.from(bytes, toSigned), _mime: mime,
      getId() { return this._id; },
      getName() { return this._name; },
      getBlob() { return makeBlob(this._bytes, this._mime, this._name); },
      getMimeType() { return this._mime; },
      isTrashed() { return !!this._trashed || !!(this._parent && this._parent.isTrashed()); },
      setTrashed(v) { this._trashed = !!v; return this; },
      setContent(s) { this._bytes = Array.from(Buffer.from(s, 'utf8'), toSigned); return this; },
      setSharing(...a) { drive.sharingCalls.push(['file', f._name, ...a]); return this; },
    };
    byId.set(f._id, f);
    return f;
  }

  function makeFolder(name) {
    const folder = {
      _id: 'folder' + ++seq, _name: name, _folders: [], _files: [],
      getId() { return this._id; },
      getName() { return this._name; },
      createFolder(n) { const c = makeFolder(n); c._parent = this; this._folders.push(c); return c; },
      isTrashed() { return !!this._trashed || !!(this._parent && this._parent.isTrashed()); },
      setTrashed(v) { this._trashed = !!v; return this; },
      getFolders() { return iterator(this._folders); },
      getFoldersByName(n) { drive.counts.getFoldersByName++; return iterator(this._folders.filter((x) => x._name === n)); },
      getFiles() { return iterator(this._files); },
      getFilesByName(n) { drive.counts.getFilesByName++; return iterator(this._files.filter((x) => x._name === n)); },
      createFile(a, b, c) {
        let f;
        if (typeof a === 'string') f = makeFile(a, Buffer.from(b, 'utf8'), c || 'text/plain');
        else f = makeFile(a.getName(), a.getBytes(), a.getContentType());
        f._parent = this;
        this._files.push(f);
        return f;
      },
      setSharing(...a) { drive.sharingCalls.push(['folder', folder._name, ...a]); return this; },
    };
    byId.set(folder._id, folder);
    return folder;
  }

  const root = makeFolder('My Drive');
  drive.root = root;
  drive.DriveApp = {
    createFolder: (n) => root.createFolder(n),
    getFolderById: (id) => { const f = byId.get(id); if (!f || !f._folders) throw new Error('No folder ' + id); return f; },
    getFileById: (id) => { const f = byId.get(id); if (!f || f._folders) throw new Error('No file ' + id); return f; },
    getRootFolder: () => root,
    Access: { ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
    Permission: { VIEW: 'VIEW', EDIT: 'EDIT' },
  };
  // path like '웹진/김민지/zine.json' -> node or null
  drive.find = (path) => {
    let node = root;
    for (const part of path.split('/')) {
      node = (node._folders || []).find((x) => x._name === part) || (node._files || []).find((x) => x._name === part);
      if (!node) return null;
    }
    return node;
  };
  return drive;
}

export function loadGas(path) {
  const drive = createDrive();
  const props = new Map();
  const cache = new Map();
  const sandbox = { console };
  const ctx = vm.createContext(sandbox);
  ctx.__now = Date.now();

  ctx.DriveApp = drive.DriveApp;
  ctx.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty(k, v) { props.set(k, String(v)); return this; },
      deleteProperty(k) { props.delete(k); return this; },
      getKeys: () => [...props.keys()],
    }),
  };
  ctx.CacheService = {
    getScriptCache: () => ({
      get(k) {
        const e = cache.get(k);
        if (!e) return null;
        if (e.exp <= ctx.__now) { cache.delete(k); return null; }
        return e.v;
      },
      put(k, v, ttl) { cache.set(k, { v: String(v), exp: ctx.__now + (ttl || 600) * 1000 }); },
      remove(k) { cache.delete(k); },
    }),
  };
  // locks: how many times a script lock was taken. onLock: test hook run when a lock is acquired
  // (simulates another execution that finished while this one waited for the lock).
  const lockState = { locks: 0, onLock: null };
  const acquire = () => { lockState.locks++; const h = lockState.onLock; lockState.onLock = null; if (h) h(); };
  ctx.LockService = {
    getScriptLock: () => ({ waitLock() { acquire(); }, releaseLock() {}, tryLock: () => { acquire(); return true; } }),
  };
  ctx.Logger = { log() {} };
  ctx.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest(alg, input) {
      const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input.map(toUnsigned));
      return Array.from(crypto.createHash('sha256').update(buf).digest(), toSigned);
    },
    base64Encode(x) {
      const buf = typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map(toUnsigned));
      return buf.toString('base64');
    },
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64'), toSigned),
    getUuid: () => crypto.randomUUID(),
    newBlob: (bytes, mime, name) => makeBlob(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes, mime, name),
  };
  ctx.ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput(text) {
      return { _text: text, setMimeType() { return this; }, getContent() { return this._text; } };
    },
  };

  // Make Date.now / new Date() follow ctx.__now.
  vm.runInContext(`
    (function () {
      var RealDate = Date;
      Date = class extends RealDate {
        constructor(...a) { if (a.length) super(...a); else super(__now); }
        static now() { return __now; }
      };
    })();
  `, ctx);

  vm.runInContext(fs.readFileSync(path, 'utf8'), ctx, { filename: path });

  function call(action, body = {}) {
    const out = ctx.doPost({ postData: { contents: JSON.stringify({ action, ...body }) } });
    return JSON.parse(out.getContent());
  }
  return { ctx, call, drive, props, cache, lockState };
}
