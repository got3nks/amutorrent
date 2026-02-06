/**
 * Main Server File
 * Orchestrates all modules and starts server
 */

// ============================================================================
// DEPENDENCIES
// ============================================================================

// Express and HTTP
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);

// Application modules
const config = require('./modules/config');
const configAPI = require('./modules/configAPI');
const authManager = require('./modules/authManager');
const authAPI = require('./modules/authAPI');
const amuleManager = require('./modules/amuleManager');
const rtorrentManager = require('./modules/rtorrentManager');
const geoIPManager = require('./modules/geoIPManager');
const arrManager = require('./modules/arrManager');
const metricsAPI = require('./modules/metricsAPI');
const historyAPI = require('./modules/historyAPI');
const torznabAPI = require('./modules/torznabAPI');
const qbittorrentAPI = require('./modules/qbittorrentAPI');
const prowlarrAPI = require('./modules/prowlarrAPI');
const rtorrentAPI = require('./modules/rtorrentAPI');
const webSocketHandlers = require('./modules/webSocketHandlers');
const autoRefreshManager = require('./modules/autoRefreshManager');
const dataFetchService = require('./lib/DataFetchService');
const categoryManager = require('./lib/CategoryManager');
const basicRoutes = require('./modules/basicRoutes');
const versionAPI = require('./modules/versionAPI');
const moveOperationManager = require('./lib/MoveOperationManager');
const filesystemAPI = require('./modules/filesystemAPI');
const eventScriptingManager = require('./lib/EventScriptingManager');
const notificationManager = require('./lib/NotificationManager');
const notificationsAPI = require('./modules/notificationsAPI');

// Middleware
const requireAuth = require('./middleware/auth');

// Utilities
const MetricsDB = require('./database');
const HashStore = require('./lib/qbittorrent/hashStore');
const DownloadHistory = require('./lib/downloadHistory');
const logger = require('./lib/logger');

// ============================================================================
// LOGGING SETUP
// ============================================================================

// Initialize centralized logger
const logDir = config.getLogDir();
logger.init(logDir);

// Create bound log function for local use
const log = logger.log.bind(logger);

// ============================================================================
// EXPRESS & WEBSOCKET SETUP
// ============================================================================

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Express middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware (will be configured after config loading)
let sessionMiddleware = null;

// --- WebSocket broadcast setup ---
const createBroadcaster = (wss) => (msg) => {
    wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
    });
};
const broadcastFn = createBroadcaster(wss);

// ============================================================================
// DATABASE & STORE INITIALIZATION
// ============================================================================

const dbPath = config.getMetricsDbPath();
const metricsDB = new MetricsDB(dbPath);

const hashDbPath = config.getHashDbPath();
const hashStore = new HashStore(hashDbPath);

// Download history database
const historyDbPath = config.getHistoryDbPath();
const downloadHistory = new DownloadHistory(historyDbPath);

// Move operations database
const moveOpsDbPath = config.getMoveOpsDbPath();
moveOperationManager.initDB(moveOpsDbPath);

// ============================================================================
// MODULE DEPENDENCY INJECTION
// ============================================================================

// Common dependencies object - modules pick what they need via inject()
// Note: Singleton managers (amuleManager, rtorrentManager, geoIPManager, authManager,
// config, categoryManager, hostnameResolver) should be imported directly in modules that need them
const deps = {
  metricsDB,
  downloadHistoryDB: downloadHistory,
  hashStore,
  wss,
  broadcast: broadcastFn
};

// Inject dependencies into each module (each module only uses what it needs)
metricsAPI.inject(deps);
autoRefreshManager.inject(deps);
historyAPI.inject(deps);
amuleManager.inject(deps);
rtorrentManager.inject(deps);
qbittorrentAPI.inject(deps);
prowlarrAPI.inject(deps);
authAPI.inject(deps);
webSocketHandlers.inject(deps);
configAPI.inject(deps);
basicRoutes.inject(deps);
arrManager.inject(deps);
torznabAPI.inject(deps);
dataFetchService.inject(deps);
rtorrentAPI.inject(deps);
moveOperationManager.inject(deps);
filesystemAPI.inject(deps);
eventScriptingManager.inject(deps);
notificationsAPI.inject(deps);

