/**
 * FileInfoModal Component
 *
 * Unified modal for displaying file information.
 * Adapts sections based on network type (bittorrent, ed2k-download, ed2k-shared).
 * Looks up live data from context internally — caller only passes a hash.
 */

import React from 'https://esm.sh/react@18.2.0';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useWebSocketConnection } from '../../contexts/WebSocketContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { SegmentsBar, Icon, Portal, Button, AlertBox, LoadingSpinner } from '../common/index.js';
import { formatBytes, getProgressColor, getExportLink, getExportLinkLabel, calculateRatio } from '../../utils/index.js';
import { formatPriority, categorizeDownloadFields, categorizeSharedFields } from '../../utils/fieldFormatters.js';
import { useCopyToClipboard } from '../../hooks/index.js';
import {
  InfoModalHeader,
  ExportLinkSection,
  CategoryFieldsSection,
  CollapsibleTableSection,
  PeersTable,
  TrackersTable,
  FilesTreeSection
} from './InfoModalTables.js';

const { createElement: h, useState, useEffect } = React;

/**
 * Default expanded-sections state for each variant
 */
const getDefaultExpanded = (variant) => {
  if (variant === 'bittorrent') {
    return {
      'Files': true,
      'Peers': true,
      'Trackers': true,
      'File Identification': true,
      'Source Information': true,
      'State & Progress': false,
      'Download Statistics': false,
      'Upload Statistics': false,
      'Timing & Activity': false,
      'Priority & Category': false,
      'Data Integrity & Optimization': false,
      'Uncategorized': false
    };
  }
  if (variant === 'ed2k-download') {
    return {
      'Download Sources': true,
      'Active Uploads': true,
      'File Identification': true,
      'Source Information': true,
      'Timing & Activity': false,
      'Priority & Category': false,
      'State & Progress': false,
      'Download Statistics': false,
      'Upload Statistics': false,
      'Data Integrity & Optimization': false,
      'Uncategorized': false
    };
  }
  // ed2k-shared
  return {
    'Active Uploads': true,
    'File Identification': true,
    'Upload Statistics': true,
    'Source Information': true
  };
};

/**
 * Header config for each variant
 */
const getHeaderConfig = (variant, item) => {
  if (variant === 'bittorrent') {
    const isSeeding = item.status === 'seeding';
    return {
      icon: isSeeding ? 'upload' : 'download',
      title: isSeeding ? 'Seeding Torrent' : 'Downloading Torrent',
      color: isSeeding ? 'green' : 'blue'
    };
  }
  if (variant === 'ed2k-download') {
    return { icon: 'download', title: 'Download Details', color: 'blue' };
  }
  return { icon: 'upload', title: 'Shared File Details', color: 'green' };
};

/**
 * Get variant string from a unified item
 */
const getVariant = (item) => {
  if (item.networkType === 'bittorrent') return 'bittorrent';
  if (item.downloading) return 'ed2k-download';
  return 'ed2k-shared';
};

/**
 * Unified file info modal
 * @param {string|null} hash - File hash to display (null = hidden)
 * @param {string|null} instanceId - Instance ID for compound key lookup (optional)
 * @param {function} onClose - Close handler
 */
