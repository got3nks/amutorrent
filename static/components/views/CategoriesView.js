/**
 * CategoriesView Component
 *
 * Displays unified category management interface
 * Shows all categories (both aMule-linked and rtorrent-only)
 * Manages its own modals: categoryEditModal, categoryDeleteModal
 * Uses contexts directly for all data and actions
 */

import React from 'https://esm.sh/react@18.2.0';
import { Table, MobileSortButton, Button, IconButton, Icon, ClientIcon, AlertBox, Tooltip } from '../common/index.js';
import { DEFAULT_SORT_CONFIG, VIEW_TITLE_STYLES } from '../../utils/index.js';
import { useModal, useTableState } from '../../hooks/index.js';
import { useStickyToolbar } from '../../contexts/StickyHeaderContext.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { useDataFetch } from '../../contexts/DataFetchContext.js';
import { useActions } from '../../contexts/ActionsContext.js';
import CategoryModal from '../modals/CategoryModal.js';
import DeleteCategoryModal from '../modals/DeleteCategoryModal.js';

const { createElement: h, useState, useEffect, useCallback, useMemo, useRef } = React;

/**
 * Categories view component - now uses contexts directly
 */
const CategoriesView = () => {
  // Get data from contexts
  const { dataCategories, dataLoaded, clientDefaultPaths, hasCategoryPathWarnings } = useStaticData();
  const { fetchCategories } = useDataFetch();
  const actions = useActions();

  // State for Docker detection (fetched from API)
  const [isDocker, setIsDocker] = useState(false);
  const isDockerFetched = useRef(false);

  // Only fetch categories if not already loaded
  useEffect(() => {
    if (!dataLoaded.categories) {
      fetchCategories();
    }
  }, [dataLoaded.categories, fetchCategories]);

  // Fetch Docker status on mount
  useEffect(() => {
    if (isDockerFetched.current) return;
    isDockerFetched.current = true;

    fetch('/api/config/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.isDocker) {
          setIsDocker(true);
        }
      })
      .catch(() => {
        // Silently fail - not critical
      });
  }, []);

  // Stable reference for sort options
  const sortOptions = useMemo(() => ({ keepDefaultFirst: true }), []);

  // Use table state hook for sorting and pagination (no text filtering)
  // keepDefaultFirst ensures Default category is always at the top
  const {
    sortedData: sortedCategories,
    loadedData,
    sortConfig,
    onSortChange,
    loadedCount,
    hasMore,
    remaining,
    loadMore,
    loadAll,
    resetLoaded,
    pageSize,
    onPageSizeChange
  } = useTableState({
    data: dataCategories,
    viewKey: 'categories',
    sortOptions
  });

  // Local state (was in CategoryContext, but only used by this view)
  const [categoryFormData, setCategoryFormData] = useState({
    title: '',
    path: '',
    color: '#CCCCCC',
    comment: '',
    priority: 0
  });

  // Aliases for readability
  const categories = dataCategories;
  const categoryState = { formData: categoryFormData }; // For modal compatibility

  const [error, setError] = useState(null);

  // Modal state management
  const { modal: categoryEditModal, open: openCategoryEditModal, close: closeCategoryEditModal } = useModal({
    mode: 'create',
    category: null
  });

  const { modal: categoryDeleteModal, open: openCategoryDeleteModal, close: closeCategoryDeleteModal } = useModal({
    categoryName: '',
    categoryId: null,
    categoryDisplayName: ''
  });

  // Modal handlers
  const handleCreateCategory = () => {
    // Reset form data for new category
    setCategoryFormData({
      title: '',
      path: '',
      color: '#CCCCCC',
      comment: '',
      priority: 0
    });
    openCategoryEditModal({ mode: 'create', category: null });
  };

  const handleEditCategory = (category) => {
    // Set form data from existing category (use hexColor for UI display)
    setCategoryFormData({
      title: category.title,
      path: category.path || '',
      color: category.hexColor || '#CCCCCC',
      comment: category.comment || '',
      priority: category.priority
    });
    openCategoryEditModal({ mode: 'edit', category });
  };

  const handleDeleteCategory = (categoryName, displayName) => {
    openCategoryDeleteModal({ categoryName, categoryId: null, categoryDisplayName: displayName });
  };

  const handleCategoryCreate = (...args) => {
    actions.categories.create(...args);
    closeCategoryEditModal();
  };

  const handleCategoryUpdate = (...args) => {
    actions.categories.update(...args);
    closeCategoryEditModal();
  };

  const handleCategoryDeleteConfirm = () => {
    // Use name-based deletion for unified categories
    actions.categories.delete(categoryDeleteModal.categoryName);
    closeCategoryDeleteModal();
  };

  const priorityMap = {
    0: { label: 'Normal', color: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200' },
    1: { label: 'High', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    2: { label: 'Low', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    3: { label: 'Auto', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' }
  };

  // Helper to format path mappings for display
  const formatPathMappings = useCallback((pathMappings) => {
    if (!pathMappings) return null;
    const parts = [];
    if (pathMappings.amule) parts.push({ client: 'amule', path: pathMappings.amule });
    if (pathMappings.rtorrent) parts.push({ client: 'rtorrent', path: pathMappings.rtorrent });
    return parts.length > 0 ? parts : null;
  }, []);

  // Helper to render path warning indicator (inline icon only, message in tooltip)
  const renderPathWarningIcon = useCallback((warning) => {
    if (!warning) return null;
    return h(Tooltip, { content: warning, position: 'top' },
      h(Icon, {
        name: 'alertTriangle',
        size: 14,
        className: 'text-amber-500 flex-shrink-0 cursor-help'
      })
    );
  }, []);

  const columns = [
    {
      label: 'Name',
      key: 'title',
      sortable: true,
      width: 'auto',
      render: (item) => {
        const displayColor = item.hexColor || '#CCCCCC';
        return h('div', { className: 'font-medium flex items-center gap-2' },
          h('div', {
            className: 'w-4 h-4 rounded border border-gray-300 dark:border-gray-600',
            style: { backgroundColor: displayColor }
          }),
          h('span', null, item.name || item.title)
        );
      }
    },
    {
      label: 'Path',
      key: 'path',
      sortable: true,
      width: 'auto',
      render: (item) => {
        const isDefault = (item.name || item.title) === 'Default';
        const pathWarning = item.pathWarnings?.path;
        const mappingWarnings = item.pathWarnings?.mappings || {};
        const hasPathMapping = item.pathMappings && (item.pathMappings.amule || item.pathMappings.rtorrent);
        // For Default category, show client default paths with icons
        // Only show warnings here if path mapping is NOT enabled (otherwise warnings show in Mappings column)
        if (isDefault && (clientDefaultPaths?.amule || clientDefaultPaths?.rtorrent)) {
          return h('div', { className: 'text-xs space-y-0.5' },
            clientDefaultPaths?.amule && h('div', { className: 'flex items-center gap-1', title: clientDefaultPaths.amule },
              h(ClientIcon, { client: 'amule', size: 14 }),
              h('span', { className: 'font-mono text-gray-600 dark:text-gray-400 truncate' }, clientDefaultPaths.amule),
              !hasPathMapping && renderPathWarningIcon(mappingWarnings.amule)
            ),
            clientDefaultPaths?.rtorrent && h('div', { className: 'flex items-center gap-1', title: clientDefaultPaths.rtorrent },
              h(ClientIcon, { client: 'rtorrent', size: 14 }),
              h('span', { className: 'font-mono text-gray-600 dark:text-gray-400 truncate' }, clientDefaultPaths.rtorrent),
              !hasPathMapping && renderPathWarningIcon(mappingWarnings.rtorrent)
            )
          );
        }
        return h('div', { className: 'flex items-center gap-1.5' },
          h('span', {
            className: 'text-sm text-gray-600 dark:text-gray-400 truncate font-mono',
            title: item.path
          }, item.path || '(default path)'),
          renderPathWarningIcon(pathWarning)
        );
      }
    },
    {
      label: 'Mappings',
      key: 'pathMappings',
      sortable: false,
      width: 'auto',
      render: (item) => {
        const mappings = formatPathMappings(item.pathMappings);
        const mappingWarnings = item.pathWarnings?.mappings || {};
        if (!mappings) {
          return h('span', { className: 'text-sm text-gray-400 dark:text-gray-500' }, '-');
        }
        return h('div', { className: 'text-xs space-y-0.5' },
          mappings.map(({ client, path }) => {
            const warning = mappingWarnings[client];
            return h('div', { key: client, className: 'flex items-center gap-1', title: path },
              h(ClientIcon, { client, size: 14 }),
              h('span', { className: 'text-gray-500 dark:text-gray-400' }, '→'),
              h('span', { className: 'font-mono text-gray-600 dark:text-gray-400 truncate' }, path),
              renderPathWarningIcon(warning)
            );
          })
        );
      }
    },
    {
      label: 'Comment',
      key: 'comment',
      sortable: true,
      width: 'auto',
      render: (item) => h('div', { className: 'text-sm truncate', title: item.comment },
        item.comment || '-'
      )
    },
    {
      label: 'Priority',
      key: 'priority',
      sortable: true,
      width: 'auto',
      render: (item) => {
        const p = priorityMap[item.priority] || priorityMap[0];
        return h('span', {
          className: `px-2 py-1 rounded text-xs font-medium ${p.color}`
        }, p.label);
      }
    },
    {
      label: '',
      key: 'actions',
      sortable: false,
      width: 'auto',
      render: (item) => {
        const isDefault = (item.name || item.title) === 'Default';
        return h('div', { className: 'flex gap-1' },
          // Edit button - shown for all categories including Default (for path mappings)
          h(IconButton, {
            variant: 'primary',
            icon: 'edit',
            iconSize: 16,
            onClick: () => handleEditCategory(item),
            title: 'Edit category',
            className: 'w-8 h-8'
          }),
          // Delete button - hidden for Default category
          !isDefault && h(IconButton, {
            variant: 'danger',
            icon: 'trash',
            iconSize: 16,
            onClick: () => handleDeleteCategory(item.name || item.title, item.name || item.title),
            title: 'Delete category',
            className: 'w-8 h-8'
          })
        );
      }
    }
  ];

  // Mobile card renderer
  const renderMobileCard = useCallback((item) => {
    const displayName = item.name || item.title;
    const displayColor = item.hexColor || '#CCCCCC';
    const isDefault = displayName === 'Default';
    const mappings = formatPathMappings(item.pathMappings);
    const hasPathMapping = item.pathMappings && (item.pathMappings.amule || item.pathMappings.rtorrent);
    const pathWarning = item.pathWarnings?.path;
    const mappingWarnings = item.pathWarnings?.mappings || {};
    const hasAnyWarning = pathWarning || Object.keys(mappingWarnings).length > 0;

    return h('div', {
      className: `rounded-lg overflow-hidden border ${hasAnyWarning ? 'border-amber-400 dark:border-amber-600' : 'border-gray-200 dark:border-gray-700'}`
    },
      // Header with title, color indicator, and action buttons
      h('div', { className: 'flex items-center justify-between gap-2 p-2 bg-gray-100 dark:bg-gray-700/70' },
        h('div', { className: 'flex items-center gap-2 flex-1 min-w-0' },
          h('div', {
            className: 'w-4 h-4 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0',
            style: { backgroundColor: displayColor }
          }),
          h('div', { className: 'flex-1 min-w-0' },
            h('div', { className: 'font-medium text-base text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5' },
              displayName,
              hasAnyWarning && h(Icon, { name: 'alertTriangle', size: 16, className: 'text-amber-500 flex-shrink-0' })
            )
          )
        ),
        // Action buttons on the right
        h('div', { className: 'flex gap-1 flex-shrink-0' },
          // Edit button - shown for all categories including Default
          h(IconButton, {
            variant: 'primary',
            icon: 'edit',
            iconSize: 16,
            onClick: () => handleEditCategory(item),
            title: 'Edit category',
            className: 'w-8 h-8'
          }),
          // Delete button - hidden for Default category
          !isDefault && h(IconButton, {
            variant: 'danger',
            icon: 'trash',
            iconSize: 16,
            onClick: () => handleDeleteCategory(displayName, displayName),
            title: 'Delete category',
            className: 'w-8 h-8'
          })
        )
      ),
      // Body with details
      h('div', { className: 'p-2 space-y-1 text-xs bg-white dark:bg-gray-800' },
        // Path - for Default category, show client default paths with icons
        isDefault && (clientDefaultPaths?.amule || clientDefaultPaths?.rtorrent)
          ? h('div', { className: 'text-gray-700 dark:text-gray-300' },
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Path: '),
              h('div', { className: 'pl-2 space-y-0.5' },
                clientDefaultPaths?.amule && h('div', { className: 'flex items-center gap-1' },
                  h(ClientIcon, { client: 'amule', size: 14 }),
                  h('span', { className: 'font-mono' }, clientDefaultPaths.amule),
                  !hasPathMapping && renderPathWarningIcon(mappingWarnings.amule)
                ),
                clientDefaultPaths?.rtorrent && h('div', { className: 'flex items-center gap-1' },
                  h(ClientIcon, { client: 'rtorrent', size: 14 }),
                  h('span', { className: 'font-mono' }, clientDefaultPaths.rtorrent),
                  !hasPathMapping && renderPathWarningIcon(mappingWarnings.rtorrent)
                )
              )
            )
          : h('div', { className: 'text-gray-700 dark:text-gray-300 flex items-center gap-1' },
              h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Path: '),
              h('span', { className: 'font-mono' }, item.path || '(default path)'),
              renderPathWarningIcon(pathWarning)
            ),
        // Path mappings (only show if present)
        mappings && mappings.map(({ client, path }) => {
          const warning = mappingWarnings[client];
          return h('div', { key: client, className: 'text-gray-700 dark:text-gray-300 pl-2 flex items-center gap-1' },
            h(ClientIcon, { client, size: 14 }),
            h('span', { className: 'text-gray-500 dark:text-gray-400' }, '→'),
            h('span', { className: 'font-mono' }, path),
            renderPathWarningIcon(warning)
          );
        }),
        // Comment (only show if present)
        item.comment && h('div', { className: 'text-gray-700 dark:text-gray-300' },
          h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Comment: '),
          h('span', null, item.comment)
        ),
        // Priority
        h('div', { className: 'text-gray-700 dark:text-gray-300' },
          h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, 'Priority: '),
          h('span', {
            className: `px-2 py-0.5 rounded text-xs font-medium ${(priorityMap[item.priority] || priorityMap[0]).color}`
          }, (priorityMap[item.priority] || priorityMap[0]).label)
        )
      )
    );
  }, [handleEditCategory, handleDeleteCategory, priorityMap, formatPathMappings, clientDefaultPaths, renderPathWarningIcon]);

  // ============================================================================
  // MOBILE HEADER CONTENT (shared between sticky toolbar and in-page header)
  // ============================================================================
  const mobileSortButton = useMemo(() =>
    categories.length > 0 && h(MobileSortButton, {
      columns,
      sortBy: sortConfig.sortBy,
      sortDirection: sortConfig.sortDirection,
      onSortChange,
      defaultSortBy: DEFAULT_SORT_CONFIG['categories'].sortBy,
      defaultSortDirection: DEFAULT_SORT_CONFIG['categories'].sortDirection
    }),
  [categories.length, columns, sortConfig, onSortChange]);

  const createButton = useMemo(() =>
    h(Button, {
      variant: 'success',
      onClick: handleCreateCategory,
      icon: 'plus'
    }, 'New Category'),
  [handleCreateCategory]);

  const mobileHeaderContent = useMemo(() =>
    h('div', { className: 'flex items-center gap-2' },
      h('h2', { className: VIEW_TITLE_STYLES.desktop }, `Categories (${categories.length})`),
      h('div', { className: 'flex-1' }),
      mobileSortButton,
      createButton
    ),
  [categories.length, mobileSortButton, createButton]);

  // Register sticky toolbar for mobile scroll behavior
  const mobileHeaderRef = useStickyToolbar(mobileHeaderContent);

  return h('div', { className: 'space-y-2 sm:space-y-3 px-2 sm:px-0' },
    // Header with title + compact controls
    h('div', { className: 'flex items-center gap-2', ref: mobileHeaderRef },
      h('h2', { className: VIEW_TITLE_STYLES.desktop }, `Categories (${categories.length})`),
      h('div', { className: 'flex-1' }),
      h('div', { className: 'xl:hidden' }, mobileSortButton),
      createButton
    ),

    // Path warnings alert box
    hasCategoryPathWarnings && h(AlertBox, { type: 'warning', className: 'mb-2' },
      h('p', { className: 'font-medium mb-1' }, 'Path Configuration Issue Detected'),
      h('p', { className: 'text-sm' },
        'Some category paths could not be accessed. Downloads will be saved to the paths configured in each category.'
      ),
      h('p', { className: 'text-sm mt-1' },
        'The "Path" column shows what the download clients see, while "Mappings" shows the translated paths this app uses to manage files.'
      )
    ),

    // Docker-specific info box (shown when path warnings exist and running in Docker)
    hasCategoryPathWarnings && isDocker && h(AlertBox, { type: 'info', className: 'mb-2' },
      h('p', { className: 'text-sm' },
        'You are running in Docker: ensure paths are correctly mounted as volumes. ',
        'If clients and this app see different paths to the same files, enable path mapping for each category.'
      )
    ),

    categories.length === 0
      ? h('div', { className: 'text-center py-8 text-gray-500 dark:text-gray-400' },
          !dataLoaded.categories ? 'Loading categories...' : 'No categories found. Create one to get started!'
        )
      // Hybrid scrollable mode: desktop shows all items in scrollable table,
      // mobile uses load-more pagination for natural page scrolling
      : h(Table, {
          data: sortedCategories,
          columns,
          scrollable: true,
          actions: null,
          currentSortBy: sortConfig.sortBy,
          currentSortDirection: sortConfig.sortDirection,
          onSortChange,
          // Load-more props for mobile in hybrid scrollable mode
          loadedCount,
          totalCount: sortedCategories.length,
          hasMore,
          remaining,
          onLoadMore: loadMore,
          onLoadAll: loadAll,
          resetLoaded,
          pageSize,
          onPageSizeChange,
          getRowKey: (item) => `cat-${item.name || item.title}`,
          breakpoint: 'xl',
          mobileCardRender: renderMobileCard,
          mobileCardStyle: 'card',
          skipSort: true
        }),

    // Modals
    h(CategoryModal, {
      show: categoryEditModal.show,
      mode: categoryEditModal.mode,
      category: categoryEditModal.category,
      formData: categoryState.formData,
      onFormDataChange: setCategoryFormData,
      onCreate: handleCategoryCreate,
      onUpdate: handleCategoryUpdate,
      onClose: closeCategoryEditModal,
      setError,
      isDocker
    }),

    h(DeleteCategoryModal, {
      show: categoryDeleteModal.show,
      categoryId: categoryDeleteModal.categoryId,
      categoryName: categoryDeleteModal.categoryDisplayName || categoryDeleteModal.categoryName,
      onConfirm: handleCategoryDeleteConfirm,
      onClose: closeCategoryDeleteModal
    })
  );
};

export default CategoriesView;
