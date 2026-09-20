const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  convertToQBittorrentInfo,
  convertToQBittorrentProperties,
  convertToQBittorrentFiles
} = require('../lib/qbittorrent/stateMapping');

const sampleInfo = {
  save_path: '/incoming/books',
  added_on: 1700000000,
  comment: '',
  uploaded: 0,
  uploaded_session: 0,
  downloaded: 500,
  downloaded_session: 500,
  up_limit: 0,
  dl_limit: 0,
  time_active: 42,
  seeding_time: 0,
  ratio: 0,
  completion_on: -1,
  dlspeed: 1024,
  eta: 3600,
  seen_complete: -1,
  num_leechs: 0,
  num_incomplete: 0,
  reannounce: 0,
  num_seeds: 2,
  num_complete: 2,
  total_size: 1000,
  size: 1000,
  upspeed: 0,
  private: false,
  name: 'Author - Book.epub',
  progress: 0.5,
  priority: 1,
  availability: 0
};

describe('convertToQBittorrentProperties', () => {
  it('maps core fields from torrent info', () => {
    const props = convertToQBittorrentProperties(sampleInfo);
    assert.equal(props.save_path, '/incoming/books');
    assert.equal(props.addition_date, 1700000000);
    assert.equal(props.total_size, 1000);
    assert.equal(props.isPrivate, false);
  });
});

describe('convertToQBittorrentFiles', () => {
  it('returns a single-file entry for active downloads', () => {
    const files = convertToQBittorrentFiles(sampleInfo);
    assert.equal(files.length, 1);
    assert.equal(files[0].index, 0);
    assert.equal(files[0].name, 'Author - Book.epub');
    assert.equal(files[0].size, 1000);
    assert.equal(files[0].progress, 0.5);
    assert.equal(files[0].is_seed, false);
  });

  it('marks completed downloads as seeding file', () => {
    const files = convertToQBittorrentFiles({ ...sampleInfo, progress: 1.0 });
    assert.equal(files[0].is_seed, true);
    assert.equal(files[0].progress, 1.0);
  });
});

describe('convertToQBittorrentInfo numeric type contract (issue #72)', () => {
  // Real qBittorrent returns numbers for all byte/speed/ratio fields. Strict
  // consumers (Medusa's Python `downloaded / size` arithmetic; typed Go/Rust
  // unmarshalers) crash on strings. Verify the boundary always emits numbers
  // regardless of upstream representation.
  const NUMERIC_FIELDS = [
    'size', 'total_size', 'amount_left',
    'downloaded', 'completed', 'downloaded_session',
    'uploaded', 'uploaded_session',
    'dlspeed', 'upspeed',
    'progress', 'ratio', 'eta',
    'added_on', 'last_activity', 'completion_on'
  ];

  const assertNumeric = (info) => {
    for (const field of NUMERIC_FIELDS) {
      assert.equal(
        typeof info[field],
        'number',
        `${field} should be number, got ${typeof info[field]} (${JSON.stringify(info[field])})`
      );
    }
  };

  it('returns numbers when input fields are numbers (typical unified item)', () => {
    const info = convertToQBittorrentInfo({
      fileName: 'test.epub',
      fileHash: 'a'.repeat(32),
      fileSize: 109519263,
      fileSizeDownloaded: 74022697,
      speed: 1024,
      uploadSpeed: 512,
      uploadTotal: 4096,
      ratio: 0.12,
      sourceCount: 3
    });
    assertNumeric(info);
    assert.equal(info.size, 109519263);
    assert.equal(info.downloaded, 74022697);
    assert.equal(info.amount_left, 109519263 - 74022697);
  });

  it('coerces strings to numbers at the output boundary', () => {
    // Simulates the pre-fix bug: earlier _mapUnifiedItemToDownload
    // String()-cast fileSize/fileSizeDownloaded, which then leaked into
    // the JSON output (Medusa saw `"size": "109519263"` and crashed).
    const info = convertToQBittorrentInfo({
      fileName: 'test.epub',
      fileHash: 'a'.repeat(32),
      fileSize: '109519263',
      fileSizeDownloaded: '74022697',
      speed: '1024',
      uploadSpeed: '512',
      uploadTotal: '4096',
      ratio: '0.12',
      sourceCount: 3
    });
    assertNumeric(info);
    assert.equal(info.size, 109519263);
    assert.equal(info.downloaded, 74022697);
    assert.equal(info.uploaded, 4096);
    assert.equal(info.dlspeed, 1024);
    assert.equal(info.upspeed, 512);
    assert.equal(info.ratio, 0.12);
  });

  it('produces valid numbers (not NaN) for empty/missing input', () => {
    const info = convertToQBittorrentInfo({});
    assertNumeric(info);
    assert.equal(info.size, 0);
    assert.equal(info.downloaded, 0);
    assert.equal(info.progress, 0);
    assert.ok(!Number.isNaN(info.amount_left));
    assert.ok(!Number.isNaN(info.progress));
  });
});
