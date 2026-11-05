import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, renderPage } from '../js/render.js';
import { BUILTIN_STICKERS, stickerSvg } from '../js/stickers.js';
import { createEmptyZine, addElement, HIGHLIGHTS } from '../js/model.js';

// Fake 2D context: records every method call (with fillStyle at call time) and keeps assigned props.
function fakeCtx() {
  const calls = [];
  const state = {};
  const ctx = new Proxy({}, {
    get(_, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'then') return undefined;
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (prop in state) return state[prop];
      return (...args) => { calls.push({ name: prop, args, fillStyle: state.fillStyle, font: state.font, alpha: state.globalAlpha }); };
    },
    set(_, prop, v) { state[prop] = v; return true; },
  });
  return ctx;
}
const names = (ctx) => ctx.calls.map((c) => c.name);
const img = (tag, w = 200, h = 100) => ({ tag, width: w, height: h });
const W = 100, H = 100;

async function render(page, opts = {}) {
  const ctx = fakeCtx();
  await renderPage(ctx, page, {
    width: W, height: H,
    loadImage: async (src) => img(src),
    loadSvg: async (svg) => img('svg'),
    ...opts,
  });
  return ctx;
}
function pageWith(...els) {
  let z = createEmptyZine('t');
  for (const e of els) z = addElement(z, 1, e);
  return z.pages[1];
}
const measure = (s) => s.length * 10;

test('wrapText splits on spaces', () => {
  const lines = wrapText(measure, '파도 소리가 들리는 골목', 60);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.length <= 6, l);
});

test('wrapText breaks long Korean word by char', () => {
  assert.deepEqual(wrapText(measure, '가나다라마바사아자차', 40), ['가나다라', '마바사아', '자차']);
});

test('wrapText honors newline', () => {
  assert.deepEqual(wrapText(measure, '가나\n다라', 100), ['가나', '다라']);
});

test('renderPage draws in z order', async () => {
  const page = pageWith({ type: 'photo', src: 'p-top', w: 0.3, h: 0.3, z: 2 }, { type: 'photo', src: 'p-bottom', w: 0.3, h: 0.3 });
  page.elements[0].z = 2; page.elements[1].z = 1;
  const ctx = await render(page);
  const order = ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args[0].tag);
  assert.deepEqual(order, ['p-bottom', 'p-top']);
});

test('renderPage applies rotation around center', async () => {
  const page = pageWith({ type: 'photo', src: 'a', x: 0.2, y: 0.2, w: 0.4, h: 0.2, rotate: 90 });
  const ctx = await render(page);
  const i = ctx.calls.findIndex((c) => c.name === 'rotate' && c.args[0] === Math.PI / 2);
  assert.ok(i > 0);
  const t = ctx.calls[i - 1];
  assert.equal(t.name, 'translate');
  assert.deepEqual(t.args.map((v) => Math.round(v * 1000) / 1000), [40, 30]);
});

test('renderPage clips to page', async () => {
  const ctx = await render(pageWith());
  const first = ctx.calls.slice(0, 5);
  const r = first.findIndex((c) => c.name === 'rect' && c.args.join() === [0, 0, W, H].join());
  assert.ok(r >= 0);
  assert.ok(first.slice(r).some((c) => c.name === 'clip'));
});

test('polaroid photo inset', async () => {
  const page = pageWith({ type: 'photo', src: 'a', x: 0.1, y: 0.1, w: 1, h: 1, rotate: 0, frame: 'polaroid' });
  page.elements[0].w = 1; page.elements[0].h = 1;
  const ctx = await render(page, { width: 100, height: 100 });
  const d = ctx.calls.find((c) => c.name === 'drawImage');
  // drawn in the element's local box (origin = box top-left): x+4, y+4, 92x80 of a 100x100 box
  assert.deepEqual(d.args.slice(-4), [4, 4, 92, 80]);
});

test('page number only on pages 2-7', async () => {
  const page = pageWith();
  const cover = await render(page, { pageNumber: 1 });
  const back = await render(page, { pageNumber: 8 });
  const mid = await render(page, { pageNumber: 3 });
  assert.equal(cover.calls.filter((c) => c.name === 'fillText').length, 0);
  assert.equal(back.calls.filter((c) => c.name === 'fillText').length, 0);
  assert.ok(mid.calls.some((c) => c.name === 'fillText' && c.args[0] === '3'));
});

