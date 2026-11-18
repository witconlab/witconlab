// 원페이퍼 전체보기(plans.html): 학생들이 보낸 원페이퍼를 한 장씩 넘겨 보는 슬라이드. 관리자로 입장한 탭에서만.
import { call, getAdminToken } from './api.js';
import { buildPlan, planSheetHtml } from './plan.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const msg = (html) => { stage.innerHTML = `<p class="sl-msg">${html}</p>`; $('nav').hidden = true; };

let plans = [];
let cur = 0;

function show(i) {
  cur = Math.max(0, Math.min(plans.length - 1, i));
  const p = plans[cur];
  const plan = buildPlan({ ...p.answers, name: p.answers?.name || p.name });
  stage.innerHTML = planSheetHtml(plan);
  $('count').textContent = `${cur + 1} / ${plans.length} · ${plan.name || '이름 없음'}`;
  $('prev').disabled = cur === 0;
  $('next').disabled = cur === plans.length - 1;
  history.replaceState(null, '', '#' + (cur + 1));
  window.scrollTo(0, 0);
}

async function start() {
  if (!getAdminToken()) { msg('관리자 화면에서 먼저 입장해 주세요.<br><a href="admin.html">관리자 화면으로 가기</a>'); return; }
  try {
    plans = (await call('adminListPlans', { adminToken: getAdminToken() })).plans || [];
  } catch (e) {
    msg(e && e.code === 'AUTH' ? '다시 입장해 주세요.<br><a href="admin.html">관리자 화면으로 가기</a>' : '불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.');
    return;
  }
  if (!plans.length) { msg('아직 보낸 원페이퍼가 없어요.'); return; }
  $('nav').hidden = false;
  show((parseInt(location.hash.slice(1), 10) || 1) - 1);
}

$('prev').addEventListener('click', () => show(cur - 1));
$('next').addEventListener('click', () => show(cur + 1));
document.addEventListener('keydown', (e) => {
  if (!plans.length || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(cur + 1); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(cur - 1); }
});
// swipe left/right on phones and tablets
let x0 = null;
stage.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
stage.addEventListener('touchend', (e) => {
  if (x0 == null) return;
  const dx = e.changedTouches[0].clientX - x0; x0 = null;
  if (Math.abs(dx) > 60) show(cur + (dx < 0 ? 1 : -1));
});
$('full').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen();
});

start();
