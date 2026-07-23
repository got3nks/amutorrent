const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');

// Ephemeral res stub — captures status + type + body per call. Includes
// .json() because response.badRequest / response.serviceUnavailable use it.
function makeRes() {
  const state = { status: 200, contentType: null, body: null, sent: false };
  const res = {
    status(s) { state.status = s; return this; },
    type(t) { state.contentType = t; return this; },
    send(b) { state.body = b; state.sent = true; return this; },
    json(b) { state.body = b; state.sent = true; return this; },
    _state: state
  };
  return res;
}

function makeHandler({ categories = [], setCategoryImpl = null, connected = true } = {}) {
  const handler = new QBittorrentHandler();
  handler.categoriesCache = categories;
  handler.categoryCacheInitialized = true;   // skip the init wait
  handler.hashStore = { getEd2kHash: () => null };

  const calls = [];
  const manager = {
    isConnected: () => connected,
    setCategoryOrLabel: async (hash, opts) => {
      calls.push({ hash, ...opts });
      return setCategoryImpl ? setCategoryImpl(hash, opts) : { success: true };
    }
  };
  handler._getAmuleManager = () => manager;
  handler.waitForCategoryInit = async () => {};
  return { handler, calls };
}

describe('setCategory handler (issue #74)', () => {
  it('returns 400 when hashes parameter is missing', async () => {
    const { handler } = makeHandler({ categories: [{ title: 'books' }] });
    const res = makeRes();
    await handler.setCategory({ body: { category: 'books' } }, res);
    assert.equal(res._state.status, 400);
  });

  it('returns 400 when category parameter is missing entirely', async () => {
    const { handler } = makeHandler();
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'abc' } }, res);
    assert.equal(res._state.status, 400);
  });

  it('accepts empty category as no-op (qBit clear-category semantics)', async () => {
    const { handler, calls } = makeHandler();
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'abc', category: '' } }, res);
    assert.equal(res._state.status, 200);
    assert.equal(res._state.body, 'Ok.');
    assert.equal(calls.length, 0, 'aMule setCategoryOrLabel should not be called');
  });

  it('returns 409 text/plain when the category does not exist (matches qBit)', async () => {
    const { handler, calls } = makeHandler({ categories: [{ title: 'books' }] });
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'abc', category: 'movies' } }, res);
    assert.equal(res._state.status, 409);
    assert.equal(res._state.contentType, 'text/plain');
    assert.match(res._state.body, /does not exist/i);
    assert.equal(calls.length, 0);
  });

  it('applies category to a single hash', async () => {
    const { handler, calls } = makeHandler({ categories: [{ title: 'books' }] });
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'a1b2c3', category: 'books' } }, res);
    assert.equal(res._state.status, 200);
    assert.equal(res._state.body, 'Ok.');
    assert.deepEqual(calls, [{ hash: 'a1b2c3', categoryName: 'books' }]);
  });

  it('applies category to multiple hashes split on |', async () => {
    const { handler, calls } = makeHandler({ categories: [{ title: 'books' }] });
    const res = makeRes();
    await handler.setCategory(
      { body: { hashes: 'h1|h2|h3', category: 'books' } },
      res
    );
    assert.equal(res._state.status, 200);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(c => c.hash), ['h1', 'h2', 'h3']);
  });

  it('resolves BTIH → ED2K via the hashStore before dispatch', async () => {
    const { handler, calls } = makeHandler({ categories: [{ title: 'books' }] });
    handler.hashStore.getEd2kHash = (h) => h === 'btih1' ? 'ed2k1' : null;
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'btih1', category: 'books' } }, res);
    assert.deepEqual(calls, [{ hash: 'ed2k1', categoryName: 'books' }]);
  });

  it('returns 503 when aMule is not connected', async () => {
    const { handler } = makeHandler({ categories: [{ title: 'books' }], connected: false });
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'abc', category: 'books' } }, res);
    assert.equal(res._state.status, 503);
  });

  it('continues remaining hashes even if one fails, still returns 200', async () => {
    const { handler, calls } = makeHandler({
      categories: [{ title: 'books' }],
      setCategoryImpl: (hash) =>
        hash === 'bad' ? { success: false, error: 'aMule rejected' } : { success: true }
    });
    const res = makeRes();
    await handler.setCategory({ body: { hashes: 'ok1|bad|ok2', category: 'books' } }, res);
    assert.equal(res._state.status, 200);
    assert.equal(calls.length, 3);
  });
});
