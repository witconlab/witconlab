// "큰 글씨" mode: bigger UI chrome (buttons, labels, sheets) for older learners. Pages themselves never change.
// On by default; only an explicit '0' turns it off. Each page's <head> has a tiny inline copy of isBigOn so the
// first paint is already big; this module wires the toggle buttons ([data-bigtext]).
export const BIG_KEY = 'webzine.bigText';

export function isBigOn(storage) {
  try { return storage.getItem(BIG_KEY) !== '0'; } catch { return true; }
}

export function setBig(on, { storage = globalThis.localStorage, root = document.documentElement } = {}) {
  try { storage.setItem(BIG_KEY, on ? '1' : '0'); } catch { /* private mode: still switch for this page */ }
  if (on) root.dataset.big = '1'; else delete root.dataset.big;
}

function sync(btn, on) {
  btn.setAttribute('aria-pressed', String(on));
  const st = btn.querySelector('.bigtext-state');
  if (st) st.textContent = on ? '켜짐' : '꺼짐';
}

export function wireBigTextToggles(doc = document) {
  const btns = [...doc.querySelectorAll('[data-bigtext]')];
  const on = () => doc.documentElement.dataset.big === '1';
  btns.forEach((b) => {
    sync(b, on());
    b.addEventListener('click', () => {
      setBig(!on(), { root: doc.documentElement });
      btns.forEach((x) => sync(x, on()));
      // layouts that size themselves from the window (viewer book) re-measure
      doc.defaultView?.dispatchEvent(new Event('resize'));
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => wireBigTextToggles());
  else wireBigTextToggles();
}
