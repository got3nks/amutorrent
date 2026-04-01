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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Application modules
const config = require('./modules/config');
const configAPI = require('./modules/configAPI');
const authManager = require('./modules/authManager');
const authAPI = require('./modules/authAPI');
const registry = require('./lib/ClientRegistry');
// Manager class registry — adding a new client type requires one entry here + clientMeta.js
const MANAGER_CLASSES = {
  amule: require('./modules/amuleManager').AmuleManager,
  rtorrent: require('./modules/rtorrentManager').RtorrentManager,
  qbittorrent: require('./modules/qbittorrentManager').QbittorrentManager,
  deluge: require('./modules/delugeManager').DelugeManager,
  transmission: require('./modules/transmissionManager').TransmissionManager,
};
const geoIPManager = require('./modules/geoIPManager');
const arrManager = require('./modules/arrManager');
const metricsAPI = require('./modules/metricsAPI');
const historyAPI = require('./modules/historyAPI');
const torznabAPI = require('./modules/torznabAPI');
const qbittorrentAPI = require('./modules/qbittorrentAPI');
const prowlarrAPI = require('./modules/prowlarrAPI');
const rtorrentAPI = require('./modules/rtorrentAPI');
const delugeAPI = require('./modules/delugeAPI');
const transmissionAPI = require('./modules/transmissionAPI');
const webSocketHandlers = require('./modules/webSocketHandlers');
const restAPI = require('./modules/restAPI');
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
const userAPI = require('./modules/userAPI');

// Middleware
const requireAuth = require('./middleware/auth');
const { createTrustedProxyMiddleware } = require('./middleware/trustedProxy');

// Utilities
const MetricsDB = require('./database');
const HashStore = require('./lib/qbittorrent/hashStore');
const DownloadHistory = require('./lib/downloadHistory');
const UserManager = require('./modules/userManager');
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
const wss = new WebSocket.Server({ server, perMessageDeflate: true });

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Preact/htm
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null  // App runs HTTP; HTTPS upgrade breaks non-TLS deployments
    }
  },
  crossOriginEmbedderPolicy: false,  // Not needed for this app, can break WebSocket
  crossOriginOpenerPolicy: false,    // Requires HTTPS on non-localhost origins
  hsts: false  // Managed by reverse proxy; avoid double HSTS
}));

// Global rate limiting (200 requests per minute per IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', globalLimiter);
app.use('/indexer', globalLimiter);

// Stricter rate limit on auth/login endpoints (20 attempts per minute)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/v2/auth/login', authLimiter);

// Express middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware (will be configured after config loading)
let sessionMiddleware = null;

