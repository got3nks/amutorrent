const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveCategoryForAdd } = require('../lib/qbittorrent/addParams');

const categories = [
  { id: 1, title: 'books', path: '/incoming/books' },
  { id: 2, title: 'magazines', path: '/incoming/magazines' }
];

describe('resolveCategoryForAdd', () => {
  it('maps category name to aMule category id', () => {
    const result = resolveCategoryForAdd({ category: 'books' }, categories);
    assert.equal(result.categoryId, 1);
    assert.deepEqual(result.warnings, []);
  });

  it('falls back to label when category is absent', () => {
    const result = resolveCategoryForAdd({ label: 'magazines' }, categories);
    assert.equal(result.categoryId, 2);
  });

  it('warns when category name is unknown', () => {
    const result = resolveCategoryForAdd({ category: 'missing' }, categories);
    assert.equal(result.categoryId, 0);
    assert.match(result.warnings[0], /not found/);
  });

  it('maps savepath to category when no category is provided', () => {
    const result = resolveCategoryForAdd({ savepath: '/incoming/books' }, categories);
    assert.equal(result.categoryId, 1);
    assert.deepEqual(result.warnings, []);
  });

  it('normalizes savepath separators before lookup', () => {
    const result = resolveCategoryForAdd({ savepath: '\\\\incoming\\\\magazines\\\\' }, categories);
    assert.equal(result.categoryId, 2);
  });

  it('warns when savepath has no matching category', () => {
    const result = resolveCategoryForAdd({ savepath: '/tmp/nowhere' }, categories);
    assert.equal(result.categoryId, 0);
    assert.match(result.warnings[0], /no matching aMule category/);
  });

  it('warns when savepath conflicts with named category path', () => {
    const result = resolveCategoryForAdd(
      { category: 'books', savepath: '/other/path' },
      categories
    );
    assert.equal(result.categoryId, 1);
    assert.match(result.warnings[0], /savepath .* ignored/);
  });
});
