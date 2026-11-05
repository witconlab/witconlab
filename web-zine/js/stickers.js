// Built-in stickers. Each item has either `svg` (hand-drawn shapes) or `draw(ctx,w,h)` (anything with text,
// so the web font is used on screen and in print). Face/doodle art is original.
const r1 = (n) => Math.round(n * 10) / 10;

// Deterministic pseudo-random so stickers look the same on every device.
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Wobbly closed blob: jittered radius around a circle, smoothed with quadratic midpoints.
function blobPath(cx, cy, rx, ry, seed, jitter = 0.09, n = 11) {
  const rand = rng(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2;
    const k = 1 + (rand() - 0.5) * 2 * jitter;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${r1(mid(pts[n - 1], pts[0])[0])} ${r1(mid(pts[n - 1], pts[0])[1])}`;
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${r1(m[0])} ${r1(m[1])}`;
  }
  return d + 'Z';
}

const svgWrap = (inner, vb = '0 0 100 100') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${vb.split(' ')[2]}" height="${vb.split(' ')[3]}" viewBox="${vb}" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const INK = '#1b1713';
const line = (d, w = 4) => `<path d="${d}" stroke="${INK}" stroke-width="${w}"/>`;

const stickers = [];
const add = (s) => stickers.push(s);

// --- Face blobs: 9 colours x one expression each (smile, flat, frown cycling) ---
const FACE_COLORS = ['#e8474f', '#3fbf6b', '#f5a3a3', '#c9a7d8', '#f58a2e', '#f7d348', '#c4c8c8', '#3d5a8c', '#8fb3d9'];
const FACE_NAMES = ['빨강', '초록', '분홍', '보라', '주황', '노랑', '회색', '남색', '하늘'];
const EXPR = ['웃음', '무표정', '찡그림'];
FACE_COLORS.forEach((c, i) => {
  const e = i % 3;
  const mouth = [
    'M36 62Q50 76 64 62', // smile
    'M39 66L61 65', // flat
    'M37 69Q50 56 63 69', // frown
  ][e];
  const brows = e === 2 ? line('M30 38L42 43M70 38L58 43', 3.5) : '';
  const svg = svgWrap(
    `<path d="${blobPath(52, 53, 42, 40, i + 3, 0.1)}" fill="#000" fill-opacity=".12"/>` + // misregistered shadow print
    `<path d="${blobPath(50, 50, 42, 40, i + 3, 0.1)}" fill="${c}"/>` +
    `<path d="${blobPath(44, 40, 20, 14, i + 20, 0.2, 7)}" fill="#fff" fill-opacity=".16"/>` +
    `<circle cx="37" cy="47" r="4.2" fill="${INK}"/><circle cx="63" cy="46" r="4.2" fill="${INK}"/>${brows}` +
    line(mouth, 4),
  );
  add({ key: `face-${i + 1}`, group: 'face', label: `${FACE_NAMES[i]} ${EXPR[e]} 얼굴`, svg, aspect: 1 });
});

// --- Doodles: black rounded outline, uneven fills ---
const doodles = {
  sun: ['해', `<path d="${blobPath(50, 50, 21, 20, 5, 0.07, 9)}" fill="#f7d348" stroke="${INK}" stroke-width="4"/>` +
    line('M50 8L51 20M50 80L49 92M8 50L20 51M80 49L92 50M20 20L28 28M72 72L80 80M80 21L72 28M28 72L20 80', 4.5)],
  note: ['음표', line('M38 74V24L72 16V66', 4.5) + `<path d="${blobPath(30, 76, 11, 8, 2, 0.1, 8)}" fill="${INK}"/>` +
    `<path d="${blobPath(64, 68, 11, 8, 9, 0.1, 8)}" fill="${INK}"/>` + line('M38 34L72 26', 6)],
  sparkle: ['반짝이', `<path d="M50 8Q54 40 90 50Q54 58 50 92Q46 58 10 50Q46 42 50 8Z" fill="#fbe58a" stroke="${INK}" stroke-width="4"/>` +
    line('M84 14V26M78 20H90', 3.5)],
  leaf: ['잎', `<path d="M16 82Q10 30 52 16Q90 12 86 52Q76 90 24 84Z" fill="#8ccf6a" stroke="${INK}" stroke-width="4"/>` +
    line('M18 82Q46 54 76 28M44 58L44 40M58 44L72 46', 3.5)],
  heart: ['하트 낙서', `<path d="M50 84Q10 56 14 34Q20 12 42 22Q48 26 50 32Q54 24 62 22Q86 14 88 38Q88 58 50 84Z" fill="#f6a0b4" stroke="${INK}" stroke-width="4"/>`],
  cloud: ['구름', `<path d="M24 74Q6 72 10 56Q12 44 28 46Q28 24 50 24Q68 22 72 40Q92 38 92 56Q92 74 72 74Z" fill="#dff0fb" stroke="${INK}" stroke-width="4"/>`],
};
for (const [k, [label, inner]] of Object.entries(doodles)) add({ key: `doodle-${k}`, group: 'doodle', label, svg: svgWrap(inner), aspect: 1 });
add({ key: 'doodle-heart-solid', group: 'doodle', label: '빨간 하트', aspect: 1,
  svg: svgWrap(`<path d="M50 86Q6 58 12 32Q18 8 42 20Q48 24 50 30Q54 22 62 20Q88 12 90 38Q90 60 50 86Z" fill="#e8474f"/>` +
    `<path d="M24 30Q28 22 36 24" stroke="#fff" stroke-opacity=".6" stroke-width="4"/>`) });
