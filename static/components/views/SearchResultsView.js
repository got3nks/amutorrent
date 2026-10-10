/**
 * SearchResultsView Component
 *
 * Displays live search results with download functionality
 * Uses SearchResultsSection for shared display logic
 */

import React from 'https://esm.sh/react@18.2.0';
import { SearchResultsSection, Button } from '../common/index.js';
import { useSearch } from '../../contexts/SearchContext.js';
import { useAppState } from '../../contexts/AppStateContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';

const { createElement: h } = React;

/**
 * Search results view component - live results with New Search button
 */
const SearchResultsView = () => {
  // Get data from contexts
  const { searchResults, searchResultsInstanceId, searchType } = useSearch();
  const { setAppCurrentView } = useAppState();
  const { instances, hasMultiInstance } = useStaticData();

  // Instance badge for multi-instance ED2K/Kad searches. Keyed on the instance
  // that PRODUCED the results, not the live source selection (which changes when
  // the source button changes), so the badge keeps naming the right instance.
  const isAmuleSearch = searchType === 'global' || searchType === 'kad';
  const instanceInfo = isAmuleSearch && hasMultiInstance && searchResultsInstanceId && instances?.[searchResultsInstanceId];
  const instanceName = instanceInfo ? (instanceInfo.name || searchResultsInstanceId) : null;

  // Handler for new search button
  const handleNewSearch = () => {
    setAppCurrentView('search');
  };

  // Mobile New Search button (no icon to save space)
  const mobileNewSearchButton = h(Button, {
    variant: 'primary',
    onClick: handleNewSearch
  }, 'New Search');

  // Desktop New Search button
  const desktopButtons = h(Button, {
    variant: 'primary',
    icon: 'search',
    onClick: handleNewSearch
  }, 'New Search');

  return h('div', { className: 'px-2 sm:px-0' },
    h(SearchResultsSection, {
      title: instanceName ? `Search Results \u2014 ${instanceName}` : 'Search Results',
      mobileTitle: instanceName ? `Results \u2014 ${instanceName}` : 'Search Results',
      results: searchResults,
      extraMobileButtons: mobileNewSearchButton,
      extraDesktopButtons: desktopButtons,
      emptyMessage: 'No results found',
      filterEmptyMessage: 'No results match the filter',
      scrollHeight: 'calc(100vh - 220px)'
    })
  );
};

export default SearchResultsView;
