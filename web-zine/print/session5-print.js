// Renders the 5차시 A3 sheets (질문지 + 원페이퍼 사업계획서) from the same questions as plan.html.
// <body data-mode="sample"> fills both pages with SAMPLE answers in handwriting.
import { QUESTIONS, FIELDS, SAMPLE, buildPlan, icon, partOf, won } from '../js/plan.js';

const sample = document.body.dataset.mode === 'sample';
const A = sample ? SAMPLE : {};
const P = sample ? buildPlan(SAMPLE) : null;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hand = (s) => (sample && s ? `<span class="hw">${esc(s)}</span>` : '');
const tick = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.5c2 1.6 3.6 3.6 5 6.3C11.6 11.4 15.6 6.3 21 3"/></svg>';

// One write-in line: "label ______" with the handwritten answer sitting on it.
const line = (label, value, suffix = '') =>
  `<div class="wl"><span class="wl-l">${esc(label)}</span><span class="wl-v">${hand(value)}</span>${suffix ? `<span class="wl-s">${esc(suffix)}</span>` : ''}</div>`;

function partPaper(p, i) {
  const v = A[p.key];
  if (p.type === 'multi' || p.type === 'single') {
    const on = p.type === 'multi' ? (v || []) : [v];
    // On paper the question title already asks; only show a label when it adds something.
    const label = p.type === 'single' || i > 0 || p.key === 'kinds' ? `<p class="pl">${esc(p.label)}</p>` : '';
    return `<div class="pp">${label}<ul class="ch c${p.cols || 1} ${p.type}">${p.options.map(([id, lab, hint]) =>
      `<li class="${on.includes(id) ? 'on' : ''}"><span class="bx">${tick}</span><span>${esc(lab)}${hint ? `<small>${esc(hint)}</small>` : ''}</span></li>`).join('')}</ul></div>`;
  }
  if (p.type === 'budget') {
    const b = v || {};
    const total = Object.values(b).reduce((s, x) => s + (Number(x) || 0), 0);
    return `<div class="pp"><ul class="ch bud">${p.options.map(([id, lab, hint]) =>
      `<li class="${id in b ? 'on' : ''}"><span class="bx">${tick}</span><span class="bl">${esc(lab)}</span><span class="amt">${hand(b[id])}</span><span class="mw">만원</span></li>`).join('')}</ul>
      <div class="btot">합계 <span class="amt">${hand(total ? String(total) : '')}</span> 만원</div></div>`;
  }
  if (p.type === 'number') return line(p.label, v, p.suffix);
  return `<div class="pp"><p class="pl">${esc(p.label)}</p><div class="ruled" style="min-height:calc(var(--lh) * ${p.lines || 1})">${hand(v)}</div></div>`;
}

function qBlock(q) {
  return `<section class="qb q${q.n}">
    <header class="qhd"><span class="no">${q.n}</span>${icon(q.icon, 30, 1.8)}<h3>${esc(q.title)}${q.sub ? ` <em>${esc(q.sub)}</em>` : ''}</h3></header>
    <p class="qex">예) ${esc(q.example)}</p>
    <div class="qbody">${q.parts.map((p, i) => partPaper(p, i)).join('')}</div>
    <p class="qto">${icon('arrow', 18, 2.2)} 계획서 ${q.to.map((t) => `<b>${esc(t)}</b>`).join(' · ')} 칸으로</p>
  </section>`;
}

function page1() {
  return `<div class="scale"><div class="sheet p1">
    <header class="top">
      <div><p class="kicker">시민기록교육 5차시 · 내년 기록화 사업 원페이퍼 ①</p><h1>질문지 <span>— 쉬운 질문에 답해 보세요</span></h1></div>
      <div class="who">${line('이름 / 테이블', sample ? `${SAMPLE.name} / 3번 테이블` : '')}</div>
    </header>
    <p class="howto">${icon('check', 22, 2.4)} 해당하는 칸에 <b>✓</b> 표시하고, 밑줄에 짧게 적어요. &nbsp; ${icon('arrow', 22, 2)} 다 쓰면 뒷면 <b>계획서</b>로 옮겨 적어요. &nbsp; <span class="exn">회색 글씨는 예시예요.</span></p>
    <div class="qgrid">${QUESTIONS.map(qBlock).join('')}</div>
  </div></div>`;
}

const AREA = { background: 'bg', purpose: 'pu', target: 'tg', people: 'pe', methods: 'me', schedule: 'sc', outputs: 'ou', effects: 'ef', budget: 'bu' };

function planBox(f) {
  const from = `<span class="from">${icon('arrow', 18, 2.2)}질문 ${f.q.map((n) => `<i class="cn">${n}</i>`).join('')}에서 옮겨 적기</span>`;
  let body;
  if (f.key === 'budget') {
    const rows = partOf('budget').options.map(([id, label]) => {
      const r = P && P.budgetRows.find((x) => x.id === id);
      return `<tr><th>${r ? '<span class="bx on">' + tick + '</span>' : '<span class="bx"></span>'}${esc(label)}</th><td>${r && r.amount != null ? hand(String(r.amount)) : ''}</td><td class="mw">만원</td></tr>`;
    }).join('');
    body = `<table class="btab"><tbody>${rows}</tbody><tfoot><tr><th>합계</th><td>${P ? hand(String(P.budgetTotal)) : ''}</td><td class="mw">만원</td></tr></tfoot></table>`;
  } else body = `<div class="ruled">${P ? hand(P[f.key]) : ''}</div>`;
  return `<section class="pb ${AREA[f.key]}"><header><h3>${esc(f.label)}</h3>${from}</header>${body}</section>`;
}

function page2() {
  return `<div class="scale"><div class="sheet p2">
    <header class="top">
      <div><p class="kicker">시민기록교육 5차시 · 내년 기록화 사업 원페이퍼 ②</p><h1>원페이퍼 사업계획서</h1></div>
      <div class="who">${line('작성', sample ? `${SAMPLE.name} 외 9명 (3번 테이블)` : '')}</div>
    </header>
    <div class="headrow">
      <section class="pb tt"><header><h3>사업명</h3><span class="from">${icon('arrow', 18, 2.2)}질문 <i class="cn">1</i><i class="cn">10</i>에서</span></header><div class="ruled big">${P ? hand(P.title) : ''}</div></section>
      <section class="pb sm"><header><h3>한 줄 요약</h3><span class="from">${icon('arrow', 18, 2.2)}질문 <i class="cn">10</i>에서 옮겨 적기</span></header><div class="ruled">${P ? hand(P.summary) : ''}</div></section>
    </div>
    <div class="pgrid">${FIELDS.filter((x) => AREA[x.key]).map(planBox).join('')}</div>
    <p class="foot">${icon('pen', 18, 2)} 칸이 모자라면 짧게 줄여 써도 괜찮아요. 금액은 대략이면 충분해요. 담당자와 이야기하며 함께 다듬어요.</p>
  </div></div>`;
}

document.getElementById('sheets').innerHTML = page1() + page2();

// Screen preview: shrink each A3 sheet to the window width (print uses real size).
function fit() {
  document.querySelectorAll('.scale').forEach((s) => {
    const sh = s.firstElementChild;
    const k = Math.min(1, (s.clientWidth || window.innerWidth) / sh.offsetWidth);
    sh.style.zoom = k;
  });
}
if (!matchMedia('print').matches) { fit(); addEventListener('resize', fit); }
addEventListener('beforeprint', () => document.querySelectorAll('.sheet').forEach((s) => { s.style.zoom = ''; }));
addEventListener('afterprint', fit);
document.fonts?.ready.then(() => { document.body.dataset.ready = '1'; });
