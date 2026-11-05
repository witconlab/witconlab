import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas-harness.mjs';
import {
  PAGE_COUNT, PAPERS, TEXT_COLORS, PATTERNS, HIGHLIGHTS, PAGE_LABELS,
  createEmptyZine, addElement, updateElement, removeElement, bringForward, sendBackward,
  duplicateElement, setPageTitle, moveTitle, setBackground, setPattern, setFrameLine,
  setTitleHighlight, isPageFilled, filledCount, outsideSafeArea,
} from '../js/model.js';

const snap = (o) => JSON.stringify(o);

test('empty zine has 8 pages, cover yellow', () => {
  const z = createEmptyZine('김민지');
  assert.equal(PAGE_COUNT, 8);
  assert.equal(z.pages.length, 8);
  assert.equal(z.pages[0].background, 'yellow');
  assert.equal(z.pages[1].background, 'cream');
  assert.equal(z.name, '김민지');
  assert.equal(z.rev, 0);
  assert.equal(PAGE_LABELS.length, 8);
  assert.ok(PAPERS.cream && TEXT_COLORS.ink && HIGHLIGHTS.sky && PATTERNS.includes('dots'));
});

test('client and server empty zine match', () => {
  const { ctx } = loadGas(new URL('../apps-script/Code.gs', import.meta.url).pathname);
  const server = JSON.parse(JSON.stringify(ctx.emptyZine_('김민지')));
  assert.deepStrictEqual(server, createEmptyZine('김민지'));
});

test('moveTitle updates titleBox', () => {
  const z = createEmptyZine('a');
  const z2 = moveTitle(z, 2, { x: 0.2, y: 0.3 });
  assert.equal(z2.pages[2].titleBox.x, 0.2);
  assert.equal(z2.pages[2].titleBox.y, 0.3);
  assert.equal(z2.pages[2].titleBox.w, 0.88);
  assert.equal(z.pages[2].titleBox.x, 0.06);
});

test('addElement does not mutate', () => {
  const z = createEmptyZine('a');
  const before = snap(z);
  const z2 = addElement(z, 1, { type: 'text', text: 'hi' });
  assert.equal(snap(z), before);
  assert.notEqual(z2, z);
  const el = z2.pages[1].elements[0];
  assert.match(el.id, /^e_.{8}$/);
  assert.equal(el.type, 'text');
});

test('z increases', () => {
  let z = createEmptyZine('a');
  z = addElement(z, 0, { type: 'sticker', src: 'builtin:star' });
  z = addElement(z, 0, { type: 'sticker', src: 'builtin:star' });
  const [a, b] = z.pages[0].elements;
  assert.equal(b.z, a.z + 1);
});

test('bringForward swaps z with next higher', () => {
  let z = createEmptyZine('a');
  for (let i = 0; i < 3; i++) z = addElement(z, 0, { type: 'sticker', src: 'builtin:star' });
  const [a, b, c] = z.pages[0].elements;
  const z2 = bringForward(z, 0, a.id);
  const m = Object.fromEntries(z2.pages[0].elements.map((e) => [e.id, e.z]));
  assert.equal(m[a.id], b.z);
  assert.equal(m[b.id], a.z);
  assert.equal(m[c.id], c.z);
  const z3 = sendBackward(z2, 0, a.id);
  assert.deepStrictEqual(z3.pages[0].elements.map((e) => e.z), z.pages[0].elements.map((e) => e.z));
});

test('duplicate offsets by 0.03', () => {
  let z = createEmptyZine('a');
  z = addElement(z, 0, { type: 'sticker', src: 'builtin:star', x: 0.4, y: 0.4 });
  const orig = z.pages[0].elements[0];
  const z2 = duplicateElement(z, 0, orig.id);
  assert.equal(z2.pages[0].elements.length, 2);
  const dup = z2.pages[0].elements[1];
  assert.notEqual(dup.id, orig.id);
  assert.ok(Math.abs(dup.x - 0.43) < 1e-9);
  assert.ok(Math.abs(dup.y - 0.43) < 1e-9);
});

