import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPagesPdf, buildA3Pdf, ensureFonts } from '../js/pdf.js';
import { createEmptyZine, addElement } from '../js/model.js';

function setup() {
  const log = [];
  class FakePdf {
    constructor(o) { this.opts = o; log.push({ n: 'new', o }); }
    addPage(f, o) { log.push({ n: 'addPage', f, o }); }
    addImage(...a) { log.push({ n: 'addImage', a }); }
    setDrawColor(c) { log.push({ n: 'color', c }); }
    setLineWidth(w) { log.push({ n: 'width', w }); }
    setLineDashPattern(d, p) { log.push({ n: 'dash', d }); }
    line(...a) { log.push({ n: 'line', a }); }
    output(t) { log.push({ n: 'output', t }); return { fake: 'blob' }; }
  }
  const canvases = [];
  const shots = [];
  const createCanvas = (w, h) => {
    const id = canvases.length;
    const ops = [];
    const ctx = new Proxy({}, {
      get: (_, p) => p === 'measureText' ? (s) => ({ width: String(s).length * 10 })
        : (...a) => { if (p === 'clearRect') ops.length = 0; ops.push({ n: p, a }); },
      set: () => true,
    });
    const c = { id, width: w, height: h, ops, getContext: () => ctx, toDataURL: (t, q) => { shots.push({ canvas: c, ops: [...ops] }); return `data:${id}:${shots.length - 1}:${t}:${q}`; } };
    canvases.push(c);
    return c;
  };
  const shot = (url) => shots[Number(url.split(':')[2])];
  return { log, FakePdf, createCanvas, canvases, shots, shot, loadImage: async () => ({ width: 10, height: 10 }) };
}

test('ensureFonts called before first render', async () => {
  const s = setup();
  const order = [];
  const cc = (w, h) => { order.push('canvas'); return s.createCanvas(w, h); };
  await buildPagesPdf(createEmptyZine('a'), {
    jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: cc,
    ensureFonts: async () => { order.push('fonts'); },
  });
  assert.equal(order[0], 'fonts');
  assert.ok(order.includes('canvas'));
});

test('ensureFonts loads fonts and waits ready', async () => {
  const loads = []; let ready = false;
  await ensureFonts({ fonts: { load: async (f, t) => { loads.push(f + '|' + t); }, get ready() { ready = true; return Promise.resolve(); } } });
  assert.deepEqual(loads, ['40px "Nanum Pen Script"|가나다진', '700 40px Pretendard|가나다진', '900 40px Pretendard|가나다진']);
  assert.ok(ready);
});

test('pages pdf has 8 pages of 105x148', async () => {
  const s = setup();
  const prog = [];
  const r = await buildPagesPdf(createEmptyZine('a'), {
    jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {},
    onProgress: (d, t) => prog.push([d, t]),
  });
  const imgs = s.log.filter((l) => l.n === 'addImage');
  assert.equal(imgs.length, 8);
  assert.equal(s.log.filter((l) => l.n === 'addPage').length, 7);
  assert.deepEqual(s.log[0].o, { orientation: 'portrait', unit: 'mm', format: [105, 148] });
  assert.deepEqual(imgs[0].a.slice(1), ['JPEG', 0, 0, 105, 148]);
  assert.ok(imgs[0].a[0].endsWith(':image/jpeg:0.92'));
  assert.equal(s.canvases.length, 1);
  assert.equal(s.canvases[0].width, 0); // released after build
  assert.deepEqual(r.blob, { fake: 'blob' });
  assert.deepEqual(r.failed, []);
  assert.deepEqual(prog[7], [8, 8]);
});

