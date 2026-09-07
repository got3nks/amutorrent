const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// aMule parses the query as a boolean expression. Parentheses and double
// quotes are grammar, not text: its scanner defines keywordchar as [^ "()],
// so they can never have been indexed and cannot match anything. Left in an
// anchor they are read as structure, and the grammar has no production for a
// parenthesised group next to a string, so the daemon rejects the whole
// search. Verified against a live core: `Example Show (US) AND (S01E05)` comes
// back "syntax error / Undefined search expression error", while the same
// query with the parentheses removed is accepted. Every series with a country
// suffix was therefore unsearchable (#89).
const res = () => ({ status() { return this; }, set() { return this; }, send() { return this; } });

/** Handler wired to a stub core that records the query it is asked to search. */
function makeHandler() {
  const sent = [];
  const handler = new TorznabHandler();
  handler.setDependencies({
    getAmuleClient: () => ({
      startSearch: async (q) => { sent.push(q); return { started: true }; },
      getSearchProgress: async () => ({ complete: true }),
      getSearchResults: async () => ({ resultsLength: 0, totalLength: 0, results: [] })
    }),
    getAmuleManager: () => ({ withSearchLock: async (fn) => fn() })
  });
  handler.searchDelayMs = 0;
  handler.searchSettleMs = 0;
  return { handler, sent };
}

/** The anchor is everything before the format OR-group. */
const anchorOf = (query) => query.replace(/ AND \([^)]*\)$/, '');

describe('search-grammar characters are stripped', () => {
  it('removes parentheses and quotes, keeping the words', () => {
    const { handler } = makeHandler();
    assert.equal(handler.stripSearchSyntax('Example Show (US)'), 'Example Show US');
    assert.equal(handler.stripSearchSyntax('"Example" (UK)'), 'Example UK');
  });

  it('leaves the characters aMule accepts alone', () => {
    // Confirmed accepted by a live core: brackets, ampersands, colons, hyphens.
    const { handler } = makeHandler();
    const query = 'Example [2020] & Sons: The Return - Part 2';
    assert.equal(handler.stripSearchSyntax(query), query);
  });

  it('collapses the whitespace the removal leaves behind', () => {
    const { handler } = makeHandler();
    assert.equal(handler.stripSearchSyntax('Example ( US ) Show'), 'Example US Show');
  });

  it('handles empty and missing input', () => {
    const { handler } = makeHandler();
    assert.equal(handler.stripSearchSyntax(''), '');
    assert.equal(handler.stripSearchSyntax(undefined), undefined);
  });
});

describe('every search mode gets a parseable anchor', () => {
  const modes = [
    ['tvsearch with season', { t: 'tvsearch', q: 'Example Show (US)', season: '1', ep: '5' }],
    ['tvsearch without season', { t: 'tvsearch', q: 'Example Show (US)' }],
    ['movie', { t: 'movie', q: 'Example Film (Directors Cut)' }],
    ['search', { t: 'search', q: 'Example (2011) Thing' }],
    ['music', { t: 'music', q: 'Example Band (Live)' }],
    ['music by artist and album', { t: 'music', artist: 'Example (Band)', album: 'Greatest (Hits)' }]
  ];

  for (const [label, query] of modes) {
    it(`sends no stray grammar for ${label}`, async () => {
      const { handler, sent } = makeHandler();
      await handler.handleRequest({ query }, res());
      assert.ok(sent.length > 0, 'no search was issued');
      for (const q of sent) {
        assert.ok(!/[()"]/.test(anchorOf(q)), `anchor still carries grammar: ${q}`);
      }
    });
  }
});

describe('the anchor is never empty', () => {
  it('keeps a title that is only a year', () => {
    // stripYear would leave nothing, and "AND (...)" with no left operand is
    // its own syntax error: "Missing left operand for AND", also confirmed live.
    const { handler } = makeHandler();
    const { primaryQuery } = handler.buildTVSearchQueries('2012', '1', '5');
    assert.ok(!primaryQuery.trimStart().startsWith('AND'), primaryQuery);
    assert.ok(primaryQuery.startsWith('2012 AND'), primaryQuery);
  });

  it('still strips a year that is not the whole title', () => {
    const { handler } = makeHandler();
    const { normalizedQuery } = handler.buildTVSearchQueries('Example Show 2012', '1', '5');
    assert.equal(normalizedQuery, 'Example Show');
  });

  it('returns an empty feed rather than searching for nothing', async () => {
    // A query of only grammar characters sanitizes to empty and takes the
    // existing "no text query" path.
    const { handler, sent } = makeHandler();
    await handler.handleRequest({ query: { t: 'search', q: '()' } }, res());
    assert.equal(sent.length, 0, 'searched aMule with an empty query');
  });
});