test('updateElement and removeElement are immutable', () => {
  let z = createEmptyZine('a');
  z = addElement(z, 0, { type: 'text', text: 'x' });
  const id = z.pages[0].elements[0].id;
  const before = snap(z);
  const z2 = updateElement(z, 0, id, { rotate: 15 });
  assert.equal(z2.pages[0].elements[0].rotate, 15);
  const z3 = removeElement(z2, 0, id);
  assert.equal(z3.pages[0].elements.length, 0);
  assert.equal(snap(z), before);
});

test('filledCount counts title or elements', () => {
  let z = createEmptyZine('a');
  assert.equal(filledCount(z), 0);
  z = setPageTitle(z, 0, '안녕');
  z = addElement(z, 3, { type: 'text', text: 'x' });
  assert.equal(filledCount(z), 2);
  assert.equal(isPageFilled(z.pages[1]), false);
  assert.equal(isPageFilled(z.pages[0]), true);
});

test('outsideSafeArea', () => {
  assert.equal(outsideSafeArea({ x: 0.02, y: 0.5, w: 0.3, h: 0.2 }), true);
  assert.equal(outsideSafeArea({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 }), false);
  assert.equal(outsideSafeArea({ x: 0.7, y: 0.5, w: 0.3, h: 0.2 }), true);
});

test('setPattern', () => {
  const z = createEmptyZine('a'); const b = snap(z);
  assert.equal(setPattern(z, 1, 'grid').pages[1].pattern, 'grid');
  assert.equal(snap(z), b);
});
test('setFrameLine', () => {
  const z = createEmptyZine('a'); const b = snap(z);
  assert.equal(setFrameLine(z, 1, false).pages[1].frameLine, false);
  assert.equal(snap(z), b);
});
test('setTitleHighlight', () => {
  const z = createEmptyZine('a'); const b = snap(z);
  assert.equal(setTitleHighlight(z, 1, 'pink').pages[1].titleHighlight, 'pink');
  assert.equal(snap(z), b);
});
test('setBackground', () => {
  const z = createEmptyZine('a'); const b = snap(z);
  assert.equal(setBackground(z, 1, 'sky').pages[1].background, 'sky');
  assert.equal(snap(z), b);
});
test('setPageTitle', () => {
  const z = createEmptyZine('a'); const b = snap(z);
  assert.equal(setPageTitle(z, 1, '제목').pages[1].title, '제목');
  assert.equal(snap(z), b);
});

