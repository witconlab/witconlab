// API client for the Apps Script backend (or the localStorage mock when API_URL === 'mock').
import { API_URL } from './config.js';
import { createMock } from './api-mock.js';

export class ApiError extends Error {
  constructor(code, message, data = {}) {
    super(message || code);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}

const SESSION_KEY = 'webzine.session';
const ADMIN_KEY = 'webzine.admin';
const safe = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
const ls = () => globalThis.localStorage;
const ss = () => globalThis.sessionStorage;

export function getSession() {
  return safe(() => JSON.parse(ls().getItem(SESSION_KEY)));
}
export function setSession(s) { safe(() => ls().setItem(SESSION_KEY, JSON.stringify(s))); }
export function clearSession() { safe(() => ls().removeItem(SESSION_KEY)); }
export function getAdminToken() { return safe(() => ss().getItem(ADMIN_KEY)); }
export function setAdminToken(t) { safe(() => (t ? ss().setItem(ADMIN_KEY, t) : ss().removeItem(ADMIN_KEY))); }

let mock = null;
export const TIMEOUT_MS = 30000;
const SETUP_MSG = '서버 설정을 확인해야 해요. 선생님께 알려 주세요.';

// A timeout is a plain (code-less) Error, i.e. treated like a network error by every caller.
// A reply that is not JSON (e.g. a Google sign-in or error page) means the web app is set up wrong.
export async function post(url, payload, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), timeoutMs);
  let r;
  try {
    r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctl ? ctl.signal : undefined,
    });
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
  try {
    return await r.json();
  } catch (e) {
    throw new ApiError('SERVER_SETUP', SETUP_MSG);
  }
}

export async function call(action, body = {}) {
  let res;
  if (API_URL === 'mock') {
    mock ||= createMock();
    res = await mock({ action, ...body });
  } else {
    res = await post(API_URL, { action, ...body });
  }
  if (!res || !res.ok) {
    const { ok, error, message, ...data } = res || {};
    throw new ApiError(error || 'SERVER', message, data);
  }
  return res;
}

// Photo bytes as {data (base64), mime, url (data URL)}. `custom:<id>` is a teacher sticker.
// An admin token wins over a student token so a teacher's device with a stale student session still works.
// opts.name (admin only): the zine owner, so the server looks in that student's folder first.
export async function fetchPhoto(src, { name } = {}) {
  let res;
  if (typeof src === 'string' && src.startsWith('custom:')) {
    res = await call('getSticker', { id: src.slice('custom:'.length) });
  } else {
    const adminToken = getAdminToken();
    const session = getSession();
    const asStudent = () => call('getPhoto', { photoId: src, token: session && session.token });
    if (adminToken) {
      try { res = await call('getPhoto', name ? { photoId: src, adminToken, name } : { photoId: src, adminToken }); } catch (e) {
        if (e.code === 'AUTH' && session && session.token) res = await asStudent(); else throw e;
      }
    } else res = await asStudent();
  }
  return { data: res.data, mime: res.mime, url: `data:${res.mime};base64,${res.data}` };
}
