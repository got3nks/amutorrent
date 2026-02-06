/**
 * FileInfoModal Component
 *
 * Unified modal for displaying file information.
 * Adapts sections based on item type (rtorrent, amule-download, amule-shared).
 * Looks up live data from context internally — caller only passes a hash.
 */

import React from 'https://esm.sh/react@18.2.0';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useLiveData } from '../../contexts/LiveDataContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { SegmentsBar, Icon, Portal, Button } from '../common/index.js';
import { formatBytes, getProgressColor, getExportLink, getExportLinkLabel } from '../../utils/index.js';
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
  if (variant === 'rtorrent') {
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
      'Data Integrity & Optimization': false
    };
  }
  if (variant === 'amule-download') {
    return {
      'Active Uploads': true,
      'File Identification': true,
      'Source Information': true,
      'Timing & Activity': false,
      'Priority & Category': false,
      'State & Progress': false,
      'Download Statistics': false,
      'Upload Statistics': false,
      'Data Integrity & Optimization': false
    };
  }
  // amule-shared
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
  if (variant === 'rtorrent') {
    const isSeeding = item.status === 'seeding';
    return {
      icon: isSeeding ? 'upload' : 'download',
      title: isSeeding ? 'Seeding Torrent' : 'Downloading Torrent',
      color: isSeeding ? 'green' : 'blue'
    };
  }
  if (variant === 'amule-download') {
    return { icon: 'download', title: 'Download Details', color: 'blue' };
  }
  return { icon: 'upload', title: 'Shared File Details', color: 'green' };
};

/**
 * Get variant string from a unified item
 */
const getVariant = (item) => {
  if (item.client === 'rtorrent') return 'rtorrent';
  if (item.downloading) return 'amule-download';
  return 'amule-shared';
};

/**
 * Unified file info modal
 * @param {string|null} hash - File hash to display (null = hidden)
 * @param {function} onClose - Close handler
 */
