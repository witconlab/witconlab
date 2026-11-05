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

export async function call(action, body = {}) {
  let res;
  if (API_URL === 'mock') {
    mock ||= createMock();
    res = await mock({ action, ...body });
  } else {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
    });
    res = await r.json();
  }
  if (!res || !res.ok) {
    const { ok, error, message, ...data } = res || {};
    throw new ApiError(error || 'SERVER', message, data);
  }
  return res;
}

// Photo bytes as {data (base64), mime, url (data URL)}. `custom:<id>` is a teacher sticker.
// An admin token wins over a student token so a teacher's device with a stale student session still works.
export async function fetchPhoto(src) {
  let res;
  if (typeof src === 'string' && src.startsWith('custom:')) {
    res = await call('getSticker', { id: src.slice('custom:'.length) });
  } else {
    const adminToken = getAdminToken();
    const session = getSession();
    const asStudent = () => call('getPhoto', { photoId: src, token: session && session.token });
    if (adminToken) {
      try { res = await call('getPhoto', { photoId: src, adminToken }); } catch (e) {
        if (e.code === 'AUTH' && session && session.token) res = await asStudent(); else throw e;
      }
    } else res = await asStudent();
  }
  return { data: res.data, mime: res.mime, url: `data:${res.mime};base64,${res.data}` };
}