// When aMule connects (including late enablement), sync categories
amuleManager.onConnect(async () => {
  try {
    // Sync qBittorrent API categories
    await qbittorrentAPI.handler.syncCategories();
  } catch (err) {
    log('[qBittorrent] Failed to sync categories on aMule connect:', err.message);
  }

  try {
    // Sync unified categories with aMule
    const amuleCategories = await amuleManager.getClient()?.getCategories();
    if (amuleCategories) {
      // Extract aMule's default path (category with id=0)
      const defaultCat = amuleCategories.find(c => c.id === 0);
      if (defaultCat?.path) {
        categoryManager.setClientDefaultPath('amule', defaultCat.path);
      }

      const result = await categoryManager.syncWithAmule(amuleCategories);
      // If categories need to be updated in aMule, do it now
      if (result.toUpdateInAmule && result.toUpdateInAmule.length > 0) {
        for (const catUpdate of result.toUpdateInAmule) {
          await categoryManager.updateAmuleCategoryWithVerify(
            catUpdate.categoryId,
            catUpdate.title,
            catUpdate.path,
            catUpdate.comment,
            catUpdate.color,
            catUpdate.priority
          );
        }
      }

      // Re-validate paths now that we have aMule's default path
      await categoryManager.validateAllPaths();
    }
  } catch (err) {
    log('[CategoryManager] Failed to sync categories on aMule connect:', err.message);
  }
});

// When rtorrent connects, sync labels as categories
rtorrentManager.onConnect && rtorrentManager.onConnect(async () => {
  try {
    // Get rTorrent's default directory
    const defaultDir = await rtorrentManager.getDefaultDirectory();
    if (defaultDir) {
      categoryManager.setClientDefaultPath('rtorrent', defaultDir);
    }

    const downloads = await rtorrentManager.getDownloads();
    const labels = [...new Set(downloads.map(d => d.label).filter(Boolean))];
    await categoryManager.syncWithRtorrent(labels);

    // Re-validate paths now that we have rtorrent's default path
    await categoryManager.validateAllPaths();
  } catch (err) {
    log('[CategoryManager] Failed to sync labels on rtorrent connect:', err.message);
  }
});

// ============================================================================
// ROUTE REGISTRATION (ORDER MATTERS!)
// ============================================================================

// --- Public routes (no authentication required) ---

// Basic public routes (request logging, static files, /login page)
basicRoutes.registerPublicRoutes(app);

// Unprotected API routes (for external integrations)
torznabAPI.registerRoutes(app);       // Torznab indexer API
qbittorrentAPI.registerRoutes(app);   // qBittorrent API
versionAPI.registerRoutes(app);       // Version info API (public)

// --- Session middleware ---
// Apply session middleware (needed for auth API and protected routes)
app.use((req, res, next) => {
  if (sessionMiddleware) {
    sessionMiddleware(req, res, next);
  } else {
    // Session not yet initialized - allow through (first run mode)
    next();
  }
});

// --- Auth API routes ---
// These routes need session but not requireAuth (handles their own auth)
authAPI.registerRoutes(app);

// --- Authentication middleware ---
// Apply to all subsequent routes (protects web UI and internal APIs)
app.use(requireAuth);

// --- Protected routes ---
basicRoutes.registerRoutes(app);    // Protected basic routes (home, health)
configAPI.registerRoutes(app);      // Configuration management API
metricsAPI.registerRoutes(app);     // Metrics API
historyAPI.registerRoutes(app);     // Download history API
prowlarrAPI.registerRoutes(app);    // Prowlarr torrent search API
rtorrentAPI.registerRoutes(app);    // rtorrent API (files, etc.)
filesystemAPI.registerRoutes(app);  // Filesystem browsing API
notificationsAPI.registerRoutes(app); // Notifications API
versionAPI.registerProtectedRoutes(app); // Version seen tracking (protected)

// ============================================================================
// WEBSOCKET SETUP
// ============================================================================

wss.on('connection', (ws, req) => {
  webSocketHandlers.handleConnection(ws, req);
});

// ============================================================================
// SERVICE INITIALIZATION
// ============================================================================

/**
 * Initialize session middleware with authentication support
 */
function initializeSessionMiddleware() {
  const sessionDB = authManager.getSessionDB();
  const sessionSecret = config.getSessionSecret();

  sessionMiddleware = session({
    store: new SQLiteStore({
      client: sessionDB,
      expired: {
        clear: true,
        intervalMs: 900000 // 15 minutes
      }
    }),
    secret: sessionSecret || 'fallback-secret-key',
    name: 'amule.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,     // Allow cookies over HTTP (for Docker/development)
      sameSite: 'lax',   // Less restrictive than 'strict', but still secure
      maxAge: null       // Set dynamically in login based on rememberMe
    }
  });

  log('🔐 Session middleware initialized');
}

