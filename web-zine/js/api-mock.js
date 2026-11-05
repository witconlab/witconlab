// Dev-only fake backend (API_URL === 'mock'). Mirrors apps-script/Code.gs semantics using localStorage.
import { createEmptyZine, PAGE_COUNT } from './model.js';

const KEY = 'webzine.mock';
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const ADMIN_PASSWORD = 'admin';
const MIMES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1, 'image/gif': 1 };

const fail = (error, message, extra) => ({ ok: false, error, message, ...extra });
const AUTH = () => fail('AUTH', '다시 로그인해 주세요.');
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);

function hash(salt, pin) { // not secure; dev only
  let h = 5381;
  const s = salt + pin;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
function validName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim();
  if (!n || n.length > 20 || /[\/\\]/.test(n) || n === 'stickers') return null;
  return n;
}
const validPin = (p) => typeof p === 'string' && /^[0-9]{4}$/.test(p);
const publicZine = (z) => { const { auth, ...rest } = z; return clone(rest); };
const filled = (z) => z.pages.filter((p) => p.title || (p.elements && p.elements.length)).length;

export function createMock({ storage = globalThis.localStorage, now = Date.now } = {}) {
  const mem = { students: {}, photos: {}, stickers: [], tokens: {}, admins: {} };
  const load = () => {
    try { const raw = storage && storage.getItem(KEY); return raw ? JSON.parse(raw) : clone(mem); } catch (e) { return clone(mem); }
  };
  let memState = null;
  const get = () => (storage ? load() : (memState ||= clone(mem)));
  const put = (st) => { if (storage) { try { storage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } } else memState = st; };

  const handlers = {
    login(st, b) {
      const name = validName(b.name);
      if (!name) return fail('BAD_INPUT', '이름을 확인해 주세요.');
      if (!validPin(b.pin)) return fail('BAD_INPUT', '비밀번호는 숫자 4자리예요.');
      let s = st.students[name];
      const token = () => { const t = 'tok_' + uid(); st.tokens[t] = name; return t; };
      if (!s) {
        const salt = uid();
        const zine = createEmptyZine(name);
        zine.updatedAt = new Date(now()).toISOString();
        s = st.students[name] = { zine, auth: { salt, hash: hash(salt, b.pin) }, fail: { count: 0, until: 0 } };
        return { ok: true, token: token(), zine: publicZine(zine), created: true };
      }
      const t = now();
      if (s.fail.until && s.fail.until > t) return fail('LOCKED', '비밀번호를 여러 번 틀려서 잠겼어요. 잠시 뒤에 다시 해 보세요.', { until: s.fail.until });
      if (s.fail.until) s.fail = { count: 0, until: 0 };
      if (hash(s.auth.salt, b.pin) !== s.auth.hash) {
        s.fail.count += 1;
        if (s.fail.count >= MAX_FAILS) {
          const until = t + LOCK_MS;
          s.fail = { count: 0, until };
          return fail('LOCKED', '비밀번호를 5번 틀려서 10분 동안 잠겼어요.', { until });
        }
        const remaining = MAX_FAILS - s.fail.count;
        return fail('BAD_PIN', `비밀번호가 달라요. ${remaining}번 더 틀리면 잠겨요.`, { remaining });
      }
      s.fail = { count: 0, until: 0 };
      return { ok: true, token: token(), zine: publicZine(s.zine), created: false };
    },
    load(st, b) {
      const s = st.students[st.tokens[b.token]];
      return s ? { ok: true, zine: publicZine(s.zine) } : AUTH();
    },
    save(st, b) {
      const name = st.tokens[b.token];
      const s = name && st.students[name];
      if (!s) return AUTH();
      const z = b.zine;
      if (!z || typeof z !== 'object' || !Array.isArray(z.pages) || z.pages.length !== PAGE_COUNT || typeof z.rev !== 'number') {
        return fail('BAD_INPUT', '저장할 내용이 올바르지 않아요.');
      }
      if (z.rev !== s.zine.rev) return fail('CONFLICT', '다른 곳에서 먼저 저장했어요. 새로고침해 주세요.', { rev: s.zine.rev });
      s.zine = { ...clone(z), name, rev: s.zine.rev + 1, updatedAt: new Date(now()).toISOString() };
      return { ok: true, rev: s.zine.rev };
    },
    uploadPhoto(st, b) {
      const name = st.tokens[b.token];
      if (!name || !st.students[name]) return AUTH();
      if (!MIMES[b.mime] || typeof b.data !== 'string' || !b.data) return fail('BAD_INPUT', '사진 파일이 올바르지 않아요.');
      const id = uid() + uid();
      (st.photos[name] ||= {})[id] = { data: b.data, mime: b.mime };
      return { ok: true, photoId: id };
    },
    getPhoto(st, b) {
      const name = st.tokens[b.token];
      let found = null;
      if (name) found = (st.photos[name] || {})[b.photoId];
      else if (st.admins[b.adminToken]) {
        for (const p of Object.values(st.photos)) if (p[b.photoId]) found = p[b.photoId];
      }
      return found ? { ok: true, data: found.data, mime: found.mime } : AUTH();
    },
    listStickers(st) { return { ok: true, stickers: st.stickers.map(({ id, name }) => ({ id, name })) }; },
    getSticker(st, b) {
      const s = st.stickers.find((x) => x.id === b.id);
      return s ? { ok: true, data: s.data, mime: s.mime } : fail('NOT_FOUND', '스티커를 찾을 수 없어요.');
    },
    adminLogin(st, b) {
      if (b.password !== ADMIN_PASSWORD) return fail('AUTH', '관리자 비밀번호가 달라요.');
      const t = 'adm_' + uid(); st.admins[t] = 1;
      return { ok: true, adminToken: t };
    },
    adminList(st, b) {
      if (!st.admins[b.adminToken]) return AUTH();
      const t = now();
      return { ok: true, students: Object.entries(st.students).map(([name, s]) => ({
        name, filledPages: filled(s.zine), updatedAt: s.zine.updatedAt, done: !!s.zine.done,
        lockedUntil: s.fail.until && s.fail.until > t ? s.fail.until : null,
      })) };
    },
    adminGetZine(st, b) {
      if (!st.admins[b.adminToken]) return AUTH();
      const s = st.students[validName(b.name)];
      return s ? { ok: true, zine: publicZine(s.zine) } : fail('NOT_FOUND', '그 학생을 찾을 수 없어요.');
    },
    adminResetPin(st, b) {
      if (!st.admins[b.adminToken]) return AUTH();
      if (!validPin(b.pin)) return fail('BAD_INPUT', '비밀번호는 숫자 4자리예요.');
      const s = st.students[validName(b.name)];
      if (!s) return fail('NOT_FOUND', '그 학생을 찾을 수 없어요.');
      const salt = uid();
      s.auth = { salt, hash: hash(salt, b.pin) };
      s.fail = { count: 0, until: 0 };
      return { ok: true };
    },
    adminUnlock(st, b) {
      if (!st.admins[b.adminToken]) return AUTH();
      const name = validName(b.name);
      if (!name) return fail('BAD_INPUT', '이름을 확인해 주세요.');
      if (st.students[name]) st.students[name].fail = { count: 0, until: 0 };
      return { ok: true };
    },
    adminAddSticker(st, b) {
      if (!st.admins[b.adminToken]) return AUTH();
      const name = typeof b.name === 'string' ? b.name.replace(/[\/\\]/g, '_') : '';
      if (!name || !MIMES[b.mime] || typeof b.data !== 'string' || !b.data) return fail('BAD_INPUT', '스티커 파일이 올바르지 않아요.');
      st.stickers.push({ id: 'stk_' + uid(), name, mime: b.mime, data: b.data });
      return { ok: true };
    },
  };

  return async function handle(body) {
    const h = handlers[body && body.action];
    if (!h) return fail('BAD_INPUT', '알 수 없는 요청이에요.');
    const st = get();
    const res = h(st, body);
    put(st);
    return clone(res);
  };
}
