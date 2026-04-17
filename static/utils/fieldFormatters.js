/**
 * Field Formatters
 *
 * Shared formatting utilities for displaying download/shared file fields.
 * Uses declarative metadata from fieldRegistry.js for type-driven formatting.
 */

import React from 'https://esm.sh/react@18.2.0';
import { formatBytes, formatSpeed } from './index.js';
import { AMULE_STATUS, RTORRENT_STATE_LABELS, QBITTORRENT_STATE_LABELS } from './constants.js';
import {
  FIELD_LABELS, FIELD_TYPES, SKIP_FIELDS, FIELD_CATEGORIES,
  CATEGORIZE_SKIP, CATEGORIZE_CONDITIONAL_SKIP, CATEGORY_ORDER,
} from './fieldRegistry.js';
import StarRating from '../components/common/StarRating.js';

const { createElement: h } = React;

// Re-export FIELD_LABELS so existing imports keep working
export { FIELD_LABELS };

/**
 * Format duration in seconds to readable format
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
 * Format priority value to readable string (aMule 0-12 scale)
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
 * Format aMule download status value
 */
export const formatStatus = (value) => {
  if (value === AMULE_STATUS.DOWNLOADING || value === AMULE_STATUS.DOWNLOADING_ACTIVE) return 'Downloading';
  else if (value === AMULE_STATUS.PAUSED) return 'Paused';
  return `Unknown status (${value})`;
};

/**
 * Format field name for display
 */
export const formatFieldName = (key) => {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];

  if (key.startsWith('EC_TAG_')) {
    return key.replace(/^EC_TAG_/, '').replace(/_/g, ' ').toLowerCase()
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  if (key.includes('_')) {
    return key.replace(/_/g, ' ').split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
};

// ─── Type Renderers ──────────────────────────────────────────────────────────

const renderNull = () => h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'N/A');
const renderNever = () => h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'Never');
const renderInfinity = () => h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, '∞');

const TYPE_RENDERERS = {
  bytes: (v) => {
    const n = typeof v === 'string' ? parseInt(v) : v;
    if (isNaN(n)) return h('span', null, String(v));
    return h('span', null,
      formatBytes(n),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${n.toLocaleString()} bytes)`)
    );
  },
  speed: (v) => {
    const n = typeof v === 'string' ? parseInt(v) : v;
    return h('span', { className: 'font-mono text-blue-600 dark:text-blue-400' }, formatSpeed(n));
  },
  timestamp: (v) => {
    if (v === -1 || v === 0 || v === null || v === undefined) return renderNever();
    return h('span', null, new Date(v * 1000).toLocaleString());
  },
  timestamp_amule: (v) => {
    if (v === 0) return renderNever();
    const date = new Date(v * 1000);
    const diff = Date.now() - (v * 1000);
    const ago = diff > 0 ? ` (${Math.floor(diff / 1000 / 60)} min ago)` : '';
    return h('span', null,
      date.toLocaleString(),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, ago)
    );
  },
  timestamp_rtorrent: (v, key) => {
    if (v === 0 || v === null || v === undefined) {
      if (key === 'creationDate') return null;
      return renderNever();
    }
    if (typeof v === 'string') {
      const date = new Date(v);
      if (date.getTime() === 0 || isNaN(date.getTime())) {
        if (key === 'creationDate') return null;
        return renderNever();
      }
      return h('span', null, date.toLocaleString());
    }
    return h('span', null, new Date(v * 1000).toLocaleString());
  },
  timestamp_transmission: (v, key) => {
    if (v === 0 || v === null || v === undefined) {
      if (key === 'dateCreated') return null;
      return renderNever();
    }
    return h('span', null, new Date(v * 1000).toLocaleString());
  },
  duration: (v) => h('span', null, formatDuration(v)),
  duration_verbose: (v) => h('span', null,
    formatDuration(v),
    h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${v.toLocaleString()}s)`)
  ),
  duration_infinity: (v) => {
    if (v === 8640000 || v < 0) return renderInfinity();
    return h('span', null, formatDuration(v));
  },
  boolean: (v) => h('span', {
    className: v ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
  }, v ? 'Yes' : 'No'),
  ratio: (v) => {
    const display = typeof v === 'number' ? (v >= 0 ? v.toFixed(2) : '-') : v;
    return h('span', { className: 'font-mono' }, display);
  },
  percent: (v) => h('span', { className: 'font-mono' }, `${(v * 100).toFixed(2)}%`),
  hash: (v) => {
    if (!v || v === '') return renderNull();
    return h('span', { className: 'font-mono text-xs break-all' }, v);
  },
  decimal3: (v) => {
    const n = typeof v === 'number' ? v.toFixed(3) : v;
    return h('span', { className: 'font-mono' }, n);
  },
};

