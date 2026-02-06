/**
 * Field Formatters
 *
 * Shared formatting utilities for displaying aMule EC tag fields
 * Used by DownloadInfoModal, SharedFileInfoModal, etc.
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatBytes, formatSpeed } from './index.js';
import { AMULE_STATUS, RTORRENT_STATE_LABELS } from './constants.js';

const { createElement: h } = React;

/**
 * Format duration in seconds to readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatDuration = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

/**
 * Format priority value to readable string
 * @param {number} value - Priority value (0-12)
 * @returns {string} Formatted priority
 */
export const formatPriority = (value) => {
  switch (value) {
    case 0: return 'Low';
    case 1: return 'Normal';
    case 2: return 'High';
    case 10: return 'Auto (Low)';
    case 11: return 'Auto (Normal)';
    case 12: return 'Auto (High)';
    default: return `Unknown (${value})`;
  }
};

/**
 * Format download status value
 * @param {number} value - Status value
 * @returns {string} Formatted status
 */
export const formatStatus = (value) => {
  if (value === AMULE_STATUS.DOWNLOADING || value === AMULE_STATUS.DOWNLOADING_ACTIVE) return 'Downloading';
  else if (value === AMULE_STATUS.PAUSED) return 'Paused';
  return `Unknown status (${value})`;
};

/**
 * Custom labels for EC tag field names and rtorrent fields
 */
export const FIELD_LABELS = {
  // rtorrent fields (camelCase)
  'clientType': 'Client',
  'hash': 'Info Hash',
  'name': 'Name',
  'size': 'Size',
  'completedBytes': 'Downloaded',
  'progress': 'Progress',
  'downloadSpeed': 'Download Speed',
  'uploadSpeed': 'Upload Speed',
  'downloadTotal': 'Total Downloaded',
  'uploadTotal': 'Total Uploaded',
  'status': 'Status',
  'state': 'State',
  'isActive': 'Active',
  'isComplete': 'Complete',
  'isOpen': 'Open',
  'isHashing': 'Hashing',
  'ratio': 'Ratio',
  'label': 'Label',
  'directory': 'Directory',
  'basePath': 'Base Path',
  'addedTime': 'Added',
  'completedTime': 'Completed',
  'seedingTime': 'Seeding Time',
  'peers': 'Connected Peers',
  'peersTotal': 'Total Peers',
  'seeds': 'Connected Seeds',
  'seedsTotal': 'Total Seeds',
  'chunkSize': 'Chunk Size',
  'chunksCompleted': 'Chunks Completed',
  'chunksTotal': 'Total Chunks',
  'priority': 'Priority',
  'isPrivate': 'Private Torrent',
  'isMultiFile': 'Multi-File',
  'creationDate': 'Creation Date',
  'startedTime': 'Started',
  'finishedTime': 'Finished',
  // Known file (shared/upload) fields
  'EC_TAG_KNOWNFILE_REQ_COUNT': 'Requests (Session)',
  'EC_TAG_KNOWNFILE_REQ_COUNT_ALL': 'Requests (Total)',
  'EC_TAG_KNOWNFILE_ACCEPT_COUNT': 'Accepted Requests (Session)',
  'EC_TAG_KNOWNFILE_ACCEPT_COUNT_ALL': 'Accepted Requests (Total)',
  'EC_TAG_KNOWNFILE_XFERRED': 'Uploaded (Session)',
  'EC_TAG_KNOWNFILE_XFERRED_ALL': 'Uploaded (Total)',
  'EC_TAG_KNOWNFILE_AICH_MASTERHASH': 'AICH Master Hash',
  'EC_TAG_KNOWNFILE_PRIO': 'Upload Priority',
  'EC_TAG_KNOWNFILE_COMPLETE_SOURCES_LOW': 'Complete Sources (Low Estimate)',
  'EC_TAG_KNOWNFILE_COMPLETE_SOURCES_HIGH': 'Complete Sources (High Estimate)',
  'EC_TAG_KNOWNFILE_COMPLETE_SOURCES': 'Complete Sources',
  'EC_TAG_KNOWNFILE_ON_QUEUE': 'Clients in Queue',
  'EC_TAG_KNOWNFILE_FILENAME': 'File Path',
  'EC_TAG_KNOWNFILE_COMMENT': 'Comment',
  'EC_TAG_KNOWNFILE_RATING': 'Rating',
  // Part file (download) fields
  'EC_TAG_PARTFILE_NAME': 'File Name',
  'EC_TAG_PARTFILE_HASH': 'ED2K Hash',
  'EC_TAG_PARTFILE_SIZE_FULL': 'Total Size',
  'EC_TAG_PARTFILE_SIZE_XFER': 'Transferred (Raw)',
  'EC_TAG_PARTFILE_SIZE_DONE': 'Verified & Written',
  'EC_TAG_PARTFILE_STATUS': 'Download Status',
  'EC_TAG_PARTFILE_STOPPED': 'Stopped by User',
  'EC_TAG_PARTFILE_SOURCE_COUNT': 'Total Sources',
  'EC_TAG_PARTFILE_SOURCE_COUNT_NOT_CURRENT': 'Sources Not Connected',
  'EC_TAG_PARTFILE_SOURCE_COUNT_XFER': 'Sources Uploading',
  'EC_TAG_PARTFILE_SOURCE_COUNT_A4AF': 'A4AF Sources',
  'EC_TAG_PARTFILE_SPEED': 'Current Speed',
  'EC_TAG_PARTFILE_PRIO': 'Download Priority',
  'EC_TAG_PARTFILE_CAT': 'Category ID',
  'EC_TAG_PARTFILE_LAST_SEEN_COMP': 'Last Complete Source Seen',
  'EC_TAG_PARTFILE_LAST_RECV': 'Last Data Received',
  'EC_TAG_PARTFILE_DOWNLOAD_ACTIVE': 'Active Download Time',
  'EC_TAG_PARTFILE_AVAILABLE_PARTS': 'Available Parts',
  'EC_TAG_PARTFILE_HASHED_PART_COUNT': 'Verified Parts',
  'EC_TAG_PARTFILE_LOST_CORRUPTION': 'Lost to Corruption',
  'EC_TAG_PARTFILE_GAINED_COMPRESSION': 'Saved by Compression',
  'EC_TAG_PARTFILE_SAVED_ICH': 'Saved by ICH',
  'EC_TAG_PARTFILE_A4AFAUTO': 'Auto A4AF Swapping',
  'EC_TAG_PARTFILE_PARTMETID': 'Part.met ID',
  'EC_TAG_PARTFILE_SOURCE_NAMES': 'Source Reported Filename',
  'EC_TAG_PARTFILE_COMMENTS': 'File Comments'
};

