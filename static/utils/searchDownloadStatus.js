/**
 * Search-result download status
 *
 * aMule reports, for every search result, whether the local core already knows
 * the file. It rides on EC_TAG_PARTFILE_STATUS and reaches us as
 * `downloadStatus` (amule-ec-node keeps it separate from `status`, which is the
 * unrelated partfile status a download carries under the same tag).
 *
 * The values mirror AmuleClient.SEARCH_DOWNLOAD_STATUS. They are re-declared
 * here rather than imported: the library deliberately ships the integer without
 * labels, because the enum lives in another repo on another release cycle, so a
 * value it does not yet cover stays visible instead of being silently named.
 */

/** CSearchFile::DownloadStatus */
export const SEARCH_DOWNLOAD_STATUS = Object.freeze({
  /** Not known to this core. */
  NEW: 0,
  /** Successfully downloaded, or shared. */
  DOWNLOADED: 1,
  /** In the download queue now. */
  QUEUED: 2,
  /** On the cancelled list and NOT queued. */
  CANCELED: 3,
  /** Cancelled once, but downloading again — queued. */
  QUEUEDCANCELED: 4
});

/**
 * Badge to show for a search result's download status.
 *
 * QUEUEDCANCELED reads as "Queued": aMule sets it when a file is on the
 * cancelled list AND in the queue, so it is downloading right now and the old
 * cancellation is a footnote rather than the headline. Reporting it as
 * cancelled would tell the user they abandoned something that is actively
 * running.
 *
 * @param {number} status - Value from SEARCH_DOWNLOAD_STATUS
 * @returns {{label: string, tone: string, title: string}|null} null for NEW,
 *   an unknown value, or a missing field — render nothing in those cases
 */
export const getSearchStatusBadge = (status) => {
  switch (status) {
    case SEARCH_DOWNLOAD_STATUS.DOWNLOADED:
      return { label: 'Downloaded', tone: 'green', title: 'Already downloaded or shared on this client' };
    case SEARCH_DOWNLOAD_STATUS.QUEUED:
      return { label: 'Queued', tone: 'blue', title: 'Already in the download queue' };
    case SEARCH_DOWNLOAD_STATUS.QUEUEDCANCELED:
      return { label: 'Queued', tone: 'blue', title: 'In the download queue (cancelled previously, downloading again)' };
    case SEARCH_DOWNLOAD_STATUS.CANCELED:
      // Not in the queue — aMule ranks the cancelled list above "known", so
      // this can also mean a file that was cancelled and later completed.
      return { label: 'Cancelled', tone: 'red', title: 'You cancelled this download previously' };
    default:
      return null;
  }
};
