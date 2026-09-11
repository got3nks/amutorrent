const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normaliseQueryForm, canonicaliseQuery, adaptQueryForKad } = require('../lib/searchQuery');
const { AmuleManager } = require('../modules/amuleManager');

// Two accented forms that render identically. Servers fold only the first.
const NFC = 'caf' + String.fromCharCode(0xe9);          // café
const NFD = 'caf' + String.fromCharCode(0x65, 0x301);   // cafe + combining acute

const cps = (s) => [...s].map(c => c.codePointAt(0).toString(16)).join(' ');

describe('normaliseQueryForm: the rewrite the user cannot see', () => {
  it('composes a decomposed accent', () => {
    // Measured on a stock Lugdunum 17.15: the NFD form returned 0 results
    // where the NFC form returned the full set.
    assert.equal(cps(normaliseQueryForm(NFD)), cps(NFC));
  });

  it('leaves an already-composed query alone', () => {
    assert.equal(normaliseQueryForm(NFC), NFC);
  });

  it('does not touch a typographic apostrophe', () => {
    // That rewrite changes a visible character, so it stays on the automated
    // path only.
    assert.equal(normaliseQueryForm('l’exemple'), 'l’exemple');
  });

  it('passes empty input straight through', () => {
    assert.equal(normaliseQueryForm(''), '');
    assert.equal(normaliseQueryForm(undefined), undefined);
  });
});

describe('canonicaliseQuery: the automated path takes both', () => {
  it('composes and folds the apostrophe in one pass', () => {
    assert.equal(canonicaliseQuery('l’' + NFD), "l'" + NFC);
  });
});

describe('adaptQueryForKad: promotion and stemming are separable', () => {
  it('promotes without stemming when stemming is off', () => {
    // Reordering cannot change what matches, only which node is asked.
    assert.equal(adaptQueryForKad('Élite Example', { stem: false }), 'Example Élite');
  });

  it('stems too when stemming is on', () => {
    assert.equal(adaptQueryForKad('Élite Example'), 'Example lite');
  });

  it('leaves a later accented word whole when stemming is off', () => {
    assert.equal(adaptQueryForKad('Example Show impôts', { stem: false }), 'Example Show impôts');
  });

  it('returns a plain-keyed query untouched either way', () => {
    assert.equal(adaptQueryForKad('Example Show', { stem: false }), 'Example Show');
  });
});

// The UI path: what the user typed is what gets sent, bar the invisible parts.
function makeManager() {
  const manager = new AmuleManager({
    id: 'amule-test', name: 'test', host: '127.0.0.1', port: 4712, password: 'x'
  });
  const sent = [];
  manager.broadcast = () => {};
  manager.client = {
    searchAndWaitResults: async (query) => { sent.push(query); return { results: [], resultsLength: 0 }; }
  };
  return { manager, sent };
}

describe('user-initiated search: only the invisible rewrites apply', () => {
  it('composes a decomposed accent before sending', async () => {
    const { manager, sent } = makeManager();
    await manager.search('Example ' + NFD, 'global', null);
    assert.equal(sent[0], 'Example ' + NFC);
  });

  it('sends a typographic apostrophe as typed', async () => {
    const { manager, sent } = makeManager();
    await manager.search('l’exemple', 'global', null);
    assert.equal(sent[0], 'l’exemple');
  });

  it('promotes the Kad keyword but never stems', async () => {
    const { manager, sent } = makeManager();
    await manager.search('Élite Example', 'kad', null);
    assert.equal(sent[0], 'Example Élite');
  });

  it('does not reorder an ed2k query: the server intersects tokens anyway', async () => {
    const { manager, sent } = makeManager();
    await manager.search('Élite Example', 'global', null);
    assert.equal(sent[0], 'Élite Example');
  });
});