const FileInfoModal = ({ hash, onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { dataItems } = useLiveData();
  const { dataCategories } = useStaticData();
  const { copyStatus, handleCopy } = useCopyToClipboard();

  // Look up live item by hash (case-insensitive)
  const liveItem = hash
    ? dataItems.find(i => i.hash?.toLowerCase() === hash.toLowerCase())
    : null;

  const variant = liveItem ? getVariant(liveItem) : null;

  // Expanded sections state — resets when hash or variant changes
  const [expandedSections, setExpandedSections] = useState(() =>
    getDefaultExpanded(variant || 'rtorrent')
  );

  useEffect(() => {
    if (variant) {
      setExpandedSections(getDefaultExpanded(variant));
    }
  }, [hash, variant]);

  // Files state (rtorrent multi-file only)
  const [files, setFiles] = useState(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(null);

  // Fetch files when modal opens for multi-file rtorrent items, refresh periodically
  useEffect(() => {
    if (!hash || !liveItem || variant !== 'rtorrent') {
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
        const response = await fetch(`/api/rtorrent/files/${liveItem.hash}`);
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

  // Item disappeared while modal open — auto-close
  if (!liveItem) return null;

  // Raw data for categorized fields:
  // - rtorrent: raw contains camelCase fields (hash, name, size, etc.)
  // - aMule: EC_TAG_ fields may be at liveItem.raw (if set from download.raw)
  //   or nested at liveItem.raw.raw (if raw was overwritten by shared file data).
  //   Resolve to whichever level has EC_TAG_ keys.
  const rawFull = liveItem.raw || {};
  const ecTagSource = variant !== 'rtorrent' && rawFull.raw && typeof rawFull.raw === 'object'
    ? rawFull.raw
    : rawFull;
  const raw = variant === 'rtorrent'
    ? rawFull
    : Object.fromEntries(Object.entries(ecTagSource).filter(([k]) => k.startsWith('EC_TAG_')));

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

  // rtorrent
  const isComplete = variant === 'rtorrent' && liveItem.progress >= 100;
  const torrentMessage = variant === 'rtorrent' ? (liveItem.message || '') : '';
  const trackersDetailed = variant === 'rtorrent' ? (liveItem.trackersDetailed || []) : [];
  const peersDetailedRt = variant === 'rtorrent' ? (liveItem.peersDetailed || []) : [];

  // amule (shared or downloading with active upload peers)
  const peersDetailedAmule = (variant === 'amule-shared' || variant === 'amule-download')
    ? (liveItem.activeUploads || []) : [];

  // --- Categorized fields ---
  let categorizedFields = {};

  if (variant === 'rtorrent') {
    const allFields = categorizeDownloadFields(raw);
    const categoryOrder = isComplete
      ? [
          'File Identification', 'Source Information', 'State & Progress',
          'Upload Statistics', 'Timing & Activity', 'Priority & Category',
          'Data Integrity & Optimization'
        ]
      : [
          'File Identification', 'Source Information', 'State & Progress',
          'Download Statistics', 'Upload Statistics', 'Timing & Activity',
          'Priority & Category', 'Data Integrity & Optimization'
        ];
    categorizedFields = Object.fromEntries(
      categoryOrder
        .filter(c => allFields[c] && allFields[c].length > 0)
        .map(c => [c, allFields[c]])
    );
  } else if (variant === 'amule-download') {
    const allFields = categorizeDownloadFields(raw);
    const categoryOrder = [
      'File Identification', 'Source Information', 'State & Progress',
      'Download Statistics', 'Upload Statistics', 'Timing & Activity',
      'Priority & Category', 'Data Integrity & Optimization'
    ];
    categorizedFields = Object.fromEntries(
      categoryOrder
        .filter(c => allFields[c] && allFields[c].length > 0)
        .map(c => [c, allFields[c]])
    );
  } else {
    // amule-shared
    const allFields = categorizeSharedFields(raw);
    const categoryOrder = ['File Identification', 'Upload Statistics', 'Source Information'];
    categorizedFields = Object.fromEntries(
      categoryOrder
        .filter(c => allFields[c] && allFields[c].length > 0)
        .map(c => [c, allFields[c]])
    );
  }

  const categories = variant === 'amule-download' ? dataCategories : [];

  return h(Portal, null,
    h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4',
      onClick: onClose
    },
    h('div', {
      className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden',
      onClick: (e) => e.stopPropagation()
    },
      // Header
      h(InfoModalHeader, {
        icon: headerConfig.icon,
        title: headerConfig.title,
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

        // --- rtorrent: Progress bar (only if not complete) ---
        variant === 'rtorrent' && !isComplete && h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700' },
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

        // --- amule-download: Segments visualization ---
        variant === 'amule-download' && liveItem.partStatus && h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 sm:p-4 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' }, 'Segments'),
          h('div', { className: 'w-full overflow-hidden rounded' },
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

        // --- rtorrent: Quick stats grid ---
        variant === 'rtorrent' && h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3' },
          h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1' }, 'Size'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100' },
              formatBytes(liveItem.size)
            )
          ),
          h('div', { className: 'bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-orange-600 dark:text-orange-400 mb-0.5 sm:mb-1' }, 'Label'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-orange-700 dark:text-orange-300' },
              liveItem.category || '(none)'
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
              liveItem.ratio != null ? liveItem.ratio.toFixed(2) : '-'
            )
          )
        ),

        // --- amule-shared: Quick stats grid ---
        variant === 'amule-shared' && h('div', { className: 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3' },
          h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1' }, 'Size'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100' },
              formatBytes(liveItem.size)
            )
          ),
          h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1' }, 'Priority'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100' },
              formatPriority(liveItem.uploadPriority)
            )
          ),
          h('div', { className: 'bg-green-50 dark:bg-green-900/20 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-green-600 dark:text-green-400 mb-0.5 sm:mb-1' }, 'Session Upload'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-green-700 dark:text-green-300' },
              formatBytes(liveItem.uploadSession)
            ),
            h('div', { className: 'text-xs text-green-600 dark:text-green-400' },
              `${liveItem.requestsAccepted} requests`
            )
          ),
          h('div', { className: 'bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 sm:p-3' },
            h('div', { className: 'text-xs text-blue-600 dark:text-blue-400 mb-0.5 sm:mb-1' }, 'Total Upload'),
            h('div', { className: 'text-sm sm:text-base font-semibold text-blue-700 dark:text-blue-300' },
              formatBytes(liveItem.uploadTotal)
            ),
            h('div', { className: 'text-xs text-blue-600 dark:text-blue-400' },
              `${liveItem.requestsAcceptedTotal} requests`
            )
          )
        ),

        // --- rtorrent: Message/error section ---
        variant === 'rtorrent' && torrentMessage && h('div', {
          className: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 sm:p-4'
        },
          h('div', { className: 'flex items-start gap-2' },
            h(Icon, { name: 'alertCircle', size: 18, className: 'text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5' }),
            h('div', null,
              h('span', { className: 'text-xs sm:text-sm font-medium text-red-700 dark:text-red-300' }, 'Message'),
              h('p', { className: 'text-xs sm:text-sm text-red-600 dark:text-red-400 mt-1' }, torrentMessage)
            )
          )
        ),

        // --- rtorrent: Files section (multi-file only) ---
        variant === 'rtorrent' && (files || filesLoading) && h(CollapsibleTableSection, {
          title: 'Files',
          count: files ? files.length : '...',
          expanded: expandedSections['Files'],
          onToggle: () => toggleSection('Files')
        }, h(FilesTreeSection, { files, loading: filesLoading, error: filesError })),

        // --- rtorrent: Peers section ---
        variant === 'rtorrent' && peersDetailedRt.length > 0 && h(CollapsibleTableSection, {
          title: 'Peers',
          count: peersDetailedRt.length,
          expanded: expandedSections['Peers'],
          onToggle: () => toggleSection('Peers')
        }, h(PeersTable, { peers: peersDetailedRt })),

        // --- rtorrent: Trackers section ---
        variant === 'rtorrent' && trackersDetailed.length > 0 && h(CollapsibleTableSection, {
          title: 'Trackers',
          count: trackersDetailed.length,
          expanded: expandedSections['Trackers'],
          onToggle: () => toggleSection('Trackers')
        }, h(TrackersTable, { trackers: trackersDetailed })),

        // --- amule: Active Uploads (peers) section ---
        (variant === 'amule-shared' || variant === 'amule-download') && peersDetailedAmule.length > 0 && h(CollapsibleTableSection, {
          title: 'Active Uploads',
          count: peersDetailedAmule.length,
          expanded: expandedSections['Active Uploads'],
          onToggle: () => toggleSection('Active Uploads')
        }, h(PeersTable, { peers: peersDetailedAmule, isAmule: true })),

        // --- All variants: Categorized fields ---
        Object.entries(categorizedFields).map(([category, fields]) =>
          h(CategoryFieldsSection, {
            key: category,
            category,
            fields,
            expanded: expandedSections[category],
            onToggle: () => toggleSection(category),
            categories
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