/**
 * Format field name for display (convert EC_TAG or camelCase to readable label)
 * @param {string} key - Field key (EC_TAG_* or camelCase)
 * @returns {string} Human-readable label
 */
export const formatFieldName = (key) => {
  if (FIELD_LABELS[key]) {
    return FIELD_LABELS[key];
  }

  // Handle EC_TAG_ prefixed fields
  if (key.startsWith('EC_TAG_')) {
    return key
      .replace(/^EC_TAG_/, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Handle camelCase fields (rtorrent)
  return key
    .replace(/([A-Z])/g, ' $1')  // Insert space before capitals
    .replace(/^./, str => str.toUpperCase())  // Capitalize first letter
    .trim();
};

/**
 * Format field value based on type and content
 * @param {string} key - Field key
 * @param {any} value - Field value
 * @param {Object} options - Additional options (categories for category lookup)
 * @returns {React.Element|null} Formatted value element
 */
export const formatFieldValue = (key, value, options = {}) => {
  const { categories = [] } = options;

  if (value === undefined || value === null) {
    return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'N/A');
  }

  // Skip ED2K link field (rendered separately)
  if (key === 'EC_TAG_PARTFILE_ED2K_LINK') {
    return null;
  }

  // Skip rtorrent fields that are rendered separately or redundant
  if (key === 'peersDetailed' || key === 'trackersDetailed' || key === 'trackers') {
    return null;
  }

  // Skip message field (rendered separately in rtorrent section)
  if (key === 'message') {
    return null;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return h('pre', {
      className: 'text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto'
    }, JSON.stringify(value, null, 2));
  }

  // Handle nested objects (like SOURCE_NAMES and COMMENTS)
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Special handling for SOURCE_NAMES
    if (key === 'EC_TAG_PARTFILE_SOURCE_NAMES') {
      const innerData = value['EC_TAG_PARTFILE_SOURCE_NAMES'];
      let namesArray = [];
      if (Array.isArray(innerData)) {
        namesArray = innerData;
      } else if (innerData && typeof innerData === 'object') {
        namesArray = [innerData];
      }

      if (namesArray.length > 0) {
        const sortedNames = [...namesArray].sort((a, b) =>
          (b.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS || 0) - (a.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS || 0)
        );

        return h('div', { className: 'space-y-1' },
          sortedNames.map((item, idx) => {
            const fileName = item.EC_TAG_PARTFILE_SOURCE_NAMES;
            const sourceCount = item.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS;

            return h('div', {
              key: idx,
              className: 'text-xs p-2 bg-gray-50 dark:bg-gray-800/50 rounded border-l-2 border-blue-500'
            },
              h('div', { className: 'font-medium text-gray-900 dark:text-gray-100 break-all' }, fileName),
              sourceCount !== undefined && h('div', { className: 'text-gray-500 dark:text-gray-400 mt-0.5' },
                `${sourceCount} source${sourceCount !== 1 ? 's' : ''}`
              )
            );
          })
        );
      }
      return null;
    }

    // Special handling for A4AF_SOURCES
    if (key === 'EC_TAG_PARTFILE_A4AF_SOURCES') {
      const count = value['EC_TAG_ECID'];
      if (count !== undefined) {
        return h('span', { className: 'font-mono' }, count.toString());
      }
      return null;
    }

    // Special handling for COMMENTS
    if (key === 'EC_TAG_PARTFILE_COMMENTS') {
      const commentsArray = value['EC_TAG_PARTFILE_COMMENTS'];
      if (Array.isArray(commentsArray)) {
        if (commentsArray.length === 0) {
          return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No comments');
        }

        const [clientName, fileName, rating, commentText] = commentsArray;
        return h('div', { className: 'p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs' },
          h('div', { className: 'flex items-center gap-2 mb-1' },
            h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, clientName || 'Unknown'),
            rating > 0 && h('span', { className: 'text-yellow-500' }, '★'.repeat(rating) + '☆'.repeat(5 - rating))
          ),
          fileName && h('div', { className: 'text-gray-600 dark:text-gray-400 mb-1' }, fileName),
          commentText && h('div', { className: 'text-gray-800 dark:text-gray-200' }, commentText)
        );
      }
    }

    // rtorrent peers summary object (connected, seeders, total)
    if (key === 'peers') {
      const { connected = 0, seeders = 0, total = 0 } = value;
      return h('span', { className: 'font-mono' },
        `${connected} connected`,
        seeders > 0 && h('span', { className: 'text-green-600 dark:text-green-400 ml-2' }, `(${seeders} seeders)`),
        total > 0 && h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2' }, `/ ${total} in swarm`)
      );
    }

    return h('pre', {
      className: 'text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto'
    }, JSON.stringify(value, null, 2));
  }

  // Priority fields (aMule EC_TAG)
  if (key === 'EC_TAG_KNOWNFILE_PRIO' || key === 'EC_TAG_PARTFILE_PRIO') {
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    return h('span', null,
      formatPriority(numValue),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${numValue})`)
    );
  }

  // Priority field (rtorrent: 0=Off, 1=Low, 2=Normal, 3=High)
  if (key === 'priority') {
    const RTORRENT_PRIORITY_LABELS = { 0: 'Off', 1: 'Low', 2: 'Normal', 3: 'High' };
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    return h('span', null, RTORRENT_PRIORITY_LABELS[numValue] || `Unknown (${numValue})`);
  }

  // Status field
  if (key === 'EC_TAG_PARTFILE_STATUS') {
    return h('span', null, formatStatus(value));
  }

  // Skip A4AF auto field
  if (key === 'EC_TAG_PARTFILE_A4AFAUTO') {
    return null;
  }

  // Active download time
  if (key === 'EC_TAG_PARTFILE_DOWNLOAD_ACTIVE') {
    return h('span', null,
      formatDuration(value),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${value.toLocaleString()}s)`)
    );
  }

  // Speed field
  if (key === 'EC_TAG_PARTFILE_SPEED') {
    return h('span', { className: 'font-mono text-blue-600 dark:text-blue-400' },
      formatSpeed(value)
    );
  }

  // Format known byte fields
  if (key.includes('SIZE') || key.includes('XFERRED') || key.includes('LOST') || key.includes('GAINED') || key.includes('SAVED')) {
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    if (!isNaN(numValue)) {
      return h('span', null,
        formatBytes(numValue),
        h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${numValue.toLocaleString()} bytes)`)
      );
    }
  }

  // Format timestamps
  if (key.includes('LAST_SEEN') || key.includes('LAST_RECV')) {
    if (value === 0) {
      return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'Never');
    }
    const date = new Date(value * 1000);
    const now = Date.now();
    const diff = now - (value * 1000);
    const ago = diff > 0 ? ` (${Math.floor(diff / 1000 / 60)} min ago)` : '';
    return h('span', null,
      date.toLocaleString(),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, ago)
    );
  }

  // AICH hash
  if (key === 'EC_TAG_KNOWNFILE_AICH_MASTERHASH') {
    if (!value || value === '') {
      return null;
    }
    return h('span', { className: 'font-mono text-xs break-all' }, value);
  }

  // Hash field
  if (key === 'EC_TAG_PARTFILE_HASH') {
    return h('span', { className: 'font-mono text-xs break-all' }, value);
  }

  // Rating field
  if (key === 'EC_TAG_KNOWNFILE_RATING') {
    if (value === 0) {
      return null;
    }
    return h('span', null, `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`);
  }

  // Comment field
  if (key === 'EC_TAG_KNOWNFILE_COMMENT') {
    if (!value || value.trim() === '') {
      return null;
    }
  }

  // Category field
  if (key === 'EC_TAG_PARTFILE_CAT') {
    const catId = typeof value === 'string' ? parseInt(value) : value;
    const cat = categories.find(c => c.id === catId);
    const categoryName = catId === 0 ? 'Default' : (cat?.title || 'Unknown');
    const categoryPath = cat?.path || '';

    return h('span', null,
      categoryName,
      categoryPath && h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${categoryPath})`)
    );
  }

  // rtorrent byte size fields
  if (key === 'size' || key === 'completedBytes' || key === 'downloadTotal' ||
      key === 'uploadTotal' || key === 'chunkSize') {
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    if (!isNaN(numValue)) {
      return h('span', null,
        formatBytes(numValue),
        h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${numValue.toLocaleString()} bytes)`)
      );
    }
  }

  // rtorrent speed fields
  if (key === 'downloadSpeed' || key === 'uploadSpeed') {
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    return h('span', { className: 'font-mono text-blue-600 dark:text-blue-400' },
      formatSpeed(numValue)
    );
  }

  // rtorrent timestamp fields
  if (key === 'creationDate' || key === 'startedTime' || key === 'finishedTime') {
    // Handle missing/unavailable dates - return null to hide them
    if (value === 0 || value === null || value === undefined) {
      // For creationDate, don't show if unavailable
      if (key === 'creationDate') return null;
      return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'Never');
    }
    // Handle ISO string format (e.g., "1970-01-01T00:00:00.000Z")
    if (typeof value === 'string') {
      const date = new Date(value);
      // If it's epoch (1970-01-01), hide it
      if (date.getTime() === 0 || isNaN(date.getTime())) {
        if (key === 'creationDate') return null;
        return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'Never');
      }
      return h('span', null, date.toLocaleString());
    }
    // Handle Unix timestamp
    const date = new Date(value * 1000);
    return h('span', null, date.toLocaleString());
  }

  // rtorrent seedingTime (duration in seconds)
  if (key === 'seedingTime') {
    return h('span', null, formatDuration(value));
  }

  // rtorrent progress field (raw format is 0-1, convert to percentage)
  if (key === 'progress') {
    const progressValue = (value * 100).toFixed(2);
    return h('span', { className: 'font-mono' }, `${progressValue}%`);
  }

  // rtorrent state field (0=stopped, 1=started)
  if (key === 'state') {
    const stateLabel = RTORRENT_STATE_LABELS[value] || `Unknown (${value})`;
    return h('span', { className: 'font-mono' }, stateLabel);
  }

  // rtorrent status field (human-readable text like "downloading", "seeding")
  if (key === 'status' && typeof value === 'string') {
    const capitalizedStatus = value.charAt(0).toUpperCase() + value.slice(1);
    return h('span', { className: 'font-mono' }, capitalizedStatus);
  }

  // rtorrent ratio field
  if (key === 'ratio') {
    const ratioValue = typeof value === 'number' ? value.toFixed(2) : value;
    return h('span', { className: 'font-mono' }, ratioValue);
  }

  // rtorrent boolean fields
  if (key === 'isActive' || key === 'isComplete' || key === 'isOpen' ||
      key === 'isHashing' || key === 'isPrivate' || key === 'isMultiFile') {
    return h('span', {
      className: value ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
    }, value ? 'Yes' : 'No');
  }

  // rtorrent hash field
  if (key === 'hash') {
    return h('span', { className: 'font-mono text-xs break-all' }, value);
  }

  // Default formatting for numbers
  if (typeof value === 'number') {
    return h('span', { className: 'font-mono' }, value.toLocaleString());
  }

  // String values
  if (typeof value === 'string' && value.trim() === '') {
    return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'Empty');
  }

  return h('span', null, String(value));
};

/**
 * Categorize shared file fields for display
 * @param {Object} raw - Raw EC tag data
 * @returns {Object} Fields grouped by category
 */
export const categorizeSharedFields = (raw) => {
  const fieldCategories = {
    'File Identification': [],
    'Upload Statistics': [],
    'Source Information': []
  };

  Object.entries(raw).forEach(([key, value]) => {
    // Skip certain fields
    if (key === 'EC_TAG_PARTFILE_ED2K_LINK') return;
    if (key === 'EC_TAG_PARTFILE_PART_STATUS') return;

    // File Identification
    if (key === 'EC_TAG_PARTFILE_NAME' ||
        key === 'EC_TAG_PARTFILE_HASH' ||
        key === 'EC_TAG_PARTFILE_SIZE_FULL' ||
        key === 'EC_TAG_KNOWNFILE_FILENAME' ||
        key === 'EC_TAG_KNOWNFILE_AICH_MASTERHASH' ||
        key === 'EC_TAG_KNOWNFILE_COMMENT' ||
        key === 'EC_TAG_KNOWNFILE_RATING') {
      fieldCategories['File Identification'].push([key, value]);
    }
    // Upload Statistics
    else if (key.includes('KNOWNFILE_REQ_COUNT') ||
             key.includes('KNOWNFILE_ACCEPT_COUNT') ||
             key.includes('KNOWNFILE_XFERRED') ||
             key === 'EC_TAG_KNOWNFILE_PRIO' ||
             key === 'EC_TAG_KNOWNFILE_ON_QUEUE') {
      fieldCategories['Upload Statistics'].push([key, value]);
    }
    // Source Information
    else if (key.includes('COMPLETE_SOURCES')) {
      fieldCategories['Source Information'].push([key, value]);
    }
  });

  return fieldCategories;
};

/**
 * Categorize download fields for display
 * @param {Object} raw - Raw EC tag data
 * @returns {Object} Fields grouped by category
 */
export const categorizeDownloadFields = (raw) => {
  const fieldCategories = {
    'File Identification': [],
    'Source Information': [],
    'Timing & Activity': [],
    'Priority & Category': [],
    'State & Progress': [],
    'Download Statistics': [],
    'Upload Statistics': [],
    'Data Integrity & Optimization': []
  };

  Object.entries(raw).forEach(([key, value]) => {
    // Skip certain fields (aMule)
    if (key === 'EC_TAG_PARTFILE_ED2K_LINK') return;
    if (key === 'EC_TAG_PARTFILE_STOPPED') return;
    if (key === 'EC_TAG_PARTFILE_A4AFAUTO') return;
    if (key === 'EC_TAG_PARTFILE_PARTMETID') return;

    // Skip certain rtorrent fields (rendered separately or redundant)
    if (key === 'peersDetailed' || key === 'trackersDetailed' || key === 'trackers') return;
    if (key === 'message') return;
    if (key === 'clientType') return; // metadata, not user-facing

    // ===== aMule EC_TAG fields =====

    // File Identification (aMule)
    if (key === 'EC_TAG_PARTFILE_NAME' ||
        key === 'EC_TAG_PARTFILE_HASH' ||
        key === 'EC_TAG_PARTFILE_SIZE_FULL' ||
        key === 'EC_TAG_KNOWNFILE_FILENAME' ||
        key === 'EC_TAG_KNOWNFILE_AICH_MASTERHASH' ||
        key === 'EC_TAG_PARTFILE_COMMENTS') {
      fieldCategories['File Identification'].push([key, value]);
    }
    // State & Progress (aMule)
    else if (key === 'EC_TAG_PARTFILE_STATUS') {
      fieldCategories['State & Progress'].push([key, value]);
    }
    // Download Statistics (aMule)
    else if (key === 'EC_TAG_PARTFILE_SIZE_XFER' ||
             key === 'EC_TAG_PARTFILE_SIZE_DONE' ||
             key === 'EC_TAG_PARTFILE_SPEED' ||
             key === 'EC_TAG_PARTFILE_AVAILABLE_PARTS' ||
             key === 'EC_TAG_PARTFILE_HASHED_PART_COUNT') {
      fieldCategories['Download Statistics'].push([key, value]);
    }
    // Priority & Category (aMule)
    else if (key.includes('PRIO') ||
             key === 'EC_TAG_PARTFILE_CAT') {
      fieldCategories['Priority & Category'].push([key, value]);
    }
    // Upload Statistics (aMule)
    else if (key.includes('KNOWNFILE_REQ_COUNT') ||
             key.includes('KNOWNFILE_ACCEPT_COUNT') ||
             key.includes('KNOWNFILE_XFERRED') ||
             key === 'EC_TAG_KNOWNFILE_ON_QUEUE' ||
             key === 'EC_TAG_KNOWNFILE_RATING' ||
             key === 'EC_TAG_KNOWNFILE_COMMENT') {
      fieldCategories['Upload Statistics'].push([key, value]);
    }
    // Source Information (aMule)
    else if (key.includes('SOURCE') || key.includes('COMPLETE_SOURCES')) {
      fieldCategories['Source Information'].push([key, value]);
    }
    // Timing & Activity (aMule)
    else if (key === 'EC_TAG_PARTFILE_LAST_SEEN_COMP' ||
             key === 'EC_TAG_PARTFILE_LAST_RECV' ||
             key === 'EC_TAG_PARTFILE_DOWNLOAD_ACTIVE') {
      fieldCategories['Timing & Activity'].push([key, value]);
    }
    // Data Integrity & Optimization (aMule)
    else if (key === 'EC_TAG_PARTFILE_LOST_CORRUPTION' ||
             key === 'EC_TAG_PARTFILE_GAINED_COMPRESSION' ||
             key === 'EC_TAG_PARTFILE_SAVED_ICH') {
      fieldCategories['Data Integrity & Optimization'].push([key, value]);
    }

    // ===== rtorrent fields (camelCase) =====

    // File Identification (rtorrent)
    else if (key === 'hash' || key === 'name' || key === 'size' ||
             key === 'directory' || key === 'basePath' ||
             key === 'isPrivate' || key === 'isMultiFile') {
      fieldCategories['File Identification'].push([key, value]);
    }
    // State & Progress (rtorrent)
    else if (key === 'status' || key === 'state' ||
             key === 'isActive' || key === 'isComplete' ||
             key === 'isOpen' || key === 'isHashing' ||
             key === 'progress') {
      fieldCategories['State & Progress'].push([key, value]);
    }
    // Download Statistics (rtorrent)
    else if (key === 'completedBytes' || key === 'downloadSpeed' ||
             key === 'downloadTotal' || key === 'chunksCompleted' ||
             key === 'chunksTotal') {
      fieldCategories['Download Statistics'].push([key, value]);
    }
    // Upload Statistics (rtorrent)
    else if (key === 'uploadSpeed' || key === 'uploadTotal' || key === 'ratio') {
      fieldCategories['Upload Statistics'].push([key, value]);
    }
    // Priority & Category (rtorrent)
    else if (key === 'priority' || key === 'label') {
      fieldCategories['Priority & Category'].push([key, value]);
    }
    // Timing & Activity (rtorrent)
    else if (key === 'creationDate' || key === 'startedTime' ||
             key === 'finishedTime') {
      fieldCategories['Timing & Activity'].push([key, value]);
    }
    // Source Information (rtorrent - peers/seeds)
    else if (key === 'peers' || key === 'peersTotal' ||
             key === 'seeds' || key === 'seedsTotal') {
      fieldCategories['Source Information'].push([key, value]);
    }
    // Data Integrity & Optimization (rtorrent)
    else if (key === 'chunkSize') {
      fieldCategories['Data Integrity & Optimization'].push([key, value]);
    }
    // Anything else goes to File Identification
    else {
      fieldCategories['File Identification'].push([key, value]);
    }
  });

  return fieldCategories;
};
