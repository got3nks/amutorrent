/**
 * Main Server File
 * Orchestrates all modules and starts server
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

// Import modules
const config = require('./modules/config');
const configManager = require('./modules/configManager');
const configAPI = require('./modules/configAPI');
const amuleManager = require('./modules/amuleManager');
const geoIPManager = require('./modules/geoIPManager');
const arrManager = require('./modules/arrManager');
const metricsAPI = require('./modules/metricsAPI');
const torznabAPI = require('./modules/torznabAPI');
const qbittorrentAPI = require('./modules/qbittorrentAPI');
const webSocketHandlers = require('./modules/webSocketHandlers');
const autoRefreshManager = require('./modules/autoRefreshManager');
const basicRoutes = require('./modules/basicRoutes');

// Import utilities
const MetricsDB = require('./database');
const HashStore = require('./lib/hashStore');

// Create logs directory if it doesn't exist
const logDir = config.getLogDir();
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// Create a write stream for the log file
const logFile = require('path').join(logDir, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Logging helper
function log(...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(String).join(' ');
  logStream.write(`[${timestamp}] ${message}\n`);
  console.log(`[${timestamp}]`, ...args);
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize databases and stores
const dbPath = config.getMetricsDbPath();
const metricsDB = new MetricsDB(dbPath);
log('📊 Metrics database initialized:', dbPath);

const hashDbPath = config.getHashDbPath();
const hashStore = new HashStore(hashDbPath);
log('🔗 Hash store initialized:', hashDbPath);

// Setup module dependencies
configManager.setLogger(log);
configAPI.setLogger(log);
configAPI.setAmuleManager(amuleManager);
configAPI.setConfigModule(config);
amuleManager.setLogger(log);
geoIPManager.setLogger(log);
arrManager.setLogger(log);
metricsAPI.setLogger(log);
metricsAPI.setMetricsDB(metricsDB);
torznabAPI.setLogger(log);
torznabAPI.setAmuleManager(amuleManager);
qbittorrentAPI.setLogger(log);
qbittorrentAPI.setAmuleManager(amuleManager);
qbittorrentAPI.setHashStore(hashStore);
qbittorrentAPI.setConfigManager(configManager);
webSocketHandlers.setLogger(log);
autoRefreshManager.setLogger(log);
basicRoutes.setLogger(log);

// Create shared broadcast function
const createBroadcaster = (wss) => (msg) => {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
  });
};
const broadcastFn = createBroadcaster(wss);

// Setup cross-module dependencies
arrManager.setAmuleManager(amuleManager);
arrManager.setBroadcast(broadcastFn);

webSocketHandlers.setAmuleManager(amuleManager);
webSocketHandlers.setGeoIPManager(geoIPManager);
webSocketHandlers.setBroadcast(broadcastFn);

autoRefreshManager.setAmuleManager(amuleManager);
autoRefreshManager.setGeoIPManager(geoIPManager);
autoRefreshManager.setMetricsDB(metricsDB);
autoRefreshManager.setBroadcast(broadcastFn);
autoRefreshManager.setWebSocketServer(wss);

basicRoutes.setWebSocketServer(wss);
basicRoutes.setGeoIPManager(geoIPManager);
basicRoutes.setAmuleManager(amuleManager);

// Broadcast helper (for external use)
function broadcast(msg) {
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
  });
}

// Register routes
basicRoutes.registerRoutes(app);
configAPI.registerRoutes(app); // Configuration API (always available)
metricsAPI.registerRoutes(app);
torznabAPI.registerRoutes(app);
qbittorrentAPI.registerRoutes(app);

// WebSocket handler
wss.on('connection', (ws, req) => {
  webSocketHandlers.handleConnection(ws, req);
});

// Schedule daily cleanup at 3 AM
function scheduleCleanup() {
  const now = new Date();
  const next3AM = new Date(now);
  next3AM.setHours(config.CLEANUP_HOUR, 0, 0, 0);
  if (next3AM <= now) {
    next3AM.setDate(next3AM.getDate() + 1);
  }
  const msUntil3AM = next3AM - now;

  setTimeout(() => {
    const deleted = metricsDB.cleanupOldData(config.CLEANUP_DAYS);
    log(`🧹 Cleaned up ${deleted} old metrics records (older than ${config.CLEANUP_DAYS} days)`);
    scheduleCleanup(); // Schedule next cleanup
  }, msUntil3AM);

  log(`⏰ Scheduled next cleanup at ${next3AM.toISOString()}`);
}

scheduleCleanup();

// Initialize all application services
async function initializeServices() {
  log('🚀 Initializing services...');

  // Initialize GeoIP
  await geoIPManager.initGeoIP();

  // Start watching GeoIP files after a short delay
  setTimeout(() => {
    geoIPManager.watchGeoIPFiles();
  }, 5000);

  // Start aMule connection
  await amuleManager.startConnection();

  // Start auto-refresh
  autoRefreshManager.start();

  // Schedule automatic searches
  arrManager.scheduleAutomaticSearches();

  log('✅ All services initialized successfully');
}

// Initialize and start services
async function startServer() {
  // Step 1: Load configuration from ConfigManager
  log('⚙️  Loading configuration...');
  await configManager.loadConfig();

  // Update config module with loaded configuration
  config.updateFromConfigManager(configManager);

  // Pass initializeServices to configAPI so it can initialize services after first-run setup
  configAPI.setInitializeServices(initializeServices);

  // Step 2: Check if this is the first run
  const isFirstRun = await configManager.isFirstRun();

  // Track connections for graceful shutdown
  const connections = new Set();
  server.on('connection', (conn) => {
    connections.add(conn);
    conn.on('close', () => connections.delete(conn));
  });

  if (isFirstRun) {
    log('🎯 First run detected - setup wizard required');
    log('⚠️  Services will NOT be initialized until configuration is complete');
    log('📝 Please access the web interface to complete the setup');

    // In first-run mode, only start the HTTP server and WebSocket
    // Don't initialize aMule, GeoIP, or Arr services
    server.listen(config.PORT, () => {
      log(`🚀 aMule Web Controller running on http://localhost:${config.PORT}`);
      log(`📊 WebSocket server ready`);
      log(`⚙️  SETUP MODE - Complete configuration via web interface`);
    });
  } else {
    log('✅ Configuration loaded successfully');

    // Normal startup flow - initialize all services
    await initializeServices();

    // Start server
    server.listen(config.PORT, () => {
      log(`🚀 aMule Web Controller running on http://localhost:${config.PORT}`);
      log(`📊 WebSocket server ready`);
      log(`🔌 aMule connection: ${config.AMULE_HOST}:${config.AMULE_PORT}`);
    });
  }

  // Graceful shutdown
  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      log(`${signal} received, closing server...`);

      connections.forEach((conn) => conn.destroy());

      server.close(() => {
        log('Server closed');
        
        // Shutdown modules
        autoRefreshManager.stop();
        amuleManager.shutdown();
        
        // Close databases
        metricsDB.close();
        log('Database closed');
        
        hashStore.close();
        log('Hash store closed');
        
        // Close GeoIP
        geoIPManager.shutdown().then(() => {
          log('GeoIP closed');
          process.exit(0);
        });
      });
    });
  });
}

// Start server
startServer().catch(err => {
  log('❌ Failed to start server:', err);
  process.exit(1);
});