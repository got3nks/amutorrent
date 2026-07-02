/**
 * QuickSearchWidget Component
 *
 * Quick search form for dashboard with type selector and search input
 */

import React, { useEffect } from 'https://esm.sh/react@18.2.0';
import { Icon, Button, Input, AmuleInstanceSelector, LoadingSpinner } from '../common/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';

const { createElement: h } = React;

/**
 * QuickSearchWidget component
 * @param {string} searchType - Current search type ('global', 'local', 'kad')
 * @param {function} onSearchTypeChange - Search type change handler
 * @param {string} searchQuery - Current search query
 * @param {function} onSearchQueryChange - Search query change handler
 * @param {function} onSearch - Search submit handler
 * @param {boolean} searchLocked - Whether search is in progress
 * @param {boolean} noBorder - Whether to hide the outer border/padding (default: false)
 * @param {string} searchInstanceId - Selected aMule instance ID for search
 * @param {function} onSearchInstanceChange - Instance selection change handler
 * @param {Array} amuleInstances - Connected aMule instances from useAmuleInstanceSelector
 * @param {boolean} showAmuleSelector - Whether to show aMule instance selector
 */
const QuickSearchWidget = ({
  searchType,
  onSearchTypeChange,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchLocked,
  noBorder = false,
  searchInstanceId,
  onSearchInstanceChange,
  amuleInstances = [],
  showAmuleSelector = false
}) => {
  const { isNetworkTypeConnected, prowlarrEnabled, instances } = useStaticData();

  // Connected instances grouped by client type. ED2K Server / Kad are aMule
  // search methods; Rucio is its own source (a single unified rucio + eMule/Kad
  // query). Check by client TYPE rather than networkType, since Rucio shares the
  // 'ed2k' networkType but must not enable the aMule-specific buttons on its own.
  const byType = (t) => Object.entries(instances || {})
    .filter(([, i]) => i.connected && i.type === t)
    .map(([id, i]) => ({ id, type: i.type, name: i.name || t, color: i.color, order: i.order }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const amuleInsts = byType('amule');
  const rucioInsts = byType('rucio');
  const amuleConnected = amuleInsts.length > 0;
  const rucioConnected = rucioInsts.length > 0;
  const bittorrentConnected = isNetworkTypeConnected('bittorrent');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!searchLocked && searchQuery.trim()) {
      onSearch();
    }
  };

  // Search types with availability based on client status
  // - ED2K and Kad require an aMule instance
  // - Rucio requires a Rucio instance
  // - Prowlarr requires prowlarr enabled AND any BitTorrent client connected
  const searchTypes = [
    { value: 'global', label: 'ED2K Server', icon: '/static/logo-brax.png', disabled: !amuleConnected },
    // { value: 'local', label: 'Local', icon: '/static/logo-brax.png', disabled: !amuleConnected }, // Hidden temporarily
    { value: 'kad', label: 'Kad', icon: '/static/logo-brax.png', disabled: !amuleConnected },
    { value: 'rucio', label: 'Rucio', icon: '/static/logo-rucio.svg', disabled: !rucioConnected },
    { value: 'prowlarr', label: 'Prowlarr', icon: '/static/prowlarr.svg', disabled: !prowlarrEnabled || !bittorrentConnected }
  ];

  // Keep the targeted instance consistent with the selected source: a Rucio
  // search must hit a Rucio instance, an ED2K/Kad search an aMule instance.
  const amuleIds = amuleInsts.map(i => i.id).join(',');
  const rucioIds = rucioInsts.map(i => i.id).join(',');
  useEffect(() => {
    // Only views that manage instance selection (e.g. SearchView) pass this;
    // the dashboard quick-search omits it and lets the dispatcher resolve it.
    if (typeof onSearchInstanceChange !== 'function') return;
    if (searchType === 'rucio') {
      if (rucioInsts.length && !rucioInsts.some(i => i.id === searchInstanceId)) {
        onSearchInstanceChange(rucioInsts[0].id);
      }
    } else if (searchType === 'global' || searchType === 'kad') {
      if (amuleInsts.length && !amuleInsts.some(i => i.id === searchInstanceId)) {
        onSearchInstanceChange(amuleInsts[0].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchType, searchInstanceId, amuleIds, rucioIds]);

  const selectedTypeDisabled = searchTypes.find(t => t.value === searchType)?.disabled;

  // Auto-select first available search type when current selection is disabled
  useEffect(() => {
    if (selectedTypeDisabled) {
      const firstAvailable = searchTypes.find(t => !t.disabled);
      if (firstAvailable) {
        onSearchTypeChange(firstAvailable.value);
      }
    }
  }, [selectedTypeDisabled, amuleConnected, bittorrentConnected, prowlarrEnabled]);

  return h('div', {
    className: noBorder ? '' : 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700'
  },
    h('form', {
      onSubmit: handleSubmit,
      className: 'flex flex-col gap-2'
    },
      // Row 1: Search type selector (full width)
      h('div', {
        className: 'flex gap-1'
      },
        ...searchTypes.map(type =>
          h(Button, {
            key: type.value,
            type: 'button',
            variant: searchType === type.value ? 'primary' : 'secondary',
            onClick: () => onSearchTypeChange(type.value),
            disabled: searchLocked || type.disabled,
            className: 'flex-1 justify-center',
            title: type.disabled ? `${type.label} is not available` : undefined
          },
            type.icon
              ? h('span', { className: 'flex items-center gap-1' },
                  h('img', { src: type.icon, alt: type.label, className: 'w-4 h-4' }),
                  type.label
                )
              : `${type.emoji} ${type.label}`
          )
        )
      ),

      // Row 2: Search input + (optional instance selector) + button
      h('div', { className: 'flex gap-2' },
        h(Input, {
          type: 'text',
          value: searchQuery,
          onChange: (e) => onSearchQueryChange(e.target.value),
          placeholder: 'Enter search query...',
          disabled: searchLocked || selectedTypeDisabled,
          className: 'flex-1 min-w-0'
        }),

        // Instance selector — only when 2+ instances of the selected source.
        // ED2K/Kad pick among aMule instances; Rucio among Rucio instances.
        (() => {
          const list = searchType === 'rucio'
            ? rucioInsts
            : (searchType === 'global' || searchType === 'kad') ? amuleInsts : [];
          return typeof onSearchInstanceChange === 'function' && list.length > 1 && h(AmuleInstanceSelector, {
            connectedInstances: list,
            selectedId: searchInstanceId,
            onSelect: onSearchInstanceChange,
            showSelector: true,
            variant: 'dropdown',
            disabled: searchLocked
          });
        })(),

        // Search button
        h(Button, {
          type: 'submit',
          variant: 'primary',
          disabled: searchLocked || !searchQuery.trim() || selectedTypeDisabled,
          className: 'whitespace-nowrap'
        },
          searchLocked
            ? h(LoadingSpinner, { size: 'sm' })
            : h(Icon, { name: 'search', size: 16 }),
          h('span', {}, searchLocked ? 'Searching...' : 'Search')
        )
      )
    )
  );
};

export default QuickSearchWidget;
