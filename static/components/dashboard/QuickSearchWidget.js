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

  // Connected instances (config order), each carrying the search sources it
  // serves (clientMeta `searchSources`, shipped via instances[id].capabilities).
  const connectedInsts = Object.entries(instances || {})
    .filter(([, i]) => i.connected)
    .map(([id, i]) => ({ id, type: i.type, name: i.name || i.type, color: i.color, order: i.order ?? 0, searchSources: i.capabilities?.searchSources || [] }))
    .sort((a, b) => a.order - b.order);

  // Connected instances that serve a given search source value.
  const instancesForSource = (value) => connectedInsts.filter(i => i.searchSources.some(s => s.value === value));

  // Distinct client search sources across all connected instances, in instance
  // order — a new searchable network contributes its own, no edit here.
  const clientSources = [];
  const seenSource = new Set();
  for (const inst of connectedInsts) {
    for (const s of inst.searchSources) {
      if (!seenSource.has(s.value)) { seenSource.add(s.value); clientSources.push(s); }
    }
  }

  const bittorrentConnected = isNetworkTypeConnected('bittorrent');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!searchLocked && searchQuery.trim()) {
      onSearch();
    }
  };

  // One button per client search source (always available — they only appear
  // while a serving instance is connected), plus Prowlarr: an external indexer
  // that rides the BitTorrent clients, not a network of its own.
  const searchTypes = [
    ...clientSources.map(s => ({ value: s.value, label: s.label, icon: s.icon || null, disabled: false })),
    { value: 'prowlarr', label: 'Prowlarr', icon: '/static/prowlarr.svg', disabled: !prowlarrEnabled || !bittorrentConnected }
  ];

  // Keep the targeted instance consistent with the selected source: if the
  // current pick doesn't serve it, jump to the first that does.
  const sourceInstanceIds = instancesForSource(searchType).map(i => i.id).join(',');
  useEffect(() => {
    // Only views that manage instance selection (e.g. SearchView) pass this;
    // the dashboard quick-search omits it and lets the dispatcher resolve it.
    if (typeof onSearchInstanceChange !== 'function') return;
    const serving = instancesForSource(searchType);
    if (serving.length && !serving.some(i => i.id === searchInstanceId)) {
      onSearchInstanceChange(serving[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchType, searchInstanceId, sourceInstanceIds]);

  const selectedTypeDisabled = searchTypes.find(t => t.value === searchType)?.disabled;

  // Auto-select first available search type when current selection is disabled
  useEffect(() => {
    if (selectedTypeDisabled) {
      const firstAvailable = searchTypes.find(t => !t.disabled);
      if (firstAvailable) {
        onSearchTypeChange(firstAvailable.value);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypeDisabled, bittorrentConnected, prowlarrEnabled]);

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

        // Instance selector — only when 2+ instances serve the selected source.
        (() => {
          const list = searchType === 'prowlarr' ? [] : instancesForSource(searchType);
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
