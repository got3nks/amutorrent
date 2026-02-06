/**
 * useCategoryFilterOptions Hook
 *
 * Wraps buildCategoryColumnFilterOptions with context access
 * for unified categories.
 */

import { useMemo } from 'https://esm.sh/react@18.2.0';
import { useStaticData } from '../contexts/StaticDataContext.js';
import { buildCategoryColumnFilterOptions } from '../utils/index.js';

/**
 * Hook for category column filter options
 * Categories are now unified - same list applies to both aMule and rtorrent
 * @returns {Array} Array of filter options
 */
export const useCategoryFilterOptions = () => {
  const { dataCategories } = useStaticData();

  return useMemo(() => buildCategoryColumnFilterOptions({
    categories: dataCategories
  }), [dataCategories]);
};

export default useCategoryFilterOptions;