test('a3 pdf places page 1 at x=315,y=148.5', async () => {
  const s = setup();
  await buildA3Pdf([createEmptyZine('a')], { jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  const imgs = s.log.filter((l) => l.n === 'addImage');
  assert.equal(imgs.length, 8);
  // slot order follows IMPOSITION: index 7 is page 1
  assert.deepEqual(imgs[7].a.slice(2), [315, 148.5, 105, 148.5]);
  // page 1 panel is canvas 11 (4 rotated slots use 2 canvases each), unrotated -> its own data url
  const p1 = s.shot(imgs[7].a[0]);
  assert.ok(!p1.ops.some((o) => o.n === 'rotate'));
  assert.ok(p1.ops.some((o) => o.n === 'rect' || o.n === 'fillRect')); // a rendered panel, not a rotated copy
  assert.deepEqual(s.log[0].o, { orientation: 'landscape', unit: 'mm', format: [420, 297] });
});

test('page 5 image rotated 180', async () => {
  const s = setup();
  await buildA3Pdf([createEmptyZine('a')], { jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  const imgs = s.log.filter((l) => l.n === 'addImage');
  assert.deepEqual(imgs[0].a.slice(2), [0, 0, 105, 148.5]);
  const rot = s.shot(imgs[0].a[0]);
  assert.equal(rot.canvas, s.canvases[1]); // the rotated scratch canvas, not the render canvas
  assert.deepEqual(rot.ops.find((o) => o.n === 'rotate').a, [Math.PI]);
  assert.deepEqual(rot.ops.find((o) => o.n === 'translate').a, [1240, 1754]);
  assert.equal(rot.ops.find((o) => o.n === 'drawImage').a[0], s.canvases[0]);
  // an unrotated page (page 6, slot index 4) is not rotated
  const p6 = s.shot(imgs[4].a[0]);
  assert.equal(p6.canvas, s.canvases[0]);
  assert.ok(!p6.ops.some((o) => o.n === 'rotate'));
});

test('a3 build of 3 zines allocates at most 2 canvases and releases them', async () => {
  const s = setup();
  await buildA3Pdf([createEmptyZine('a'), createEmptyZine('b'), createEmptyZine('c')], { jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  assert.ok(s.canvases.length <= 2);
  assert.ok(s.canvases.every((c) => c.width === 0 && c.height === 0));
});

test('a3 pdf one sheet per zine', async () => {
  const s = setup();
  await buildA3Pdf([createEmptyZine('a'), createEmptyZine('b'), createEmptyZine('c')], { jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  assert.equal(s.log.filter((l) => l.n === 'addPage').length, 2);
  assert.equal(s.log.filter((l) => l.n === 'addImage').length, 24);
});

test('guides draw fold lines (0.2mm #cccccc dashed) and cut line (0.3mm #e8473a)', async () => {
  const s = setup();
  await buildA3Pdf([createEmptyZine('a')], { jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  const lines = s.log.filter((l) => l.n === 'line');
  assert.equal(lines.length, 5);
  const i = s.log.findIndex((l) => l.n === 'line');
  assert.deepEqual(s.log.slice(i - 3, i).map((l) => l.n), ['color', 'width', 'dash']);
  assert.equal(s.log[i - 3].c, '#cccccc'); assert.equal(s.log[i - 2].w, 0.2);
  assert.deepEqual(lines[4].a, [105, 148.5, 315, 148.5]);
  const cutColor = s.log.slice(0, s.log.lastIndexOf(lines[4])).filter((l) => l.n === 'color').pop();
  assert.equal(cutColor.c, '#e8473a');
});

test('guides=false draws no lines', async () => {
  const s = setup();
  await buildA3Pdf([createEmptyZine('a')], { guides: false, jsPDF: s.FakePdf, loadImage: s.loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  assert.equal(s.log.filter((l) => l.n === 'line').length, 0);
});

test('failed photos are collected with page number and name', async () => {
  const s = setup();
  const z = addElement(createEmptyZine('민지'), 2, { type: 'photo', src: 'bad.jpg' });
  const loadImage = async () => { throw new Error('x'); };
  const r = await buildA3Pdf([z], { jsPDF: s.FakePdf, loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].pageNumber, 3);
  assert.equal(r.failed[0].name, '민지');
  const r2 = await buildPagesPdf(z, { jsPDF: s.FakePdf, loadImage, createCanvas: s.createCanvas, ensureFonts: async () => {} });
  assert.equal(r2.failed[0].pageNumber, 3);
});
