import test from 'node:test';
import assert from 'node:assert/strict';
import { post, ApiError } from '../js/api.js';

test('post: timeout aborts and is a code-less (network) error', async () => {
  const hang = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(post('x', {}, { fetchImpl: hang, timeoutMs: 20 }), (e) => !(e instanceof ApiError) && !e.code && e.message === 'timeout');
});

test('post: network failure is a code-less error', async () => {
  const down = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(post('x', {}, { fetchImpl: down }), (e) => !e.code);
});

test('post: non-JSON reply is SERVER_SETUP', async () => {
  const html = async () => ({ json: async () => { throw new SyntaxError('Unexpected token <'); } });
  await assert.rejects(post('x', {}, { fetchImpl: html }), (e) => e instanceof ApiError && e.code === 'SERVER_SETUP' && /선생님/.test(e.message));
});

test('post: JSON reply is returned, body is text/plain JSON', async () => {
  let seen;
  const ok = async (url, opts) => { seen = opts; return { json: async () => ({ ok: true, rev: 3 }) }; };
  assert.deepEqual(await post('u', { action: 'save' }, { fetchImpl: ok }), { ok: true, rev: 3 });
  assert.equal(seen.method, 'POST');
  assert.equal(seen.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(seen.body), { action: 'save' });
});
