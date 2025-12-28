/**
 * DownloadsView Component
 *
 * Displays current downloads with progress, categorization, and ED2K link input
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, Tooltip, MobileCardView, PaginationControls, SortControls, SegmentsBar } from '../common/index.js';
import { formatBytes, formatSpeed, getDynamicFontSize, getProgressColor, getCategoryColorStyle, sortFiles, formatDateTime, formatLastSeenComplete, getTimeBasedColor, calculatePagination } from '../../utils/index.js';

const { createElement: h, useMemo, useState } = React;

/**
 * Progress Bar Cell Component (Desktop)
 * Shows simple progress bar normally, segmented bar on hover
 */
const ProgressBarCell = ({ item }) => {
  const [isHovered, setIsHovered] = useState(false);

  return h('div', {
    className: 'w-full min-w-[160px]',
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false)
  },
    h('div', { className: 'w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 relative overflow-hidden' },
      // Show segmented bar on hover, simple bar otherwise
      isHovered
        ? h(SegmentsBar, {
            fileSize: parseInt(item.fileSize),
            fileSizeDownloaded: parseInt(item.fileSizeDownloaded),
            partStatus: item.partStatus,
            gapStatus: item.gapStatus,
            reqStatus: item.reqStatus,
            sourceCount: parseInt(item.sourceCount),
            width: 280,
            height: 20
          })
        : h('div', {
            className: `h-full rounded-full transition-all duration-300 ${getProgressColor(item.progress)}`,
            style: { width: `${item.progress}%` }
          }),
      // Progress percentage text overlay with black outline
      h('span', {
        className: 'absolute inset-0 flex items-center justify-center text-xs font-bold text-white pointer-events-none',
        style: {
          WebkitTextStroke: '1px black',
          paintOrder: 'stroke fill'
        }
      },
        `${item.progress}%`
      )
    )
  );
};

/**
 * Progress Bar Cell Component (Mobile)
 * Shows simple progress bar normally, segmented bar on hover, with file size info
 */
const MobileProgressBarCell = ({ item }) => {
  const [isHovered, setIsHovered] = useState(false);

  return h('div', {
    className: 'w-full mb-2',
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onTouchStart: () => setIsHovered(true),
    onTouchEnd: () => setTimeout(() => setIsHovered(false), 2000)
  },
    h('div', { className: 'w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 relative overflow-hidden' },
      // Show segmented bar on hover/touch, simple bar otherwise
      isHovered
        ? h(SegmentsBar, {
            fileSize: parseInt(item.fileSize),
            fileSizeDownloaded: parseInt(item.fileSizeDownloaded),
            partStatus: item.partStatus,
            gapStatus: item.gapStatus,
            reqStatus: item.reqStatus,
            sourceCount: parseInt(item.sourceCount),
            width: 400,
            height: 20
          })
        : h('div', {
            className: `h-full rounded-full transition-all duration-300 ${getProgressColor(item.progress)}`,
            style: { width: `${item.progress}%` }
          }),
      // Progress percentage and size info text overlay with black outline
      h('span', {
        className: 'absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-bold text-white pointer-events-none',
        style: {
          WebkitTextStroke: '0.5px black',
          paintOrder: 'stroke fill'
        }
      },
        `${item.progress}% (${formatBytes(item.fileSizeDownloaded)} / ${formatBytes(item.fileSize)})`
      )
    )
  );
};

/**
 * Format source count display with detailed breakdown
 * @param {Object} item - Download item with source counts
 * @returns {string} Formatted source display
 */
const formatSourceDisplay = (item) => {
  const {
    sourceCount = 0,
    sourceCountNotCurrent = 0,
    sourceCountXfer = 0,
    sourceCountA4AF = 0
  } = item;

  let display = '';

  // Main source count display
  if (sourceCountNotCurrent !== 0) {
    const current = sourceCount - sourceCountNotCurrent;
    display = `${current}/${sourceCount}`;
  } else {
    display = `${sourceCount}`;
  }

  // Active transfers
  display += ` (${sourceCountXfer})`;

  // A4AF sources (Asked For Another File)
  if (sourceCountA4AF !== 0) {
    display += ` +${sourceCountA4AF}`;
  }

  return display;
};

