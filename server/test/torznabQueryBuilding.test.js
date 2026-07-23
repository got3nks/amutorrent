const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

describe('_capQueryWords (issue #73)', () => {
  const handler = new TorznabHandler();

  it('returns query unchanged when under the limit', () => {
    const q = 'The Shield';
    assert.equal(handler._capQueryWords(q, 0), q);
  });

  it('returns query unchanged at exactly the limit (11 words, 0 reserved)', () => {
    const q = 'one two three four five six seven eight nine ten eleven';
    assert.equal(handler._capQueryWords(q, 0), q);
  });

  it('truncates from the right when over the limit', () => {
    const q = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    assert.equal(
      handler._capQueryWords(q, 0),
      'one two three four five six seven eight nine ten eleven'
    );
  });

  it('reserves N words for an appended format token', () => {
    // 11 real words + reserve 1 for a format suffix → keep 10 words
    const q = 'series name with many extra descriptive words in title here';
    assert.equal(
      handler._capQueryWords(q, 1).split(/\s+/).length,
      10
    );
  });

  it('collapses multiple spaces without inflating the word count', () => {
    const q = 'The    Shield    Season   1';   // 4 real words, extra spaces
    assert.equal(handler._capQueryWords(q, 0).split(/\s+/).filter(Boolean).length, 4);
  });

  it('handles null / empty input without throwing', () => {
    assert.equal(handler._capQueryWords(''), '');
    assert.equal(handler._capQueryWords(null), null);
    assert.equal(handler._capQueryWords(undefined), undefined);
  });
});

describe('buildTVSearchQueries (issue #73)', () => {
  const handler = new TorznabHandler();

  it('emits SxxExx, 1x01, AND absolute-style variants when ep is set', () => {
    const { primaryQueries } = handler.buildTVSearchQueries('The Shield', '1', '5');
    assert.deepEqual(primaryQueries, [
      'The Shield 1x05',
      'The Shield S01E05',
      'The Shield 05'   // absolute-style — new in this fix
    ]);
  });

  it('emits SxxE and 1x variants when only season is set', () => {
    const { primaryQueries } = handler.buildTVSearchQueries('The Shield', '2', undefined);
    assert.deepEqual(primaryQueries, [
      'The Shield 2x',
      'The Shield S02'
    ]);
  });

  it('provides a fallbackQuery equal to the bare series name', () => {
    const { fallbackQuery } = handler.buildTVSearchQueries('The Shield', '1', '5');
    assert.equal(fallbackQuery, 'The Shield');
  });

  it('caps a long series name and reserves room for the format token', () => {
    const longName = 'this is a really long series name with way too many descriptive words for aMule';
    const { primaryQueries, fallbackQuery } = handler.buildTVSearchQueries(longName, '1', '5');
    // Every primary should be ≤ 11 whitespace-separated tokens
    for (const q of primaryQueries) {
      const wordCount = q.split(/\s+/).length;
      assert.ok(wordCount <= 11, `variant "${q}" has ${wordCount} words, expected ≤ 11`);
    }
    // The fallback (bare capped series name) should be ≤ 10 words (reserve was 1)
    assert.ok(fallbackQuery.split(/\s+/).length <= 10);
  });

  it('strips year from the query before capping and building variants', () => {
    const { primaryQueries } = handler.buildTVSearchQueries('The Shield 2002', '1', '5');
    assert.deepEqual(primaryQueries, [
      'The Shield 1x05',
      'The Shield S01E05',
      'The Shield 05'
    ]);
  });

  it('season/ep numbers are treated as integers (not string concat)', () => {
    const { primaryQueries } = handler.buildTVSearchQueries('X', '01', '05');
    assert.ok(primaryQueries.includes('X 1x05'));
    assert.ok(primaryQueries.includes('X S01E05'));
  });
});
