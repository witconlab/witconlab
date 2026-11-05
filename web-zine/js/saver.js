// Autosave with local backup. Never silently lose work: the backup stays until the server confirms.
// Each save attempt carries a saveId. When the outcome of an attempt is unknown (network error, timeout,
// server error), that exact snapshot is resent with the same saveId first, so a save whose response was
// lost is recognised by the server instead of turning into a false CONFLICT.
const RETRY_DELAYS = [5000, 15000, 30000];
const KNOWN_FAILURES = ['CONFLICT', 'AUTH', 'BAD_INPUT', 'NOT_FOUND']; // server said no: nothing was written

// Local backup key of a student's unsaved editor changes (the viewer checks it too).
export const backupKeyFor = (name) => 'webzine.backup.' + (name || 'me');

export function newSaveId() {
  try { if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID(); } catch (e) { /* fall through */ }
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}

export function createSaver({
  save, backupKey, delay = 3000, now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id),
  storage = globalThis.localStorage, makeId = newSaveId,
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
  let unconfirmed = null; // { zine, saveId, source } whose outcome is unknown

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
          // resend an attempt with unknown outcome (same snapshot, same saveId) before anything newer
          const attempt = unconfirmed && unconfirmed.zine.rev === rev
            ? unconfirmed
            : { zine: withRev(latest), saveId: makeId(), source: latest };
          unconfirmed = null;
          if (attempt.source === latest) dirty = false;
          emit('saving');
          try {
            const res = await save(attempt.zine, { saveId: attempt.saveId });
            rev = res.rev;
            failures = 0;
            if (dirty) writeBackup(); else dropBackup();
            emit('saved', { zine: withRev(latest) });
          } catch (err) {
            dirty = true; // backup remains; nothing confirmed
            const code = err && err.code;
            if (!KNOWN_FAILURES.includes(code)) unconfirmed = attempt;
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
      unconfirmed = null;
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
