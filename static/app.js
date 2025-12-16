// Import React from CDN
import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { useState, useEffect, useRef } from 'https://esm.sh/react@18.2.0';

const { createElement: h } = React;

// Icons (simplified inline SVG)
const Icon = ({ name, size = 20, className = '' }) => {
  const icons = {
    search: '<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>',
    download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m14-7l-5 5m0 0l-5-5m5 5V3"/>',
    share: '<path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>',
    home: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>',
    refresh: '<path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>',
    trash: '<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M6 18L18 6M6 6l12 12"/>',
    chevronLeft: '<path d="M15 19l-7-7 7-7"/>',
    chevronRight: '<path d="M9 5l7 7-7 7"/>',
    chevronDown: '<path d="M19 9l-7 7-7-7"/>',
    chevronUp: '<path d="M5 15l7-7 7 7"/>',
    upload: '<path d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4M17 8l-5-5m0 0L7 8m5-5v12"/>',
    sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    chartBar: '<path d="M3 3v18h18M7 16V9m4 7V6m4 10v-3m4 3V9"/>',
    fileText: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8m8 4H8m2-8H8"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
    plugConnect: '<path d="M12 2v4m0 0a4 4 0 014 4v4m-4-8a4 4 0 00-4 4v4m8 4v4m-8-4v4m4-4a4 4 0 01-4 4m4-4a4 4 0 004 4"/>',
    disconnect: '<path d="M18.36 6.64a9 9 0 11-12.73 0M12 2v10"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    power: '<path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>'
  };
  
  return h('svg', {
    className: `inline-block ${className}`,
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    viewBox: '0 0 24 24',
    dangerouslySetInnerHTML: { __html: icons[name] }
  });
};

// Memoized NavButton to prevent unnecessary re-renders
const NavButton = React.memo(({ icon, label, view, active, onNavigate }) => {
  return h('button', {
    onClick: () => onNavigate(view),
    className: `flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all text-base sm:text-lg font-medium ${
      active
        ? 'bg-blue-600 text-white shadow-lg'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`
  },
    h(Icon, { name: icon, size: 20 }),
    h('span', null, label)
  );
});

