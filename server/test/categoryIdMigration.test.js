const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CategoryManager } = require('../lib/CategoryManager');

// Per-instance client category ids used to be saved as `amuleIds`, though
// Rucio stores its ids there too.

async function withCategoriesFile(json, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cat-ids-'));
  const file = path.join(dir, 'categories.json');
  await fs.writeFile(file, JSON.stringify(json));
  const m = new CategoryManager();
  m.log = m.warn = m.error = () => {};
  m.filePath = file;
  try { await fn(m, file); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

describe('client category ids', () => {
  it('reads the old amuleIds key and saves it as clientCategoryIds', async () => {
    await withCategoriesFile({ categories: { Movies: { color: '#ff0000', amuleIds: { 'amule-a': 3, 'rucio-b': 7 } } } }, async (m, file) => {
      await m.load();
      assert.deepEqual(m.getByName('Movies').clientCategoryIds, { 'amule-a': 3, 'rucio-b': 7 });
      assert.equal(m.getCategoryNameByClientCategoryId('rucio-b', 7), 'Movies');
      await m.save();
      const saved = JSON.parse(await fs.readFile(file, 'utf8')).categories.Movies;
      assert.deepEqual(saved.clientCategoryIds, { 'amule-a': 3, 'rucio-b': 7 });
      assert.equal('amuleIds' in saved, false);
    });
  });

  it('still drops a legacy single amuleId', async () => {
    await withCategoriesFile({ categories: { Movies: { amuleId: 3 } } }, async (m) => {
      await m.load();
      assert.deepEqual(m.getByName('Movies').clientCategoryIds, {});
    });
  });
});