// ─── Special Formatters ──────────────────────────────────────────────────────
// Keys with custom rendering beyond simple type dispatch.

const RTORRENT_PRIORITY_LABELS = { 0: 'Off', 1: 'Low', 2: 'Normal', 3: 'High' };
const TRANSMISSION_STATUS_LABELS = {
  0: 'Paused', 1: 'Check Pending', 2: 'Checking',
  3: 'Download Pending', 4: 'Downloading', 5: 'Seed Pending', 6: 'Seeding'
};
const TRANSMISSION_BANDWIDTH_LABELS = { '-1': 'Low', '0': 'Normal', '1': 'High' };
const TRANSMISSION_ERROR_TYPES = { 1: 'Tracker Warning', 2: 'Tracker Error', 3: 'Local Error' };

const SPECIAL_FORMATTERS = {
  // aMule nested objects
  'EC_TAG_PARTFILE_SOURCE_NAMES': (value) => {
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const innerData = value['EC_TAG_PARTFILE_SOURCE_NAMES'];
    let namesArray = Array.isArray(innerData) ? innerData
      : (innerData && typeof innerData === 'object') ? [innerData] : [];
    if (namesArray.length === 0) return null;
    const sorted = [...namesArray].sort((a, b) =>
      (b.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS || 0) - (a.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS || 0)
    );
    return h('div', { className: 'space-y-1' },
      sorted.map((item, idx) => h('div', {
        key: idx,
        className: 'text-xs p-2 bg-gray-50 dark:bg-gray-800/50 rounded border-l-2 border-blue-500'
      },
        h('div', { className: 'font-medium text-gray-900 dark:text-gray-100 break-all' },
          item.EC_TAG_PARTFILE_SOURCE_NAMES),
        item.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS !== undefined &&
          h('div', { className: 'text-gray-500 dark:text-gray-400 mt-0.5' },
            `${item.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS} source${item.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS !== 1 ? 's' : ''}`)
      ))
    );
  },
  'EC_TAG_PARTFILE_A4AF_SOURCES': (value) => {
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const count = value['EC_TAG_ECID'];
    return count !== undefined ? h('span', { className: 'font-mono' }, count.toString()) : null;
  },
  'EC_TAG_PARTFILE_COMMENTS': (value) => {
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const commentsArray = value['EC_TAG_PARTFILE_COMMENTS'];
    if (!Array.isArray(commentsArray) || commentsArray.length === 0) {
      return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No comments');
    }
    // aMule emits this tag as a flat sequence of 4 child tags per peer
    // (username, filename, rating, comment) all under the same tag ID — see
    // ECSpecialCoreTags.cpp line ~193. Chunk the array back into tuples.
    const comments = [];
    for (let i = 0; i + 4 <= commentsArray.length; i += 4) {
      comments.push({
        clientName: commentsArray[i],
        fileName: commentsArray[i + 1],
        rating: commentsArray[i + 2],
        commentText: commentsArray[i + 3]
      });
    }
    if (comments.length === 0) return null;
    return h('div', { className: 'space-y-2' },
      comments.map((c, idx) =>
        h('div', { key: idx, className: 'p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs' },
          h('div', { className: 'flex items-center gap-2 mb-1' },
            h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, c.clientName || 'Unknown'),
            h(StarRating, { value: c.rating })
          ),
          c.fileName && h('div', { className: 'text-gray-600 dark:text-gray-400 mb-1' }, c.fileName),
          c.commentText && h('div', { className: 'text-gray-800 dark:text-gray-200' }, c.commentText)
        )
      )
    );
  },
  // aMule priority/status/category/rating/comment
  'EC_TAG_KNOWNFILE_PRIO': (value) => {
    const n = typeof value === 'string' ? parseInt(value) : value;
    return h('span', null, formatPriority(n),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${n})`));
  },
  'EC_TAG_PARTFILE_PRIO': (value) => {
    const n = typeof value === 'string' ? parseInt(value) : value;
    return h('span', null, formatPriority(n),
      h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2 text-xs' }, `(${n})`));
  },
  'EC_TAG_PARTFILE_STATUS': (value) => h('span', null, formatStatus(value)),
  'EC_TAG_PARTFILE_CAT': (value) =>
    h('span', null, typeof value === 'string' ? value : (value === 0 ? 'Default' : `#${value}`)),
  'rating': (value) => {
    if (!value || value === 0) return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'Not rated');
    return h(StarRating, { value });
  },
  'comment': (value) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No comment');
    }
    return undefined; // fall through to default rendering
  },
  // rtorrent peers summary object
  'peers': (value) => {
    if (typeof value !== 'object' || Array.isArray(value)) return undefined;
    const { connected = 0, seeders = 0, total = 0 } = value;
    return h('span', { className: 'font-mono' },
      `${connected} connected`,
      seeders > 0 && h('span', { className: 'text-green-600 dark:text-green-400 ml-2' }, `(${seeders} seeders)`),
      total > 0 && h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2' }, `/ ${total} in swarm`)
    );
  },
  // rtorrent priority (0=Off, 1=Low, 2=Normal, 3=High)
  'priority': (value) => {
    const n = typeof value === 'string' ? parseInt(value) : value;
    return h('span', null, RTORRENT_PRIORITY_LABELS[n] || `Unknown (${n})`);
  },
  // Multi-client state (rtorrent: number, qBit/Deluge: string)
  'state': (value) => {
    if (typeof value === 'string') {
      const label = QBITTORRENT_STATE_LABELS[value] || value.charAt(0).toUpperCase() + value.slice(1);
      return h('span', { className: 'font-mono' }, label);
    }
    const label = RTORRENT_STATE_LABELS[value] || `Unknown (${value})`;
    return h('span', { className: 'font-mono' }, label);
  },
  // Multi-client status (rtorrent: string, Transmission: number)
  'status': (value) => {
    if (typeof value === 'number') {
      const label = TRANSMISSION_STATUS_LABELS[value];
      if (label) return h('span', { className: 'font-mono' }, label);
    }
    if (typeof value === 'string') {
      return h('span', { className: 'font-mono' }, value.charAt(0).toUpperCase() + value.slice(1));
    }
    return undefined; // fall through to default
  },
  // rtorrent progress (0-1 → percentage)
  'progress': (value) => {
    if (typeof value !== 'number') return undefined;
    return h('span', { className: 'font-mono' }, `${(value * 100).toFixed(2)}%`);
  },
  // Transmission fields
  'bandwidthPriority': (value) =>
    h('span', null, TRANSMISSION_BANDWIDTH_LABELS[String(value)] || `Unknown (${value})`),
  'error': (value) => {
    if (value === 0) return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'None');
    return h('span', { className: 'text-red-600 dark:text-red-400' },
      TRANSMISSION_ERROR_TYPES[value] || `Error ${value}`);
  },
  // qBittorrent limit fields (bytes with special -1/0 handling)
  'dl_limit': (value) => {
    const n = typeof value === 'string' ? parseInt(value) : value;
    if (n === 0) return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'No limit');
    return TYPE_RENDERERS.bytes(n);
  },
  'up_limit': (value) => {
    const n = typeof value === 'string' ? parseInt(value) : value;
    if (n === 0) return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' }, 'No limit');
    return TYPE_RENDERERS.bytes(n);
  },
  // qBittorrent ratio/time limit fields (-1 = no limit, -2 = use global)
  'max_ratio': limitFormatter,
  'ratio_limit': limitFormatter,
  'max_seeding_time': limitFormatter,
  'seeding_time_limit': limitFormatter,
  'inactive_seeding_time_limit': limitFormatter,
  'max_inactive_seeding_time': limitFormatter,
  // qBittorrent magnet URI (truncated)
  'magnet_uri': (value) => {
    if (!value || value === '') return renderNull();
    const truncated = value.length > 80 ? value.substring(0, 80) + '...' : value;
    return h('span', { className: 'font-mono text-xs break-all', title: value }, truncated);
  },
};