const FileInfoModal = ({ hash, instanceId, onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { dataItems } = useLiveData();
  const { instances, hasMultiInstance } = useStaticData();
  const { copyStatus, handleCopy } = useCopyToClipboard();

  // Look up live item by hash + instanceId (compound key when available)
  const liveItem = hash
    ? dataItems.find(i =>
        i.hash?.toLowerCase() === hash.toLowerCase() &&
        (!instanceId || i.instanceId === instanceId))
    : null;

  const variant = liveItem ? getVariant(liveItem) : null;

  // Subscribe to segment data when showing ed2k-download (for SegmentsBar)
  const { subscribe, unsubscribe } = useWebSocketConnection();
  useEffect(() => {
    if (variant !== 'ed2k-download') return;
    subscribe('segmentData');
    return () => unsubscribe('segmentData');
  }, [variant, subscribe, unsubscribe]);

  // Expanded sections state — resets when hash or variant changes
  const [expandedSections, setExpandedSections] = useState(() =>
    getDefaultExpanded(variant || 'bittorrent')
  );

  useEffect(() => {
    if (variant) {
      setExpandedSections(getDefaultExpanded(variant));
    }
  }, [hash, variant]);

  // Files state (torrent multi-file only)
  const [files, setFiles] = useState(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(null);

  // Item detail state (raw + trackersDetailed, stripped from broadcasts)
  const [itemDetail, setItemDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch files when modal opens for multi-file torrent items, refresh periodically
  useEffect(() => {
    const isTorrent = variant === 'bittorrent';
    if (!hash || !liveItem || !isTorrent) {
      setFiles(null);
      return;
    }

    const isMultiFile = liveItem.multiFile || (liveItem.fileCount && liveItem.fileCount > 1);
    if (!isMultiFile) {
      setFiles(null);
      return;
    }

    let cancelled = false;

    const fetchFiles = async (isInitial) => {
      if (isInitial) {
        setFilesLoading(true);
        setFilesError(null);
      }
      try {
        const instanceParam = liveItem.instanceId ? `?instanceId=${encodeURIComponent(liveItem.instanceId)}` : '';
        const apiPath = `/api/${liveItem.client}/files/${liveItem.hash}${instanceParam}`;
        const response = await fetch(apiPath);
        if (cancelled) return;
        if (!response.ok) throw new Error('Failed to fetch files');
        const data = await response.json();
        if (!cancelled) {
          setFiles(data.files);
        }
      } catch (err) {
        // Only show error on initial fetch; silently ignore refresh errors
        if (!cancelled && isInitial) {
          setFilesError(err.message);
        }
      } finally {
        if (!cancelled && isInitial) {
          setFilesLoading(false);
        }
      }
    };

    fetchFiles(true);
    const interval = setInterval(() => fetchFiles(false), 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hash, liveItem?.hash, variant]);

  // Fetch item detail (raw + trackersDetailed) from generic endpoint
  useEffect(() => {
    if (!hash || !liveItem) {
      setItemDetail(null);
      return;
    }

    let cancelled = false;

    const fetchDetail = async (isInitial) => {
      if (isInitial) setDetailLoading(true);
      try {
        const instanceParam = liveItem.instanceId ? `?instanceId=${encodeURIComponent(liveItem.instanceId)}` : '';
        const response = await fetch(`/api/item/detail/${liveItem.hash}${instanceParam}`);
        if (cancelled || !response.ok) return;
        const data = await response.json();
        if (!cancelled) setItemDetail(data);
      } catch {
        // Non-critical — fields section will be empty
      } finally {
        if (!cancelled && isInitial) setDetailLoading(false);
      }
    };

    fetchDetail(true);
    const interval = setInterval(() => fetchDetail(false), 5000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [hash, liveItem?.hash, variant]);

  // Item disappeared while modal open — auto-close
  if (!liveItem) return null;

  // Raw data for categorized fields:
  // - rtorrent/qbittorrent: raw contains camelCase fields (hash, name, size, etc.)
  // - aMule: EC_TAG_ fields may be at raw top level or nested at raw.raw.
  //   Resolve to whichever level has EC_TAG_ keys.
  // Note: raw is fetched on-demand via API (stripped from broadcasts for performance)
  const isTorrent = variant === 'bittorrent';
  const rawFull = itemDetail?.raw || {};
  const ecTagSource = !isTorrent && rawFull.raw && typeof rawFull.raw === 'object'
    ? rawFull.raw
    : rawFull;
  const raw = isTorrent
    ? rawFull
    : { clientType: 'amule', ...Object.fromEntries(Object.entries(ecTagSource).filter(([k]) => k.startsWith('EC_TAG_'))) };

  // Inject resolved category name into raw for ed2k downloads (replaces numeric ID)
  if (!isTorrent && raw.EC_TAG_PARTFILE_CAT !== undefined) {
    raw.EC_TAG_PARTFILE_CAT = liveItem.category || 'Default';
  }

  // Export link — fallback to raw ED2K field if unified field is empty
  const exportLink = getExportLink(liveItem) || ecTagSource.EC_TAG_PARTFILE_ED2K_LINK || null;
  const linkLabel = getExportLinkLabel(liveItem);
  const headerConfig = getHeaderConfig(variant, liveItem);

  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // --- Variant-specific data ---

  // torrent clients (rtorrent/qbittorrent)
  const isComplete = isTorrent && liveItem.progress >= 100;
  const torrentMessage = isTorrent ? (liveItem.message || '') : '';
  const trackersDetailed = isTorrent ? (itemDetail?.trackersDetailed || []) : [];
  const allPeers = liveItem.peers || [];

  // BitTorrent: all peers shown together (bidirectional)
  const peersDetailedTorrent = isTorrent ? allPeers : [];

  // aMule: split by role for separate sections
  const downloadSourcesAmule = !isTorrent ? allPeers.filter(p => p.role === 'download') : [];
  const peersDetailedAmule = !isTorrent ? allPeers.filter(p => p.role === 'upload') : [];

  // --- Categorized fields ---
  let categorizedFields = {};

  if (isTorrent) {
    const allFields = categorizeDownloadFields(raw);
    const categoryOrder = isComplete
      ? [
          'File Identification', 'Source Information', 'State & Progress',
          'Upload Statistics', 'Timing & Activity', 'Priority & Category',
          'Data Integrity & Optimization', 'Uncategorized'
        ]
      : [
          'File Identification', 'Source Information', 'State & Progress',
          'Download Statistics', 'Upload Statistics', 'Timing & Activity',
          'Priority & Category', 'Data Integrity & Optimization', 'Uncategorized'
        ];
    categorizedFields = Object.fromEntries(
      categoryOrder
        .filter(c => allFields[c] && allFields[c].length > 0)
        .map(c => [c, allFields[c]])
    );
  } else if (variant === 'ed2k-download') {
    const allFields = categorizeDownloadFields(raw);
    const categoryOrder = [
      'File Identification', 'Source Information', 'State & Progress',
      'Download Statistics', 'Upload Statistics', 'Timing & Activity',
      'Priority & Category', 'Data Integrity & Optimization', 'Uncategorized'
    ];
    categorizedFields = Object.fromEntries(
      categoryOrder
        .filter(c => allFields[c] && allFields[c].length > 0)
        .map(c => [c, allFields[c]])
    );
  } else {
    // ed2k-shared
    const allFields = categorizeSharedFields(raw, liveItem);
    const categoryOrder = ['File Identification', 'Upload Statistics', 'Source Information'];
    categorizedFields = Object.fromEntries(
      categoryOrder
        .filter(c => allFields[c] && allFields[c].length > 0)
        .map(c => [c, allFields[c]])
    );
  }


  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4',
      onClick: onClose
    },
    h('div', {
      className: 'modal-full bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden',
      onClick: (e) => e.stopPropagation()
    },
      // Header
      h(InfoModalHeader, {
        icon: headerConfig.icon,
        title: hasMultiInstance && liveItem.instanceId && instances[liveItem.instanceId]?.name
          ? `${headerConfig.title} — ${instances[liveItem.instanceId].name}`
          : headerConfig.title,
        subtitle: liveItem.name,
        color: headerConfig.color,
        onClose
      }),

      // Content
      h('div', { className: 'flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4' },
        // Export Link section
        h(ExportLinkSection, {
          exportLink,
          linkLabel,
          copyStatus,
          onCopy: handleCopy
        }),

        // --- torrent: Progress bar (only if not complete) ---
        isTorrent && !isComplete && h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' }, 'Progress'),
          h('div', { className: 'w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 relative overflow-hidden' },
            h('div', {
              className: `h-full rounded-full transition-all duration-300 ${getProgressColor(liveItem.progress)}`,
              style: { width: `${liveItem.progress}%` }
            }),
            h('span', {
              className: 'absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-900 dark:text-white pointer-events-none',
              style: {
                WebkitTextStroke: isDark ? '1px black' : '1px white',
                textShadow: isDark ? '0 0 1px black, 0 0 1px black' : '0 0 1px white, 0 0 1px white',
                paintOrder: 'stroke fill'
              }
            }, `${liveItem.progress}%`)
          ),
          h('div', { className: 'flex justify-between items-center mt-2 text-xs text-gray-600 dark:text-gray-400' },
            h('span', null, `${liveItem.progress}% complete`),
            h('span', null, `${formatBytes(liveItem.sizeDownloaded)} / ${formatBytes(liveItem.size)}`)
          )
        ),

        // --- ed2k-download: Segments visualization ---
        // Render whenever we have gap data (aMule always emits gapStatus for
        // active partfiles). `partStatus` may be missing when the file has 0
        // connected sources contributing part-frequency data — SegmentsBar
        // falls back to red for gap regions in that case, which is exactly
        // the right "missing, no sources" signal.
        variant === 'ed2k-download' && (liveItem.partStatus || liveItem.gapStatus) && h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' }, 'Segments'),
          h('div', { className: 'w-full overflow-hidden rounded-full h-6' },
            h(SegmentsBar, {
              fileSize: parseInt(liveItem.size),
              fileSizeDownloaded: parseInt(liveItem.sizeDownloaded),
              partStatus: liveItem.partStatus,
              gapStatus: liveItem.gapStatus,
              reqStatus: liveItem.reqStatus,
              sourceCount: parseInt(liveItem.sources?.total || 0),
              width: 800,
              height: 24
            })
          ),
          h('div', { className: 'flex justify-between items-center mt-2 text-xs text-gray-600 dark:text-gray-400' },
            h('span', null, `${liveItem.progress}% complete`),
            h('span', null, `${formatBytes(liveItem.sizeDownloaded)} / ${formatBytes(liveItem.size)}`)
          )
        ),

        // --- Quick stats grid (all variants) ---
        h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3' },
          h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1' }, 'Size'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100' },
              formatBytes(liveItem.size)
            )
          ),
          h('div', { className: 'bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-orange-600 dark:text-orange-400 mb-0.5 sm:mb-1' }, 'Category'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-orange-700 dark:text-orange-300' },
              liveItem.category || 'Default'
            )
          ),
          h('div', { className: 'bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-blue-600 dark:text-blue-400 mb-0.5 sm:mb-1' }, 'Total Upload'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-blue-700 dark:text-blue-300' },
              formatBytes(liveItem.uploadTotal || 0)
            )
          ),
          h('div', { className: 'bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-purple-600 dark:text-purple-400 mb-0.5 sm:mb-1' }, 'Ratio'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-purple-700 dark:text-purple-300' },
              calculateRatio(liveItem)
            )
          )
        ),

        // --- torrent: Message/error section ---
        isTorrent && torrentMessage && h(AlertBox, { type: 'error', className: 'mb-0' },
          h('span', { className: 'font-medium' }, 'Message'),
          h('p', { className: 'mt-1' }, torrentMessage)
        ),

        // --- torrent: Files section (multi-file only) ---
        isTorrent && (files || filesLoading) && h(CollapsibleTableSection, {
          title: 'Files',
          count: files ? files.length : '...',
          expanded: expandedSections['Files'],
          onToggle: () => toggleSection('Files')
        }, h(FilesTreeSection, { files, loading: filesLoading, error: filesError })),

        // --- torrent: Peers section ---
        isTorrent && peersDetailedTorrent.length > 0 && h(CollapsibleTableSection, {
          title: 'Peers',
          count: peersDetailedTorrent.length,
          expanded: expandedSections['Peers'],
          onToggle: () => toggleSection('Peers')
        }, h(PeersTable, { peers: peersDetailedTorrent })),

        // --- torrent: Trackers section ---
        isTorrent && trackersDetailed.length > 0 && h(CollapsibleTableSection, {
          title: 'Trackers',
          count: trackersDetailed.length,
          expanded: expandedSections['Trackers'],
          onToggle: () => toggleSection('Trackers')
        }, h(TrackersTable, { trackers: trackersDetailed, clientType: instances[liveItem.instanceId]?.type })),

        // --- ed2k: Download Sources (peers we download from) section ---
        !isTorrent && downloadSourcesAmule.length > 0 && h(CollapsibleTableSection, {
          title: 'Download Sources',
          count: downloadSourcesAmule.length,
          expanded: expandedSections['Download Sources'],
          onToggle: () => toggleSection('Download Sources')
        }, h(PeersTable, { peers: downloadSourcesAmule, variant: 'amule-source' })),

        // --- ed2k: Active Uploads (peers) section ---
        !isTorrent && peersDetailedAmule.length > 0 && h(CollapsibleTableSection, {
          title: 'Active Uploads',
          count: peersDetailedAmule.length,
          expanded: expandedSections['Active Uploads'],
          onToggle: () => toggleSection('Active Uploads')
        }, h(PeersTable, { peers: peersDetailedAmule, variant: 'amule-upload' })),

        // --- All variants: Categorized fields ---
        detailLoading
          ? h('div', { className: 'flex items-center justify-center py-8' },
              h(LoadingSpinner, { size: 'sm' })
            )
          : Object.entries(categorizedFields).map(([category, fields]) =>
              h(CategoryFieldsSection, {
                key: category,
                category,
                fields,
                expanded: expandedSections[category],
                onToggle: () => toggleSection(category)
              })
            )
      ),

      // Footer
      h('div', { className: 'p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end' },
        h(Button, {
          variant: 'secondary',
          onClick: onClose
        }, 'Close')
      )
    )
  ));
};

export default FileInfoModal;