test('title highlight drawn before title text', async () => {
  const page = { ...pageWith(), title: '안녕', titleHighlight: 'lemon' };
  const ctx = await render(page);
  const hl = ctx.calls.findIndex((c) => c.name === 'fillRect' && c.fillStyle === HIGHLIGHTS.lemon);
  const tx = ctx.calls.findIndex((c) => c.name === 'fillText' && c.args[0] === '안녕');
  assert.ok(hl >= 0 && tx > hl);
});

test('9 face stickers and 26x3 letters exist', () => {
  assert.equal(BUILTIN_STICKERS.filter((s) => s.group === 'face').length, 9);
  assert.equal(BUILTIN_STICKERS.filter((s) => s.group === 'letter').length, 78);
});

test('every builtin sticker has svg or draw', () => {
  const keys = new Set();
  for (const s of BUILTIN_STICKERS) {
    assert.ok(!keys.has(s.key), 'dup ' + s.key); keys.add(s.key);
    assert.ok(s.label && s.aspect > 0, s.key);
    if (s.svg !== undefined) {
      assert.ok(s.svg.startsWith('<svg') && s.svg.includes('viewBox'), s.key);
      assert.equal(stickerSvg(s.key), s.svg);
    } else assert.equal(typeof s.draw, 'function', s.key);
  }
  assert.equal(BUILTIN_STICKERS.filter((s) => s.group === 'alpha').length, 26);
  assert.equal(BUILTIN_STICKERS.filter((s) => s.group === 'number').length, 15);
  for (const s of BUILTIN_STICKERS.filter((s) => ['alpha', 'letter', 'number'].includes(s.group))) {
    assert.equal(typeof s.draw, 'function', s.key);
    assert.equal(s.svg, undefined);
  }
});

test('builtin sticker with draw is drawn directly; svg via loadSvg; custom via loadImage', async () => {
  const calls = [];
  const page = pageWith(
    { type: 'sticker', src: 'builtin:alpha-A', w: 0.2, h: 0.2 },
    { type: 'sticker', src: 'builtin:face-1', w: 0.2, h: 0.2 },
    { type: 'sticker', src: 'custom:abc', w: 0.2, h: 0.2 },
  );
  const ctx = await render(page, {
    loadImage: async (s) => { calls.push('img:' + s); return img(s); },
    loadSvg: async (s) => { calls.push('svg'); return img('svg'); },
  });
  assert.deepEqual(calls.sort(), ['img:custom:abc', 'svg']);
  assert.ok(ctx.calls.some((c) => c.name === 'fillText' && c.args[0] === 'A'));
});

test('failed loads are reported and other elements still draw', async () => {
  const page = pageWith({ type: 'photo', src: 'bad', w: 0.3, h: 0.3 }, { type: 'photo', src: 'good', w: 0.3, h: 0.3 },
    { type: 'sticker', src: 'builtin:nope', w: 0.2, h: 0.2 });
  const ctx = fakeCtx();
  const res = await renderPage(ctx, page, { width: W, height: H, loadSvg: async () => img('svg'),
    loadImage: async (s) => { if (s === 'bad') throw new Error('x'); return img(s); } });
  assert.deepEqual(res.failed.map((f) => f.src).sort(), ['bad', 'builtin:nope']);
  assert.ok(res.failed[0].error);
  assert.deepEqual(ctx.calls.filter((c) => c.name === 'drawImage').map((c) => c.args[0].tag), ['good']);
});

test('tape outline is a monotone loop; svgs have explicit size; number sits inside frame', async () => {
  const tape = BUILTIN_STICKERS.find((s) => s.group === 'tape');
  const d = tape.svg.match(/d="(M2 0H98[^"]*)"/)[1];
  const ys = [...d.split('H98')[1].split('H2')[0].matchAll(/L[\d.]+ ([\d.]+)/g)].map((m) => +m[1]);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
  for (const s of BUILTIN_STICKERS.filter((s) => s.svg)) assert.match(s.svg, /<svg[^>]* width="\d+" height="\d+"/);
  const ctx = await render(pageWith(), { pageNumber: 3 });
  const t = ctx.calls.find((c) => c.name === 'fillText' && c.args[0] === '3');
  assert.ok(t.args[1] > (5 / 105) * W + 0.03 * W && t.args[2] > (5 / 148) * H + 0.02 * H);
});
