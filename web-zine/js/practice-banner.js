// Red banner when the site still runs on the practice backend (API_URL 'mock') somewhere other than the
// teacher's own computer: work is then saved only in this browser, never on the teacher's Drive.
import { API_URL } from './config.js';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isPracticeMode(apiUrl, hostname) {
  return apiUrl === 'mock' && !LOCAL.has(String(hostname || ''));
}

export function showPracticeBanner(doc = document) {
  if (doc.getElementById('practiceBanner')) return;
  const b = doc.createElement('div');
  b.id = 'practiceBanner';
  b.setAttribute('role', 'alert');
  b.textContent = '연습 모드 · 이 기기에만 저장돼요. 선생님께 알려 주세요';
  // fixed to the top so it spans the full width whatever layout the page body uses (index centres with flex)
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;margin:0;padding:8px 14px;background:#d93025;color:#fff;'
    + 'font:700 14px/1.35 Pretendard,system-ui,sans-serif;text-align:center;';
  doc.body.prepend(b);
  const h = b.offsetHeight;
  // push the page down by the banner's height, keeping any padding the page already had
  const view = doc.defaultView;
  const pad = view ? parseFloat(view.getComputedStyle(doc.body).paddingTop) || 0 : 0;
  doc.body.style.paddingTop = (pad + h) + 'px';
  // full-height pages (editor, viewer) shrink by the banner's height so their bottom bars stay visible
  doc.documentElement.style.setProperty('--practice-h', h + 'px');
}

if (typeof document !== 'undefined' && isPracticeMode(API_URL, location.hostname)) {
  if (document.body) showPracticeBanner();
  else document.addEventListener('DOMContentLoaded', () => showPracticeBanner());
}
