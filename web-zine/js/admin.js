// Admin (teacher) page: roster, per-student actions, A3 fold PDF, sticker upload.
import { call, getAdminToken, setAdminToken, fetchPhoto } from './api.js';
import { createPhotoLoader } from './photo-cache.js';
import { ensureFonts, buildPagesPdf, buildA3Pdf, JSPDF_URL, zineTitle } from './pdf.js';

const PAGE_COUNT = 8;
const MAX_STICKER = 3 * 1024 * 1024;

export function sortStudents(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
export function validNewPin(s) { return /^\d{4}$/.test(String(s)); }
export function fmtTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtUpdated(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const safeName = (s) => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();

if (typeof document !== 'undefined') main();

function main() {
  const $ = (id) => document.getElementById(id);
  // One photo loader per student: the server is told whose photos these are and looks there first.
  const loaders = new Map();
  const loaderFor = (name) => {
    if (!loaders.has(name)) loaders.set(name, createPhotoLoader({ fetchPhoto: (src) => fetchPhoto(src, { name }) }));
    return loaders.get(name);
  };
  let students = [];
  let busy = false;
  const selected = new Set();

  const show = (el, text) => { el.textContent = text || ''; el.hidden = !text; };
  const clearNotes = () => { show($('topErr')); show($('topOk')); };

  function showLogin(msg) {
    setAdminToken(null);
    $('mainView').hidden = true;
    $('loginView').hidden = false;
    show($('loginErr'), msg);
    $('pw').value = '';
  }

  // Wraps an admin call; an expired token sends the teacher back to the login form.
  async function admin(action, body = {}) {
    try {
      return await call(action, { ...body, adminToken: getAdminToken() });
    } catch (e) {
      if (e && e.code === 'AUTH') { showLogin('다시 입장해 주세요. (시간이 지났어요)'); throw Object.assign(e, { handled: true }); }
      throw e;
    }
  }
  const errText = (e) => (e && e.code ? (e.message || '처리하지 못했어요.') : '인터넷 연결을 확인해 주세요.');
  function fail(e) { if (!(e && e.handled)) show($('topErr'), errText(e)); }

  // ----- roster -----
  async function refresh() {
    clearNotes();
    try {
      const res = await admin('adminList');
      students = sortStudents(res.students || []);
      for (const n of [...selected]) if (!students.some((s) => s.name === n)) selected.delete(n);
      render();
    } catch (e) { fail(e); }
  }

  function cell(tr, label, text, cls) {
    const td = document.createElement('td');
    if (label) td.dataset.label = label;
    if (cls) td.className = cls;
    if (text !== undefined) td.textContent = text;
    tr.append(td);
    return td;
  }
  function btn(text, onClick, extra = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `btn sm ${extra}`.trim(); b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    const rows = $('rows');
    rows.textContent = '';
    const now = Date.now();
    for (const s of students) {
      const tr = document.createElement('tr');
      const sel = cell(tr, '', undefined, 'sel');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = selected.has(s.name); cb.setAttribute('aria-label', `${s.name} 선택`);
      cb.addEventListener('change', () => { cb.checked ? selected.add(s.name) : selected.delete(s.name); syncSel(); });
      sel.append(cb);
      cell(tr, '이름', s.name, 'nm');
      cell(tr, '채운 쪽', `${s.filledPages}/${PAGE_COUNT}`);
      cell(tr, '마지막 수정', fmtUpdated(s.updatedAt));
      const done = cell(tr, '완성');
      if (s.done) { const b = document.createElement('span'); b.className = 'badge badge-lime'; b.textContent = '완성'; done.append(b); } else done.textContent = '작업 중';
      const lock = cell(tr, '잠김');
      if (s.lockedUntil && s.lockedUntil > now) {
        const b = document.createElement('span'); b.className = 'badge badge-red'; b.textContent = `잠김 (${fmtTime(s.lockedUntil)}까지)`;
        lock.append(b);
      } else lock.textContent = '-';
      const act = cell(tr, '', undefined, 'act');
      const view = document.createElement('a');
      view.className = 'btn sm'; view.textContent = '보기';
      view.href = `view.html?name=${encodeURIComponent(s.name)}`; view.target = '_blank'; view.rel = 'noopener';
      act.append(view,
        btn('쪽 PDF', () => pagesPdf(s.name)),
        btn('비밀번호 바꾸기', () => resetPin(s.name)));
      if (s.lockedUntil && s.lockedUntil > now) act.append(btn('잠금 풀기', () => unlock(s.name)));
      rows.append(tr);
    }
    $('empty').hidden = students.length > 0;
    $('tbl').hidden = students.length === 0;
    const doneN = students.filter((s) => s.done).length;
    $('summary').textContent = `학생 ${students.length}명, 완성 ${doneN}명`;
    syncSel();
  }

  function syncSel() {
    const n = selected.size;
    $('a3Btn').disabled = busy || n === 0;
    $('a3Btn').textContent = n ? `A3 접기용 PDF (${n}명)` : 'A3 접기용 PDF';
    $('selAll').checked = students.length > 0 && n === students.length;
  }

  // ----- row actions -----
  async function resetPin(name) {
    clearNotes();
    const pin = window.prompt(`${name}의 새 비밀번호 (숫자 4자리)`);
    if (pin === null) return;
    if (!validNewPin(pin.trim())) { show($('topErr'), '비밀번호는 숫자 4자리여야 해요.'); return; }
    try {
      await admin('adminResetPin', { name, pin: pin.trim() });
      show($('topOk'), `${name}의 새 비밀번호는 ${pin.trim()} 입니다. 학생에게 알려 주세요. (이 안내는 한 번만 보여요)`);
      await refreshQuiet();
    } catch (e) { fail(e); }
  }
  async function unlock(name) {
    clearNotes();
    try {
      await admin('adminUnlock', { name });
      show($('topOk'), `${name}의 잠금을 풀었어요.`);
      await refreshQuiet();
    } catch (e) { fail(e); }
  }
  async function refreshQuiet() {
    try {
      const res = await admin('adminList');
      students = sortStudents(res.students || []);
      render();
    } catch (e) { fail(e); }
  }

  // ----- PDF -----
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSPDF_URL;
      s.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF missing')));
      s.onerror = () => reject(new Error('jsPDF load failed'));
      document.head.append(s);
    });
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function setBusy(v) {
    busy = v;
    document.querySelectorAll('#rows button, #reload').forEach((b) => { b.disabled = v; });
    syncSel();
  }
  const ymd = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  async function pagesPdf(name) {
    if (busy) return;
    clearNotes(); show($('a3Warn'));
    setBusy(true);
    try {
      show($('a3Msg'), `쪽 PDF 만드는 중… ${name}`);
      const zine = (await admin('adminGetZine', { name })).zine;
      const jsPDF = await loadJsPdf();
      const { blob, failed } = await buildPagesPdf(zine, {
        loadImage: loaderFor(zine.name || name), jsPDF, ensureFonts,
        onProgress: (d, t) => show($('a3Msg'), `쪽 PDF 만드는 중… ${name} (${d}/${t})`),
      });
      download(blob, `${safeName(zine.name || name)}_${safeName(zineTitle(zine)) || '진'}.pdf`);
      if (failed.length) show($('a3Warn'), `${name}: 사진 ${failed.length}장을 불러오지 못해 빠졌어요. (${[...new Set(failed.map((f) => f.pageNumber))].join(', ')}쪽)`);
    } catch (e) {
      if (!(e && e.handled)) show($('a3Warn'), 'PDF를 만들지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally { show($('a3Msg')); setBusy(false); }
  }

  async function a3Pdf() {
    if (busy || selected.size === 0) return;
    clearNotes(); show($('a3Warn'));
    const names = students.filter((s) => selected.has(s.name)).map((s) => s.name);
    setBusy(true);
    try {
      const zines = [];
      for (let i = 0; i < names.length; i++) {
        show($('a3Msg'), `A3 만드는 중… 불러오는 중 ${names[i]} (${i + 1}/${names.length})`);
        zines.push((await admin('adminGetZine', { name: names[i] })).zine);
      }
      const jsPDF = await loadJsPdf();
      let cur = 0;
      const { blob, failed } = await buildA3Pdf(zines, {
        loaderFor: (z) => loaderFor(z.name), jsPDF, ensureFonts, guides: $('guides').checked,
        onProgress: (d, t) => {
          cur = Math.min(zines.length - 1, Math.floor((d - 1) / (t / zines.length)));
          show($('a3Msg'), `A3 만드는 중… ${zines[cur].name || names[cur]} (${cur + 1}/${names.length})`);
        },
      });
      download(blob, names.length === 1 ? `A3_${safeName(names[0])}.pdf` : `A3_${ymd()}_${names.length}명.pdf`);
      if (failed.length) {
        const by = new Map();
        for (const f of failed) {
          const k = f.name || '';
          if (!by.has(k)) by.set(k, new Set());
          by.get(k).add(f.pageNumber);
        }
        const lines = [...by].map(([n, ps]) => `${n}: ${[...ps].sort((a, b) => a - b).join(', ')}쪽`);
        const w = $('a3Warn');
        w.textContent = '사진을 불러오지 못해 PDF에서 빠진 곳이 있어요. 인터넷 연결을 확인하고 다시 받아 주세요. ';
        const ul = document.createElement('ul'); ul.className = 'fails';
        for (const l of lines) { const li = document.createElement('li'); li.textContent = l; ul.append(li); }
        w.append(ul); w.hidden = false;
      }
    } catch (e) {
      if (!(e && e.handled)) show($('a3Warn'), 'PDF를 만들지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    } finally { show($('a3Msg')); setBusy(false); }
  }

  // ----- stickers -----
  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('read'));
      r.readAsDataURL(file);
    });
  }
  async function addSticker() {
    show($('stkErr')); show($('stkOk'));
    const f = $('stkFile').files[0];
    if (!f) { show($('stkErr'), '스티커 파일을 먼저 골라 주세요.'); return; }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { show($('stkErr'), 'PNG, JPG, WEBP, GIF 파일만 올릴 수 있어요.'); return; }
    if (f.size > MAX_STICKER) { show($('stkErr'), '파일이 너무 커요. 3MB 이하로 줄여 주세요.'); return; }
    const name = $('stkName').value.trim() || f.name.replace(/\.[^.]+$/, '');
    $('stkBtn').disabled = true;
    try {
      const data = await readBase64(f);
      await admin('adminAddSticker', { name, data, mime: f.type });
      show($('stkOk'), `스티커 "${name}"를 올렸어요.`);
      $('stkFile').value = ''; $('stkName').value = '';
    } catch (e) {
      if (!(e && e.handled)) show($('stkErr'), e && e.code ? errText(e) : '올리지 못했어요. 인터넷 연결을 확인해 주세요.');
    } finally { $('stkBtn').disabled = false; }
  }

  // ----- wiring -----
  $('loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    show($('loginErr'));
    const pw = $('pw').value;
    if (!pw) { show($('loginErr'), '비밀번호를 입력해 주세요.'); return; }
    $('loginBtn').disabled = true;
    try {
      const res = await call('adminLogin', { password: pw });
      setAdminToken(res.adminToken);
      $('pw').value = '';
      enter();
    } catch (e) {
      const left = e && e.data && e.data.remaining;
      show($('loginErr'), e && e.code === 'AUTH' ? `비밀번호가 달라요.${left ? ` (${left}번 더 틀리면 10분 동안 잠겨요)` : ''}`
        : e && e.code ? errText(e) : '인터넷 연결을 확인해 주세요.');
    } finally { $('loginBtn').disabled = false; }
  });
  $('reload').addEventListener('click', refresh);
  $('logout').addEventListener('click', () => showLogin(''));
  $('selAll').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) students.forEach((s) => selected.add(s.name));
    render();
  });
  $('a3Btn').addEventListener('click', a3Pdf);
  $('stkBtn').addEventListener('click', addSticker);

  function enter() {
    $('loginView').hidden = true;
    $('mainView').hidden = false;
    refresh();
  }
  if (getAdminToken()) enter();
}