/**
 * Downloads view component
 * @param {Array} downloads - List of downloads
 * @param {boolean} loading - Loading state
 * @param {function} onRefresh - Refresh handler
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {Array} categories - Categories list
 * @param {function} onSetFileCategory - Set file category handler (fileHash, fileName, currentCategoryId)
 * @param {function} onDelete - Delete handler (fileHash, fileName)
 * @param {function} onPauseDownload - Pause download handler (fileHash)
 * @param {function} onResumeDownload - Resume download handler (fileHash)
 * @param {string} ed2kLinks - ED2K links input value
 * @param {function} onEd2kLinksChange - ED2K links change handler
 * @param {number} selectedCategoryId - Selected category ID for new downloads
 * @param {function} onSelectedCategoryIdChange - Selected category change handler
 * @param {function} onAddEd2kLinks - Add ED2K links handler (links, isServerList)
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 * @param {number} filterCategoryId - Selected category ID for filtering downloads
 * @param {function} onFilterCategoryChange - Filter category change handler
 */
const DownloadsView = ({
  downloads,
  loading,
  onRefresh,
  sortConfig,
  onSortChange,
  categories,
  onSetFileCategory,
  onDelete,
  onPauseDownload,
  onResumeDownload,
  ed2kLinks,
  onEd2kLinksChange,
  selectedCategoryId,
  onSelectedCategoryIdChange,
  onAddEd2kLinks,
  page,
  onPageChange,
  pageSize,
  filterCategoryId,
  onFilterCategoryChange
}) => {
  const columns = [
    {
      label: 'File Name',
      key: 'fileName',
      sortable: true,
      width: 'auto',
      render: (item) =>
        h('div', {
          className: 'font-medium break-words whitespace-normal',
          style: { wordBreak: 'break-word', overflowWrap: 'anywhere' }
        }, item.fileName)
    },
    {
      label: 'Progress',
      key: 'progress',
      sortable: true,
      width: '180px',
      render: (item) => {
        // Create a component to manage hover state
        return h(ProgressBarCell, { item });
      }
    },
    {
      label: 'Size',
      key: 'fileSize',
      sortable: true,
      width: '100px',
      render: (item) => formatBytes(item.fileSize)
    },
    {
      label: 'Sources',
      key: 'sourceCount',
      sortable: true,
      width: '120px',
      render: (item) => {
        const sourceText = formatSourceDisplay(item);
        const colorClass = getTimeBasedColor(item.lastSeenComplete);
        const formattedLastSeen = formatLastSeenComplete(item.lastSeenComplete);

        // Tooltip shows only last seen complete
        const tooltipContent = `Last seen complete: ${formattedLastSeen}`;

        return h(Tooltip, {
          content: tooltipContent,
          position: 'top'
        },
          h('span', {
            className: `${colorClass} cursor-help font-mono text-sm`
          }, sourceText)
        );
      }
    },
    {
      label: 'Speed',
      key: 'speed',
      sortable: true,
      width: '100px',
      render: (item) => h('span', { className: 'font-mono text-blue-600 dark:text-blue-400' }, formatSpeed(item.speed))
    },
    {
      label: 'Category',
      key: 'category',
      sortable: true,
      width: '140px',
      render: (item) => {
        const catId = item.category || 0;
        const cat = categories.find(c => c.id === catId);
        const categoryName = catId === 0 ? 'Default (all)' : (cat?.title || 'Unknown');
        const categoryColor = cat?.color || 0xCCCCCC;

        return h('button', {
          onClick: () => onSetFileCategory(item.fileHash, item.fileName, catId),
          title: 'Click to change category',
          className: 'text-sm px-2 py-1 rounded flex items-center gap-1 hover:opacity-80 transition-opacity'
        },
          h('div', {
            className: 'w-3 h-3 rounded border border-gray-300 dark:border-gray-600',
            style: { backgroundColor: `#${categoryColor.toString(16).padStart(6, '0')}` }
          }),
          h('span', null, categoryName)
        );
      }
    }
  ];

  // Memoize filtered downloads
  const filteredDownloads = useMemo(() =>
    filterCategoryId === 0
      ? downloads
      : downloads.filter(download => (download.category || 0) === filterCategoryId),
    [downloads, filterCategoryId]
  );

  // Memoize sorted data to avoid double sorting
  const sortedFilteredDownloads = useMemo(() =>
    sortFiles(filteredDownloads, sortConfig.sortBy, sortConfig.sortDirection, true),
    [filteredDownloads, sortConfig.sortBy, sortConfig.sortDirection]
  );

  const { pagesCount, paginatedData } = calculatePagination(
    sortedFilteredDownloads,
    page,
    pageSize
  );

  return h('div', { className: 'space-y-2 sm:space-y-3' },
    h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Current Downloads (${filteredDownloads.length})`),
      h('div', { className: 'hidden sm:flex gap-2 w-full sm:w-auto' },
        h('select', {
          value: filterCategoryId,
          onChange: (e) => onFilterCategoryChange(parseInt(e.target.value)),
          className: 'px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-full sm:w-auto'
        },
          h('option', { value: 0 }, 'All Categories'),
          ...categories.filter(cat => cat.id !== 0).map(cat =>
            h('option', { key: cat.id, value: cat.id }, cat.title)
          )
        ),
        h('button', {
          onClick: onRefresh,
          disabled: loading,
          className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base'
        },
          loading ? h('span', { className: 'flex items-center justify-center gap-2' },
            h('div', { className: 'loader' }),
            'Loading...'
          ) : h('span', null,
            h(Icon, { name: 'refresh', size: 16, className: 'inline mr-1' }),
            'Refresh'
          )
        )
      )
    ),

    // Mobile sort and category controls (always visible)
    h('div', { className: 'md:hidden flex flex-wrap items-center gap-2 mb-2' },
      h(SortControls, {
        columns,
        sortBy: sortConfig.sortBy,
        sortDirection: sortConfig.sortDirection,
        onSortChange,
        showLabel: true,
        fullWidth: true,
        className: 'flex-1'
      }),
      h('div', { className: 'flex items-center gap-2 flex-1' },
        h('label', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' }, 'Cat:'),
        h('select', {
          value: filterCategoryId,
          onChange: (e) => onFilterCategoryChange(parseInt(e.target.value)),
          className: 'flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        },
          h('option', { value: 0 }, 'All'),
          ...categories.filter(cat => cat.id !== 0).map(cat =>
            h('option', { key: cat.id, value: cat.id }, cat.title)
          )
        )
      )
    ),

    filteredDownloads.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
      loading ? 'Loading downloads...' : (filterCategoryId === 0 ? 'No active downloads' : 'No downloads in this category')
    ) : h('div', null,
      // Mobile card view
      h(MobileCardView, {
        data: paginatedData,
        columns,
        actions: (item) => [
          h('button', {
            onClick: () => onSetFileCategory(item.fileHash, item.fileName, item.category || 0),
            className: 'flex-shrink-0 p-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors',
            title: 'Change category'
          },
            h(Icon, { name: 'folder', size: 16, className: 'text-yellow-600 dark:text-yellow-400' })
          ),
          h('button', {
            onClick: () => onDelete(item.fileHash, item.fileName),
            className: 'flex-shrink-0 p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors',
            title: 'Delete'
          },
            h(Icon, { name: 'trash', size: 16, className: 'text-red-600 dark:text-red-400' })
          )
        ],
        options: {
          customRender: (item, idx) => {
            const catId = item.category || 0;
            const cat = categories.find(c => c.id === catId);
            const isDefault = catId === 0;
            const categoryColorStyle = getCategoryColorStyle(cat, isDefault);

            return h('div', {
              className: `p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700 relative overflow-hidden`,
              style: categoryColorStyle || {}
            },
              // Header with file name, folder and delete buttons
              h('div', { className: 'flex items-start gap-2 mb-2' },
                h('div', {
                  className: 'flex-1 font-medium text-gray-900 dark:text-gray-100 min-w-0',
                  style: {
                    fontSize: getDynamicFontSize(item.fileName),
                    wordBreak: 'break-all',
                    overflowWrap: 'anywhere',
                    hyphens: 'auto',
                    lineHeight: '1.4'
                  }
                },
                  item.fileName
                ),
                // Pause/Resume button
                (() => {
                  const isPaused = item.status === 7;
                  return h('button', {
                    onClick: () => isPaused ? onResumeDownload(item.fileHash) : onPauseDownload(item.fileHash),
                    className: `flex-shrink-0 p-1.5 rounded-lg ${isPaused ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50'} transition-colors`,
                    title: isPaused ? 'Resume download' : 'Pause download'
                  },
                    h(Icon, {
                      name: isPaused ? 'play' : 'pause',
                      size: 16,
                      className: isPaused ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                    })
                  );
                })(),
                h('button', {
                  onClick: () => onSetFileCategory(item.fileHash, item.fileName, item.category || 0),
                  className: 'flex-shrink-0 p-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors',
                  title: 'Change category'
                },
                  h(Icon, { name: 'folder', size: 16, className: 'text-yellow-600 dark:text-yellow-400' })
                ),
                h('button', {
                  onClick: () => onDelete(item.fileHash, item.fileName),
                  className: 'flex-shrink-0 p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors',
                  title: 'Delete'
                },
                  h(Icon, { name: 'trash', size: 16, className: 'text-red-600 dark:text-red-400' })
                )
              ),
              // Progress bar with size info inside - use ProgressBarCell for hover effect
              h(MobileProgressBarCell, { item }),
              // Sources and Speed in one line
              h('div', { className: 'flex justify-between text-xs text-gray-700 dark:text-gray-300' },
                h('div', null,
                  h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Sources: '),
                  (() => {
                    const sourceText = formatSourceDisplay(item);
                    const colorClass = getTimeBasedColor(item.lastSeenComplete);
                    const formattedLastSeen = formatLastSeenComplete(item.lastSeenComplete);

                    // Tooltip shows only last seen complete
                    const tooltipContent = `Last seen complete: ${formattedLastSeen}`;

                    return h(Tooltip, {
                      content: tooltipContent,
                      position: 'right'
                    },
                      h('span', {
                        className: `${colorClass} cursor-help font-mono`
                      }, sourceText)
                    );
                  })()
                ),
                h('div', null,
                  h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Speed: '),
                  h('span', { className: 'font-mono text-blue-600 dark:text-blue-400' }, formatSpeed(item.speed))
                )
              )
            );
          }
        }
      }),
      // Mobile pagination
      h(PaginationControls, { page, onPageChange, pagesCount, options: { mobileOnly: true } }),
      // Desktop table view
      h('div', { className: 'hidden md:block overflow-x-auto overflow-y-visible' },
        h(Table, {
          data: sortedFilteredDownloads,
          columns,
          actions: (item) => {
            // Check if file is paused (status 7 = paused)
            const isPaused = item.status === 7;

            return h('div', { className: 'flex gap-1' },
              // Pause/Resume button
              h('button', {
                onClick: () => isPaused ? onResumeDownload(item.fileHash) : onPauseDownload(item.fileHash),
                className: `p-1.5 rounded ${isPaused ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50'} transition-colors`,
                title: isPaused ? 'Resume download' : 'Pause download'
              },
                h(Icon, {
                  name: isPaused ? 'play' : 'pause',
                  size: 14,
                  className: isPaused ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                })
              ),
              // Delete button
              h('button', {
                onClick: () => onDelete(item.fileHash, item.fileName),
                className: 'p-1.5 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors',
                title: 'Delete download'
              },
                h(Icon, { name: 'trash', size: 14, className: 'text-red-600 dark:text-red-400' })
              )
            );
          },
          currentSortBy: sortConfig.sortBy,
          currentSortDirection: sortConfig.sortDirection,
          onSortChange,
          page,
          onPageChange,
          pageSize
        })
      )
    ),

    // ED2K download link form
    h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mt-3' },
      h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' },
        'Add download from ED2K link:'
      ),
      h('div', { className: 'flex gap-2' },
        h('textarea', {
          value: ed2kLinks,
          onChange: (e) => onEd2kLinksChange(e.target.value),
          placeholder: 'ed2k://|file|... (multiple ED2K links can be pasted, one per line)',
          rows: 2,
          className: 'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y',
          disabled: loading
        }),
        h('div', { className: 'flex flex-col gap-2 min-w-[140px]' },
          h('select', {
            value: selectedCategoryId,
            onChange: (e) => onSelectedCategoryIdChange(parseInt(e.target.value)),
            className: 'px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500',
            disabled: loading,
            title: 'Select category for new downloads'
          },
            h('option', { value: 0 }, 'Default (all)'),
            ...categories.filter(cat => cat.id !== 0).map(cat =>
              h('option', { key: cat.id, value: cat.id }, cat.title)
            )
          ),
          h('button', {
            onClick: () => onAddEd2kLinks(ed2kLinks, false),
            disabled: loading || !ed2kLinks.trim(),
            className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all active:scale-95 text-sm font-medium'
          }, loading ? 'Adding...' : 'Add Download')
        )
      )
    )
  );
};

export default DownloadsView;