const AmuleWebApp = () => {
  const [currentView, setCurrentView] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('global');
  const [searchLocked, setSearchLocked] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [previousResults, setPreviousResults] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [shared, setShared] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [servers, setServers] = useState([]);
  const [downloadedFiles, setDownloadedFiles] = useState(new Set());
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState('');
  const [serverInfo, setServerInfo] = useState('');
  const [statsTree, setStatsTree] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState({});
  const [sortConfig, setSortConfig] = useState({
    'search': { sortBy: 'sourceCount', sortDirection: 'desc' },
    'search-results': { sortBy: 'sourceCount', sortDirection: 'desc' },
    'downloads': { sortBy: 'EC_TAG_PARTFILE_NAME', sortDirection: 'asc' },
    'uploads': { sortBy: 'EC_TAG_CLIENT_UP_SPEED', sortDirection: 'desc' },
    'shared': { sortBy: 'transferred', sortDirection: 'desc' },
    'servers': { sortBy: 'EC_TAG_SERVER_FILES', sortDirection: 'desc' }
  });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState({ show: false, fileHash: null, fileName: '', isServer: false, serverAddress: null });
  const [ed2kLink, setEd2kLink] = useState('');
  const hasUserInteracted = useRef(false);
  const [historicalData, setHistoricalData] = useState(null);
  const [speedData, setSpeedData] = useState(null);
  const [historicalRange, setHistoricalRange] = useState('24h');
  const [historicalStats, setHistoricalStats] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const speedChartRef = useRef(null);
  const transferChartRef = useRef(null);
  const speedChartInstance = useRef(null);
  const transferChartInstance = useRef(null);
  const [theme, setTheme] = useState(() => {
    // Check device preference, default to dark
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      // Apply immediately
      const initialTheme = 'dark'; // Always default to dark
      const root = document.documentElement;
      const body = document.body;
      if (initialTheme === 'dark') {
        root.classList.add('dark');
        body.classList.add('dark');
        root.style.colorScheme = 'dark';
      }
      return initialTheme;
    }
    return 'dark';
  });

  const PAGE_SIZE_DESKTOP = 20,
        PAGE_SIZE_MOBILE = 10;
  
  // Track landscape orientation for mobile
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia("(orientation: landscape)").matches && window.matchMedia("(max-device-width: 600px)").matches;
    }
    return false;
  });

  // Dynamic page size based on screen width
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768 ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
    }
    return 10;
  });

  // Update page size and landscape mode on window resize
  useEffect(() => {
    const handleResize = () => {
      const newPageSize = window.innerWidth >= 768 ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE;
      setPageSize(newPageSize);
      
      // Update landscape detection
      const isLandscapeMode = window.matchMedia("(orientation: landscape)").matches && window.matchMedia("(max-device-width: 600px)").matches;
      setIsLandscape(isLandscapeMode);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // WebSocket connection for real-time updates
  const [ws, setWs] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const reconnectRef = useRef({ timer: null, interval: 1000 });
  const serverInfoRef = useRef(null);
  const logsRef = useRef(null);

  // Apply theme to document and body
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    
    if (theme === 'dark') {
      root.classList.add('dark');
      body.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [theme]);

  // Auto-expand first level of stats tree when loaded
  useEffect(() => {
    if (hasUserInteracted.current) return;
    if (!statsTree || !statsTree.EC_TAG_STATTREE_NODE) return;
    
    const firstLevelKeys = {};
    
    const collectFirstLevel = (node, level = 0, parentKey = 'root') => {
      if (!node || level >= 1) return;
      
      const nodes = Array.isArray(node) ? node : [node];
      
      for (let idx = 0; idx < nodes.length; idx++) {
        const item = nodes[idx];
        if (!item) continue;
        
        const children = item.EC_TAG_STATTREE_NODE;
        if (!children) continue;
        
        const hasChildren = Array.isArray(children) ? children.length > 0 : true;
        
        if (hasChildren) {
          const nodeKey = `${parentKey}-${level}-${idx}`;
          firstLevelKeys[nodeKey] = true;
          collectFirstLevel(children, level + 1, nodeKey);
        }
      }
    };
    
    collectFirstLevel(statsTree.EC_TAG_STATTREE_NODE);
    setExpandedNodes(firstLevelKeys);
  }, [statsTree]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  const fetchHistoricalData = async (range, showLoading = true) => {
    if (showLoading) setLoadingHistory(true);
    try {
      const [speedRes, historyRes, statsRes] = await Promise.all([
        fetch(`/api/metrics/speed-history?range=${range}`),
        fetch(`/api/metrics/history?range=${range}`),
        fetch(`/api/metrics/stats?range=${range}`)
      ]);

      const speedHistoryData = await speedRes.json();
      const historyData = await historyRes.json();
      const statsData = await statsRes.json();

      setSpeedData(speedHistoryData);
      setHistoricalData(historyData);
      setHistoricalStats(statsData);
      setHistoricalRange(range);
    } catch (err) {
      console.error('Error fetching historical data:', err);
      setError('Failed to load historical data');
    } finally {
      if (showLoading) setLoadingHistory(false);
    }
  };

  // Fetch historical data when statistics view is active and auto-refresh every 15 seconds
  useEffect(() => {
    if (currentView === 'statistics') {
      fetchHistoricalData(historicalRange, true); // Show loading on initial load

      // Auto-refresh every 15 seconds without showing loading spinner
      const interval = setInterval(() => {
        fetchHistoricalData(historicalRange, false); // Don't show loading on auto-refresh
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [currentView, historicalRange]);

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const websocket = new WebSocket(`${protocol}://${window.location.host}`);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWsConnected(true);
      reconnectRef.current.interval = 1000;
      if (reconnectRef.current.timer) {
        clearTimeout(reconnectRef.current.timer);
        reconnectRef.current.timer = null;
      }
    };

    websocket.onclose = () => {
      console.warn('WebSocket disconnected, scheduling reconnect...');
      setWsConnected(false);
      scheduleReconnect();
    };

    websocket.onerror = (err) => {
      console.error('WebSocket error:', err);
      websocket.close(); // trigger onclose
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'downloads-update') {
        setDownloads(data.data);
      } else if (data.type === 'shared-update') {
        setShared(data.data);
      } else if (data.type === 'previous-search-results') {
        setPreviousResults(data.data || []);
      } else if (data.type === 'search-lock') {
        setSearchLocked(data.locked);
      } else if (data.type === 'stats-update') {
        setStats(data.data);
      } else if (data.type === 'uploads-update') {
        // Ensure uploads is always an array
        let uploadsData = data.data;
        if (uploadsData && uploadsData.EC_TAG_CLIENT) {
          // If it's wrapped in EC_TAG_CLIENT, extract it
          uploadsData = uploadsData.EC_TAG_CLIENT;
        }
        // Make sure it's an array
        if (Array.isArray(uploadsData)) {
          setUploads(uploadsData);
        } else if (uploadsData) {
          // If it's a single object, wrap it in an array
          setUploads([uploadsData]);
        } else {
          setUploads([]);
        }
      } else if (data.type === 'servers-update') {
        setServers(data.data?.EC_TAG_SERVER || []);
      } else if (data.type === 'server-action') {
        // Refresh server list after action
        websocket.send(JSON.stringify({ action: 'getServersList' }));
      } else if (data.type === 'log-update') {
        setLogs(data.data?.EC_TAG_STRING || '');
      } else if (data.type === 'server-info-update') {
        setServerInfo(data.data?.EC_TAG_STRING || '');
      } else if (data.type === 'stats-tree-update') {
        setStatsTree(data.data);
      }
    };

    setWs(websocket);
  };

  const scheduleReconnect = () => {
    if (!reconnectRef.current.timer) {
      reconnectRef.current.timer = setTimeout(() => {
        console.log('Attempting WebSocket reconnect...');
        reconnectRef.current.interval = Math.min(reconnectRef.current.interval * 2, 16000);
        reconnectRef.current.timer = null;
        connectWebSocket();
      }, reconnectRef.current.interval);
    }
  };

  useEffect(() => {
    connectWebSocket();

    // cleanup
    return () => {
      if (ws) ws.close();
      if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wsConnected) {
      fetchStats();
    }
  }, [wsConnected]);

  useEffect(() => {
    if (currentView === 'downloads') {
      fetchDownloads();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'search') {
      fetchPreviousSearchResults();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'shared') {
      fetchShared();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'uploads') {
      fetchUploads();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'logs') {
      fetchLogs();
      fetchServerInfo();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'servers') {
      fetchServers();
    }
  }, [currentView]);

  useEffect(() => {
    if (currentView === 'statistics') {
      fetchStatsTree();

      // Auto-refresh stats tree every 15 seconds
      const interval = setInterval(() => {
        fetchStatsTree();
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [currentView]);

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

  // Auto-refresh logs every 5 seconds when on logs page
  useEffect(() => {
    if (currentView === 'logs') {
      const intervalId = setInterval(() => {
        fetchLogs();
        fetchServerInfo();
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [currentView]);

  const sendWsMessage = (message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const fetchDownloads = async () => {
    setLoading(true);
    sendWsMessage({ action: 'getDownloads' });
    setTimeout(() => setLoading(false), 1000);
  };

  const fetchPreviousSearchResults = async () => {
    sendWsMessage({ action: 'getPreviousSearchResults' });
  };

  const fetchShared = async () => {
    setLoading(true);
    sendWsMessage({ action: 'getShared' });
    setTimeout(() => setLoading(false), 1000);
  };

  const fetchStats = () => {
    sendWsMessage({ action: 'getStats' });
  };

  const fetchUploads = () => {
    setLoading(true);
    sendWsMessage({ action: 'getUploadingQueue' });
    setTimeout(() => setLoading(false), 1000);
  };

  const fetchLogs = () => {
    setLoading(true);
    sendWsMessage({ action: 'getLog' });
    setTimeout(() => setLoading(false), 1000);
  };

  const fetchServerInfo = () => {
    sendWsMessage({ action: 'getServerInfo' });
  };

  const fetchStatsTree = () => {
    setLoading(true);
    sendWsMessage({ action: 'getStatsTree' });
    setTimeout(() => setLoading(false), 1000);
  };

  const fetchServers = () => {
    setLoading(true);
    sendWsMessage({ action: 'getServersList' });
    setTimeout(() => setLoading(false), 1000);
  };

  const handleServerAction = (ipPort, action) => {
    if (action === 'remove') {
      // Extract server name from servers array
      const server = servers.find(s => s._value === ipPort);
      const serverName = server?.EC_TAG_SERVER_NAME || ipPort;
      setDeleteModal({ show: true, fileHash: null, fileName: serverName, isServer: true, serverAddress: ipPort });
      return;
    }

    const [ip, port] = ipPort.split(':');
    sendWsMessage({ 
      action: 'serverDoAction',
      ip,
      port: parseInt(port),
      serverAction: action
    });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError('');
    
    sendWsMessage({
      action: 'search',
      query: searchQuery,
      type: searchType,
      extension: null
    });

    const handleSearchResponse = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'search-results') {
        if (!data.data || data.data.length === 0) {
          setError('No results found');
          setSearchResults([]);
        } else {
          setSearchResults(data.data);
          setCurrentView('search-results');
          setPage(0);
        }
        setLoading(false);
        ws.removeEventListener('message', handleSearchResponse);
      }
    };

    ws.addEventListener('message', handleSearchResponse);
  };

  const handleDownload = (fileHash) => {
    sendWsMessage({ action: 'download', fileHash });
    setDownloadedFiles(prev => new Set(prev).add(fileHash));
  };

  const handleAddEd2kLink = (link, isServerList = false) => {
    if (!link.trim()) return;
    
    setLoading(true);
    sendWsMessage({ action: 'addEd2kLink', link: link.trim() });

    const handleEd2kResponse = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'ed2k-added') {
        setLoading(false);
        if (data.success) {
          setEd2kLink('');
          // Refresh appropriate list based on context
          setTimeout(() => {
            if (isServerList) {
              fetchServers();
            } else {
              fetchDownloads();
            }
          }, 500);
        } else {
          setError('Failed to add ED2K link');
          setTimeout(() => setError(''), 3000);
        }
        ws.removeEventListener('message', handleEd2kResponse);
      } else if (data.type === 'error') {
        setLoading(false);
        setError(data.message || 'Failed to add ED2K link');
        setTimeout(() => setError(''), 3000);
        ws.removeEventListener('message', handleEd2kResponse);
      }
    };

    ws.addEventListener('message', handleEd2kResponse);
  };

  const handleDelete = (fileHash, fileName) => {
    setDeleteModal({ show: true, fileHash, fileName });
  };

  const confirmDelete = () => {
    if (deleteModal.isServer) {
      // Handle server removal
      const [ip, port] = deleteModal.serverAddress.split(':');
      sendWsMessage({ 
        action: 'serverDoAction',
        ip,
        port: parseInt(port),
        serverAction: 'remove'
      });
      setDeleteModal({ show: false, fileHash: null, fileName: '', isServer: false, serverAddress: null });
      
      setTimeout(() => {
        fetchServers();
      }, 500);
    } else {
      // Handle file deletion
      const { fileHash } = deleteModal;
      sendWsMessage({ action: 'delete', fileHash });
      setDeleteModal({ show: false, fileHash: null, fileName: '', isServer: false, serverAddress: null });
      
      setTimeout(() => {
        if (currentView === 'downloads') fetchDownloads();
        if (currentView === 'shared') fetchShared();
      }, 500);
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ show: false, fileHash: null, fileName: '', isServer: false, serverAddress: null });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;

    if (bytes >= gb) return (bytes / gb).toFixed(2) + ' GB';
    if (bytes >= mb) return (bytes / mb).toFixed(2) + ' MB';
    if (bytes >= kb) return (bytes / kb).toFixed(2) + ' KB';
    return bytes + ' B';
  };

  const formatSpeed = (speed) => {
    if (speed <= 0) return '-';
    const kb = 1024;
    const mb = kb * 1024;

    if (speed >= mb) return (speed / mb).toFixed(2) + ' MB/s';
    if (speed >= kb) return (speed / kb).toFixed(2) + ' KB/s';
    return speed + ' B/s';
  };

  const sortFiles = (files, sortBy, sortDirection) => {
    // Safety check: ensure files is an array
    if (!Array.isArray(files)) {
      console.error('sortFiles: files is not an array', files);
      return [];
    }
    
    return [...files].sort((a, b) => {
      let result = 0;

      if (sortBy === 'progress') result = (a.progress || 0) - (b.progress || 0);
      else if (sortBy === 'fileSize') result = a.fileSize - b.fileSize;
      else if (sortBy === 'sourceCount') result = (a.sourceCount || 0) - (b.sourceCount || 0);
      else if (sortBy === 'transferred') result = a.transferred - b.transferred;
      else if (sortBy === 'transferredTotal') result = a.transferredTotal - b.transferredTotal;
      else if (sortBy === 'speed') result = (a.speed || 0) - (b.speed || 0);
      else if (sortBy === 'EC_TAG_CLIENT_UP_SPEED') result = (a.EC_TAG_CLIENT_UP_SPEED || 0) - (b.EC_TAG_CLIENT_UP_SPEED || 0);
      else if (sortBy === 'EC_TAG_CLIENT_UPLOAD_SESSION') result = (a.EC_TAG_CLIENT_UPLOAD_SESSION || 0) - (b.EC_TAG_CLIENT_UPLOAD_SESSION || 0);
      else if (sortBy === 'EC_TAG_CLIENT_UPLOAD_TOTAL') result = (a.EC_TAG_CLIENT_UPLOAD_TOTAL || 0) - (b.EC_TAG_CLIENT_UPLOAD_TOTAL || 0);
      else if (sortBy === 'EC_TAG_CLIENT_NAME') result = (a.EC_TAG_CLIENT_NAME || '').localeCompare(b.EC_TAG_CLIENT_NAME || '');
      else if (sortBy === 'EC_TAG_PARTFILE_NAME') result = (a.EC_TAG_PARTFILE_NAME || '').localeCompare(b.EC_TAG_PARTFILE_NAME || '');
      // Server fields
      else if (sortBy === 'EC_TAG_SERVER_NAME') result = (a.EC_TAG_SERVER_NAME || '').localeCompare(b.EC_TAG_SERVER_NAME || '');
      else if (sortBy === 'EC_TAG_SERVER_USERS') result = (a.EC_TAG_SERVER_USERS || 0) - (b.EC_TAG_SERVER_USERS || 0);
      else if (sortBy === 'EC_TAG_SERVER_FILES') result = (a.EC_TAG_SERVER_FILES || 0) - (b.EC_TAG_SERVER_FILES || 0);
      else if (sortBy === 'EC_TAG_SERVER_PING') result = (a.EC_TAG_SERVER_PING || 0) - (b.EC_TAG_SERVER_PING || 0);
      else if (sortBy === '_value') result = (a._value || '').localeCompare(b._value || '');
      else result = (a.fileName || '').localeCompare(b.fileName || '');

      return sortDirection === 'asc' ? result : -result;
    });
  };

  const getProgressColor = (percent) => {
    if (percent < 25) return 'bg-red-500';
    if (percent < 50) return 'bg-orange-500';
    if (percent < 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const renderFooter = () => {
    if (!stats) {
      return h('footer', { className: 'bg-gray-800 text-white py-4 text-center text-sm' },
        'Loading stats...'
      );
    }

    // Hide footer on mobile when on home page (sm:hidden)
    if (currentView === 'home' && window.innerWidth < 640) {
      return null;
    }

    const connState = stats.EC_TAG_CONNSTATE || {};
    const server = connState.EC_TAG_SERVER || {};

    const ed2kConnected = server?.EC_TAG_SERVER_PING > 0;
    const clientId = connState.EC_TAG_CLIENT_ID;
    const isHighId = clientId && clientId > 16777216;
    
    const kadFirewalled = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP === 1;
    const kadConnected = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP !== undefined && stats.EC_TAG_STATS_KAD_FIREWALLED_UDP !== null;
    
    const uploadSpeed = formatSpeed(stats.EC_TAG_STATS_UL_SPEED || 0);
    const downloadSpeed = formatSpeed(stats.EC_TAG_STATS_DL_SPEED || 0);

    return h('footer', { 
      className: 'bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-1.5 px-2 sm:px-3 flex-none md:sticky md:bottom-0 z-40'
    },
      h('div', { className: 'mx-auto' },
        
        // Mobile view
        h('div', { className: 'md:hidden flex flex-col gap-1.5 text-xs' },

          h('div', { className: 'flex justify-between items-center' },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-300' }, 'ED2K:'),
              h('span', {
                className: `w-28 text-center px-2 py-0.5 rounded text-xs font-medium ${
                  ed2kConnected
                    ? (isHighId ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`
              }, ed2kConnected ? (isHighId ? '✓ High ID' : '⚠ Low ID') : '✗ Disconnected')
            ),
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-300' }, 'Upload ↑'),
              h('span', { className: 'w-24 text-right text-green-400 font-mono' }, uploadSpeed)
            )
          ),
          h('div', { className: 'flex justify-between items-center' },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-300' }, 'KAD:'),
              h('span', {
                className: `w-28 text-center px-2 py-0.5 rounded text-xs font-medium ${
                  kadConnected
                    ? (!kadFirewalled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`
              }, kadConnected ? (!kadFirewalled ? '✓ OK' : '⚠ Firewalled') : '✗ Disconnected')
            ),
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'w-20 flex-shrink-0 font-semibold text-gray-300' }, 'Download ↓'),
              h('span', { className: 'w-24 text-right text-blue-400 font-mono' }, downloadSpeed)
            )
          )
        ),

        // Desktop view
        h('div', { className: 'hidden md:flex justify-between items-center text-xs' },
          h('div', { className: 'flex items-center gap-3' },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'ED2K:'),
              h('span', { className: `px-2 py-1 rounded text-xs font-medium ${
                ed2kConnected
                  ? (isHighId ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`
                },
                ed2kConnected ? (isHighId ? '✓ High ID' : '⚠ Low ID') : '✗ Disconnected'
              ),
              ed2kConnected && server.EC_TAG_SERVER_NAME && h('span', { className: 'text-gray-600 dark:text-gray-400 text-xs' }, `(${server.EC_TAG_SERVER_NAME} - ${server.EC_TAG_SERVER_PING}ms)`)
            ),
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'KAD:'),
              h('span', { className: `px-2 py-1 rounded text-xs font-medium ${
                kadConnected
                  ? (!kadFirewalled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`
                },
                kadConnected ? (!kadFirewalled ? '✓ OK' : '⚠ Firewalled') : '✗ Disconnected'
              ),
            )
          ),
          h('div', { className: 'flex items-center gap-3' },
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'Upload ↑'),
              h('span', { className: 'text-green-600 dark:text-green-400 font-mono font-semibold' }, uploadSpeed)
            ),
            h('div', { className: 'flex items-center gap-2' },
              h('span', { className: 'font-semibold text-gray-700 dark:text-gray-300' }, 'Download ↓'),
              h('span', { className: 'text-blue-600 dark:text-blue-400 font-mono font-semibold' }, downloadSpeed)
            )
          )
        )
      )
    );
  };

  const renderTable = (data, columns, actions, currentSortBy, currentSortDirection, onSortChange) => {
    // Safety check: ensure data is an array
    if (!Array.isArray(data)) {
      console.error('renderTable: data is not an array', data);
      return h('div', { className: 'text-center py-6 text-xs sm:text-sm text-red-500 dark:text-red-400' }, 
        'Error: Invalid data format'
      );
    }
    
    const sorted = sortFiles(data, currentSortBy, currentSortDirection);
    const pagesCount = Math.ceil(sorted.length / pageSize);
    const start = page * pageSize;
    const paginatedData = sorted.slice(start, start + pageSize);

    return h('div', { className: 'space-y-2' },

      // Mobile sort control
      h('div', { className: 'md:hidden flex flex-wrap items-center justify-between gap-2' },
        h('div', { className: 'flex items-center gap-2 flex-1' },
          h('label', { className: 'text-sm font-medium text-gray-700 dark:text-gray-300' }, 'Sort by:'),
          h('select', {
            value: currentSortBy,
            onChange: (e) => onSortChange(e.target.value, currentSortDirection),
            className: 'flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          },
            columns.filter(c => c.sortable !== false).map(col =>
              h('option', { key: col.key, value: col.key }, col.label)
            )
          )
        ),
        h('button', {
          onClick: () => onSortChange(currentSortBy, currentSortDirection === 'asc' ? 'desc' : 'asc'),
          className: 'px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm flex items-center gap-1 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition-all'
        },
          currentSortDirection === 'asc' ? '↑ Asc' : '↓ Desc'
        )
      ),

      // Mobile card view
      h('div', { className: 'block md:hidden space-y-2' },
        paginatedData.map((item, idx) => {
          // Title based on item type
          const title = item.EC_TAG_SERVER_NAME || item.fileName || item.EC_TAG_PARTFILE_NAME || 'N/A';
          
          return h('div', {
            key: item.fileHash || item.EC_TAG_CLIENT_HASH || item._value || idx,
            className: `p-2 sm:p-3 rounded-lg ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-white dark:bg-gray-800/50'} border border-gray-200 dark:border-gray-700`
          },
            h('div', { 
              className: 'font-medium text-xs sm:text-sm mb-1.5 break-words text-gray-900 dark:text-gray-100' 
            }, title),
            h('div', { className: 'space-y-1 text-xs' },
              columns.map((col, cidx) => {
                if (col.key === 'fileName' || col.key === 'EC_TAG_PARTFILE_NAME' || col.key === 'EC_TAG_SERVER_NAME') return null;
                return h('div', {
                  key: cidx,
                  className: 'text-gray-700 dark:text-gray-300'
                },
                  col.key != 'progress' && h('span', { className: 'font-medium text-gray-600 dark:text-gray-400' }, col.label + ': '),
                  h('span', { className: 'text-gray-900 dark:text-gray-100' },
                    col.render ? col.render(item) : item[col.key]
                  )
                );
              })
            ),
            actions && h('div', { className: 'flex gap-1.5 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 justify-center' },
              actions(item)
            )
          );
        })
      ),

      // Desktop table view
      h('div', { className: 'hidden md:block overflow-x-auto' },
        h('table', { className: 'w-full' },
          h('thead', null,
            h('tr', { className: 'border-b-2 border-gray-300 dark:border-gray-600' },
              columns.map((col, idx) =>
                h('th', {
                  key: idx,
                  className: 'text-left p-2 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300',
                  style: col.width && col.width !== 'auto' ? { width: col.width } : undefined
                },
                  col.sortable ? h('button', {
                    onClick: () => {
                      if (currentSortBy === col.key) {
                        // Toggle direction
                        onSortChange(col.key, currentSortDirection === 'asc' ? 'desc' : 'asc');
                      } else {
                        // New column – default to descending
                        onSortChange(col.key, 'desc');
                      }
                      setPage(0);
                    },
                    className: `hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${currentSortBy === col.key ? 'text-blue-600 dark:text-blue-400' : ''}`
                  }, col.label +
                      (currentSortBy === col.key
                        ? currentSortDirection === 'asc' ? ' ↑' : ' ↓'
                        : '')
                      ) : col.label
                )
              ),
              actions && h('th', { className: 'text-left p-2 font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-300' }, 'Actions')
            )
          ),
          h('tbody', null,
            paginatedData.map((item, idx) =>
              h('tr', {
                key: item.fileHash || item.EC_TAG_CLIENT_HASH || idx,
                className: `
                  ${idx % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}
                  hover:bg-indigo-100 dark:hover:bg-indigo-700 transition-colors duration-200
                `
              },
                columns.map((col, cidx) =>
                  h('td', { 
                    key: cidx, 
                    className: 'p-2 text-xs sm:text-sm text-gray-900 dark:text-gray-100',
                    style: col.width && col.width !== 'auto' ? { width: col.width } : undefined
                  },
                    col.render ? col.render(item) : item[col.key]
                  )
                ),
                actions && h('td', { className: 'p-2' },
                  h('div', { className: 'flex gap-2' }, actions(item))
                )
              )
            )
          )
        )
      ),

      // Pagination
      pagesCount > 1 && h('div', { className: 'flex justify-center items-center gap-1.5 pt-3' },
        h('button', {
          onClick: () => setPage(Math.max(0, page - 1)),
          disabled: page === 0,
          className: 'p-1.5 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300'
        }, h(Icon, { name: 'chevronLeft', size: 16 })),
        h('span', { className: 'px-2 py-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300' },
          `Page ${page + 1} of ${pagesCount}`
        ),
        h('button', {
          onClick: () => setPage(Math.min(pagesCount - 1, page + 1)),
          disabled: page >= pagesCount - 1,
          className: 'p-1.5 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-700 dark:text-gray-300'
        }, h(Icon, { name: 'chevronRight', size: 16 }))
      )
    );
  };

  const renderHome = () => {
    return h('div', { className: 'py-4 sm:py-8 px-2 sm:px-4' },
      // Logo and title only on desktop
      h('div', { className: 'hidden sm:block text-center mb-6' },
        h('img', { 
          src: '/static/logo-brax.png', 
          alt: 'aMule', 
          className: 'w-24 h-24 mx-auto mb-4 object-contain'
        }),
        h('h1', { className: 'text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3' }, 'Welcome to aMule Controller'),
        h('p', { className: 'text-sm text-gray-600 dark:text-gray-400' }, 'Select an option from the menu to get started')
      ),
      
      // Desktop: 3 columns grid with last row centered (no Home button)
      h('div', { className: 'hidden sm:grid grid-cols-3 gap-3 max-w-4xl mx-auto' },
        // Row 1
        h('button', {
          onClick: () => setCurrentView('search'),
          className: 'p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors active:scale-95 border border-blue-200 dark:border-blue-800'
        },
          h(Icon, { name: 'search', size: 24, className: 'mx-auto mb-1 text-blue-600 dark:text-blue-400' }),
          h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Search Files')
        ),
        h('button', {
          onClick: () => setCurrentView('downloads'),
          className: 'p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors active:scale-95 border border-green-200 dark:border-green-800'
        },
          h(Icon, { name: 'download', size: 24, className: 'mx-auto mb-1 text-green-600 dark:text-green-400' }),
          h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Downloads')
        ),
        h('button', {
          onClick: () => setCurrentView('uploads'),
          className: 'p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors active:scale-95 border border-orange-200 dark:border-orange-800'
        },
          h(Icon, { name: 'upload', size: 24, className: 'mx-auto mb-1 text-orange-600 dark:text-orange-400' }),
          h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Uploads')
        ),
        
        // Row 2
        h('button', {
          onClick: () => setCurrentView('shared'),
          className: 'p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors active:scale-95 border border-purple-200 dark:border-purple-800'
        },
          h(Icon, { name: 'share', size: 24, className: 'mx-auto mb-1 text-purple-600 dark:text-purple-400' }),
          h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Shared Files')
        ),
        h('button', {
          onClick: () => setCurrentView('servers'),
          className: 'p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors active:scale-95 border border-indigo-200 dark:border-indigo-800'
        },
          h(Icon, { name: 'server', size: 24, className: 'mx-auto mb-1 text-indigo-600 dark:text-indigo-400' }),
          h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Servers')
        ),
        h('button', {
          onClick: () => setCurrentView('logs'),
          className: 'p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors active:scale-95 border border-cyan-200 dark:border-cyan-800'
        },
          h(Icon, { name: 'fileText', size: 24, className: 'mx-auto mb-1 text-cyan-600 dark:text-cyan-400' }),
          h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Logs')
        ),
        
        // Row 3 - centered (1 button in middle)
        h('div', { className: 'col-span-3 flex justify-center gap-3' },
          h('button', {
            onClick: () => setCurrentView('statistics'),
            className: 'p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors active:scale-95 border border-pink-200 dark:border-pink-800 w-full max-w-[calc(33.333%-0.5rem)]'
          },
            h(Icon, { name: 'chartBar', size: 24, className: 'mx-auto mb-1 text-pink-600 dark:text-pink-400' }),
            h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Statistics')
          )
        )
      ),
      
      // Mobile: stats widgets + buttons (no Home button)
      h('div', { className: 'sm:hidden flex flex-col gap-3' },
        // Stats widgets - 2x2 grid
        stats ? h('div', { className: 'grid grid-cols-2 gap-3 mb-2' },
          // Upload widget
          h('div', { className: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/30 rounded-lg p-4 border border-green-200 dark:border-green-800' },
            h('div', { className: 'flex items-center gap-2 mb-2' },
              h(Icon, { name: 'upload', size: 20, className: 'text-green-600 dark:text-green-400' }),
              h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Upload')
            ),
            h('div', { className: 'space-y-1' },
              h('div', { className: 'text-2xl font-bold text-green-600 dark:text-green-400' }, 
                formatSpeed(stats.EC_TAG_STATS_UL_SPEED || 0)
              ),
              h('div', { className: 'text-xs text-gray-600 dark:text-gray-400' },
                'Current speed'
              )
            )
          ),
          // Download widget
          h('div', { className: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/30 rounded-lg p-4 border border-blue-200 dark:border-blue-800' },
            h('div', { className: 'flex items-center gap-2 mb-2' },
              h(Icon, { name: 'download', size: 20, className: 'text-blue-600 dark:text-blue-400' }),
              h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'Download')
            ),
            h('div', { className: 'space-y-1' },
              h('div', { className: 'text-2xl font-bold text-blue-600 dark:text-blue-400' }, 
                formatSpeed(stats.EC_TAG_STATS_DL_SPEED || 0)
              ),
              h('div', { className: 'text-xs text-gray-600 dark:text-gray-400' },
                'Current speed'
              )
            )
          ),
          // ED2K Status widget
          (() => {
            const connState = stats.EC_TAG_CONNSTATE || {};
            const server = connState.EC_TAG_SERVER || {};
            const ed2kConnected = server?.EC_TAG_SERVER_PING > 0;
            const clientId = connState.EC_TAG_CLIENT_ID;
            const isHighId = clientId && clientId > 16777216;
            const statusText = ed2kConnected ? (isHighId ? 'High ID' : 'Low ID') : 'Disconnected';
            const statusColor = ed2kConnected ? (isHighId ? 'green' : 'yellow') : 'red';
            const serverName = ed2kConnected && server.EC_TAG_SERVER_NAME ? server.EC_TAG_SERVER_NAME : 'No server';
            
            return h('div', { 
                className: 'bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/30 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800' 
              },
              h('div', { className: 'flex items-center gap-2 mb-2' },
                h(Icon, { name: 'server', size: 20, className: 'text-indigo-600 dark:text-indigo-400' }),
                h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'ED2K')
              ),
              h('div', { className: 'space-y-1' },
                h('div', { className: `text-2xl font-bold text-${statusColor}-600 dark:text-${statusColor}-400` }, 
                  statusText
                ),
                h('div', { className: 'text-xs text-gray-600 dark:text-gray-400 truncate' },
                  serverName
                )
              )
            );
          })(),
          // KAD Status widget
          (() => {
            const kadFirewalledValue = stats.EC_TAG_STATS_KAD_FIREWALLED_UDP;
            const kadConnected = kadFirewalledValue !== undefined && kadFirewalledValue !== null;
            const kadFirewalled = kadFirewalledValue === 1;
            const statusText = !kadConnected ? 'Disconnected' : (kadFirewalled ? 'Firewalled' : 'OK');
            const statusColor = !kadConnected ? 'red' : (kadFirewalled ? 'orange' : 'green');
            
            return h('div', { className: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800' },
              h('div', { className: 'flex items-center gap-2 mb-2' },
                h(Icon, { name: 'cloud', size: 20, className: 'text-purple-600 dark:text-purple-400' }),
                h('h3', { className: 'font-semibold text-sm text-gray-800 dark:text-gray-200' }, 'KAD')
              ),
              h('div', { className: 'space-y-1' },
                h('div', { className: `text-2xl font-bold text-${statusColor}-600 dark:text-${statusColor}-400` }, 
                  statusText
                ),
                h('div', { className: 'text-xs text-gray-600 dark:text-gray-400' },
                  'Network'
                )
              )
            );
          })()
        ) : h('div', { className: 'grid grid-cols-2 gap-3 mb-2' },
          // Placeholder widgets (4 total)
          ...Array(4).fill(null).map((_, i) => 
            h('div', { 
              key: i,
              className: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 animate-pulse' 
            },
              h('div', { className: 'h-4 bg-gray-300 dark:bg-gray-600 rounded w-20 mb-3' }),
              h('div', { className: 'h-8 bg-gray-300 dark:bg-gray-600 rounded w-24 mb-2' }),
              h('div', { className: 'h-3 bg-gray-300 dark:bg-gray-600 rounded w-20' })
            )
          )
        ),
        
        h('button', {
          onClick: () => setCurrentView('search'),
          className: 'p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors active:scale-95 border border-blue-200 dark:border-blue-800 flex items-center gap-3'
        },
          h(Icon, { name: 'search', size: 24, className: 'text-blue-600 dark:text-blue-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Search Files')
        ),
        h('button', {
          onClick: () => setCurrentView('downloads'),
          className: 'p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors active:scale-95 border border-green-200 dark:border-green-800 flex items-center gap-3'
        },
          h(Icon, { name: 'download', size: 24, className: 'text-green-600 dark:text-green-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Downloads')
        ),
        h('button', {
          onClick: () => setCurrentView('uploads'),
          className: 'p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors active:scale-95 border border-orange-200 dark:border-orange-800 flex items-center gap-3'
        },
          h(Icon, { name: 'upload', size: 24, className: 'text-orange-600 dark:text-orange-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Uploads')
        ),
        h('button', {
          onClick: () => setCurrentView('shared'),
          className: 'p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors active:scale-95 border border-purple-200 dark:border-purple-800 flex items-center gap-3'
        },
          h(Icon, { name: 'share', size: 24, className: 'text-purple-600 dark:text-purple-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Shared Files')
        ),
        h('button', {
          onClick: () => setCurrentView('servers'),
          className: 'p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors active:scale-95 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3'
        },
          h(Icon, { name: 'server', size: 24, className: 'text-indigo-600 dark:text-indigo-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Servers')
        ),
        h('button', {
          onClick: () => setCurrentView('logs'),
          className: 'p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors active:scale-95 border border-cyan-200 dark:border-cyan-800 flex items-center gap-3'
        },
          h(Icon, { name: 'fileText', size: 24, className: 'text-cyan-600 dark:text-cyan-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Logs')
        ),
        h('button', {
          onClick: () => setCurrentView('statistics'),
          className: 'p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors active:scale-95 border border-pink-200 dark:border-pink-800 flex items-center gap-3'
        },
          h(Icon, { name: 'chartBar', size: 24, className: 'text-pink-600 dark:text-pink-400' }),
          h('h3', { className: 'font-semibold text-base text-gray-800 dark:text-gray-200' }, 'Statistics')
        )
      )
    );
  };

  const renderSearch = () => {
    const currentSort = sortConfig['search'];
    const handleSortChange = (newSortBy, newSortDirection) => {
      setSortConfig(prev => ({
        ...prev,
        'search': { sortBy: newSortBy, sortDirection: newSortDirection }
      }));
    };

    const previousResultsColumns = [
      {
        label: 'File Name',
        key: 'fileName',
        sortable: true,
        width: 'auto', // Takes remaining space
        render: (item) =>
          h('div', {
            className: 'font-medium break-words whitespace-normal',
            style: { wordBreak: 'break-word', overflowWrap: 'anywhere' }
          }, item.fileName)
      },
      {
        label: 'Size',
        key: 'fileSize',
        sortable: true,
        width: '100px', // Fixed width for size column
        render: (item) => formatBytes(item.fileSize)
      },
      {
        label: 'Sources',
        key: 'sourceCount',
        sortable: true,
        width: '120px', // Fixed width for sources column
        render: (item) => `${item.sourceCount} sources`
      }
    ];

    return h('div', { className: 'space-y-2 sm:space-y-3' },
      h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Search Files'),
      h('div', { className: 'space-y-2' },
        h('div', { className: 'grid grid-cols-3 gap-1.5' },
          [
            { value: 'global', label: '🌐 Global' },
            { value: 'local', label: '🗄️ Local' },
            { value: 'kad', label: '☁️ Kad' }
          ].map(type =>
            h('button', {
              key: type.value,
              onClick: () => setSearchType(type.value),
              className: `px-2 py-1.5 rounded text-xs sm:text-sm transition-all active:scale-95 ${
                searchType === type.value
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`
            }, type.label)
          )
        ),
        h('div', { className: 'flex flex-col sm:flex-row gap-2' },
          h('input', {
            type: 'text',
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            onKeyPress: (e) => e.key === 'Enter' && handleSearch(),
            placeholder: 'Enter search query...',
            className: 'flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
          }),
          h('button', {
            onClick: handleSearch,
            disabled: loading || searchLocked,
            className: 'px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 whitespace-nowrap'
          },
            loading ? h('span', { className: 'flex items-center justify-center gap-2' },
              h('div', { className: 'loader' }),
              'Searching...'
            ) : searchLocked ? 'Another search is running' : 'Search'
          )
        ),
        error && h('div', { className: 'p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-200 text-sm' }, error)
      ),
      // Previous Search Results Section
      previousResults.length > 0 && h('div', { className: 'space-y-2' },
        h('div', { className: 'flex items-center gap-3' },
          h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Previous Search Results'),
          h('span', { className: 'text-sm text-gray-500 dark:text-gray-400' }, `(${previousResults.length} cached results)`)
        ),
        renderTable(previousResults, previousResultsColumns, (item) => {
          const isDownloaded = downloadedFiles.has(item.fileHash);
          return h('button', {
            onClick: () => !isDownloaded && handleDownload(item.fileHash),
            disabled: isDownloaded,
            className: `flex-1 px-2 py-1 text-xs sm:text-sm rounded transition-all ${
              isDownloaded 
                ? 'bg-gray-400 text-white cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
            }`
          }, 
            h('span', { className: 'flex items-center justify-center gap-1' },
              h(Icon, { name: isDownloaded ? 'check' : 'download', size: 14 }),
              isDownloaded ? 'Downloading' : 'Download'
            )
          );
        }, currentSort.sortBy, currentSort.sortDirection, handleSortChange)
      )
    );
  };

  const renderSearchResults = () => {
    const currentSort = sortConfig['search-results'];
    const handleSortChange = (newSortBy, newSortDirection) => {
      setSortConfig(prev => ({
        ...prev,
        'search-results': { sortBy: newSortBy, sortDirection: newSortDirection }
      }));
    };

    const columns = [
      {
        label: 'File Name',
        key: 'fileName',
        sortable: true,
        width: 'auto',
        render: (item) =>
          h('div', {
            className: 'font-medium break-words whitespace-normal',
            style: { wordBreak: 'break-word', overflowWrap: 'anywhere' }
          }, item.fileName)
      },
      {
        label: 'Size',
        key: 'fileSize',
        sortable: true,
        width: '100px',
        render: (item) => formatBytes(item.fileSize)
      },
      {
        label: 'Sources',
        key: 'sourceCount',
        sortable: true,
        width: '120px',
        render: (item) => `${item.sourceCount} sources`
      }
    ];

    return h('div', { className: 'space-y-2 sm:space-y-3' },
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Search Results (${searchResults.length})`),
        h('button', {
          onClick: () => setCurrentView('search'),
          className: 'px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors active:scale-95 text-sm sm:text-base w-full sm:w-auto text-gray-700 dark:text-gray-300'
        }, 'New Search')
      ),
      searchResults.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' }, 'No results found') :
        renderTable(searchResults, columns, (item) => {
          const isDownloaded = downloadedFiles.has(item.fileHash);
          return h('button', {
            onClick: () => !isDownloaded && handleDownload(item.fileHash),
            disabled: isDownloaded,
            className: `flex-1 px-2 py-1 text-xs sm:text-sm rounded transition-all ${
              isDownloaded 
                ? 'bg-gray-400 text-white cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
            }`
          }, 
            h('span', { className: 'flex items-center justify-center gap-1' },
              h(Icon, { name: isDownloaded ? 'check' : 'download', size: 14 }),
              isDownloaded ? 'Downloading' : 'Download'
            )
          );
        }, currentSort.sortBy, currentSort.sortDirection, handleSortChange)
    );
  };

  const renderDownloads = () => {
    const currentSort = sortConfig['downloads'];
    const handleSortChange = (newSortBy, newSortDirection) => {
      setSortConfig(prev => ({
        ...prev,
        'downloads': { sortBy: newSortBy, sortDirection: newSortDirection }
      }));
    };

    const columns = [
      {
        label: 'File Name',
        key: 'fileName',
        sortable: true,
        width: 'auto',
        render: (item) =>
          h('div', {
            className: 'font-medium break-words whitespace-normal',
            style: { wordBreak: 'break-word', overflowWrap: 'anywhere' }
          }, item.fileName)
      },
      {
        label: 'Progress',
        key: 'progress',
        sortable: true,
        width: '140px',
        render: (item) => h('div', { className: 'w-full min-w-[120px]' },
          h('div', { className: 'w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 relative overflow-hidden' },
            h('div', {
              className: `h-full rounded-full transition-all duration-300 ${getProgressColor(item.progress)}`,
              style: { width: `${item.progress}%` }
            }),
            h('span', { className: 'absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-900 dark:text-gray-100' },
              `${item.progress}%`
            )
          )
        )
      },
      {
        label: 'Size',
        key: 'fileSize',
        sortable: true,
        width: '100px',
        render: (item) => formatBytes(item.fileSize)
      },
      {
        label: 'Sources',
        key: 'sourceCount',
        sortable: true,
        width: '80px',
        render: (item) => `${item.sourceCount} source${item.sourceCount === 1 ? '' : 's'}`
      },
      {
        label: 'Speed',
        key: 'speed',
        sortable: true,
        width: '100px',
        render: (item) => h('span', { className: 'font-mono text-blue-600 dark:text-blue-400' }, formatSpeed(item.speed))
      }
    ];

    return h('div', { className: 'space-y-2 sm:space-y-3' },
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Current Downloads (${downloads.length})`),
        h('button', {
          onClick: fetchDownloads,
          disabled: loading,
          className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
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
      
      downloads.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
        loading ? 'Loading downloads...' : 'No active downloads'
      ) : renderTable(downloads, columns, (item) =>
        h('button', {
          onClick: () => handleDelete(item.fileHash, item.fileName),
          className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700 text-sm transition-all active:scale-95'
        },
          h(Icon, { name: 'trash', size: 14, className: 'inline mr-1' }),
          'Delete'
        )
      , currentSort.sortBy, currentSort.sortDirection, handleSortChange),
      
      // ED2K download link form
      h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mt-3' },
        h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' }, 
          'Add download from ED2K link:'
        ),
        h('div', { className: 'flex gap-2' },
          h('input', {
            type: 'text',
            value: ed2kLink,
            onChange: (e) => setEd2kLink(e.target.value),
            placeholder: 'ed2k://|file|...',
            className: 'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            disabled: loading
          }),
          h('button', {
            onClick: () => handleAddEd2kLink(ed2kLink, false),
            disabled: loading || !ed2kLink.trim(),
            className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all active:scale-95 text-sm font-medium'
          }, loading ? 'Adding...' : 'Add Download')
        )
      )
    );
  };

  const renderShared = () => {
    const currentSort = sortConfig['shared'];
    const handleSortChange = (newSortBy, newSortDirection) => {
      setSortConfig(prev => ({
        ...prev,
        'shared': { sortBy: newSortBy, sortDirection: newSortDirection }
      }));
    };

    const columns = [
      {
        label: 'File Name',
        key: 'fileName',
        sortable: true,
        width: 'auto',
        render: (item) =>
          h('div', {
            className: 'font-medium break-words whitespace-normal',
            style: { wordBreak: 'break-word', overflowWrap: 'anywhere' }
          }, item.fileName)
      },
      {
        label: 'Size',
        key: 'fileSize',
        sortable: true,
        width: '100px',
        render: (item) => formatBytes(item.fileSize)
      },
      {
        label: 'Total Upload',
        key: 'transferredTotal',
        sortable: true,
        width: '140px',
        render: (item) => formatBytes(item.transferredTotal)+` (${item.acceptedCountTotal})`
      },
      {
        label: 'Session Upload',
        key: 'transferred',
        sortable: true,
        width: '140px',
        render: (item) => formatBytes(item.transferred)+` (${item.acceptedCount})`
      }
    ];

    return h('div', { className: 'space-y-2 sm:space-y-3' },
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Shared Files (${shared.length})`),
        h('button', {
          onClick: fetchShared,
          disabled: loading,
          className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
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
      shared.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
        loading ? 'Loading shared files...' : 'No shared files'
      ) : renderTable(shared, columns, null, currentSort.sortBy, currentSort.sortDirection, handleSortChange)
    );
  };

  const renderUploads = () => {
    const currentSort = sortConfig['uploads'];
    const handleSortChange = (newSortBy, newSortDirection) => {
      setSortConfig(prev => ({
        ...prev,
        'uploads': { sortBy: newSortBy, sortDirection: newSortDirection }
      }));
    };

    const ipToString = (ip) => {
      if (!ip) return 'N/A';
      return [
        (ip >>> 24) & 0xFF,
        (ip >>> 16) & 0xFF,
        (ip >>> 8) & 0xFF,
        ip & 0xFF
      ].join('.');
    };

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
        width: '140px',
        render: (item) =>
          h('span', { className: '' }, [
            h('span', { className: 'font-medium text-sm align-baseline' }, getClientSoftware(item.EC_TAG_CLIENT_SOFTWARE)),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 align-baseline ml-1' }, item.EC_TAG_CLIENT_SOFT_VER_STR || 'N/A')
          ])
      },
      {
        label: 'IP Address',
        key: 'EC_TAG_CLIENT_USER_IP',
        width: '130px',
        render: (item) => h('span', { className: 'font-mono text-xs' }, ipToString(item.EC_TAG_CLIENT_USER_IP))
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

    return h('div', { className: 'space-y-2 sm:space-y-3' },
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Current Uploads (${uploads.length})`),
        h('button', {
          onClick: fetchUploads,
          disabled: loading,
          className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
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
      ) : renderTable(uploads, columns, null, currentSort.sortBy, currentSort.sortDirection, handleSortChange)
    );
  };

  const renderLogs = () => {
    return h('div', { className: 'space-y-3 sm:space-y-4' },
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Logs & Server Info'),
        h('button', {
          onClick: () => {
            fetchLogs();
            fetchServerInfo();
          },
          disabled: loading,
          className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
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
      
      // Server Info Section
      h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
        h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'Server Information'),
        h('div', {
          ref: serverInfoRef,
          className: 'bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 max-h-48 overflow-y-auto',
          style: { fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
        },
          serverInfo || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No server info available')
        )
      ),
      
      // Logs Section
      h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3' },
        h('h3', { className: 'text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2' }, 'Application Logs'),
        h('div', {
          ref: logsRef,
          className: 'bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 max-h-96 overflow-y-auto',
          style: { fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
        },
          logs || h('span', { className: 'text-gray-400 dark:text-gray-500 italic' }, 'No logs available')
        )
      )
    );
  };

  const renderServers = () => {
    const currentSort = sortConfig['servers'];
    const handleSortChange = (newSortBy, newSortDirection) => {
      setSortConfig(prev => ({
        ...prev,
        'servers': { sortBy: newSortBy, sortDirection: newSortDirection }
      }));
    };

    const columns = [
      {
        label: 'Server Name',
        key: 'EC_TAG_SERVER_NAME',
        sortable: true,
        width: 'auto',
        render: (item) =>
          h('div', { className: 'max-w-xs' },
            h('div', { className: 'font-medium text-sm' }, item.EC_TAG_SERVER_NAME || 'Unknown'),
            h('div', { className: 'text-xs text-gray-500 dark:text-gray-400 ml-1' }, item.EC_TAG_SERVER_DESC || '')
          )
      },
      {
        label: 'Address',
        key: '_value',
        sortable: true,
        width: '140px',
        render: (item) => h('span', { className: 'font-mono text-xs' }, item._value || 'N/A')
      },
      {
        label: 'Users',
        key: 'EC_TAG_SERVER_USERS',
        sortable: true,
        width: '120px',

        render: (item) => {
          const users = item.EC_TAG_SERVER_USERS || 0;
          const maxUsers = item.EC_TAG_SERVER_USERS_MAX || 0;
          return h('span', { className: '' }, [
            h('span', { className: 'font-medium text-sm align-baseline' }, users.toLocaleString()),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400 align-baseline ml-1' }, `/ ${maxUsers.toLocaleString()}`)
          ])
        }
      },
      {
        label: 'Files',
        key: 'EC_TAG_SERVER_FILES',
        sortable: true,
        width: '100px',
        render: (item) => (item.EC_TAG_SERVER_FILES || 0).toLocaleString()
      },
      {
        label: 'Ping',
        key: 'EC_TAG_SERVER_PING',
        sortable: true,
        width: '80px',
        render: (item) => item.EC_TAG_SERVER_PING ? `${item.EC_TAG_SERVER_PING} ms` : '-'
      },
      {
        label: 'Version',
        key: 'EC_TAG_SERVER_VERSION',
        width: '80px',
        render: (item) => item.EC_TAG_SERVER_VERSION || '-'
      }
    ];

    return h('div', { className: 'space-y-2 sm:space-y-3' },
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, `Servers (${servers.length})`),
        h('button', {
          onClick: fetchServers,
          disabled: loading,
          className: 'px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm sm:text-base w-full sm:w-auto'
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
      
      servers.length === 0 ? h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
        loading ? 'Loading servers...' : 'No servers available'
      ) : renderTable(servers, columns, (item) =>
        h('div', { className: 'flex gap-1.5' },
          h('button', {
            onClick: () => handleServerAction(item._value, 'connect'),
            className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-all active:scale-95'
          }, 
            h('span', { className: 'flex items-center justify-center gap-1' },
              h(Icon, { name: 'power', size: 14 }),
              'Connect'
            )
          ),
          h('button', {
            onClick: () => handleServerAction(item._value, 'disconnect'),
            className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-orange-600 text-white rounded hover:bg-orange-700 transition-all active:scale-95'
          }, 
            h('span', { className: 'flex items-center justify-center gap-1' },
              h(Icon, { name: 'disconnect', size: 14 }),
              'Disconnect'
            )
          ),
          h('button', {
            onClick: () => handleServerAction(item._value, 'remove'),
            className: 'flex-1 px-2 py-1 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-all active:scale-95'
          }, 
            h('span', { className: 'flex items-center justify-center gap-1' },
              h(Icon, { name: 'trash', size: 14 }),
              'Remove'
            )
          )
        )
      , currentSort.sortBy, currentSort.sortDirection, handleSortChange),
      
      // ED2K server.met form
      h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mt-3' },
        h('label', { className: 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2' }, 
          'Add server from server.met ED2K link:'
        ),
        h('div', { className: 'flex gap-2' },
          h('input', {
            type: 'text',
            value: ed2kLink || 'ed2k://|serverlist|http://upd.emule-security.org/server.met|/',
            onChange: (e) => setEd2kLink(e.target.value),
            placeholder: 'ed2k://|serverlist|http://...',
            className: 'flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            disabled: loading
          }),
          h('button', {
            onClick: () => handleAddEd2kLink(ed2kLink || 'ed2k://|serverlist|http://upd.emule-security.org/server.met|/', true),
            disabled: loading,
            className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all active:scale-95 text-sm font-medium'
          }, loading ? 'Adding...' : 'Add Servers')
        )
      )
    );
  };

  const formatStatsValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && value._value !== undefined) {
      return value._value;
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  };

  const toggleNode = (nodeKey) => {
    hasUserInteracted.current = true; 
    setExpandedNodes(prev => ({
      ...prev,
      [nodeKey]: !prev[nodeKey]
    }));
  };

  const formatNodeLabel = (label, value) => {
    if (value === undefined || value === null) return label;

    if (typeof value === 'object' && value._value !== undefined && value.EC_TAG_STAT_NODE_VALUE !== undefined) {
      const sessionValue = value._value;
      const totalValue = formatStatsValue(value.EC_TAG_STAT_NODE_VALUE);
      return label.replace(/%s|%i|%llu|%g|%.2f%%/g, () => `${sessionValue} (${totalValue})`);
    } else if (Array.isArray(value)) {
      let valueIndex = 0;
      return label.replace(/%s|%i|%llu|%g|%.2f%%/g, () => value[valueIndex++] || '');
    } else {
      return label.replace(/%s|%i|%llu|%g|%.2f%%/g, formatStatsValue(value));
    }
  };

  const renderStatsNode = (node, level = 0, parentKey = 'root') => {
    if (!node) return null;
    const nodes = Array.isArray(node) ? node : [node];

    return nodes.map((item, idx) => {
      if (!item) return null;

      const label = item._value || '';
      const value = item.EC_TAG_STAT_NODE_VALUE;
      const children = item.EC_TAG_STATTREE_NODE;
      const displayText = formatNodeLabel(label, value);

      const hasChildren = children && ((Array.isArray(children) && children.length > 0) || (!Array.isArray(children)));
      const nodeKey = `${parentKey}-${level}-${idx}`;
      const isExpanded = !!expandedNodes[nodeKey];

      return h('div', { key: nodeKey, className: 'mb-1' },
        h('div', {
          className: `py-1 px-2 rounded text-sm flex items-center gap-2 ${
            hasChildren 
              ? 'font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer' 
              : 'text-gray-600 dark:text-gray-300'
          }`,
          style: { paddingLeft: `${level * 20 + 8}px` },
          onClick: hasChildren ? () => toggleNode(nodeKey) : undefined
        },
          hasChildren && h(Icon, { 
            name: isExpanded ? 'chevronDown' : 'chevronRight', 
            size: 16, 
            className: 'flex-shrink-0' 
          }),
          h('span', { className: 'flex-1' }, displayText)
        ),
        hasChildren && isExpanded && renderStatsNode(children, level + 1, nodeKey)
      );
    });
  };

  // Update speed chart when data or theme changes
  useEffect(() => {
    if (!speedChartRef.current || !speedData || !speedData.data || !window.Chart) return;
    if (currentView !== 'statistics') return; // Only render when on statistics view

    const isDark = theme === 'dark';
    const labels = speedData.data.map(d =>
      new Date(d.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    );

    // If chart exists, update data instead of recreating (prevents animation bounce)
    if (speedChartInstance.current) {
      speedChartInstance.current.data.labels = labels;
      speedChartInstance.current.data.datasets[0].data = speedData.data.map(d => d.uploadSpeed);
      speedChartInstance.current.data.datasets[1].data = speedData.data.map(d => d.downloadSpeed);

      // Update colors for theme changes
      const legendColor = isDark ? '#e5e7eb' : '#1f2937';
      const tickColor = isDark ? '#9ca3af' : '#6b7280';
      const gridColor = isDark ? '#374151' : '#e5e7eb';

      speedChartInstance.current.options.plugins.legend.labels.color = legendColor;
      speedChartInstance.current.options.scales.x.ticks.color = tickColor;
      speedChartInstance.current.options.scales.y.ticks.color = tickColor;
      speedChartInstance.current.options.scales.x.grid.color = gridColor;
      speedChartInstance.current.options.scales.y.grid.color = gridColor;

      speedChartInstance.current.update('none'); // Update without animation
      return;
    }

    // Create chart for the first time
    const ctx = speedChartRef.current.getContext('2d');
    speedChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Upload Speed',
            data: speedData.data.map(d => d.uploadSpeed),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          },
          {
            label: 'Download Speed',
            data: speedData.data.map(d => d.downloadSpeed),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: { color: isDark ? '#e5e7eb' : '#1f2937' }
          },
          tooltip: {
            backgroundColor: isDark ? '#1f2937' : '#ffffff',
            titleColor: isDark ? '#e5e7eb' : '#1f2937',
            bodyColor: isDark ? '#e5e7eb' : '#1f2937',
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + formatSpeed(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: isDark ? '#9ca3af' : '#6b7280',
              maxTicksLimit: 12
            },
            grid: { color: isDark ? '#374151' : '#e5e7eb' }
          },
          y: {
            ticks: {
              color: isDark ? '#9ca3af' : '#6b7280',
              callback: function(value) {
                return formatSpeed(value);
              }
            },
            grid: { color: isDark ? '#374151' : '#e5e7eb' }
          }
        }
      }
    });
  }, [speedData, theme, currentView]);

  // Cleanup charts when leaving statistics page
  useEffect(() => {
    if (currentView !== 'statistics') {
      // Destroy both charts when leaving statistics view
      if (speedChartInstance.current) {
        speedChartInstance.current.destroy();
        speedChartInstance.current = null;
      }
      if (transferChartInstance.current) {
        transferChartInstance.current.destroy();
        transferChartInstance.current = null;
      }
    }
  }, [currentView]);

  // Update transfer chart when data or theme changes
  useEffect(() => {
    if (!transferChartRef.current || !historicalData || !historicalData.data || !window.Chart) return;
    if (currentView !== 'statistics') return; // Only render when on statistics view

    const isDark = theme === 'dark';

    // Use deltas directly from API (already bucketed by 15min/2hr/6hr)
    const labels = historicalData.data.map(d =>
      new Date(d.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    );
    const uploadedData = historicalData.data.map(d => d.uploadedDelta || 0);
    const downloadedData = historicalData.data.map(d => d.downloadedDelta || 0);

    // If chart exists, update data instead of recreating (prevents animation bounce)
    if (transferChartInstance.current) {
      transferChartInstance.current.data.labels = labels;
      transferChartInstance.current.data.datasets[0].data = uploadedData;
      transferChartInstance.current.data.datasets[1].data = downloadedData;

      // Update colors for theme changes
      const legendColor = isDark ? '#e5e7eb' : '#1f2937';
      const tickColor = isDark ? '#9ca3af' : '#6b7280';
      const gridColor = isDark ? '#374151' : '#e5e7eb';

      transferChartInstance.current.options.plugins.legend.labels.color = legendColor;
      transferChartInstance.current.options.plugins.tooltip.backgroundColor = isDark ? '#1f2937' : '#ffffff';
      transferChartInstance.current.options.plugins.tooltip.titleColor = legendColor;
      transferChartInstance.current.options.plugins.tooltip.bodyColor = legendColor;
      transferChartInstance.current.options.plugins.tooltip.borderColor = gridColor;
      transferChartInstance.current.options.scales.x.ticks.color = tickColor;
      transferChartInstance.current.options.scales.y.ticks.color = tickColor;
      transferChartInstance.current.options.scales.x.grid.color = gridColor;
      transferChartInstance.current.options.scales.y.grid.color = gridColor;

      transferChartInstance.current.update('none'); // Update without animation
      return;
    }

    const ctx = transferChartRef.current.getContext('2d');

    transferChartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Uploaded',
            data: uploadedData,
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: '#10b981',
            borderWidth: 1
          },
          {
            label: 'Downloaded',
            data: downloadedData,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            labels: { color: isDark ? '#e5e7eb' : '#1f2937' }
          },
          tooltip: {
            backgroundColor: isDark ? '#1f2937' : '#ffffff',
            titleColor: isDark ? '#e5e7eb' : '#1f2937',
            bodyColor: isDark ? '#e5e7eb' : '#1f2937',
            borderColor: isDark ? '#374151' : '#e5e7eb',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + formatBytes(context.parsed.y);
              }
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            ticks: {
              color: isDark ? '#9ca3af' : '#6b7280',
              maxTicksLimit: 12
            },
            grid: { color: isDark ? '#374151' : '#e5e7eb' }
          },
          y: {
            stacked: false,
            ticks: {
              color: isDark ? '#9ca3af' : '#6b7280',
              callback: function(value) {
                return formatBytes(value);
              }
            },
            grid: { color: isDark ? '#374151' : '#e5e7eb' }
          }
        }
      }
    });
  }, [historicalData, theme, currentView]);

  const renderStatistics = () => {
    const expandAll = () => {
      hasUserInteracted.current = true;
      const allKeys = {};
      const collectKeys = (node, level = 0, parentKey = 'root') => {
        if (!node) return;
        const nodes = Array.isArray(node) ? node : [node];
        for (let idx = 0; idx < nodes.length; idx++) {
          const item = nodes[idx];
          if (!item) continue;
          const children = item.EC_TAG_STATTREE_NODE;
          const hasChildren = children && ((Array.isArray(children) && children.length > 0) || (!Array.isArray(children)));
          if (hasChildren) {
            const nodeKey = `${parentKey}-${level}-${idx}`;
            allKeys[nodeKey] = true;
            collectKeys(children, level + 1, nodeKey);
          }
        }
      };
      collectKeys(statsTree?.EC_TAG_STATTREE_NODE);
      setExpandedNodes(allKeys);
    };

    const collapseAll = () => {
      hasUserInteracted.current = true;
      setExpandedNodes({});
    };

    return h('div', { className: 'space-y-3 sm:space-y-4' },
      // Historical Statistics Header
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Historical Statistics'),
        h('div', { className: 'flex gap-2' },
          ['24h', '7d', '30d'].map(range =>
            h('button', {
              key: range,
              onClick: () => fetchHistoricalData(range),
              disabled: loadingHistory,
              className: `px-3 py-1.5 rounded transition-all text-sm ${
                historicalRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              } disabled:opacity-50`
            }, range.toUpperCase())
          )
        )
      ),

      // Summary Statistics Cards - Upload stats first, then Download stats
      historicalStats && h('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-3' },
        // Upload Statistics
        h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Total Uploaded'),
          h('div', { className: 'text-lg font-bold text-green-600 dark:text-green-400' },
            formatBytes(historicalStats.totalUploaded)
          )
        ),
        h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Avg Upload Speed'),
          h('div', { className: 'text-lg font-bold text-green-600 dark:text-green-400' },
            formatSpeed(historicalStats.avgUploadSpeed)
          )
        ),
        h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Peak Upload Speed'),
          h('div', { className: 'text-lg font-bold text-green-600 dark:text-green-400' },
            formatSpeed(historicalStats.peakUploadSpeed)
          )
        ),
        // Download Statistics
        h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Total Downloaded'),
          h('div', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' },
            formatBytes(historicalStats.totalDownloaded)
          )
        ),
        h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Avg Download Speed'),
          h('div', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' },
            formatSpeed(historicalStats.avgDownloadSpeed)
          )
        ),
        h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700' },
          h('div', { className: 'text-xs text-gray-500 dark:text-gray-400' }, 'Peak Download Speed'),
          h('div', { className: 'text-lg font-bold text-blue-600 dark:text-blue-400' },
            formatSpeed(historicalStats.peakDownloadSpeed)
          )
        )
      ),

      // Speed Chart
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300' }, 'Speed Over Time'),
        h('div', { className: 'w-full', style: { height: '300px' } },
          historicalData && historicalData.data && historicalData.data.length > 0
            ? h('canvas', { ref: speedChartRef })
            : h('p', { className: 'text-center text-gray-500 dark:text-gray-400 text-sm py-8' }, 'No data available')
        )
      ),

      // Data Transferred Chart
      h('div', { className: 'bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700' },
        h('h3', { className: 'text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300' }, 'Data Transferred Over Time'),
        h('div', { className: 'w-full', style: { height: '300px' } },
          historicalData && historicalData.data && historicalData.data.length > 0
            ? h('canvas', { ref: transferChartRef })
            : h('p', { className: 'text-center text-gray-500 dark:text-gray-400 text-sm py-8' }, 'No data available')
        )
      ),

      // Loading state
      loadingHistory && h('div', { className: 'text-center py-6' },
        h('div', { className: 'loader' }),
        h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mt-2' }, 'Loading historical data...')
      ),

      // Statistics Tree (original content) - auto-refreshes every 5 seconds
      h('div', { className: 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-6' },
        h('h2', { className: 'text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100' }, 'Statistics Tree'),
        h('div', { className: 'flex gap-2 w-full sm:w-auto' },
          h('button', {
            onClick: expandAll,
            className: 'flex-1 sm:flex-none px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 transition-all active:scale-95 text-sm'
          }, 'Expand All'),
          h('button', {
            onClick: collapseAll,
            className: 'flex-1 sm:flex-none px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 transition-all active:scale-95 text-sm'
          }, 'Collapse All')
        )
      ),

      h('div', { className: 'bg-gray-50 dark:bg-gray-700 rounded-lg p-3 max-h-[calc(100vh-200px)] overflow-y-auto' },
        statsTree && statsTree.EC_TAG_STATTREE_NODE
          ? renderStatsNode(statsTree.EC_TAG_STATTREE_NODE)
          : h('div', { className: 'text-center py-6 text-xs sm:text-sm text-gray-500 dark:text-gray-400' },
              loading ? 'Loading statistics...' : 'No statistics available'
            )
      )
    );
  };

  // Navigation handler for NavButton
  const handleNavigate = (view) => {
    setCurrentView(view);
    setPage(0);
  };

  const renderDeleteModal = () => {
    if (!deleteModal.show) return null;

    const isServer = deleteModal.isServer;
    const itemType = isServer ? 'Server' : 'File';
    const actionWord = isServer ? 'remove' : 'delete';

    return h('div', {
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4',
      onClick: cancelDelete
    },
      h('div', {
        className: 'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all',
        onClick: (e) => e.stopPropagation()
      },
        h('div', { className: 'flex items-center gap-3 mb-4' },
          h('div', { className: 'flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center' },
            h(Icon, { name: 'trash', size: 24, className: 'text-red-600 dark:text-red-400' })
          ),
          h('div', null,
            h('h3', { className: 'text-lg font-semibold text-gray-900 dark:text-gray-100' }, `${isServer ? 'Remove' : 'Delete'} ${itemType}`),
            h('p', { className: 'text-sm text-gray-500 dark:text-gray-400' }, 'This action cannot be undone')
          )
        ),
        h('p', { className: 'text-gray-700 dark:text-gray-300 mb-6 break-words' },
          `Are you sure you want to ${actionWord} `,
          h('span', { className: 'font-semibold break-words max-w-full' }, `"${deleteModal.fileName}"`),
          '?'
        ),
        h('div', { className: 'flex gap-3 justify-end' },
          h('button', {
            onClick: cancelDelete,
            className: 'px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
          }, 'Cancel'),
          h('button', {
            onClick: confirmDelete,
            className: 'px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors'
          }, isServer ? 'Remove' : 'Delete')
        )
      )
    );
  };

  // Render app
  return h('div', { className: 'min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col' },

    // Overlay "Reconnecting"
    !wsConnected
      ? h('div', {
          className: 'absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 pointer-events-auto',
          style: { backdropFilter: 'blur(2px)' }
        },
          h('span', { className: 'text-white text-lg font-semibold' }, 'Reconnecting to server...')
        )
      : null,

    h('div', { className: `flex-1 flex flex-col ${wsConnected ? '' : 'pointer-events-none opacity-50'}` },
      
      // Header
      h('header', { className: 'bg-white dark:bg-gray-800 shadow-md sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700' },
        h('div', { className: 'mx-auto px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between' },
          h('div', { className: 'flex items-center gap-1.5 sm:gap-3' },
            h('img', { src: '/static/logo-brax.png', alt: 'aMule', className: 'w-6 h-6 sm:w-10 sm:h-10 object-contain' }),
            h('h1', { className: 'text-sm sm:text-xl font-bold text-gray-800 dark:text-gray-100' }, 'aMule Controller')
          ),
          h('div', { className: 'flex items-center gap-1' },
            h('button', {
              onClick: toggleTheme,
              className: 'p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors',
              title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }, h(Icon, { name: theme === 'dark' ? 'sun' : 'moon', size: 18, className: 'text-gray-600 dark:text-gray-300' })),
            // Show home button on mobile (portrait) or in landscape mode
            h('button', {
              onClick: () => handleNavigate('home'),
              className: `${isLandscape ? '' : 'md:hidden'} p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors`,
              title: 'Go to Home'
            }, h(Icon, { name: 'home', size: 20, className: 'text-gray-600 dark:text-gray-300' }))
          )
        )
      ),

      // Main layout
      h('div', { className: 'px-2 sm:px-3 py-2 sm:py-3 flex flex-col md:flex-row gap-2 sm:gap-3 flex-1' },
        
        // Sidebar (hidden on mobile and in landscape mode)
        !isLandscape && h('aside', {
          className: 'hidden md:flex md:flex-col w-56 bg-white dark:bg-gray-800 p-3 rounded-lg shadow border border-gray-200 dark:border-gray-700'
        },
          h('div', { className: 'space-y-2' },
            h(NavButton, { icon: 'home', label: 'Home', view: 'home', active: currentView === 'home', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'search', label: 'Search', view: 'search', active: currentView === 'search' || currentView === 'search-results', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'download', label: 'Downloads', view: 'downloads', active: currentView === 'downloads', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'upload', label: 'Uploads', view: 'uploads', active: currentView === 'uploads', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'share', label: 'Shared Files', view: 'shared', active: currentView === 'shared', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'server', label: 'Servers', view: 'servers', active: currentView === 'servers', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'fileText', label: 'Logs', view: 'logs', active: currentView === 'logs', onNavigate: handleNavigate }),
            h(NavButton, { icon: 'chartBar', label: 'Statistics', view: 'statistics', active: currentView === 'statistics', onNavigate: handleNavigate })
          )
        ),

        // Main content
        h('main', { className: 'flex-1 bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700' },
          currentView === 'home' && renderHome(),
          currentView === 'search' && renderSearch(),
          currentView === 'search-results' && renderSearchResults(),
          currentView === 'downloads' && renderDownloads(),
          currentView === 'uploads' && renderUploads(),
          currentView === 'shared' && renderShared(),
          currentView === 'servers' && renderServers(),
          currentView === 'logs' && renderLogs(),
          currentView === 'statistics' && renderStatistics()
        )
      )
    ),
    renderDeleteModal(),
    renderFooter()
  );

};

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(h(AmuleWebApp));
