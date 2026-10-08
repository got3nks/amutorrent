const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const QBittorrentHandler = require('../lib/qbittorrent/QBittorrentHandler');

function makeHandler(createResult) {
  const categories = [{ id: 0, title: 'all', path: '/downloads/incoming' }];
  const client = {
    createCategory: async (title, path) => {
      if (createResult.success) categories.push({ id: categories.length, title, path });
      return createResult;
    },
    getCategories: async () => [...categories]
  };
  const handler = new QBittorrentHandler();
  handler.getAmuleClient = () => client;
  handler.categoryCacheInitialized = true;
  return handler;
}

async function createCategory(handler) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler.createCategory({ body: { category: 'Movies', savePath: '/downloads/movies' } }, res);
  return res;
}

describe('qBittorrent createCategory', () => {
  it('answers Ok on a clean create, where aMule sends no id', async () => {
    const handler = makeHandler({ success: true, categoryId: null, applied: 'full' });
    const res = await createCategory(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, 'Ok.');
    assert.ok(handler.categoriesCache.some(cat => cat.title === 'Movies'), 'cache refreshed');
  });

  it('answers Ok when aMule keeps another folder', async () => {
    const handler = makeHandler({
      success: true, categoryId: 1, applied: 'partial', reason: 'path_rejected', keptPath: '/downloads/incoming'
    });
    const res = await createCategory(handler);
    assert.equal(res.body, 'Ok.');
  });

  it('fails when aMule does not create it', async () => {
    const handler = makeHandler({ success: false, categoryId: null, applied: 'none' });
    const res = await createCategory(handler);
    assert.equal(res.statusCode, 500);
  });
});
