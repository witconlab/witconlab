// Autosave with local backup. Never silently lose work: the backup stays until the server confirms.
const RETRY_DELAYS = [5000, 15000, 30000];

export function createSaver({
  save, backupKey, delay = 3000, now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  storage = globalThis.localStorage,
}) {
  const staleKey = backupKey + '.stale';
  const listeners = [];
  let latest = null;     // newest zine from the editor
  let rev = null;        // last known server rev
  let dirty = false;
  let timer = null;
  let inflight = null;
  let stopped = null;    // 'conflict' | 'auth'
  let failures = 0;
  let lastStatus = 'saved';

  const emit = (status, info = {}) => { lastStatus = status; notify(status, info); };
  const notify = (status, info) => listeners.forEach((fn) => fn(status, { rev, ...info }));
  const clearT = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  const arm = (ms) => { clearT(); timer = setTimer(() => { timer = null; run(); }, ms); };

  function writeBackup() {
    try { storage && storage.setItem(backupKey, JSON.stringify({ zine: withRev(latest), savedAt: now() })); } catch (e) { /* quota/private mode */ }
  }
  function dropBackup() { try { storage && storage.removeItem(backupKey); } catch (e) { /* ignore */ } }
  function readBackup() {
    try { const raw = storage && storage.getItem(backupKey); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  const withRev = (z) => (rev === null ? z : { ...z, rev });

  function run() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        while (dirty && !stopped) {
          clearT();
          dirty = false;
          const snapshot = withRev(latest);
          emit('saving');
          try {
            const res = await save(snapshot);
            rev = res.rev;
            failures = 0;
            if (dirty) writeBackup(); else dropBackup();
            emit('saved', { zine: withRev(latest) });
          } catch (err) {
            dirty = true; // backup remains; nothing confirmed
            const code = err && err.code;
            if (code === 'CONFLICT') { stopped = 'conflict'; emit('conflict', { error: err }); }
            else if (code === 'AUTH') { stopped = 'auth'; emit('auth', { error: err }); }
            else if (code === 'BAD_INPUT' || code === 'NOT_FOUND') {
              emit('error', { error: err, retry: false }); // retrying cannot help; backup kept until next schedule()
              break;
            } else {
              emit('error', { error: err });
              arm(RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length - 1)]);
              failures++;
              break;
            }
          }
        }
      } finally { inflight = null; }
    })();
    return inflight;
  }

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('beforeunload', (e) => {
      if (dirty || inflight) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
  }

  return {
    schedule(zine) {
      if (rev === null) rev = zine.rev;
      latest = zine;
      dirty = true;
      writeBackup();
      if (!stopped) arm(delay);
    },
    async flush() {
      if (!dirty && !inflight) return lastStatus;
      clearT();
      await run();
      return lastStatus;
    },
    getStaleBackup() {
      try { const raw = storage && storage.getItem(staleKey); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    discardStaleBackup() { try { storage && storage.removeItem(staleKey); } catch (e) { /* ignore */ } },
    onStatus(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    restore(serverZine) {
      stopped = null;
      failures = 0;
      rev = serverZine.rev;
      const b = readBackup();
      if (b && b.zine && b.zine.rev === serverZine.rev) {
        latest = b.zine;
        dirty = true;
        arm(delay);
        return b.zine;
      }
      if (b && b.zine && b.savedAt > Date.parse(serverZine.updatedAt)) {
        // backup is newer than the server copy (e.g. reload while a save was in flight): rebase onto server rev
        latest = { ...b.zine, rev: serverZine.rev };
        dirty = true;
        writeBackup();
        arm(delay);
        return latest;
      }
      if (b) {
        // keep older/unmatched work instead of deleting it
        try { storage && storage.setItem(staleKey, JSON.stringify(b)); } catch (e) { /* ignore */ }
        dropBackup();
      }
      latest = serverZine;
      dirty = false;
      return serverZine;
    },
  };
}