/**
 * Initialize all application services
 * Called after first-run configuration or on normal startup
 */
async function initializeServices() {
  log('🚀 Initializing services...');

  // Initialize session and authentication
  initializeSessionMiddleware();
  authManager.start();

  // Initialize category manager (load categories from file)
  await categoryManager.load();

  // Initialize notification manager
  notificationManager.init();

  // Validate category paths on boot
  await categoryManager.validateAllPaths();

  // Initialize GeoIP database
  await geoIPManager.initGeoIP();

  // Start watching GeoIP files after a short delay (prevents initial reload)
  setTimeout(() => {
    geoIPManager.watchGeoIPFiles();
  }, 5000);

  // Start aMule connection with auto-reconnect (non-blocking)
  // Connection happens in background - server starts immediately
  amuleManager.startConnection();

  // Start rtorrent connection with auto-reconnect (non-blocking)
  // Only connects if rtorrent is enabled in config
  rtorrentManager.startConnection();

  // Recover any interrupted move operations (may fail gracefully if clients not yet connected)
  await moveOperationManager.recoverOperations();

  // Start auto-refresh loop for stats/downloads/uploads
  autoRefreshManager.start();

  // Schedule automatic searches for Sonarr/Radarr
  arrManager.scheduleAutomaticSearches();

  log('✅ All services initialized successfully');
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Initialize configuration and start server
 */
async function startServer() {
  // Load configuration from file or environment variables
  log('⚙️  Loading configuration...');
  await config.loadConfig();

  // Pass initializeServices to configAPI so it can initialize after first-run setup
  configAPI.setInitializeServices(initializeServices);

  // Check if this is the first run (no config file exists)
  const isFirstRun = await config.isFirstRun();

  // Track connections for graceful shutdown
  const connections = new Set();
  server.on('connection', (conn) => {
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
  });

  if (isFirstRun) {
    // FIRST RUN MODE
    log('🎯 First run detected - setup wizard required');
    log('⚠️  Services will NOT be initialized until configuration is complete');
    log('📝 Please access the web interface to complete the setup');

    // If auth is enabled via env vars, we need session middleware for login
    if (config.getAuthEnabled()) {
      log('🔐 Auth enabled via environment - initializing session middleware');
      initializeSessionMiddleware();
      authManager.start();
    }

    // In first-run mode, only start HTTP server and WebSocket
    // Don't initialize aMule, GeoIP, or Arr services until configured
    server.listen(config.PORT, () => {
      log(`🚀 aMuTorrent web UI running on http://localhost:${config.PORT}`);
      log(`📊 WebSocket server ready`);
      log(`⚙️  SETUP MODE - Complete configuration via web interface`);
    });
  } else {
    // NORMAL STARTUP
    log('✅ Configuration loaded successfully');

    // Initialize all services
    await initializeServices();

    // Start HTTP server
    server.listen(config.PORT, () => {
      log(`🚀 aMuTorrent web UI running on http://localhost:${config.PORT}`);
      log(`📊 WebSocket server ready`);
      log(`🔌 aMule connection: ${config.AMULE_HOST}:${config.AMULE_PORT}`);
    });
  }

  // ============================================================================
  // GRACEFUL SHUTDOWN
  // ============================================================================

  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      log(`${signal} received, shutting down gracefully...`);

      // Destroy all active connections
      connections.forEach((conn) => conn.destroy());

      // Close HTTP server
      server.close(() => {
        log('HTTP server closed');

        // Stop background tasks
        authManager.stop();
        autoRefreshManager.stop();

        // Shutdown aMule connection
        amuleManager.shutdown().then(() => {
          log('aMule connection closed');

          // Shutdown rtorrent connection
          return rtorrentManager.shutdown();
        }).then(() => {
          log('rtorrent connection closed');

          // Close databases
          metricsDB.close();
          log('Metrics database closed');

          hashStore.close();
          log('Hash store closed');

          downloadHistory.close();
          log('Download history closed');

          // Close move operation manager
          moveOperationManager.shutdown();
          log('Move operation manager closed');

          // Close GeoIP
          geoIPManager.shutdown().then(() => {
            log('GeoIP manager closed');
            log('✅ Graceful shutdown complete');

            // Close logger last
            logger.close();
            process.exit(0);
          });
        });
      });
    });
  });
}

// ============================================================================
// ENTRY POINT
// ============================================================================

startServer().catch(err => {
  log('❌ Failed to start server:', err);
  process.exit(1);
});