// --- WebSocket broadcast setup ---
// Supports optional per-client filtering and message transformation:
//   broadcast(msg)                                — send to all clients (backwards-compatible)
//   broadcast(msg, { filter: u => bool })         — skip clients whose ws.user doesn't match
//   broadcast(msg, { transform: (msg, u) => msg })— per-client message transformation
const createBroadcaster = (wss) => (msg, { filter, transform } = {}) => {
    wss.clients.forEach(c => {
        if (c.readyState !== WebSocket.OPEN) return;
        if (filter && !filter(c.user)) return;
        const payload = transform ? transform(msg, c.user) : msg;
        if (payload) c.send(JSON.stringify(payload));
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

// User database
const userDbPath = config.getUserDbPath();
const userManager = new UserManager(userDbPath);

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
  broadcast: broadcastFn,
  userManager
};

// Inject dependencies into each module (each module only uses what it needs)
metricsAPI.inject(deps);
autoRefreshManager.inject(deps);
historyAPI.inject(deps);
qbittorrentAPI.inject(deps);
prowlarrAPI.inject(deps);
authAPI.inject(deps);
webSocketHandlers.inject(deps);
restAPI.setHandlers(webSocketHandlers);
requireAuth.setUserManager(userManager);
configAPI.inject(deps);
basicRoutes.inject(deps);
arrManager.inject(deps);
torznabAPI.inject(deps);
dataFetchService.inject(deps);
rtorrentAPI.inject(deps);
delugeAPI.inject(deps);
transmissionAPI.inject(deps);
moveOperationManager.inject(deps);
filesystemAPI.inject(deps);
eventScriptingManager.inject(deps);
notificationsAPI.inject(deps);
userAPI.inject(deps);

// onConnect callbacks are registered per-instance inside initializeServices()
// (moved from module-level to support multi-instance)

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

// --- Trusted proxy SSO middleware ---
// Authenticates users via reverse proxy headers (e.g., Authelia, Authentik)
// Runs after session so it can create sessions, before requireAuth so sessions are ready
const trustedProxyMiddleware = createTrustedProxyMiddleware(userManager);
app.use(trustedProxyMiddleware);

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
delugeAPI.registerRoutes(app);     // Deluge API (files, etc.)
transmissionAPI.registerRoutes(app); // Transmission API (files, etc.)
filesystemAPI.registerRoutes(app);  // Filesystem browsing API
restAPI.registerRoutes(app);        // REST API (HTTP bridge to WS handlers)

// Item detail API — serves raw/trackersDetailed stripped from broadcasts (Phase 0)
app.get('/api/item/detail/:hash', (req, res) => {
  const detail = dataFetchService.getItemDetail(req.params.hash, req.query.instanceId);
  if (!detail) return res.status(404).json({ error: 'Item not found' });
  res.json(detail);
});
notificationsAPI.registerRoutes(app); // Notifications API
userAPI.registerRoutes(app);           // User management API (admin only)
versionAPI.registerProtectedRoutes(app); // Version seen tracking (protected)

// Debug API — only when NODE_INSPECT=true
if (process.env.NODE_INSPECT === 'true') {
  const debugAPI = require('./modules/debugAPI');
  debugAPI.registerRoutes(app);
}

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
  const sessionSecret = config.ensureSessionSecret();

  // Enable trust proxy when trusted proxy authentication is configured
  // This ensures correct client IP for rate limiting and secure cookie auto-detection
  const trustedProxyConfig = config.getTrustedProxyConfig();
  const behindProxy = trustedProxyConfig.enabled === true;
  if (behindProxy) {
    app.set('trust proxy', 1);
    log('🔒 trust proxy enabled (trusted proxy authentication is configured)');
  }

  sessionMiddleware = session({
    store: new SQLiteStore({
      client: sessionDB,
      expired: {
        clear: true,
        intervalMs: 900000 // 15 minutes
      }
    }),
    secret: sessionSecret,
    name: 'amule.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: behindProxy ? 'auto' : false,
      sameSite: 'lax',
      maxAge: null       // Set dynamically in login based on rememberMe
    },
    ...(behindProxy ? { proxy: true } : {})
  });

  log('🔐 Session middleware initialized');
}

/**
 * Wire WebSocket force-disconnect callback for session invalidation.
 * When a user's sessions are invalidated, close their WebSocket connections.
 */
function wireDisconnectCallback() {
  authManager.setDisconnectCallback((userId) => {
    let disconnected = 0;
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN && ws.user?.userId === userId) {
        ws.close(4001, 'Session invalidated');
        disconnected++;
      }
    });
    if (disconnected > 0) {
      log(`🔌 Force-disconnected ${disconnected} WebSocket client(s) for userId ${userId}`);
    }
  });
}

/**
 * Reinitialize all client connections.
 * Clears the registry, creates fresh manager instances for each configured client,
 * registers onConnect callbacks, adopts legacy history entries, and starts connections.
 * Called from initializeServices() on startup and from configAPI on settings save.
 * @returns {Promise<void>}
 */
async function reinitializeClients() {
  // Wire client configs and register in ClientRegistry
  registry.clear();
  categoryManager.clearClientDefaultPaths();
  const clientConfigs = config.getClientConfigs();

  for (const cc of clientConfigs) {
    const ManagerClass = MANAGER_CLASSES[cc.type];
    const manager = new ManagerClass();
    manager.inject(deps);
    manager.setClientConfig(cc);
    registry.register(cc.id, cc.type, manager, { displayName: cc.name });
  }

  // Register per-instance onConnect callbacks for category sync
  registry.forEach((manager, instanceId) => {
    if (!manager.onConnect || !manager.onConnectSync) return;

    manager.onConnect(async () => {
      try {
        await manager.onConnectSync(categoryManager, { qbittorrentAPI });
      } catch (err) {
        log(`[CategoryManager] Failed to sync on ${manager.clientType} connect (${instanceId}):`, err.message);
      }
    });
  });

  // Adopt legacy entries now that registry has real instance IDs
  const instances = [];
  registry.forEach((manager, instanceId) => {
    instances.push({ instanceId, clientType: manager.clientType });
  });
  if (downloadHistory) {
    downloadHistory.adoptLegacyEntries(instances);
  }
  metricsDB.adoptLegacyMetrics(instances);

  // Start connections via registry (replaces hardcoded startConnection calls)
  registry.forEach((manager) => {
    manager.startConnection();
  });
}

