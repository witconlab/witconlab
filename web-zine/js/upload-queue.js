// Photo upload queue: one at a time, retry with backoff, reject when exhausted.
const BACKOFF = [2000, 5000, 10000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createUploadQueue({ upload, retries = 3, wait = sleep } = {}) {
  let count = 0;
  let tail = Promise.resolve();
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn(count));

  async function attempt(blob) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try {
        return await upload(blob);
      } catch (e) {
        lastErr = e;
        if (i < retries) await wait(BACKOFF[Math.min(i, BACKOFF.length - 1)]);
      }
    }
    throw lastErr;
  }

  return {
    add(blob) {
      count++;
      emit();
      const job = tail.then(() => attempt(blob));
      tail = job.catch(() => {});
      return job.finally(() => { count--; emit(); });
    },
    pending: () => count,
    onChange(fn) { listeners.push(fn); },
  };
}
