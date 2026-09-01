const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { convertToTorznabFeed } = require('../lib/torznab/search');
const { convertMagnetToEd2k } = require('../lib/linkConverter');

// One ed2k hash can be published under several filenames (#82). The feed emits
// one <item> per distinct name so an *arr can parse whichever title its parser
// prefers; every one of them grabs the same file.
const HASH = 'e3403c41b5140d71c61f3b4109233b2e';

const grouped = () => [{
  fileHash: HASH, fileName: 'Oppenheimer (2023) (Dual).mkv', fileSize: 100, sourceCount: 9,
  children: [
    // aMule can repeat the parent's own name among its children.
    { fileHash: HASH, fileName: 'Oppenheimer (2023) (Dual).mkv', fileSize: 100, sourceCount: 3 },
    { fileHash: HASH, fileName: 'Oppenheimer.2023.iTA.BDRip.AC3.x264-WRM.mkv', fileSize: 100, sourceCount: 5 },
    { fileHash: HASH, fileName: 'Oppenheimer.mkv', fileSize: 100, sourceCount: 1 }
  ]
}];

const parse = (xml) => {
  const items = xml.split('<item>').slice(1);
  return items.map(it => ({
    title: (it.match(/<title>([^<]*)<\/title>/) || [])[1],
    guid: (it.match(/<guid>([^<]*)<\/guid>/) || [])[1],
    url: ((it.match(/<enclosure url="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&')
  }));
};

describe('Torznab feed: alternate filenames', () => {
  it('emits one item per distinct name, deduping the repeated parent', () => {
    const items = parse(convertToTorznabFeed(grouped(), 'oppenheimer', '2000'));
    assert.equal(items.length, 3);
    assert.equal(items.filter(i => i.title === 'Oppenheimer (2023) (Dual).mkv').length, 1);
    assert.ok(items.some(i => i.title === 'Oppenheimer.2023.iTA.BDRip.AC3.x264-WRM.mkv'));
  });

  it('leaves a result without alternates as a single item', () => {
    const xml = convertToTorznabFeed([{ fileHash: HASH, fileName: 'One.mkv', fileSize: 1, sourceCount: 1 }], 'q', '');
    assert.equal(parse(xml).length, 1);
  });

  it('gives every item a unique guid', () => {
    const guids = parse(convertToTorznabFeed(grouped(), 'q', '')).map(i => i.guid);
    assert.equal(new Set(guids).size, guids.length);
  });

  it('keeps the bare hash as the first guid so existing *arr history still matches', () => {
    const items = parse(convertToTorznabFeed(grouped(), 'q', ''));
    assert.equal(items[0].guid, HASH);
    assert.ok(items.slice(1).every(i => i.guid.startsWith(`${HASH}-`)));
  });

  it('produces stable guids across identical searches', () => {
    const a = parse(convertToTorznabFeed(grouped(), 'q', '')).map(i => i.guid);
    const b = parse(convertToTorznabFeed(grouped(), 'q', '')).map(i => i.guid);
    assert.deepEqual(a, b);
  });
});

describe('Torznab feed: what an *arr actually grabs', () => {
  it('resolves every item back to the one real ed2k hash', () => {
    // The guid suffix must never reach the download path: grabs use the
    // enclosure URL, whose btih is the padded real hash.
    for (const item of parse(convertToTorznabFeed(grouped(), 'q', ''))) {
      const converted = convertMagnetToEd2k(item.url);
      assert.equal(converted.ed2kHash, HASH);
      assert.ok(converted.ed2kLink.includes(HASH));
      const suffix = item.guid.includes('-') ? item.guid.split('-')[1] : null;
      if (suffix) assert.ok(!item.url.includes(suffix), 'guid suffix leaked into the grab URL');
    }
  });

  it('advertises a distinct display name per item', () => {
    const dns = parse(convertToTorznabFeed(grouped(), 'q', ''))
      .map(i => decodeURIComponent((i.url.match(/dn=([^&]*)/) || [])[1] || ''));
    assert.equal(new Set(dns).size, 3);
  });
});
