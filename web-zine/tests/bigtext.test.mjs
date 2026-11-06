import test from 'node:test';
import assert from 'node:assert/strict';
import { isBigOn, setBig, BIG_KEY } from '../js/bigtext.js';

const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('big text is on unless explicitly turned off', () => {
  assert.equal(isBigOn(store()), true);
  assert.equal(isBigOn(store({ [BIG_KEY]: '1' })), true);
  assert.equal(isBigOn(store({ [BIG_KEY]: '0' })), false);
  assert.equal(isBigOn({ getItem() { throw new Error('blocked'); } }), true);
});

test('setBig stores the choice and flags the root element', () => {
  const s = store(); const root = { dataset: {} };
  setBig(false, { storage: s, root });
  assert.equal(s.getItem(BIG_KEY), '0'); assert.equal(root.dataset.big, undefined);
  setBig(true, { storage: s, root });
  assert.equal(s.getItem(BIG_KEY), '1'); assert.equal(root.dataset.big, '1');
});
