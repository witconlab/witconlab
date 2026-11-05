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
