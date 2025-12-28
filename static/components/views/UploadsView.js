/**
 * UploadsView Component
 *
 * Displays current uploads with client information
 */

import React from 'https://esm.sh/react@18.2.0';
import { Icon, Table, FlagIcon, PaginationControls, SortControls } from '../common/index.js';
import { formatBytes, formatSpeed, getDynamicFontSize, sortFiles, calculatePagination } from '../../utils/index.js';

const { createElement: h, useMemo } = React;

/**
 * Convert IP address from number to string
 */
const ipToString = (ip) => {
    if (!ip) return 'N/A';
    return [
        (ip & 0xFF),         // lowest byte first
        (ip >>> 8) & 0xFF,
        (ip >>> 16) & 0xFF,
        (ip >>> 24) & 0xFF   // highest byte last
    ].join('.');
};

/**
 * Get client software name from ID
 */
const getClientSoftware = (software) => {
  const softwareMap = {
    0: 'eMule',
    1: 'aMule',
    2: 'xMule',
    3: 'aMule',
    4: 'MLDonkey',
    5: 'Shareaza'
  };
  return softwareMap[software] || 'Unknown';
};

/**
 * Uploads view component
 * @param {Array} uploads - List of current uploads
 * @param {boolean} loading - Loading state
 * @param {function} onRefresh - Refresh handler
 * @param {object} sortConfig - Current sort configuration
 * @param {function} onSortChange - Sort change handler
 * @param {number} page - Current page number
 * @param {function} onPageChange - Page change handler
 * @param {number} pageSize - Items per page
 */