function limitFormatter(value) {
  if (value === -1 || value === -2) {
    return h('span', { className: 'text-gray-500 dark:text-gray-400 italic' },
      value === -1 ? 'No limit' : 'Use global');
  }
  return undefined; // fall through to type-based or default rendering
}

// ─── Main Format Function ────────────────────────────────────────────────────

/**
 * Format field value based on type and content
 * @param {string} key - Field key
 * @param {any} value - Field value
 * @returns {React.Element|null} Formatted value element
 */
export const formatFieldValue = (key, value) => {
  if (value === undefined || value === null) return renderNull();
  if (SKIP_FIELDS.has(key)) return null;

  // Arrays → JSON pre
  if (Array.isArray(value)) {
    return h('pre', {
      className: 'text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto'
    }, JSON.stringify(value, null, 2));
  }

  // Objects: special formatter or JSON fallback
  if (typeof value === 'object') {
    const special = SPECIAL_FORMATTERS[key];
    if (special) {
      const result = special(value);
      if (result !== undefined) return result;
    }
    return h('pre', {
      className: 'text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto'
    }, JSON.stringify(value, null, 2));
  }

  // Special formatters (client-specific complex rendering)
  const special = SPECIAL_FORMATTERS[key];
  if (special) {
    const result = special(value);
    if (result !== undefined) return result;
  }

  // Type-driven formatting
  const type = FIELD_TYPES[key];
  if (type) {
    const renderer = TYPE_RENDERERS[type];
    if (renderer) return renderer(value, key);
  }

  // Fallback: number → toLocaleString, empty string → "Empty", else text
  if (typeof value === 'number') {
    return h('span', { className: 'font-mono' }, value.toLocaleString());
  }
  if (typeof value === 'string' && value.trim() === '') {
    return h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'Empty');
  }
  return h('span', null, String(value));
};

