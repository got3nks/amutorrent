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

const { createElement: h } = React;

/**
 * Search results view component - live results with New Search button
 */
const SearchResultsView = () => {
  // Get data from contexts
  const { searchResults } = useSearch();
  const { setAppCurrentView } = useAppState();

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
  const desktopNewSearchButton = h(Button, {
    variant: 'primary',
    icon: 'search',
    onClick: handleNewSearch
  }, 'New Search');

  return h('div', { className: 'px-2 sm:px-0' },
    h(SearchResultsSection, {
      title: 'Search Results',
      mobileTitle: 'Search Results',
      results: searchResults,
      extraMobileButtons: mobileNewSearchButton,
      extraDesktopButtons: desktopNewSearchButton,
      emptyMessage: 'No results found',
      filterEmptyMessage: 'No results match the filter',
      scrollHeight: 'calc(100vh - 220px)'
    })
  );
};

export default SearchResultsView;
