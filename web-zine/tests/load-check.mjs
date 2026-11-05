#!/usr/bin/env node
// Manual load check (not part of `node --test`): 30 fake students hit the real web app at the same time.
//   node web-zine/tests/load-check.mjs <API_URL>
// Each student 테스트01..테스트30: login, 3 saves (each using the rev the server returned), one ~200KB photo upload.
// Retries follow the app's own rules:
//   - save: network/server errors retried after 5s, 15s, 30s with the SAME saveId (lost responses are not conflicts);
//           CONFLICT / AUTH / BAD_INPUT are not retried.
//   - upload: up to 3 retries after 2s, 5s, 10s, except AUTH / BAD_INPUT.
//   - login: not retried (a student would just press the button again).
// Afterwards delete the 테스트01..테스트30 folders from the 웹진 folder in Google Drive.
import crypto from 'node:crypto';

const URL_ARG = process.argv[2];
if (!URL_ARG || !/^https?:\/\//.test(URL_ARG)) {
  console.error('사용법: node web-zine/tests/load-check.mjs <웹 앱 URL (https://script.google.com/macros/s/.../exec)>');
  process.exit(2);
}
const STUDENTS = 30;
const PIN = '7357';
const TIMEOUT_MS = 30000;
const SAVE_DELAYS = [5000, 15000, 30000];
const UPLOAD_DELAYS = [2000, 5000, 10000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(code, message, data) { super(message || code); this.code = code; this.data = data; }
}

// Same transport as js/api.js: text/plain JSON POST, 30s timeout -> network error, non-JSON -> SERVER_SETUP.
async function call(action, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(URL_ARG, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }), signal: ctl.signal, redirect: 'follow',
    });
  } catch (e) {
    throw new Error(e && e.name === 'AbortError' ? 'timeout' : 'network: ' + (e && e.message));
  } finally { clearTimeout(timer); }
  let res;
  try { res = await r.json(); } catch (e) { throw new ApiError('SERVER_SETUP', `JSON이 아닌 응답 (HTTP ${r.status})`); }
  if (!res || !res.ok) throw new ApiError(res && res.error || 'SERVER', res && res.message, res);
  return res;
}

const stats = {};
function record(kind, ms, ok, err) {
  const s = (stats[kind] ||= { ok: 0, fail: 0, retries: 0, ms: [], errors: {} });
  if (ok) { s.ok++; s.ms.push(ms); } else {
    s.fail++;
    const k = (err && (err.code || err.message)) || 'unknown';
    s.errors[k] = (s.errors[k] || 0) + 1;
  }
}
const retried = (kind) => { (stats[kind] ||= { ok: 0, fail: 0, retries: 0, ms: [], errors: {} }).retries++; };

// One logical operation with retries; latency is measured per operation (including retries).
async function op(kind, fn, delays, shouldRetry) {
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    try {
      const res = await fn();
      record(kind, Date.now() - t0, true);
      return res;
    } catch (e) {
      if (i >= delays.length || !shouldRetry(e)) { record(kind, Date.now() - t0, false, e); throw e; }
      retried(kind);
      await sleep(delays[i]);
    }
  }
}

function fakeJpegBase64(bytes = 200 * 1024) {
  const buf = crypto.randomBytes(bytes);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff; buf[3] = 0xe0; // JPEG-ish header
  buf[bytes - 2] = 0xff; buf[bytes - 1] = 0xd9;
  return buf.toString('base64');
}

async function student(i) {
  const name = '테스트' + String(i).padStart(2, '0');
  const login = await op('login', () => call('login', { name, pin: PIN }), [], () => false);
  const token = login.token;
  let zine = login.zine;
  let rev = zine.rev;
  for (let k = 1; k <= 3; k++) {
    const snapshot = {
      ...zine, rev, title: `부하 확인 ${k}`,
      pages: zine.pages.map((p, j) => (j === 0 ? { ...p, title: `저장 ${k}` } : p)),
    };
    const saveId = crypto.randomUUID(); // reused on every retry of this snapshot
    const res = await op('save', () => call('save', { token, zine: snapshot, saveId }), SAVE_DELAYS,
      (e) => !(e && ['CONFLICT', 'AUTH', 'BAD_INPUT', 'NOT_FOUND'].includes(e.code)));
    rev = res.rev;
    zine = snapshot;
  }
  const data = fakeJpegBase64();
  await op('upload', () => call('uploadPhoto', { token, data, mime: 'image/jpeg' }), UPLOAD_DELAYS,
    (e) => !(e && ['AUTH', 'BAD_INPUT'].includes(e.code)));
  return name;
}

function pct(arr, p) {
  if (!arr.length) return '-';
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

const t0 = Date.now();
console.log(`학생 ${STUDENTS}명이 동시에 시작합니다… (${URL_ARG.slice(0, 60)}…)`);
const results = await Promise.allSettled(Array.from({ length: STUDENTS }, (_, i) => student(i + 1)));
const done = results.filter((r) => r.status === 'fulfilled').length;

console.log(`\n끝까지 성공한 학생: ${done}/${STUDENTS}  (전체 ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
console.log('동작      성공  실패  재시도   p50(ms)  p95(ms)');
for (const kind of ['login', 'save', 'upload']) {
  const s = stats[kind] || { ok: 0, fail: 0, retries: 0, ms: [], errors: {} };
  console.log(`${kind.padEnd(8)} ${String(s.ok).padStart(5)} ${String(s.fail).padStart(5)} ${String(s.retries).padStart(6)} ${String(pct(s.ms, 50)).padStart(9)} ${String(pct(s.ms, 95)).padStart(8)}`);
  for (const [k, n] of Object.entries(s.errors)) console.log(`         실패 이유: ${k} × ${n}`);
}
console.log('\n확인이 끝나면 구글 드라이브 웹진 폴더에서 테스트01~테스트30 폴더를 지워 주세요.');
process.exit(done === STUDENTS ? 0 : 1);