add({ key: 'doodle-note-solid', group: 'doodle', label: '검정 음표', aspect: 1,
  svg: svgWrap(`<path d="M40 76V22L74 14V66" stroke="${INK}" stroke-width="6"/><path d="${blobPath(30, 78, 12, 9, 4, 0.1, 8)}" fill="${INK}"/><path d="${blobPath(64, 70, 12, 9, 6, 0.1, 8)}" fill="${INK}"/>`) });

// --- Crayon stars (drawn twice with different jitter for a rough, scribbly look) ---
function starPath(seed) {
  const rand = rng(seed);
  let d = '';
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = (i % 2 ? 19 : 44) * (1 + (rand() - 0.5) * 0.16);
    d += `${i ? 'L' : 'M'}${r1(50 + Math.cos(a) * rad + (rand() - 0.5) * 3)} ${r1(52 + Math.sin(a) * rad + (rand() - 0.5) * 3)}`;
  }
  return d + 'Z';
}
[['red', '#e8473a', '빨간 색연필 별', 1], ['green', '#3fae49', '초록 색연필 별', 7]].forEach(([k, c, label, seed]) => {
  add({ key: `star-${k}`, group: 'star', label, aspect: 1,
    svg: svgWrap(`<path d="${starPath(seed)}" fill="${c}" fill-opacity=".8" stroke="${c}" stroke-width="5"/>` +
      `<path d="${starPath(seed + 3)}" stroke="${c}" stroke-width="2.5" stroke-opacity=".7"/>`) });
});

// --- Washi tape: translucent rectangle with serrated ends ---
['#f6a0b4', '#8fd0e8', '#f7d348'].forEach((c, i) => {
  let left = '', right = '';
  for (let y = 0; y < 40; y += 5) { right += `L${y % 10 ? 100 : 96} ${y + 2.5}`; left += `L${y % 10 ? 0 : 4} ${40 - y - 2.5}`; }
  add({ key: `tape-${i + 1}`, group: 'tape', label: `마스킹테이프 ${i + 1}`, aspect: 2.5,
    svg: svgWrap(`<path d="M2 0H98${right}L98 40H2${left}Z" fill="${c}" fill-opacity=".72"/>` +
      `<path d="M14 6L30 34M40 6L56 34M66 6L82 34" stroke="#fff" stroke-opacity=".45" stroke-width="4"/>`, '0 0 100 40') });
});

// --- Letters / numbers: drawn with canvas text so Pretendard is used identically everywhere ---
const FONT = (px) => `900 ${px}px Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function circleLabel(fill, textColor, text) {
  return (ctx, w, h) => {
    const d = Math.min(w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(0, 0, d / 2 * 0.96, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = FONT(d * (text.length > 1 ? 0.46 : 0.6));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, d * 0.03);
    ctx.restore();
  };
}
function outlinedLetter(color, ch) {
  return (ctx, w, h) => {
    const d = Math.min(w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.font = FONT(d * 0.92);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = d * 0.1; ctx.strokeStyle = '#ffffff';
    ctx.strokeText(ch, 0, d * 0.04);
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, d * 0.04);
    ctx.restore();
  };
}
['#e8473a', '#f7c948', '#2f6fb3'].forEach((c, ci) => {
  ALPHABET.forEach((ch) => add({ key: `letter-${ch}-${ci + 1}`, group: 'letter', label: `글자 ${ch}`, aspect: 1, draw: outlinedLetter(c, ch) }));
});
ALPHABET.forEach((ch) => add({ key: `alpha-${ch}`, group: 'alpha', label: `동그라미 ${ch}`, aspect: 1, draw: circleLabel('#ffe14d', INK, ch) }));
for (let n = 1; n <= 15; n++) {
  const t = String(n).padStart(2, '0');
  add({ key: `num-${t}`, group: 'number', label: `번호 ${t}`, aspect: 1, draw: circleLabel('#e9b93a', '#ffffff', t) });
}

export const BUILTIN_STICKERS = stickers;
const byKey = new Map(stickers.map((s) => [s.key, s]));
export const getSticker = (key) => byKey.get(key);
export const stickerSvg = (key) => byKey.get(key)?.svg;
