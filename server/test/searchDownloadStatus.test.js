const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { importStatic } = require('./helpers/importEsm');

// aMule reports whether the local core already knows a search result (#77).
// It arrives as `downloadStatus`, distinct from `status` because the same EC
// tag carries the unrelated partfile status for a download and their low
// values overlap.
describe('search result download-status badges', () => {
  let getSearchStatusBadge, S;

  before(async () => {
    ({ getSearchStatusBadge, SEARCH_DOWNLOAD_STATUS: S } =
      await importStatic('utils', 'searchDownloadStatus.js'));
  });

  it('renders nothing for a file the core does not know', () => {
    // The overwhelming majority of results — badging them would be noise.
    assert.equal(getSearchStatusBadge(S.NEW), null);
  });

  it('badges a downloaded or shared file green', () => {
    const badge = getSearchStatusBadge(S.DOWNLOADED);
    assert.equal(badge.label, 'Downloaded');
    assert.equal(badge.tone, 'green');
  });

  it('badges a queued file blue', () => {
    const badge = getSearchStatusBadge(S.QUEUED);
    assert.equal(badge.label, 'Queued');
    assert.equal(badge.tone, 'blue');
  });

  it('reads cancelled-but-downloading-again as Queued, not Cancelled', () => {
    // aMule sets QUEUEDCANCELED when a file is on the cancelled list AND in the
    // queue. It is downloading right now, so reporting it as cancelled would
    // claim the user abandoned something actively running.
    const badge = getSearchStatusBadge(S.QUEUEDCANCELED);
    assert.equal(badge.label, 'Queued');
    assert.equal(badge.tone, 'blue');
  });

  it('still mentions the cancellation in the tooltip', () => {
    assert.notEqual(getSearchStatusBadge(S.QUEUEDCANCELED).title, getSearchStatusBadge(S.QUEUED).title);
  });

  it('badges a cancelled file red', () => {
    const badge = getSearchStatusBadge(S.CANCELED);
    assert.equal(badge.label, 'Cancelled');
    assert.equal(badge.tone, 'red');
  });

  it('renders nothing for a missing or unrecognised status', () => {
    // The status table mirrors an enum from another repo on another release
    // cycle, so an unknown value must stay silent rather than be guessed at.
    assert.equal(getSearchStatusBadge(undefined), null);
    assert.equal(getSearchStatusBadge(null), null);
    assert.equal(getSearchStatusBadge(99), null);
  });
});
