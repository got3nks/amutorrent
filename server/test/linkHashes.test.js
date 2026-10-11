const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BaseClientManager = require('../lib/BaseClientManager');
const { convertEd2kToMagnet } = require('../lib/linkConverter');
const webSocketHandlers = require('../modules/webSocketHandlers');

const MD4 = '0123456789abcdef0123456789abcdef';

describe('hashFromLink (ownership)', () => {
  const m = new BaseClientManager();

  it('reads a hex magnet btih', () => {
    assert.equal(m.hashFromLink('magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01&dn=x'),
      'abcdef0123456789abcdef0123456789abcdef01');
  });

  it('reads a base32 magnet btih as hex', () => {
    // Used to be missed, so no owner was recorded for the download.
    assert.equal(m.hashFromLink('magnet:?xt=urn:btih:MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U&dn=x'),
      '6162636465666768696a6b6c6d6e6f7071727374');
  });

  it('reads an ed2k hash in any scheme case', () => {
    assert.equal(m.hashFromLink(`ED2K://|file|Sample.avi|1|${MD4.toUpperCase()}|/`), MD4);
  });

  it('returns null for anything else', () => {
    assert.equal(m.hashFromLink(null), null);
    assert.equal(m.hashFromLink('https://example.com/file'), null);
  });
});

describe('convertEd2kToMagnet', () => {
  it('reads a full link with the shared parser, in any scheme case', () => {
    const { magnetLink, ed2kHash } = convertEd2kToMagnet(`ED2K://|file|Sample%20File.avi|123|${MD4.toUpperCase()}|/`);
    assert.equal(ed2kHash, MD4);
    assert.equal(magnetLink, `magnet:?xt=urn:btih:${MD4}00000000&dn=Sample%20File.avi&xl=123`);
  });

  it('still takes a bare hash with name and size', () => {
    const { magnetLink } = convertEd2kToMagnet(MD4, 'Sample File.avi', 5);
    assert.equal(magnetLink, `magnet:?xt=urn:btih:${MD4}00000000&dn=Sample%20File.avi&xl=5`);
  });
});

describe('search with no serving instance', () => {
  it('clears the optimistic lock the browser took', async () => {
    // No lock is taken on the server, so no unlock broadcast would ever clear it.
    const sent = [];
    await webSocketHandlers.handleSearch(
      { query: 'sample', type: 'global', instanceId: 'amule-missing' },
      { send: (m) => sent.push(m), log() {}, error() {} }
    );
    assert.deepEqual(sent[0], { type: 'search-lock', locked: false, instanceId: 'amule-missing' });
    assert.equal(sent[1].type, 'error');
  });
});