// ─── Categorize Functions ────────────────────────────────────────────────────

/**
 * Categorize shared file fields for display (aMule only, already clean).
 * `item` is the unified item, used to surface canonical fields
 * (`comment`, `rating`) instead of the raw EC_TAG values.
 */
export const categorizeSharedFields = (raw, item = null) => {
  const fieldCategories = {
    'File Identification': [],
    'Upload Statistics': [],
    'Source Information': []
  };

  Object.entries(raw).forEach(([key, value]) => {
    if (key === 'EC_TAG_PARTFILE_ED2K_LINK') return;
    if (key === 'EC_TAG_PARTFILE_PART_STATUS') return;
    // Canonical comment/rating are emitted below from the unified item;
    // skip the raw EC_TAG variants so they don't render twice.
    if (key === 'EC_TAG_KNOWNFILE_COMMENT' || key === 'EC_TAG_KNOWNFILE_RATING') return;

    if (key === 'EC_TAG_PARTFILE_NAME' || key === 'EC_TAG_PARTFILE_HASH' ||
        key === 'EC_TAG_PARTFILE_SIZE_FULL' || key === 'EC_TAG_KNOWNFILE_FILENAME' ||
        key === 'EC_TAG_KNOWNFILE_AICH_MASTERHASH') {
      fieldCategories['File Identification'].push([key, value]);
    } else if (key.includes('KNOWNFILE_REQ_COUNT') || key.includes('KNOWNFILE_ACCEPT_COUNT') ||
               key.includes('KNOWNFILE_XFERRED') || key === 'EC_TAG_KNOWNFILE_PRIO' ||
               key === 'EC_TAG_KNOWNFILE_ON_QUEUE') {
      fieldCategories['Upload Statistics'].push([key, value]);
    } else if (key.includes('COMPLETE_SOURCES')) {
      fieldCategories['Source Information'].push([key, value]);
    }
  });

  // Always surface rating + comment for shared files (even when empty),
  // since they're user-editable metadata now.
  if (item) {
    fieldCategories['File Identification'].push(['rating', item.rating ?? 0]);
    fieldCategories['File Identification'].push(['comment', item.comment ?? '']);
  }

  return applySectionPins(fieldCategories);
};

// Keys that should be pinned to the top of their section (in this order),
// overriding the natural insertion order driven by the raw object.
const SECTION_PINNED_TOP = {
  'Source Information': ['EC_TAG_PARTFILE_SOURCE_NAMES']
};

const applySectionPins = (result) => {
  for (const [section, pinnedKeys] of Object.entries(SECTION_PINNED_TOP)) {
    const entries = result[section];
    if (!entries || entries.length === 0) continue;
    const pinned = [];
    const rest = [];
    for (const entry of entries) {
      (pinnedKeys.includes(entry[0]) ? pinned : rest).push(entry);
    }
    // Preserve declaration order for pinned keys
    pinned.sort((a, b) => pinnedKeys.indexOf(a[0]) - pinnedKeys.indexOf(b[0]));
    result[section] = [...pinned, ...rest];
  }
  return result;
};

/**
 * Categorize download fields for display — registry-driven
 */
export const categorizeDownloadFields = (raw) => {
  const clientType = raw.clientType;
  const categoryMap = FIELD_CATEGORIES[clientType] || {};
  const globalSkip = CATEGORIZE_SKIP._global;
  const clientSkip = CATEGORIZE_SKIP[clientType] || new Set();
  const result = Object.fromEntries(CATEGORY_ORDER.map(c => [c, []]));

  for (const [key, value] of Object.entries(raw)) {
    if (globalSkip.has(key) || clientSkip.has(key)) continue;
    const condSkip = CATEGORIZE_CONDITIONAL_SKIP[key];
    if (condSkip && condSkip(value)) continue;
    const category = categoryMap[key];
    if (category) {
      result[category].push([key, value]);
    } else {
      // Unknown/unmapped keys go to Uncategorized for review
      result['Uncategorized'].push([key, value]);
    }
  }
  return applySectionPins(result);
};