/**
 * Initialize all application services
 * Called after first-run configuration or on normal startup
 */
async function initializeServices() {
  log('🚀 Initializing services...');

  // Migrate legacy auth to user accounts (before session init)
  await userManager.migrateFromConfig(config, downloadHistory);

  // Backfill download ownership from history (runs once when ownership table is empty)
  userManager.backfillFromHistory(downloadHistory);

  // Initialize session and authentication
  initializeSessionMiddleware();
  authManager.start();
  wireDisconnectCallback();

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

  // Initialize client connections
  await reinitializeClients();

  // Recover any interrupted move operations (may fail gracefully if clients not yet connected)
  await moveOperationManager.recoverOperations();

  // Start auto-refresh loop for stats/downloads/uploads
  autoRefreshManager.start();

  // Schedule automatic searches for Sonarr/Radarr
  arrManager.scheduleAutomaticSearches();

  log('✅ All services initialized successfully');
}

// ============================================================================
// HTTP LISTENER WITH IPv6 FALLBACK
// ============================================================================

/**
 * Start the HTTP server with automatic IPv4 fallback.
 * Tries the configured host (default '::' for dual-stack), falls back to
 * '0.0.0.0' if IPv6 is not available (EAFNOSUPPORT / EADDRNOTAVAIL).
 */
function startServerListen(onReady) {
  const port = config.PORT;
  const host = config.HOST;

  const onListening = (boundHost) => {
    const label = (boundHost === '::' || boundHost === '0.0.0.0') ? 'listening on all interfaces' : `bound to ${boundHost}`;
    log(`🚀 aMuTorrent web UI running on http://localhost:${port} — ${label}`);
    log(`📊 WebSocket server ready`);
    if (onReady) onReady();
  };

  server.once('error', (err) => {
    if ((err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') && host === '::') {
      log(`⚠️  IPv6 not available (${err.code}), falling back to 0.0.0.0`);
      server.listen(port, '0.0.0.0', () => onListening('0.0.0.0'));
    } else {
      throw err;
    }
  });

  server.listen(port, host, () => onListening(host));
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

  // Pass initializeServices and reinitializeClients to configAPI
  configAPI.setInitializeServices(initializeServices);
  configAPI.setReinitializeClients(reinitializeClients);

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

    // If auth is enabled via env vars, try to migrate existing credentials
    if (config.getAuthEnabled()) {
      await userManager.migrateFromConfig(config, downloadHistory);

      if (userManager.hasUsers()) {
        // Credentials migrated — enable auth for the wizard
        log('🔐 Auth enabled via environment - initializing session middleware');
        initializeSessionMiddleware();
        authManager.start();
        wireDisconnectCallback();
      } else {
        // Auth enabled but no password set — disable auth so the wizard is accessible
        log('⚠️  WEB_AUTH_ENABLED=true but no WEB_AUTH_PASSWORD set — disabling auth for setup wizard');
        config.runtimeConfig.server.auth.enabled = false;
      }
    }

    // In first-run mode, only start HTTP server and WebSocket
    // Don't initialize aMule, GeoIP, or Arr services until configured
    startServerListen(() => {
      log(`⚙️  SETUP MODE - Complete configuration via web interface`);
    });
  } else {
    // NORMAL STARTUP
    log('✅ Configuration loaded successfully');

    // Initialize all services
    await initializeServices();

    // Start HTTP server
    startServerListen(() => {
      registry.forEach((manager, instanceId) => {
        const cc = config.getClientConfig(instanceId);
        if (cc) log(`🔌 ${cc.name}: ${cc.host}:${cc.port}`);
      });
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

        // Shutdown all client managers via registry
        const shutdownPromises = [];
        registry.forEach((manager, instanceId) => {
          shutdownPromises.push(manager.shutdown().then(() => {
            log(`${instanceId} connection closed`);
          }).catch(err => {
            log(`⚠️ Error shutting down ${instanceId}: ${err.message}`);
          }));
        });
        Promise.all(shutdownPromises).then(() => {
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

          userManager.close();
          log('User database closed');

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