test('movePage moves inner pages only, immutably', async () => {
  const { movePage } = await import('../js/model.js');
  let z = createEmptyZine('a');
  z = { ...z, pages: z.pages.map((p, i) => ({ ...p, title: 'p' + (i + 1) })) };
  const before = snap(z);
  const m = movePage(z, 1, 4);
  assert.deepEqual(m.pages.map((p) => p.title), ['p1', 'p3', 'p4', 'p5', 'p2', 'p6', 'p7', 'p8']);
  assert.equal(snap(z), before);
  assert.equal(m.pages[0], z.pages[0]);
  assert.equal(m.pages[7], z.pages[7]);
  assert.deepEqual(movePage(z, 6, 1).pages.map((p) => p.title), ['p1', 'p7', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8']);
  for (const [f, t] of [[0, 2], [2, 0], [7, 3], [3, 7], [-1, 2], [2, 2], [1.5, 2], [2, 9]]) assert.equal(movePage(z, f, t), z);
});

test('title font/size: optional with defaults and clamping', async () => {
  const { setTitleFont, setTitleSize, titleSizeOf, fontOf, TITLE_SIZE } = await import('../js/model.js');
  const z = createEmptyZine('a');
  assert.equal(titleSizeOf(z.pages[1]), TITLE_SIZE.def);
  assert.equal(fontOf(z.pages[1].titleFont), 'sans');
  assert.equal(setTitleSize(z, 1, 0.5).pages[1].titleSize, 0.12);
  assert.equal(setTitleSize(z, 1, 0.01).pages[1].titleSize, 0.04);
  assert.equal(setTitleSize(z, 1, 0.08).pages[1].titleSize, 0.08);
  assert.equal(setTitleFont(z, 1, 'hand').pages[1].titleFont, 'hand');
  assert.equal(setTitleFont(z, 1, 'weird').pages[1].titleFont, 'sans');
  assert.equal(HIGHLIGHTS.white, '#ffffff');
});

test('cropOf: absent/invalid -> null, otherwise clamped into the image', async () => {
  const { cropOf } = await import('../js/model.js');
  assert.equal(cropOf({}), null);
  assert.equal(cropOf({ crop: { x: 0, y: 0, w: 0, h: 1 } }), null);
  assert.equal(cropOf({ crop: { x: 'a', y: 0, w: 1, h: 1 } }), null);
  assert.deepEqual(cropOf({ crop: { x: 0.5, y: -0.2, w: 0.8, h: 0.5 } }), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
});

test('setPhotoCrop keeps width and centre, height follows aspect (polaroid inset), removes with null', async () => {
  const { setPhotoCrop, photoHeight } = await import('../js/model.js');
  let z = addElement(createEmptyZine('t'), 1, { type: 'photo', src: 'p', frame: 'polaroid', x: 0.2, y: 0.2, w: 0.6, h: 0.5 });
  const id = z.pages[1].elements[0].id;
  const before = snap(z);
  const z2 = setPhotoCrop(z, 1, id, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1, 0.7);
  assert.equal(snap(z), before);
  const e = z2.pages[1].elements[0];
  assert.equal(e.w, 0.6);
  assert.ok(Math.abs(e.h - (0.6 * 0.92 * 0.7) / 0.8) < 1e-12);
  assert.ok(Math.abs(e.y + e.h / 2 - 0.45) < 1e-12 && Math.abs(e.x - 0.2) < 1e-12);
  assert.deepEqual(e.crop, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  assert.equal(photoHeight(1, 'none', 2, 1), 0.5);
  const z3 = setPhotoCrop(z2, 1, id, null, 2, 0.7);
  assert.equal('crop' in z3.pages[1].elements[0], false);
  // too tall -> shrinks to maxH, width scaled down
  const z4 = setPhotoCrop(z, 1, id, { x: 0, y: 0, w: 0.1, h: 1 }, 0.1, 0.7);
  assert.ok(Math.abs(z4.pages[1].elements[0].h - 0.9) < 1e-12 && z4.pages[1].elements[0].w < 0.6);
});

test('myStickers: newest first, deduped, max 30, optional', async () => {
  const { addMySticker, myStickersOf, MY_STICKERS_MAX } = await import('../js/model.js');
  let z = createEmptyZine('t');
  assert.deepEqual(myStickersOf(z), []);
  assert.equal('myStickers' in z, false);
  for (let i = 0; i < 35; i++) z = addMySticker(z, { id: 'p' + i, w: 10, h: 20 });
  assert.equal(z.myStickers.length, MY_STICKERS_MAX);
  assert.equal(z.myStickers[0].id, 'p34');
  z = addMySticker(z, { id: 'p20', w: 10, h: 20 });
  assert.equal(z.myStickers[0].id, 'p20');
  assert.equal(z.myStickers.filter((s) => s.id === 'p20').length, 1);
});

test('mergeMyStickers: first list order wins, deduped, capped at 30', async () => {
  const { mergeMyStickers } = await import('../js/model.js');
  const s = (id) => ({ id, w: 1, h: 1 });
  assert.deepEqual(mergeMyStickers([s('a'), s('b')], [s('b'), s('c')]).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(mergeMyStickers(undefined, [s('c')]).map((x) => x.id), ['c']);
  const many = Array.from({ length: 25 }, (_, i) => s('x' + i));
  const more = Array.from({ length: 25 }, (_, i) => s('y' + i));
  assert.equal(mergeMyStickers(many, more).length, 30);
});

test('setPhotoCrop keeps the element on the page', async () => {
  const { setPhotoCrop } = await import('../js/model.js');
  const z = addElement(createEmptyZine('t'), 1, { type: 'photo', src: 'p', frame: 'none', x: 0.05, y: 0.6, w: 0.5, h: 0.3 });
  const id = z.pages[1].elements[0].id;
  const e = setPhotoCrop(z, 1, id, { x: 0, y: 0, w: 0.2, h: 1 }, 0.3, 0.7).pages[1].elements[0];
  assert.ok(e.y >= 0 && e.y + e.h <= 1 + 1e-12 && e.x >= 0 && e.x + e.w <= 1 + 1e-12, JSON.stringify(e));
});
