// Import React from CDN
import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { useState, useEffect, useRef } from 'https://esm.sh/react@18.2.0';

// Import utilities
import {
  PAGE_SIZE_DESKTOP,
  PAGE_SIZE_MOBILE,
  LOGS_REFRESH_INTERVAL,
  STATISTICS_REFRESH_INTERVAL,
  ERROR_DISPLAY_DURATION
} from './utils/index.js';

// Import components
import {
  DeleteModal
} from './components/common/index.js';

// Import hooks
import {
  useTheme,
  useWebSocket,
  useModal,
  useAmuleData,
  useWebSocketActions,
  useConfig
} from './hooks/index.js';

// Import views
import {
  LogsView,
  ServersView,
  SharedView,
  UploadsView,
  CategoriesView,
  HomeView,
  SearchView,
  SearchResultsView,
  DownloadsView,
  StatisticsView,
  SettingsView,
  SetupWizardView
} from './components/views/index.js';

// Import modals
import {
  CategoryModal,
  FileCategoryModal,
  DeleteCategoryModal
} from './components/modals/index.js';

// Import layout components
import {
  Header,
  Sidebar,
  Footer
} from './components/layout/index.js';

const { createElement: h } = React;

const AmuleWebApp = () => {
  // ============================================================================
  // STATE
  // ============================================================================

  // Configuration state
  const [isFirstRun, setIsFirstRun] = useState(null); // null = checking, true = show wizard, false = normal
  const { fetchStatus } = useConfig();

  // View state
  const [currentView, setCurrentView] = useState('home');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search state
  const [searchState, setSearchState] = useState({
    query: '',
    type: 'global',
    locked: false,
    results: [],
    previousResults: [],
    error: ''
  });

  // Data state
  const [downloads, setDownloads] = useState([]);
  const [shared, setShared] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [servers, setServers] = useState([]);
  const [downloadedFiles, setDownloadedFiles] = useState(new Set());
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState('');
  const [serverInfo, setServerInfo] = useState('');
  const [statsTree, setStatsTree] = useState(null);
  const [downloadsEd2kLinks, setDownloadsEd2kLinks] = useState('');
  const [serversEd2kLinks, setServersEd2kLinks] = useState('ed2k://|serverlist|http://upd.emule-security.org/server.met|/');

// Category state
  const [categoryState, setCategoryState] = useState({
    list: [],
    selectedId: 0,
    searchDownloadId: 0,
    filterId: 0,
    formData: {
      title: '',
      path: '',
      color: 0xCCCCCC,
      comment: ''
    }
  });

  // Historical/Statistics state
  const [statsState, setStatsState] = useState({
    historicalData: null,
    speedData: null,
    historicalRange: '24h',
    historicalStats: null,
    loadingHistory: false
  });

  // Sort configuration state with localStorage persistence
  const [sortConfig, setSortConfig] = useState(() => {
    const defaultConfig = {
      'search': { sortBy: 'sourceCount', sortDirection: 'desc' },
      'search-results': { sortBy: 'sourceCount', sortDirection: 'desc' },
      'downloads': { sortBy: 'speed', sortDirection: 'desc' },
      'uploads': { sortBy: 'EC_TAG_CLIENT_UP_SPEED', sortDirection: 'desc' },
      'shared': { sortBy: 'transferred', sortDirection: 'desc' },
      'servers': { sortBy: 'EC_TAG_SERVER_FILES', sortDirection: 'desc' }
    };

    try {
      const saved = localStorage.getItem('amule-sort-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new views that might not be in saved config
        return { ...defaultConfig, ...parsed };
      }
    } catch (err) {
      console.error('Failed to load sort config from localStorage:', err);
    }

    return defaultConfig;
  });

  // Responsive UI state
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia("(orientation: landscape)").matches && window.matchMedia("(max-device-width: 600px)").matches;
    }
    return false;
  });

  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768 ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
    }
    return 10;
  });

  // ============================================================================
  // REFS
  // ============================================================================

  const isServerListAdd = useRef(false);
  const serverInfoRef = useRef(null);
  const logsRef = useRef(null);

  // ============================================================================
  // CUSTOM HOOKS
  // ============================================================================

  // Theme management
  const { theme, toggleTheme: toggleThemeHook } = useTheme();

  // Modal hooks
  const { modal: deleteModal, open: openDeleteModal, close: closeDeleteModal } = useModal({
    fileHash: null,
    fileName: '',
    isServer: false,
    serverAddress: null
  });

  const { modal: categoryModal, open: openCategoryModal, close: closeCategoryModal } = useModal({
    mode: 'create',
    category: null
  });

  const { modal: fileCategoryModal, open: openFileCategoryModal, close: closeFileCategoryModal, update: updateFileCategoryModal } = useModal({
    fileHash: null,
    fileName: '',
    currentCategoryId: 0,
    selectedCategoryId: 0
  });

  const { modal: deleteCategoryModal, open: openDeleteCategoryModal, close: closeDeleteCategoryModal } = useModal({
    categoryId: null,
    categoryName: ''
  });

  // WebSocket connection with message handlers
  const { wsConnected, sendMessage } = useWebSocket((data) => {
    const messageHandlers = {
      'downloads-update': () => {
          setDownloads(data.data);
          setLoading(false);
      },
      'shared-update': () => {
          setShared(data.data);
          setLoading(false);
      },
      'previous-search-results': () => setSearchState(prev => ({ ...prev, previousResults: data.data || [] })),
      'search-lock': () => setSearchState(prev => ({ ...prev, locked: data.locked })),
      'search-results': () => {
        if (!data.data || data.data.length === 0) {
          setSearchState(prev => ({ ...prev, results: [], error: 'No results found' }));
        } else {
          setSearchState(prev => ({ ...prev, results: data.data, error: '' }));
          setCurrentView('search-results');
          setPage(0);
        }
        setLoading(false);
      },
      'download-started': () => {},
      'stats-update': () => setStats(data.data),
      'uploads-update': () => {
        // Ensure uploads is always an array
        let uploadsData = data.data;
        if (uploadsData && uploadsData.EC_TAG_CLIENT) {
          uploadsData = uploadsData.EC_TAG_CLIENT;
        }
        if (Array.isArray(uploadsData)) {
          setUploads(uploadsData);
        } else if (uploadsData) {
          setUploads([uploadsData]);
        } else {
          setUploads([]);
        }
        setLoading(false);
      },
      'servers-update': () => {
          setServers(data.data?.EC_TAG_SERVER || []);
          setLoading(false);
      },
      'server-action': () => sendMessage({ action: 'getServersList' }),
      'log-update': () => {
          setLogs(data.data?.EC_TAG_STRING || '');
          setLoading(false);
      },
      'server-info-update': () => setServerInfo(data.data?.EC_TAG_STRING || ''),
      'stats-tree-update': () => {
          setStatsTree(data.data);
          setLoading(false);
      },
      'categories-update': () => setCategoryState(prev => ({ ...prev, list: data.data || [] })),
      'ed2k-added': () => {
        const results = Array.isArray(data.results) ? data.results : [];
        const successCount = results.filter(r => r && r.success).length;
        const failureCount = results.length - successCount;

        if (failureCount === 0) {
          if (isServerListAdd.current === true) {
            setServersEd2kLinks("")
          } else {
            setDownloadsEd2kLinks("");
          }
        } else {
          setError(`Added ${successCount}, failed ${failureCount}`);
          setTimeout(() => setError(""), ERROR_DISPLAY_DURATION);
        }

        // Auto refresh servers
        if (isServerListAdd.current === true) {
            setTimeout(() => {
                fetchServers();
            }, 500);
          isServerListAdd.current = false;
        } else {
            setTimeout(() => {
                fetchDownloads();
            }, 100);
        }
      },
      'error': () => {
        setLoading(false);
        setError(data.message || 'An error occurred');
        setTimeout(() => setError(''), ERROR_DISPLAY_DURATION);
      }
    };

    const handler = messageHandlers[data.type];
    if (handler) {
      handler();
    }
  });

  // aMule data fetching operations
  const {
    fetchDownloads,
    fetchPreviousSearchResults,
    fetchShared,
    fetchStats,
    fetchUploads,
    fetchLogs,
    fetchServerInfo,
    fetchStatsTree,
    fetchServers,
    fetchCategories
  } = useAmuleData(sendMessage, setLoading);

  // WebSocket action handlers
  const {
    handleCreateCategory,
    handleUpdateCategory,
    handleDeleteCategory,
    confirmDeleteCategory,
    handleSetFileCategory,
    handleServerAction,
    handleSearch,
    handleDownload,
    handleAddEd2kLinks,
    handlePauseDownload,
    handleResumeDownload,
    handleDelete,
    confirmDelete,
    cancelDelete
  } = useWebSocketActions({
    sendMessage,
    setLoading,
    setError,
    setSearchState,
    setDownloadedFiles,
    searchState,
    categoryState,
    deleteModal,
    deleteCategoryModal,
    servers,
    modalControls: {
      closeCategoryModal,
      closeFileCategoryModal,
      closeDeleteModal,
      openDeleteModal,
      openDeleteCategoryModal,
      closeDeleteCategoryModal
    },
    fetchFunctions: {
      fetchDownloads,
      fetchServers
    },
    refs: {
      isServerListAdd
    }
  });

  // ============================================================================
  // SIDE EFFECTS
  // ============================================================================

  // Check for first-run status on mount
  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        const status = await fetchStatus();
        setIsFirstRun(status.firstRun);
      } catch (err) {
        console.error('Failed to check first-run status:', err);
        // Assume not first run if check fails
        setIsFirstRun(false);
      }
    };
    checkFirstRun();
  }, []);

  // Fetch stats when WebSocket connects
  useEffect(() => {
    if (wsConnected) {
      fetchStats();
    }
  }, [wsConnected]);

  // Update page size and landscape mode on window resize
  useEffect(() => {
    const handleResize = () => {
      const newPageSize = window.innerWidth >= 768 ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
      setPageSize(newPageSize);

      const isLandscapeMode = window.matchMedia("(orientation: landscape)").matches && window.matchMedia("(max-device-width: 600px)").matches;
      setIsLandscape(isLandscapeMode);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch historical data when statistics view is active
  useEffect(() => {
    if (currentView === 'statistics') {
      fetchHistoricalData(statsState.historicalRange, true);

      const interval = setInterval(() => {
        fetchHistoricalData(statsState.historicalRange, false);
      }, STATISTICS_REFRESH_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [currentView, statsState.historicalRange]);

  // Handle view-specific data fetching and auto-refresh intervals
  useEffect(() => {
    let intervalId = null;

    switch (currentView) {
      case 'search':
        fetchPreviousSearchResults();
        break;
      case 'shared':
        fetchShared();
        break;
      case 'logs':
        fetchLogs();
        fetchServerInfo();
        intervalId = setInterval(() => {
          fetchLogs();
          fetchServerInfo();
        }, LOGS_REFRESH_INTERVAL);
        break;
      case 'servers':
        fetchServers();
        break;
      case 'statistics':
        fetchStatsTree();
        intervalId = setInterval(() => {
          fetchStatsTree();
        }, STATISTICS_REFRESH_INTERVAL);
        break;
      case 'categories':
        fetchCategories();
        break;
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentView]);

  // Update form data when category modal opens
  useEffect(() => {
    if (categoryModal.show) {
      const category = categoryModal.category || {
        id: null,
        title: '',
        path: '',
        comment: '',
        color: 0,
        priority: 0
      };
      setCategoryState(prev => ({
        ...prev,
        formData: {
          title: category.title,
          path: category.path,
          comment: category.comment,
          color: category.color,
          priority: category.priority
        }
      }));
    }
  }, [categoryModal]);

  // Auto-scroll logs to bottom when they update
  useEffect(() => {
    if (currentView === 'logs') {
      if (serverInfoRef.current) {
        serverInfoRef.current.scrollTop = serverInfoRef.current.scrollHeight;
      }
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }
  }, [logs, serverInfo, currentView]);

  // Persist sort configuration to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('amule-sort-config', JSON.stringify(sortConfig));
    } catch (err) {
      console.error('Failed to save sort config to localStorage:', err);
    }
  }, [sortConfig]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  // Factory function for creating sort handlers
  const createSortHandler = (viewName) => (newSortBy, newSortDirection) => {
    setSortConfig(prev => ({
      ...prev,
      [viewName]: { sortBy: newSortBy, sortDirection: newSortDirection }
    }));
  };

  // Fetch historical data for statistics
  const fetchHistoricalData = async (range, showLoading = true) => {
    if (showLoading) setStatsState(prev => ({ ...prev, loadingHistory: true }));
    try {
      const [speedRes, historyRes, statsRes] = await Promise.all([
        fetch(`/api/metrics/speed-history?range=${range}`),
        fetch(`/api/metrics/history?range=${range}`),
        fetch(`/api/metrics/stats?range=${range}`)
      ]);

      const speedHistoryData = await speedRes.json();
      const historyData = await historyRes.json();
      const statsData = await statsRes.json();

      setStatsState({
        speedData: speedHistoryData,
        historicalData: historyData,
        historicalStats: statsData,
        historicalRange: range,
        loadingHistory: false
      });
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setError('Failed to load historical data');
      if (showLoading) setStatsState(prev => ({ ...prev, loadingHistory: false }));
    }
  };

  // Navigation handler
  const handleNavigate = (view) => {
    setCurrentView(view);
    setPage(0);
  };

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================
  // (Render wrapper functions eliminated - components called directly in main render)

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  // Show loading while checking first-run status
  if (isFirstRun === null) {
    return h('div', { className: 'min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center' },
      h('div', { className: 'text-center' },
        h('div', { className: 'inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600' }),
        h('p', { className: 'mt-4 text-gray-600 dark:text-gray-400' }, 'Loading...')
      )
    );
  }

  // Show setup wizard on first run
  if (isFirstRun) {
    return h(SetupWizardView, {
      onComplete: () => {
        setIsFirstRun(false);
        window.location.reload();
      }
    });
  }

  // Normal app render
  return h('div', { className: 'min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col' },

    // Error banner
    error
      ? h('div', {
          className: 'fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md',
          onClick: () => setError('')
        },
          h('svg', {
            className: 'w-5 h-5 flex-shrink-0',
            fill: 'currentColor',
            viewBox: '0 0 20 20'
          },
            h('path', {
              fillRule: 'evenodd',
              d: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
              clipRule: 'evenodd'
            })
          ),
          h('span', { className: 'flex-1' }, error),
          h('button', {
            onClick: () => setError(''),
            className: 'ml-2 text-white hover:text-gray-200'
          }, '✕')
        )
      : null,

    // Overlay "Reconnecting"
    !wsConnected
      ? h('div', {
          className: 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 pointer-events-auto',
          style: { backdropFilter: 'blur(2px)' }
        },
          h('span', { className: 'text-white text-lg font-semibold' }, 'Reconnecting to server...')
        )
      : null,

    h('div', { className: `flex-1 flex flex-col ${wsConnected ? '' : 'pointer-events-none opacity-50'}` },

      // Header
      h(Header, {
        theme,
        onToggleTheme: toggleThemeHook,
        isLandscape,
        onNavigateHome: () => handleNavigate('home'),
        onOpenSettings: () => handleNavigate('settings')
      }),

      // Main layout
      h('div', { className: 'px-2 sm:px-3 py-2 sm:py-3 flex flex-col md:flex-row gap-2 sm:gap-3 flex-1' },

        // Sidebar
        h(Sidebar, {
          currentView,
          onNavigate: handleNavigate,
          isLandscape
        }),

        // Main content
        h('main', { className: 'flex-1 bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700' },
          currentView === 'home' && h(HomeView, {
            stats,
            onNavigate: setCurrentView
          }),
          currentView === 'search' && h(SearchView, {
            searchQuery: searchState.query,
            onSearchQueryChange: (q) => setSearchState(prev => ({ ...prev, query: q })),
            searchType: searchState.type,
            onSearchTypeChange: (t) => setSearchState(prev => ({ ...prev, type: t })),
            loading,
            searchLocked: searchState.locked,
            onSearch: handleSearch,
            error: searchState.error,
            previousResults: searchState.previousResults,
            sortConfig: sortConfig['search'],
            onSortChange: createSortHandler('search'),
            categories: categoryState.list,
            searchDownloadCategoryId: categoryState.searchDownloadId,
            onSearchDownloadCategoryIdChange: (id) => setCategoryState(prev => ({ ...prev, searchDownloadId: id })),
            downloadedFiles,
            onDownload: handleDownload,
            page,
            onPageChange: setPage,
            pageSize
          }),
          currentView === 'search-results' && h(SearchResultsView, {
            searchResults: searchState.results,
            sortConfig: sortConfig['search-results'],
            onSortChange: createSortHandler('search-results'),
            categories: categoryState.list,
            searchDownloadCategoryId: categoryState.searchDownloadId,
            onSearchDownloadCategoryIdChange: (id) => setCategoryState(prev => ({ ...prev, searchDownloadId: id })),
            downloadedFiles,
            onDownload: handleDownload,
            onNewSearch: () => setCurrentView('search'),
            page,
            onPageChange: setPage,
            pageSize
          }),
          currentView === 'downloads' && h(DownloadsView, {
            downloads,
            loading,
            onRefresh: fetchDownloads,
            sortConfig: sortConfig['downloads'],
            onSortChange: createSortHandler('downloads'),
            categories: categoryState.list,
            onSetFileCategory: (fileHash, fileName, currentCategoryId) => openFileCategoryModal({
              fileHash,
              fileName,
              currentCategoryId,
              selectedCategoryId: currentCategoryId
            }),
            onPauseDownload: handlePauseDownload,
            onResumeDownload: handleResumeDownload,
            onDelete: handleDelete,
            ed2kLinks: downloadsEd2kLinks,
            onEd2kLinksChange: setDownloadsEd2kLinks,
            selectedCategoryId: categoryState.selectedId,
            onSelectedCategoryIdChange: (id) => setCategoryState(prev => ({ ...prev, selectedId: id })),
            onAddEd2kLinks: handleAddEd2kLinks,
            page,
            onPageChange: setPage,
            pageSize,
            filterCategoryId: categoryState.filterId,
            onFilterCategoryChange: (id) => setCategoryState(prev => ({ ...prev, filterId: id }))
          }),
          currentView === 'uploads' && h(UploadsView, {
            uploads,
            loading,
            onRefresh: fetchUploads,
            sortConfig: sortConfig['uploads'],
            onSortChange: createSortHandler('uploads'),
            page,
            onPageChange: setPage,
            pageSize
          }),
          currentView === 'shared' && h(SharedView, {
            shared,
            loading,
            onRefresh: fetchShared,
            sortConfig: sortConfig['shared'],
            onSortChange: createSortHandler('shared'),
            page,
            onPageChange: setPage,
            pageSize
          }),
          currentView === 'categories' && h(CategoriesView, {
            categories: categoryState.list,
            loading,
            onCreateCategory: () => openCategoryModal({ mode: 'create', category: null }),
            onEditCategory: (category) => openCategoryModal({ mode: 'edit', category }),
            onDeleteCategory: handleDeleteCategory,
            page,
            onPageChange: setPage,
            pageSize
          }),
          currentView === 'servers' && h(ServersView, {
            servers,
            loading,
            onRefresh: fetchServers,
            onServerAction: handleServerAction,
            sortConfig: sortConfig['servers'],
            onSortChange: createSortHandler('servers'),
            ed2kLinks: serversEd2kLinks,
            onEd2kLinksChange: setServersEd2kLinks,
            onAddEd2kLinks: () => handleAddEd2kLinks(serversEd2kLinks, true),
            page,
            onPageChange: setPage,
            pageSize
          }),
          currentView === 'logs' && h(LogsView, {
            logs,
            serverInfo,
            logsRef,
            serverInfoRef,
            loading,
            onRefresh: () => {
              fetchLogs();
              fetchServerInfo();
            }
          }),
          currentView === 'statistics' && h(StatisticsView, {
            loading,
            loadingHistory: statsState.loadingHistory,
            historicalRange: statsState.historicalRange,
            onFetchHistoricalData: fetchHistoricalData,
            historicalStats: statsState.historicalStats,
            historicalData: statsState.historicalData,
            speedData: statsState.speedData,
            statsTree,
            theme
          }),
          currentView === 'settings' && h(SettingsView, {
            onClose: () => handleNavigate('home')
          })
        )
      )
    ),

    // Modals
    h(DeleteModal, {
      show: deleteModal.show,
      itemName: deleteModal.fileName,
      itemType: deleteModal.isServer ? 'Server' : 'File',
      confirmLabel: deleteModal.isServer ? 'Remove' : 'Delete',
      onConfirm: confirmDelete,
      onCancel: cancelDelete
    }),
    h(CategoryModal, {
      show: categoryModal.show,
      mode: categoryModal.mode,
      category: categoryModal.category,
      formData: categoryState.formData,
      onFormDataChange: (formData) => setCategoryState(prev => ({ ...prev, formData })),
      onCreate: handleCreateCategory,
      onUpdate: handleUpdateCategory,
      onClose: closeCategoryModal,
      setError
    }),
    h(FileCategoryModal, {
      show: fileCategoryModal.show,
      fileHash: fileCategoryModal.fileHash,
      fileName: fileCategoryModal.fileName,
      currentCategoryId: fileCategoryModal.currentCategoryId,
      categories: categoryState.list,
      selectedCategoryId: fileCategoryModal.selectedCategoryId,
      onSelectedCategoryChange: (id) => updateFileCategoryModal({ selectedCategoryId: id }),
      onSubmit: handleSetFileCategory,
      onClose: closeFileCategoryModal
    }),
    h(DeleteCategoryModal, {
      show: deleteCategoryModal.show,
      categoryId: deleteCategoryModal.categoryId,
      categoryName: deleteCategoryModal.categoryName,
      onConfirm: confirmDeleteCategory,
      onClose: closeDeleteCategoryModal
    }),
    h(Footer, { stats, currentView })
  );

};

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(h(AmuleWebApp));