const UploadsView = ({
  uploads,
  loading,
  onRefresh,
  sortConfig,
  onSortChange,
  page,
  onPageChange,
  pageSize
}) => {
  // Memoize sorted data to avoid double sorting
  const sortedUploads = useMemo(() =>
    sortFiles(uploads, sortConfig.sortBy, sortConfig.sortDirection),
    [uploads, sortConfig.sortBy, sortConfig.sortDirection]
  );

  const columns = [
    {
      label: 'File',
      key: 'EC_TAG_PARTFILE_NAME',
      sortable: true,
      width: 'auto',
      render: (item) =>
        h('div', {
          className: 'font-medium break-words whitespace-normal text-sm',
          style: { wordBreak: 'break-word', overflowWrap: 'anywhere' }
        }, item.EC_TAG_PARTFILE_NAME || 'Unknown')
    },
    {
      label: 'Upload Speed',
      key: 'EC_TAG_CLIENT_UP_SPEED',
      sortable: true,
      width: '110px',
      render: (item) => h('span', { className: 'font-mono text-sm text-green-600 dark:text-green-400' }, formatSpeed(item.EC_TAG_CLIENT_UP_SPEED || 0))
    },
    {
      label: 'Client',
      key: 'EC_TAG_CLIENT_NAME',
      sortable: true,
      width: '200px',
      render: (item) =>
        h('div', { className: 'space-y-1' }, [
          h('div', null,
            h('span', { className: 'font-medium text-sm align-baseline' }, getClientSoftware(item.EC_TAG_CLIENT_SOFTWARE)),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 align-baseline ml-1' }, item.EC_TAG_CLIENT_SOFT_VER_STR || 'N/A')
          ),
          h('div', null,
            h('span', { className: 'font-mono text-xs inline-flex items-center gap-1' }, ipToString(item.EC_TAG_CLIENT_USER_IP),
            item.geoData?.countryCode ? h(FlagIcon, {
                countryCode: item.geoData.countryCode,
                size: 16,
                className: 'ml-1',
                title: item.geoData.countryCode
            }) : null,
            item.geoData?.city ? h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 ml-1' }, `(${item.geoData.city})`) : null)
          )
        ])
    },
    {
      label: 'Session Upload',
      key: 'EC_TAG_CLIENT_UPLOAD_SESSION',
      sortable: true,
      width: '100px',
      render: (item) => formatBytes(item.EC_TAG_CLIENT_UPLOAD_SESSION || 0)
    },
    {
      label: 'Total Upload',
      key: 'EC_TAG_CLIENT_UPLOAD_TOTAL',
      sortable: true,
      width: '100px',
      render: (item) => formatBytes(item.EC_TAG_CLIENT_UPLOAD_TOTAL || 0)
    }
  ];

  const { pagesCount, paginatedData } = calculatePagination(
    sortedUploads,
    page,
    pageSize
  );

  return h('div', { className: 'space-y-2 sm:space-y-3' },
    h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Current Uploads (${uploads.length})`),
      h('button', {
        onClick: onRefresh,
        disabled: loading,
        className: 'hidden sm:block px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
      },
        loading ? h('span', { className: 'flex items-center justify-center gap-2' },
          h('div', { className: 'loader' }),
          'Loading...'
        ) : h('span', null,
          h(Icon, { name: 'refresh', size: 16, className: 'inline mr-1' }),
          'Refresh'
        )
      )
    ),
    uploads.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
      loading ? 'Loading uploads...' : 'No active uploads'
    ) : h('div', null,
      // Mobile sort control
      h('div', { className: 'md:hidden flex flex-wrap items-center justify-between gap-2 mb-2' },
        h(SortControls, {
          columns,
          sortBy: sortConfig.sortBy,
          sortDirection: sortConfig.sortDirection,
          onSortChange,
          showLabel: true,
          fullWidth: true
        })
      ),
      // Mobile card view
      h('div', { className: 'block md:hidden space-y-2' },
        paginatedData.map((item, idx) => {
          const fileName = item.EC_TAG_PARTFILE_NAME || 'Unknown';
          const fileSize = item.EC_TAG_PARTFILE_SIZE_FULL;

          return h('div', {
            key: item.EC_TAG_CLIENT_HASH || idx,
            className: `p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700`
          },
            // File name with size
            h('div', {
              className: 'font-medium text-sm mb-2 text-gray-900 dark:text-gray-100',
              style: {
                fontSize: getDynamicFontSize(fileName),
                wordBreak: 'break-all',
                overflowWrap: 'anywhere',
                lineHeight: '1.4'
              }
            },
              fileSize ? `${fileName} (${formatBytes(fileSize)})` : fileName
            ),
            // Upload Speed
            h('div', { className: 'text-xs text-gray-700 dark:text-gray-300 mb-1' },
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Upload Speed: '),
              h('span', { className: 'font-mono text-green-600 dark:text-green-400' }, formatSpeed(item.EC_TAG_CLIENT_UP_SPEED || 0))
            ),
            // Client with IP
            h('div', { className: 'text-xs text-gray-700 dark:text-gray-300 mb-1' },
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Client: '),
              h('span', null, getClientSoftware(item.EC_TAG_CLIENT_SOFTWARE)),
              h('span', { className: 'text-gray-500 dark:text-gray-400 ml-1' }, item.EC_TAG_CLIENT_SOFT_VER_STR || ''),
              h('span', { className: 'text-gray-500 dark:text-gray-400 ml-2' }, '('),
              h('span', { className: 'font-mono' }, ipToString(item.EC_TAG_CLIENT_USER_IP)),
              item.geoData?.countryCode ? h(FlagIcon, {
                  countryCode: item.geoData.countryCode,
                  size: 16,
                  className: 'ml-1',
                  title: item.geoData.countryCode
              }) : null,
              item.geoData?.city ? h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 ml-1' }, item.geoData.city) : null,
              h('span', { className: 'text-gray-500 dark:text-gray-400' }, ')')
            ),
            // Session / Total Upload in one line
            h('div', { className: 'text-xs text-gray-700 dark:text-gray-300' },
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Session Upload: '),
              h('span', null, formatBytes(item.EC_TAG_CLIENT_UPLOAD_SESSION || 0)),
              h('span', { className: 'mx-2 text-gray-400' }, '/'),
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Total Upload: '),
              h('span', null, formatBytes(item.EC_TAG_CLIENT_UPLOAD_TOTAL || 0))
            )
          );
        })
      ),
      // Mobile pagination
      h(PaginationControls, { page, onPageChange, pagesCount, options: { mobileOnly: true } }),
      // Desktop table view
      h('div', { className: 'hidden md:block' },
        h(Table, {
          data: sortedUploads,
          columns,
          actions: null,
          currentSortBy: sortConfig.sortBy,
          currentSortDirection: sortConfig.sortDirection,
          onSortChange,
          page,
          onPageChange,
          pageSize
        })
      )
    )
  );
};

export default UploadsView;
