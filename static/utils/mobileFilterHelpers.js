/**
 * Mobile Filter Helpers
 *
 * Shared functions for building MobileFilterSheet filterGroups configs.
 * Reduces code duplication across views.
 */

/**
 * Create unified category filter group config for MobileFilterSheet
 * Categories are now unified - same list applies to both aMule and rtorrent
 * @param {Object} options
 * @param {Array} options.categories - Unified categories array
 * @param {Array} options.selectedValues - Currently selected filter values
 * @param {Function} options.onToggle - Toggle handler for filter values
 * @returns {Object|false} Filter group config or false if no categories
 */
export const createCategoryLabelFilter = ({
  categories = [],
  selectedValues,
  onToggle
}) => {
  if (!categories || categories.length === 0) return false;

  // Sort categories: Default first, then alphabetically
  const sortedCategories = [...categories].sort((a, b) => {
    const nameA = a.name || a.title || '';
    const nameB = b.name || b.title || '';
    if (nameA === 'Default') return -1;
    if (nameB === 'Default') return 1;
    return nameA.localeCompare(nameB);
  });

  return {
    title: 'Categories',
    options: sortedCategories.map(cat => {
      const name = cat.name || cat.title;
      return {
        value: `category:${name}`,
        label: name
      };
    }),
    selectedValues,
    onToggle
  };
};

/**
 * Create tracker filter group config for MobileFilterSheet
 * @param {Object} options
 * @param {Array} options.trackerOptions - Tracker options array (with value/label)
 * @param {Array} options.selectedValues - Currently selected filter values
 * @param {Function} options.onToggle - Toggle handler for filter values
 * @param {boolean} options.show - Whether to show this filter (default: true)
 * @returns {Object|false} Filter group config or false if hidden
 */
export const createTrackerFilter = ({
  trackerOptions = [],
  selectedValues,
  onToggle,
  show = true
}) => {
  if (!show) return false;

  return {
    title: 'Trackers',
    options: trackerOptions
      .filter(opt => opt.value !== 'all')
      .map(opt => ({
        value: `tracker:${opt.value}`,
        label: opt.label
      })),
    selectedValues,
    onToggle
  };
};

/**
 * Create indexer filter group config for MobileFilterSheet (Prowlarr results)
 * @param {Object} options
 * @param {Array} options.indexerOptions - Indexer options array (with value/label)
 * @param {Array} options.selectedValues - Currently selected filter values
 * @param {Function} options.onToggle - Toggle handler for filter values
 * @param {boolean} options.show - Whether to show this filter (default: true)
 * @returns {Object|false} Filter group config or false if hidden
 */
export const createIndexerFilter = ({
  indexerOptions = [],
  selectedValues,
  onToggle,
  show = true
}) => {
  if (!show || indexerOptions.length <= 2) return false;

  return {
    title: 'Indexers',
    options: indexerOptions
      .filter(opt => opt.value !== 'all')
      .map(opt => ({
        value: `indexer:${opt.value}`,
        label: opt.label
      })),
    selectedValues,
    onToggle
  };
};
