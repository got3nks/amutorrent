const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');

// An *arr sends the title as it holds it, accents and typographic punctuation
// included, and the two networks resolve that text by completely different
// rules (#93).
//
// Measured against a live public ED2K server, varying only the query while the
// files on the network kept one spelling:
//
//   plain ASCII word      153 results
//   same word, NFC accent 153 results   -> servers fold precomposed accents
//   same word, NFD accent   0 results   -> they do NOT fold decomposed ones
//   truncated prefix        0 results   -> no prefix matching on ED2K
//
// Kad is the opposite: aMule matches terms as substrings with no folding
// (Entry.cpp), and hashes words.front() to pick the node that answers.
const handler = () => { const h = new TorznabHandler(); h.stopCacheSweep(); return h; };
const cps = (s) => [...s].map(c => c.codePointAt(0).toString(16)).join(' ');

describe('query canonicalisation (both networks)', () => {
  it('normalises decomposed accents to NFC', () => {
    // NFD returns nothing at all on ED2K, so this is load-bearing.
    const nfd = 'café';                     // e + combining acute
    assert.equal(cps(handler().canonicaliseQuery(nfd)), '63 61 66 e9');
  });

  it('leaves an already-precomposed query alone', () => {
    assert.equal(handler().canonicaliseQuery('café'), 'café');
  });

  it('maps typographic apostrophes to ASCII', () => {
    // Server tokenizers split on ' but not on U+2019, so the curly form keeps
    // the whole thing as one token that matches nothing.
    assert.equal(handler().canonicaliseQuery('l’exemple'), "l'exemple");
    assert.equal(handler().canonicaliseQuery('l‘exemple'), "l'exemple");
  });

  it('passes plain text through untouched', () => {
    assert.equal(handler().canonicaliseQuery('Example Show'), 'Example Show');
  });
});

describe('Kad adaptation: stemming later words', () => {
  it('replaces an accented word with its longest plain run', () => {
    // A stem is strictly broader: any name containing the accented word
    // contains the stem, in NFC, NFD or mojibake alike.
    assert.equal(handler().adaptQueryForKad('Example Show impôts'), 'Example Show imp');
  });

  it('leaves a word alone when the stem would be under three characters', () => {
    // Dropping or folding it would lose matches we get today.
    assert.equal(handler().adaptQueryForKad('Example Noël'), 'Example Noël');
  });

  it('never stems the first word, which becomes the DHT key', () => {
    // A stem is nobody's published keyword, so it can never be the lookup key.
    assert.equal(handler().adaptQueryForKad('impôts Example'), 'Example imp');
  });

  it('leaves a query with no accents completely alone', () => {
    const q = 'Example Show AND (S01E05 OR 1x05 OR 01x05)';
    assert.equal(handler().adaptQueryForKad(q), q);
  });
});

describe('Kad adaptation: promoting the keyword', () => {
  it('promotes a plain word ahead of an accented first word', () => {
    assert.equal(handler().adaptQueryForKad('Élite Example'), 'Example lite');
  });

  it('picks the longest candidate, not merely the first', () => {
    // The key decides which node answers, and Kad returns a bounded set per
    // keyword, so a rarer word is worth more than a nearer one.
    assert.equal(handler().adaptQueryForKad('Élite Foo Longest'), 'Longest lite Foo');
  });

  it('refuses to promote a stop-word', () => {
    // Asking the node that indexes "the" would drown the wanted file.
    assert.equal(handler().adaptQueryForKad('Élite the'), 'Élite the');
  });

  it('refuses to promote a word under three bytes', () => {
    // aMule's GetWords discards those, so it could not become the key anyway.
    assert.equal(handler().adaptQueryForKad('Élite ab'), 'Élite ab');
  });

  it('leaves the format OR-group untouched when reordering', () => {
    assert.equal(
      handler().adaptQueryForKad('Élite Example AND (S01E05 OR 1x05)'),
      'Example lite AND (S01E05 OR 1x05)');
  });

  it('does not disturb a quoted anchor', () => {
    // _buildAnchoredQuery quotes a long base to reclaim operator budget.
    // Reordering its words would strand the quotes and produce an expression
    // aMule rejects, the same class of failure as the parentheses bug.
    const h = handler();
    const q = h._buildAnchoredQuery('Élite Example Show With A Very Long Title Here',
      ['S01E05', '1x05', '01x05']);
    assert.ok(q.startsWith('"'), q);
    assert.equal(h.adaptQueryForKad(q), q);
  });
});

describe('ED2K keeps the plain query', () => {
  it('is not stemmed or reordered', async () => {
    // Prefixes match nothing on ED2K and token order is meaningless there,
    // so only the shared canonicalisation applies.
    const h = handler();
    const sent = [];
    h.setDependencies({
      getAmuleClient: () => ({
        startSearch: async (q, net) => { sent.push([net, q]); return { started: true }; },
        getSearchProgress: async () => ({ complete: true }),
        getSearchResults: async () => ({ resultsLength: 0, totalLength: 0, results: [] })
      }),
      getAmuleManager: () => ({ withSearchLock: async (fn) => fn() })
    });
    h.searchDelayMs = 0;
    h.searchSettleMs = 0;

    const res = { status() { return this; }, set() { return this; }, send() { return this; } };
    await h.handleRequest({ query: { t: 'search', q: 'Example impôts' } }, res);

    const global = sent.find(([net]) => net === 'global');
    const kad = sent.find(([net]) => net === 'kad');
    assert.equal(global[1], 'Example impôts', 'ED2K query was altered');
    assert.equal(kad[1], 'Example imp', 'Kad query was not stemmed');
  });
});
