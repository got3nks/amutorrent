const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
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
