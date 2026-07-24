const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

describe('_capQueryWords (issue #73)', () => {
  const handler = new TorznabHandler();

  it('returns query unchanged when under the limit', () => {
    const q = 'Show Alpha';
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
    const q = 'Show    Alpha    Season   1';   // 4 real words, extra spaces
    assert.equal(handler._capQueryWords(q, 0).split(/\s+/).filter(Boolean).length, 4);
  });

  it('handles null / empty input without throwing', () => {
    assert.equal(handler._capQueryWords(''), '');
    assert.equal(handler._capQueryWords(null), null);
    assert.equal(handler._capQueryWords(undefined), undefined);
  });
});

describe('_buildAnchoredQuery (issue #75)', () => {
  const handler = new TorznabHandler();

  it('joins base + single alternative with an explicit AND', () => {
    assert.equal(
      handler._buildAnchoredQuery('Show Alpha', ['S01E05']),
      'Show Alpha AND S01E05'
    );
  });

  it('groups multiple alternatives inside a parenthesized OR', () => {
    assert.equal(
      handler._buildAnchoredQuery('Show Alpha', ['S01E05', '1x05', '05']),
      'Show Alpha AND (S01E05 OR 1x05 OR 05)'
    );
  });

  it('returns the bare base when there are no alternatives (fallback shape)', () => {
    assert.equal(handler._buildAnchoredQuery('Show Alpha', []), 'Show Alpha');
  });

  it('leaves a punctuation-heavy base unquoted — hyphens are free per Scanner.l', () => {
    // "Show Foo-Bar" is 2 whitespace tokens (show, Foo-Bar). Punctuation is
    // NOT a client-side separator; hyphens/dots stay inside one token.
    // With 3 OR alternatives: base=2, K=3, operators = 2 + 3 - 1 = 4 ≤ 10.
    assert.equal(
      handler._buildAnchoredQuery('Show Foo-Bar', ['S11E08', '11x08', '08']),
      'Show Foo-Bar AND (S11E08 OR 11x08 OR 08)'
    );
  });

  it('quotes the base only when the operator budget would overflow', () => {
    // 9 whitespace tokens + 3 alternatives → operators = 9 + 3 - 1 = 11 > 10.
    // Quoting collapses base to 1 token → operators = 1 + 3 - 1 = 3 ≤ 10.
    const longBase = 'A B C D E F G H I';
    const q = handler._buildAnchoredQuery(longBase, ['x1', 'x2', 'x3']);
    assert.equal(q, '"A B C D E F G H I" AND (x1 OR x2 OR x3)');
  });

  it('does not quote at the operator boundary (base fits exactly)', () => {
    // 8 whitespace tokens + 3 alternatives → operators = 8 + 3 - 1 = 10 = cap.
    const base = 'A B C D E F G H';
    const q = handler._buildAnchoredQuery(base, ['x1', 'x2', 'x3']);
    assert.equal(q, 'A B C D E F G H AND (x1 OR x2 OR x3)');
  });

  it('strips embedded double-quotes when it decides to quote the base', () => {
    const q = handler._buildAnchoredQuery(
      'A "quoted" B C D E F G H I J K L',   // 13 tokens, forces quoting
      ['x1', 'x2', 'x3']
    );
    assert.match(q, /^"A quoted B C D E F G H I J K L" AND/);
    assert.doesNotMatch(q, /""/);  // no literal empty-quote artifacts
  });

  it('trims incoming whitespace so token counts are accurate', () => {
    const q = handler._buildAnchoredQuery('  Show Alpha  ', ['S01E05']);
    assert.equal(q, 'Show Alpha AND S01E05');
  });
});

describe('getCacheKey (case + whitespace normalization)', () => {
  const handler = new TorznabHandler();

  it('collapses case variants of the same query to one cache key', () => {
    const a = handler.getCacheKey('tvsearch', 'foo bar baz', '3', '5');
    const b = handler.getCacheKey('tvsearch', 'Foo Bar Baz', '3', '5');
    const c = handler.getCacheKey('tvsearch', 'FOO BAR BAZ', '3', '5');
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it('collapses whitespace variants (leading, trailing, doubled)', () => {
    const a = handler.getCacheKey('tvsearch', 'Show Alpha', '1', '5');
    const b = handler.getCacheKey('tvsearch', '  Show   Alpha  ', '1', '5');
    assert.equal(a, b);
  });

  it('keeps distinct queries distinct', () => {
    const a = handler.getCacheKey('tvsearch', 'Show Alpha', '1', '5');
    const b = handler.getCacheKey('tvsearch', 'Show Beta', '1', '5');
    assert.notEqual(a, b);
  });

  it('keeps distinct t/season/ep distinct even with same q', () => {
    const a = handler.getCacheKey('tvsearch', 'Show Alpha', '1', '5');
    const b = handler.getCacheKey('tvsearch', 'Show Alpha', '2', '5');
    const c = handler.getCacheKey('search',   'Show Alpha', '1', '5');
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });
});

describe('buildTVSearchQueries (issue #75 refactor)', () => {
  const handler = new TorznabHandler();

  it('emits a single OR-grouped primary query for season+ep', () => {
    const { primaryQuery } = handler.buildTVSearchQueries('Show Alpha', '1', '5');
    assert.equal(primaryQuery, 'Show Alpha AND (S01E05 OR 1x05 OR 05)');
  });

  it('emits a single OR-grouped primary query for season only', () => {
    const { primaryQuery } = handler.buildTVSearchQueries('Show Alpha', '2', undefined);
    assert.equal(primaryQuery, 'Show Alpha AND (S02 OR 2x)');
  });

  it('fallbackQuery is the bare series name', () => {
    const { fallbackQuery } = handler.buildTVSearchQueries('Show Alpha', '1', '5');
    assert.equal(fallbackQuery, 'Show Alpha');
  });

  it('strips year before building the anchor', () => {
    const { primaryQuery, normalizedQuery } = handler.buildTVSearchQueries('Show Alpha 2002', '1', '5');
    assert.equal(primaryQuery, 'Show Alpha AND (S01E05 OR 1x05 OR 05)');
    assert.equal(normalizedQuery, 'Show Alpha');
  });

  it('season/ep numbers are treated as integers (not string concat)', () => {
    const { primaryQuery } = handler.buildTVSearchQueries('X', '01', '05');
    assert.equal(primaryQuery, 'X AND (S01E05 OR 1x05 OR 05)');
  });

  it('quotes a very long series name to preserve operator budget', () => {
    // 9 tokens + 3 alternatives → operators = 11 > 10 → quote
    const longName = 'This Is A Really Long Series Name Here Now';
    const { primaryQuery, fallbackQuery } = handler.buildTVSearchQueries(longName, '1', '5');
    assert.equal(primaryQuery, `"${longName}" AND (S01E05 OR 1x05 OR 05)`);
    assert.equal(fallbackQuery, longName);   // bare fallback: 0 alternatives, no operator pressure
  });
});
