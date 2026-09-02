const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TorznabHandler = require('../lib/torznab/TorznabHandler');
const { generateCapabilities } = require('../lib/torznab/capabilities');
const { convertToTorznabFeed } = require('../lib/torznab/search');

// Lidarr support (#80). Lidarr speaks the same Torznab aMuTorrent already
// serves for Sonarr and Radarr; what was missing was the Audio (3000) tree and
// the t=music mode, which Lidarr issues with artist/album rather than free text.
function makeRes() {
  const state = { status: 200, body: null, type: null };
  return {
    status(s) { state.status = s; return this; },
    set(k, v) { if (/content-type/i.test(k)) state.type = v; return this; },
    send(b) { state.body = b; return this; },
    _state: state
  };
}

/** Handler with no aMule attached, so searches short-circuit to an empty feed. */
function makeHandler() {
  const handler = new TorznabHandler();
  handler.getAmuleClient = () => null;
  return handler;
}

describe('Torznab capabilities: audio', () => {
  const xml = generateCapabilities();

  it('advertises audio-search with the params Lidarr sends', () => {
    assert.match(xml, /<audio-search[^>]*available="yes"/);
    assert.match(xml, /<audio-search[^>]*supportedParams="q,artist,album"/);
  });

  it('advertises the 3000 Audio tree, without which Prowlarr will not offer the indexer to Lidarr', () => {
    assert.match(xml, /id="3000"[^>]*name="Audio"/);
    for (const sub of ['3010', '3030', '3040']) {
      assert.ok(xml.includes(`id="${sub}"`), `missing subcategory ${sub}`);
    }
  });

  it('still advertises movies and TV', () => {
    assert.match(xml, /id="2000"/);
    assert.match(xml, /id="5000"/);
  });
});

describe('Torznab t=music', () => {
  it('is accepted rather than rejected as an invalid mode', async () => {
    const res = makeRes();
    await makeHandler().handleRequest({ query: { t: 'music', q: 'example artist example album' } }, res);
    assert.notEqual(res._state.status, 400);
  });

  it('still rejects a genuinely unknown mode', async () => {
    const res = makeRes();
    await makeHandler().handleRequest({ query: { t: 'nonsense', q: 'x' } }, res);
    assert.equal(res._state.status, 400);
  });

  it('treats artist and album as search parameters', async () => {
    // Lidarr commonly sends these with no `q` at all. Before this, the request
    // fell through the "no search params" branch and returned the sample result
    // used for indexer validation.
    const res = makeRes();
    await makeHandler().handleRequest(
      { query: { t: 'music', artist: 'Example Artist', album: 'Example Album' } }, res);
    assert.ok(!String(res._state.body).includes('Sample.Test.File.mkv'),
      'artist/album were not recognised as a real search');
  });

  it('combines artist and album into one query', async () => {
    // Either alone is too broad on ED2K: an artist name pulls their whole
    // discography plus unrelated files. Capture the query where it reaches
    // aMule, since the handler returns early when no client is attached.
    const handler = new TorznabHandler();
    const searched = [];
    // Mirror production wiring: the search runs under the manager's lock and
    // drives the poll loop itself, so both have to be injected.
    const client = {
      startSearch: async (query) => { searched.push(query); return { started: true }; },
      getSearchProgress: async () => ({ complete: true }),
      getSearchResults: async () => ({ resultsLength: 0, totalLength: 0, results: [] })
    };
    handler.getAmuleClient = () => client;
    handler.getAmuleManager = () => ({ withSearchLock: async (fn) => fn() });
    handler.searchSettleMs = 0;

    await handler.handleRequest(
      { query: { t: 'music', artist: 'Example Artist', album: 'Example Album' } }, makeRes());

    assert.ok(searched.length > 0, 'no search was issued');
    assert.ok(searched.some(q => /example artist/i.test(q) && /example album/i.test(q)),
      `query did not combine both: ${JSON.stringify(searched)}`);
  });
});

describe('Torznab feed: audio categories', () => {
  const result = [{
    fileHash: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4',
    fileName: 'Example.Artist - Example.Album.mp3', fileSize: 1024, sourceCount: 3
  }];
  const cats = (xml) => [...xml.matchAll(/name="category" value="([0-9]+)"/g)].map(m => m[1]);

  it('emits the requested audio category', () => {
    assert.deepEqual(cats(convertToTorznabFeed(result, 'q', '3000')), ['3000']);
  });

  it('adds the 3000 parent for an audio subcategory', () => {
    const out = cats(convertToTorznabFeed(result, 'q', '3040'));
    assert.ok(out.includes('3040') && out.includes('3000'));
  });

  it('does not leak audio categories into a movie request', () => {
    const out = cats(convertToTorznabFeed(result, 'q', '2040'));
    assert.ok(!out.some(c => c.startsWith('3')), `audio leaked: ${out.join(',')}`);
  });
});
