/**
 * A mutex that grants waiters strictly in arrival order.
 *
 * Release hands the lock straight to the next waiter, so it is never free
 * while anyone is queued and a newcomer cannot slip in ahead. A waiter can
 * leave the queue by timing out or through an AbortSignal.
 */

function abortError(message = 'Aborted') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

class FifoLock {
  constructor() {
    this.held = false;
    this.waiters = [];
  }

  /** Requests holding or waiting for the lock. */
  get pending() {
    return (this.held ? 1 : 0) + this.waiters.length;
  }

  /**
   * Take the lock, waiting in line if it is held.
   * @param {Object} [opts]
   * @param {number} [opts.timeoutMs] - Give up after this long (0 = never)
   * @param {AbortSignal} [opts.signal] - Leave the queue when aborted
   * @returns {Promise<void>}
   * @throws {Error} AbortError when aborted, code LOCK_TIMEOUT on timeout
   */
  acquire({ timeoutMs = 0, signal } = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (!this.held) {
      this.held = true;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const waiter = { settled: false };
      const leave = (err) => {
        if (waiter.settled) return;
        waiter.settled = true;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        cleanup();
        reject(err);
      };
      const onAbort = () => leave(abortError());
      const timer = timeoutMs > 0
        ? setTimeout(() => leave(Object.assign(new Error('Timed out waiting for the lock'), { code: 'LOCK_TIMEOUT' })), timeoutMs)
        : null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      waiter.grant = () => {
        waiter.settled = true;
        cleanup();
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  release() {
    const next = this.waiters.shift();
    if (next) {
      next.grant();   // handed over: stays held
    } else {
      this.held = false;
    }
  }
}

/** Sleep that ends early, with an AbortError, when the signal fires. */
function abortableSleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

module.exports = { FifoLock, abortableSleep, abortError };
