/**
 * SearchView Component
 *
 * File search interface with type selection and previous results
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { SearchResultsSection, Icon, AlertBox, LoadingSpinner } from '../common/index.js';
import QuickSearchWidget from '../dashboard/QuickSearchWidget.js';
import { useSearch } from '../../contexts/SearchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useSearchProviderSelector } from '../../hooks/useSearchProviderSelector.js';

const { createElement: h, useEffect } = React;

/**
 * Search view component - search form with cached results
 */
const SearchView = () => {
  // Get data from contexts
  const {
    searchQuery,
    searchType,
    searchLocked,
    searchError,
    searchPreviousResults,
    searchPreviousResultsLoaded,
    searchInstanceId,
    setSearchPreviousResultsLoaded,
    setSearchQuery,
    setSearchType,
    setSearchInstanceId
  } = useSearch();
  const actions = useActions();
  const { fetchPreviousSearchResults } = useDataFetch();
  const {
    connectedInstances: providerInstances,
    showSelector: showProviderSelector,
    selectedId: effectiveProviderInstance,
    selectInstance: selectProviderInstance
  } = useSearchProviderSelector({ searchType, selectedId: searchInstanceId, onSelect: setSearchInstanceId });

  // Fetch previous search results on mount (always fetch fresh from backend)
  useEffect(() => {
    setSearchPreviousResultsLoaded(false);
    fetchPreviousSearchResults(effectiveProviderInstance);
  }, [fetchPreviousSearchResults, setSearchPreviousResultsLoaded, effectiveProviderInstance]);

  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // Search form (reusing QuickSearchWidget without border)
    h('div', null,
      h(QuickSearchWidget, {
        searchType,
        onSearchTypeChange: setSearchType,
        searchQuery,
        onSearchQueryChange: setSearchQuery,
        onSearch: actions.search.perform,
        searchLocked,
        noBorder: true,
        searchInstanceId: effectiveProviderInstance,
        onSearchInstanceChange: selectProviderInstance,
        providerInstances,
        showProviderSelector
      })
    ),

    // Search error message
    searchError && h(AlertBox, { type: 'error', className: 'mb-0' }, searchError),

    // Horizontal divider
    h('hr', { className: 'border-gray-200 dark:border-gray-700' }),

    // Previous Search Results Section
    searchPreviousResults.length > 0
      ? h(SearchResultsSection, {
          title: 'Previous Search Results',
          mobileTitle: 'Previous Search Results',
          results: searchPreviousResults,
          emptyMessage: null,
          filterEmptyMessage: 'No cached results match the filter',
          scrollHeight: 'calc(100vh - 310px)'
        })
      : h('div', { className: 'text-center py-12' },
          searchLocked || !searchPreviousResultsLoaded
            ? h('div', null,
                h('div', { className: 'flex justify-center mb-4' }, h(LoadingSpinner, { size: 'md' })),
                h('p', { className: 'text-gray-500 dark:text-gray-400' }, searchLocked ? 'Searching...' : 'Loading cached results...')
              )
            : h('div', null,
                h(Icon, { name: 'search', size: 48, className: 'mx-auto text-gray-400 mb-4' }),
                h('p', { className: 'text-gray-500 dark:text-gray-400' }, 'No cached search results')
              )
        )
  );
};

export default SearchView;
