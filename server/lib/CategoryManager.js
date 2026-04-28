/**
 * CategoryManager - Unified category system for aMule and rTorrent
 *
 * Manages app-level categories that are synchronized with:
 * - aMule categories (full objects with id, title, color, path, etc.)
 * - rTorrent labels (simple strings extracted from downloads)
 *
 * Categories are persisted to categories.json and synchronized bidirectionally
 * with clients when they connect.
 */

const fs = require('fs').promises;
const path = require('path');
const BaseModule = require('./BaseModule');
const configTester = require('./configTester');
const clientMeta = require('./clientMeta');

// Client registry - replaces direct singleton manager imports
const registry = require('./ClientRegistry');
const config = require('../modules/config');

// ============================================================================
// COLOR UTILITIES
// ============================================================================

// Default color palette for auto-created categories
const COLOR_PALETTE = [
  '#FF5733', // Red-orange
  '#33A1FF', // Blue
  '#33FF57', // Green
  '#FF33A1', // Pink
  '#A133FF', // Purple
  '#FFFF33', // Yellow
  '#33FFFF', // Cyan
  '#FF8C33', // Orange
  '#8C33FF', // Violet
  '#33FF8C', // Mint
  '#FF3333', // Red
  '#3333FF', // Blue
];

/**
 * Convert aMule BGR integer color to hex string
 * aMule stores colors as BGR integers (e.g., 0xCCCCCC)
 * @param {number} bgrColor - BGR integer color
 * @returns {string} Hex color string (#RRGGBB)
 */
function amuleColorToHex(bgrColor) {
  if (bgrColor === null || bgrColor === undefined) {
    return '#CCCCCC';
  }
  // aMule stores as BGR, we need RGB
  const b = (bgrColor >> 16) & 0xFF;
  const g = (bgrColor >> 8) & 0xFF;
  const r = bgrColor & 0xFF;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Convert hex color string to aMule BGR integer
 * @param {string} hexColor - Hex color string (#RRGGBB)
 * @returns {number} BGR integer color
 */
function hexColorToAmule(hexColor) {
  if (!hexColor || typeof hexColor !== 'string') {
    return 0xCCCCCC;
  }
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return (b << 16) | (g << 8) | r;
}

/**
 * Get a random color from the palette
 * @param {Set} usedColors - Set of already used colors to avoid
 * @returns {string} Hex color string
 */
function getRandomColor(usedColors = new Set()) {
  // Try to find an unused color
  for (const color of COLOR_PALETTE) {
    if (!usedColors.has(color)) {
      return color;
    }
  }
  // All colors used, pick random from palette
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

// ============================================================================
// CATEGORY MANAGER CLASS
// ============================================================================

class CategoryManager extends BaseModule {
  constructor() {
    super();
    this.categories = new Map(); // name -> category object
    this.filePath = null;
    this._loaded = false;
    // Store default paths from clients, keyed by instanceId (e.g. 'amule-host-4712': '/path')
    this.clientDefaultPaths = {};
    // Store path validation warnings per category
    // Format: { categoryName: { path: 'warning', mappings: { amule: 'warning', rtorrent: 'warning' } } }
    this.pathWarnings = {};
    // Debounce concurrent validateAllPaths calls so all client syncs settle first
    this._validateTimer = null;
    this._validateResolvers = [];
  }

  /**
   * Clear all client default paths (called when clients are reinitialized)
   */
  clearClientDefaultPaths() {
    this.clientDefaultPaths = {};
  }

  /**
   * Set the default path for a client instance
   * @param {string} instanceId - Instance identifier (e.g. 'amule-host-4712')
   * @param {string} path - Default directory path
   */
  setClientDefaultPath(instanceId, path) {
    this.clientDefaultPaths[instanceId] = path || null;
    this.log(`📂 Set default path for ${instanceId}: ${path || '(none)'}`);
  }

  /**
   * Get the default path for a specific instance
   * @param {string} instanceId - Instance ID
   * @returns {string|null}
   */
  getClientDefaultPath(instanceId) {
    const result = this.clientDefaultPaths[instanceId];
    if (result !== undefined) return result;
    if (instanceId) {
      this.warn(`⚠️ getClientDefaultPath: no path for instanceId "${instanceId}"`);
    }
    return null;
  }

  /**
   * Get the default paths for all clients (per-instance)
   * @returns {Object} { instanceId: string|null, ... }
   */
  getClientDefaultPaths() {
    return { ...this.clientDefaultPaths };
  }

  // ==========================================================================
  // PATH VALIDATION
  // ==========================================================================

  /**
   * Validate all category paths and store warnings.
   * Debounced: multiple rapid calls (e.g. from concurrent client connects)
   * are collapsed into a single validation that runs after calls settle.
   * All callers receive the same result promise.
   * @returns {Promise<Object>} { hasWarnings: boolean, warnings: Object }
   */
  validateAllPaths() {
    // Reset the debounce timer on each call
    if (this._validateTimer) {
      clearTimeout(this._validateTimer);
    }

    // Return a promise that will resolve when the debounced validation completes
    return new Promise((resolve, reject) => {
      this._validateResolvers.push({ resolve, reject });

      this._validateTimer = setTimeout(async () => {
        this._validateTimer = null;
        const resolvers = this._validateResolvers;
        this._validateResolvers = [];

        try {
          const result = await this._doValidateAllPaths();
          for (const r of resolvers) r.resolve(result);
        } catch (err) {
          for (const r of resolvers) r.reject(err);
        }
      }, 500);
    });
  }

  /**
   * Internal: actual path validation logic
   * @returns {Promise<Object>} { hasWarnings: boolean, warnings: Object }
   * @private
   */
  async _doValidateAllPaths() {
    this.pathWarnings = {};
    let hasWarnings = false;

    for (const category of this.categories.values()) {
      const warnings = await this._validateCategoryPaths(category);
      if (warnings) {
        this.pathWarnings[category.name] = warnings;
        hasWarnings = true;
      }
    }

    if (hasWarnings) {
      const warningCount = Object.keys(this.pathWarnings).length;
      this.warn(`⚠️ Path validation: ${warningCount} category/ies with path issues`);
      for (const [catName, warns] of Object.entries(this.pathWarnings)) {
        if (warns.path) {
          const cat = this.categories.get(catName);
          this.warn(`   ⚠️ "${catName}" path (${cat?.path || '(unknown)'}): ${warns.path}`);
        }
        for (const [client, msg] of Object.entries(warns.mappings || {})) {
          const cat = this.categories.get(catName);
          const mappedPath = cat?.pathMappings?.[client] || this.getClientDefaultPath(client) || '(unknown)';
          this.warn(`   ⚠️ "${catName}" ${client} path mapping (${mappedPath}): ${msg}`);
        }
      }
    } else {
      this.log(`✅ Path validation: all category paths OK`);
    }

    return { hasWarnings, warnings: this.pathWarnings };
  }

  /**
   * Check if a pathMappings key or instanceId resolves to a client with nativeMove capability.
   * Keys can be clientType ('qbittorrent') or instanceId ('qbittorrent-host-8080').
   * @param {string} key - pathMappings key or instanceId
   * @returns {boolean}
   * @private
   */
  _isNativeMoveKey(key) {
    // Try as instanceId first (e.g. 'qbittorrent-host-8080')
    const mgr = registry.get(key);
    if (mgr) return clientMeta.hasCapability(mgr.clientType, 'nativeMove');
    // Try as clientType directly (e.g. 'qbittorrent')
    return clientMeta.hasCapability(key, 'nativeMove');
  }

  /**
   * Validate paths for a single category
   * @param {Object} category - Category object
   * @returns {Promise<Object|null>} Warnings object or null if no issues
   * @private
   */
  async _validateCategoryPaths(category) {
    const warnings = { path: null, mappings: {} };
    let hasWarnings = false;

    // For Default category, only check mapped paths (regular path is from clients)
    const isDefault = category.name === 'Default';

    // Check if path mapping is enabled for this category
    // Skip clients with nativeMove (they handle moves/deletes internally via API)
    const hasPathMapping = category.pathMappings && Object.entries(category.pathMappings).some(
      ([key, val]) => val && !this._isNativeMoveKey(key)
    );

    if (isDefault) {
      // Default category: validate mapped paths if enabled, otherwise check client default paths
      if (hasPathMapping) {
        for (const [key, mappedPath] of Object.entries(category.pathMappings)) {
          if (!mappedPath) continue;
          if (this._isNativeMoveKey(key)) continue;
          const result = await this._checkPath(mappedPath);
          if (result) {
            warnings.mappings[key] = result;
            hasWarnings = true;
          }
        }
      } else {
        // No path mapping: check client default paths (per-instance)
        for (const [instanceId, defaultPath] of Object.entries(this.clientDefaultPaths)) {
          if (!defaultPath) continue;
          if (this._isNativeMoveKey(instanceId)) continue;
          const result = await this._checkPath(defaultPath);
          if (result) {
            warnings.mappings[instanceId] = result;
            hasWarnings = true;
          }
        }
      }
    } else {
      // Non-default category
      if (hasPathMapping) {
        for (const [key, mappedPath] of Object.entries(category.pathMappings)) {
          if (!mappedPath) continue;
          if (this._isNativeMoveKey(key)) continue;
          const result = await this._checkPath(mappedPath);
          if (result) {
            warnings.mappings[key] = result;
            hasWarnings = true;
          }
        }
      } else if (category.path) {
        // No path mapping: check regular path
        const result = await this._checkPath(category.path);
        if (result) {
          warnings.path = result;
          hasWarnings = true;
        }
      }
    }

    return hasWarnings ? warnings : null;
  }

  /**
   * Check a single path and return warning message if issues
   * @param {string} pathToCheck - Path to validate
   * @returns {Promise<string|null>} Warning message or null if OK
   * @private
   */
  async _checkPath(pathToCheck) {
    if (!pathToCheck || !pathToCheck.trim()) {
      return null;
    }

    try {
      const result = await configTester.testDirectoryAccess(pathToCheck.trim(), { checkOnly: true });

      if (!result.exists) {
        return 'Directory not found';
      }
      if (!result.readable || !result.writable) {
        if (result.error) {
          return result.error;
        }
        const missing = [];
        if (!result.readable) missing.push('read');
        if (!result.writable) missing.push('write');
        return `Missing ${missing.join(' and ')} permission`;
      }
      return null;
    } catch (err) {
      return `Check failed: ${err.message}`;
    }
  }

  /**
   * Get path warnings for all categories
   * @returns {Object} Path warnings object
   */
  getPathWarnings() {
    return { ...this.pathWarnings };
  }

  /**
   * Check if there are any path warnings
   * @returns {boolean}
   */
  hasPathWarnings() {
    return Object.keys(this.pathWarnings).length > 0;
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  /**
   * Get the path to categories.json
   * @returns {string} File path
   */
  getFilePath() {
    if (!this.filePath) {
      const dataDir = config.getDataDir() || path.join(__dirname, '..', 'data');
      this.filePath = path.join(dataDir, 'categories.json');
    }
    return this.filePath;
  }

  /**
   * Load categories from file
   * Creates default category if file doesn't exist
   * @returns {Promise<void>}
   */
  async load() {
    try {
      const filePath = this.getFilePath();
      const data = await fs.readFile(filePath, 'utf8');
      const json = JSON.parse(data);

      this.categories.clear();

      if (json.categories && typeof json.categories === 'object') {
        for (const [name, cat] of Object.entries(json.categories)) {
          // Migrate legacy single amuleId → per-instance amuleIds
          let amuleIds = cat.amuleIds || {};
          if (!cat.amuleIds && cat.amuleId != null) {
            // Legacy data: discard single amuleId — sync will re-discover per-instance IDs
            amuleIds = {};
          }

          this.categories.set(name, {
            name,
            color: cat.color || '#CCCCCC',
            path: cat.path || null,
            pathMappings: cat.pathMappings || null,
            comment: cat.comment || '',
            priority: cat.priority ?? 0,
            amuleIds,
            createdAt: cat.createdAt || new Date().toISOString(),
            updatedAt: cat.updatedAt || new Date().toISOString()
          });
        }
      }

      // Ensure Default category exists
      this._ensureDefaultCategory();

      this._loaded = true;
      this.log(`📂 Loaded ${this.categories.size} categories from ${filePath}`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File doesn't exist - create with default category
        this.log('📂 categories.json not found, creating with default category');
        this._ensureDefaultCategory();
        await this.save();
        this._loaded = true;
      } else {
        this.error('❌ Error loading categories:', err.message);
        // Initialize with default on error
        this._ensureDefaultCategory();
        this._loaded = true;
      }
    }
  }

  /**
   * Save categories to file
   * @returns {Promise<void>}
   */
  async save() {
    try {
      const filePath = this.getFilePath();

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Build categories object
      const categoriesObj = {};
      for (const [name, cat] of this.categories) {
        categoriesObj[name] = {
          color: cat.color,
          path: cat.path,
          pathMappings: cat.pathMappings,
          comment: cat.comment,
          priority: cat.priority,
          amuleIds: cat.amuleIds || {},
          createdAt: cat.createdAt,
          updatedAt: cat.updatedAt
        };
      }

      const json = {
        version: 1,
        categories: categoriesObj
      };

      await fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8');
      this.log(`💾 Saved ${this.categories.size} categories to ${filePath}`);
    } catch (err) {
      this.error('❌ Error saving categories:', err.message);
      throw err;
    }
  }

  /**
   * Ensure Default category exists
   * @private
   */
  _ensureDefaultCategory() {
    if (!this.categories.has('Default')) {
      const now = new Date().toISOString();
      this.categories.set('Default', {
        name: 'Default',
        color: '#CCCCCC',
        path: null,
        pathMappings: null,
        comment: '',
        priority: 0,
        amuleIds: {},
        createdAt: now,
        updatedAt: now
      });
    }
  }

  // ==========================================================================
  // ACCESSORS
  // ==========================================================================

  /**
   * Get all categories formatted for frontend (with id field for compatibility)
   * @returns {Object} Object with categories array, clientDefaultPaths, and pathWarnings
   */
  getAllForFrontend() {
    const categories = Array.from(this.categories.values()).map(cat => ({
      title: cat.name,
      color: hexColorToAmule(cat.color),
      path: cat.path || '',
      pathMappings: cat.pathMappings || null,
      comment: cat.comment || '',
      priority: cat.priority ?? 0,
      // Additional unified fields
      name: cat.name,
      hexColor: cat.color,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      // Path warnings for this category (if any)
      pathWarnings: this.pathWarnings[cat.name] || null
    }));

    return {
      categories,
      clientDefaultPaths: this.getClientDefaultPaths(),
      hasPathWarnings: this.hasPathWarnings()
    };
  }

  /**
   * Get category by name
   * @param {string} name - Category name
   * @returns {Object|null} Category object or null
   */
  getByName(name) {
    return this.categories.get(name) || null;
  }

  /**
   * Get category by aMule ID for a specific instance
   * @param {string} instanceId - aMule instance ID
   * @param {number} amuleId - aMule category ID
   * @returns {Object|null} Category object or null
   */
  getByAmuleId(instanceId, amuleId) {
    if (instanceId == null || amuleId == null) {
      return null;
    }
    for (const cat of this.categories.values()) {
      if (cat.amuleIds?.[instanceId] === amuleId) {
        return cat;
      }
    }
    return null;
  }

  /**
   * Get category name for an aMule category ID on a specific instance
   * @param {string} instanceId - aMule instance ID
   * @param {number} amuleId - aMule category ID
   * @returns {string} Category name (defaults to 'Default')
   */
  getCategoryNameByAmuleId(instanceId, amuleId) {
    const cat = this.getByAmuleId(instanceId, amuleId);
    return cat ? cat.name : 'Default';
  }

  // ==========================================================================
  // SYNC MUTATION PRIMITIVES
  // These are used by managers' syncCategories() to modify app state
  // without knowing about CategoryManager internals.
  // ==========================================================================

  /**
   * Import a category from external client data (used during sync).
   * Adds directly to the categories map without propagating to clients.
   * @param {Object} data - { name, color, path, comment, priority, amuleIds }
   * @returns {Object} Created category object
   */
  importCategory({ name, color = '#CCCCCC', path = null, comment = '', priority = 0, amuleIds = {} } = {}) {
    if (!name) throw new Error('Category name is required for import');
    if (this.categories.has(name)) return this.categories.get(name);

    const now = new Date().toISOString();
    const usedColors = new Set(Array.from(this.categories.values()).map(c => c.color));
    const category = {
      name,
      color: color || getRandomColor(usedColors),
      path: path || null,
      pathMappings: null,
      comment: comment || '',
      priority: priority ?? 0,
      amuleIds: amuleIds || {},
      createdAt: now,
      updatedAt: now
    };
    this.categories.set(name, category);
    const idEntries = Object.entries(amuleIds || {});
    this.log(`📥 Imported category "${name}"${idEntries.length > 0 ? ` (amuleIds: ${idEntries.map(([k, v]) => `${k}=${v}`).join(', ')})` : ''}`);
    return category;
  }

  /**
   * Link an existing category to an aMule category ID for a specific instance.
   * @param {string} name - Category name
   * @param {string} instanceId - aMule instance ID
   * @param {number} amuleId - aMule category ID
   * @returns {boolean} True if linked, false if category not found
   */
  linkAmuleId(name, instanceId, amuleId) {
    const category = this.categories.get(name);
    if (!category) return false;
    if (!category.amuleIds) category.amuleIds = {};
    category.amuleIds[instanceId] = amuleId;
    category.updatedAt = new Date().toISOString();
    this.log(`🔗 Linked category "${name}" to amuleId ${amuleId} on ${instanceId}`);
    return true;
  }

  /**
   * Get a read-only snapshot of categories for sync comparison.
   * @returns {Object} { getByAmuleId, getByName, entries, getUnlinkedFor }
   */
  getCategoriesSnapshot() {
    const self = this;
    return {
      getByAmuleId: (instanceId, id) => self.getByAmuleId(instanceId, id),
      getByName: (name) => self.getByName(name),
      entries: () => Array.from(self.categories.entries()),
      getUnlinkedFor: (instanceId) => Array.from(self.categories.entries())
        .filter(([name, cat]) => cat.amuleIds?.[instanceId] == null && name !== 'Default')
        .map(([, cat]) => cat)
    };
  }

  // ==========================================================================
  // POST-SYNC PROPAGATION
  // ==========================================================================

  /**
   * After a client sync imports new categories, propagate them to all other
   * connected clients that support categories. Uses batch-aware method
   * (one getCategories() call per client, not one per category).
   * @param {string} excludeInstanceId - Instance that just synced (already has the categories)
   */
  async propagateToOtherClients(excludeInstanceId) {
    const allCategories = Array.from(this.categories.entries())
      .filter(([name]) => name !== 'Default')
      .map(([, cat]) => cat);

    if (allCategories.length === 0) return;

    let dirty = false;
    for (const mgr of registry.getConnected()) {
      if (mgr.instanceId === excludeInstanceId) continue;
      if (!clientMeta.hasCapability(mgr.clientType, 'categories')) continue;

      const batch = allCategories.map(cat => ({
        name: cat.name, path: cat.path || '',
        comment: cat.comment || '',
        color: hexColorToAmule(cat.color), priority: cat.priority || 0
      }));

      try {
        const results = await mgr.ensureCategoriesBatch(batch);
        // Link any new amuleIds from aMule instances
        for (const r of results) {
          if (r.amuleId != null) {
            const appCat = this.categories.get(r.name);
            if (appCat) {
              if (!appCat.amuleIds) appCat.amuleIds = {};
              if (appCat.amuleIds[mgr.instanceId] == null) {
                appCat.amuleIds[mgr.instanceId] = r.amuleId;
                appCat.updatedAt = new Date().toISOString();
                dirty = true;
              }
            }
          }
        }
      } catch (err) {
        this.warn(`⚠️ Failed to propagate categories to ${mgr.instanceId}: ${err.message}`);
      }
    }

    if (dirty) await this.save();
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a new category
   * Also ensures category exists in all connected clients with category support
   * @param {string} name - Category name
   * @param {Object} options - Category options
   * @param {string} options.color - Hex color string
   * @param {string} options.path - Download path
   * @param {Object|null} options.pathMappings - Per-client path mappings { amule: '/path', rtorrent: '/path' }
   * @param {string} options.comment - Comment
   * @param {number} options.priority - Priority (0=Normal, 1=High, 2=Low, 3=Auto)
   * @param {boolean} options.skipClients - Skip creating in clients (used during sync)
   * @returns {Promise<Object>} Created category
   */
  async create(name, { color = null, path = null, pathMappings = null, comment = '', priority = 0, skipClients = false } = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Category name is required');
    }

    if (this.categories.has(name)) {
      throw new Error(`Category "${name}" already exists`);
    }

    // Get used colors for random selection
    const usedColors = new Set(Array.from(this.categories.values()).map(c => c.color));

    // Normalize pathMappings - treat empty object as null
    const normalizedMappings = pathMappings && Object.keys(pathMappings).length > 0 ? pathMappings : null;

    const now = new Date().toISOString();
    const finalColor = color || getRandomColor(usedColors);
    const category = {
      name,
      color: finalColor,
      path: path || null,
      pathMappings: normalizedMappings,
      comment: comment || '',
      priority: priority ?? 0,
      amuleIds: {},
      createdAt: now,
      updatedAt: now
    };

    // Ensure category exists in all connected clients with category support
    if (!skipClients) {
      for (const mgr of registry.getConnected()) {
        if (!clientMeta.hasCapability(mgr.clientType, 'categories')) continue;
        try {
          const result = await mgr.ensureCategoryExists({
            name, path: category.path || '', comment: category.comment || '',
            color: hexColorToAmule(finalColor), priority: category.priority || 0
          });
          if (result?.amuleId != null) {
            category.amuleIds[mgr.instanceId] = result.amuleId;
          }
        } catch (err) {
          this.warn(`⚠️ Failed to ensure category in ${mgr.clientType} (${mgr.instanceId}): ${err.message}`);
        }
      }
    }

    this.categories.set(name, category);
    await this.save();

    const idEntries = Object.entries(category.amuleIds);
    this.log(`✅ Created category: ${name}${idEntries.length > 0 ? ` (amuleIds: ${idEntries.map(([k, v]) => `${k}=${v}`).join(', ')})` : ''}`);
    return category;
  }

  /**
   * Update an existing category
   * Also updates in all connected clients with category support
   * @param {string} name - Category name
   * @param {Object} [updates] - Fields to update
   * @param {string} [updates.color] - Category color
   * @param {string} [updates.path] - Download path
   * @param {Object} [updates.pathMappings] - Per-client path mappings
   * @param {string} [updates.comment] - Category comment
   * @param {number} [updates.priority] - Category priority
   * @param {boolean} [updates.skipClients] - Skip updating in clients (used during sync)
   * @returns {Promise<{category: Object, clientVerification: Object|null}>} Updated category and verification result
   */
  async update(name, { color, path, pathMappings, comment, priority, skipClients = false } = {}) {
    const category = this.categories.get(name);
    if (!category) {
      throw new Error(`Category "${name}" not found`);
    }

    // Update fields that are provided
    if (color !== undefined) category.color = color;
    if (path !== undefined) category.path = path;
    if (pathMappings !== undefined) {
      // Normalize pathMappings - treat empty object as null
      category.pathMappings = pathMappings && Object.keys(pathMappings).length > 0 ? pathMappings : null;
    }
    if (comment !== undefined) category.comment = comment;
    if (priority !== undefined) category.priority = priority;
    category.updatedAt = new Date().toISOString();

    // Update in all connected clients with category support
    // Skip for Default category — it's managed by the clients themselves
    let clientVerification = null;
    if (!skipClients && name !== 'Default') {
      for (const mgr of registry.getConnected()) {
        if (!clientMeta.hasCapability(mgr.clientType, 'categories')) continue;
        try {
          const amuleColor = hexColorToAmule(category.color);
          const result = await mgr.editCategory({
            id: category.amuleIds?.[mgr.instanceId], name: category.name,
            path: category.path || '',
            defaultPath: this.getClientDefaultPath(mgr.instanceId),
            comment: category.comment || '', color: amuleColor,
            priority: category.priority || 0
          });
          // Track first verification failure across all clients
          if (result?.verified === false && !clientVerification) {
            clientVerification = { ...result, instanceId: mgr.instanceId, clientType: mgr.clientType };
          }
        } catch (err) {
          this.warn(`⚠️ Failed to update category in ${mgr.clientType} (${mgr.instanceId}): ${err.message}`);
        }
      }
    }

    await this.save();

    this.log(`📝 Updated category: ${name}`);
    return { category, clientVerification };
  }

  /**
   * Rename a category
   * Propagates to all connected clients that support categories
   * @param {string} oldName - Current name
   * @param {string} newName - New name
   * @returns {Promise<{category: Object, clientVerification: Object|null}>} Renamed category and verification result
   */
  async rename(oldName, newName) {
    if (oldName === 'Default') {
      throw new Error('Cannot rename Default category');
    }

    const category = this.categories.get(oldName);
    if (!category) {
      throw new Error(`Category "${oldName}" not found`);
    }

    if (this.categories.has(newName)) {
      throw new Error(`Category "${newName}" already exists`);
    }

    // Rename in all connected clients that support categories
    let clientVerification = null;
    for (const mgr of registry.getConnected()) {
      if (!clientMeta.hasCapability(mgr.clientType, 'categories')) continue;
      try {
        const result = await mgr.renameCategory({
          oldName,
          newName,
          path: category.path || '',
          comment: category.comment || '',
          color: hexColorToAmule(category.color),
          priority: category.priority || 0,
          id: category.amuleIds?.[mgr.instanceId],
          defaultPath: this.getClientDefaultPath(mgr.instanceId)
        });
        this.log(`📤 Renamed category "${oldName}" → "${newName}" on ${mgr.instanceId}`);
        // Track first verification failure across all clients
        if (result?.verified === false && !clientVerification) {
          clientVerification = { ...result, instanceId: mgr.instanceId, clientType: mgr.clientType };
        }
      } catch (err) {
        this.warn(`⚠️ Failed to rename category on ${mgr.instanceId}: ${err.message}`);
      }
    }

    // Update the category
    category.name = newName;
    category.updatedAt = new Date().toISOString();

    // Move to new key
    this.categories.delete(oldName);
    this.categories.set(newName, category);

    await this.save();

    this.log(`📝 Renamed category: ${oldName} -> ${newName}`);
    return { category, clientVerification };
  }

  /**
   * Delete a category
   * Also deletes from aMule if connected and category has amuleId
   * @param {string} name - Category name
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(name) {
    if (name === 'Default') {
      throw new Error('Cannot delete Default category');
    }

    const category = this.categories.get(name);
    if (!category) {
      throw new Error(`Category "${name}" not found`);
    }

    // Delete from all connected clients that support categories
    for (const mgr of registry.getConnected()) {
      if (!clientMeta.hasCapability(mgr.clientType, 'categories')) continue;
      try {
        await mgr.deleteCategory({ id: category.amuleIds?.[mgr.instanceId], name });
        this.log(`📤 Deleted category "${name}" from ${mgr.clientType} on ${mgr.instanceId}`);
      } catch (err) {
        this.warn(`⚠️ Failed to delete category from ${mgr.clientType} (${mgr.instanceId}): ${err.message}`);
      }
    }

    this.categories.delete(name);
    await this.save();

    this.log(`🗑️  Deleted category: ${name}`);
    return true;
  }


  // ==========================================================================
  // PATH TRANSLATION
  // ==========================================================================

  /**
   * Translate a client path to app path using category mappings
   * @param {string} clientPath - Full file path as reported by client
   * @param {string} clientType - Client type ('amule', 'rtorrent', or 'qbittorrent')
   * @param {string} instanceId - Instance ID for per-instance path mapping lookup
   * @returns {string} Translated path or original if no mapping found
   */
  translatePath(clientPath, clientType, instanceId) {
    if (!clientPath || !clientType) return clientPath;

    // Normalize path - remove trailing slashes for consistent matching
    const normalizedClientPath = clientPath.replace(/\/+$/, '');

    // Find matching category by path prefix (longest match wins)
    let bestMatch = null;
    let bestMatchLength = 0;

    for (const category of this.categories.values()) {
      // Skip Default category in first pass (it's handled as fallback)
      if (category.name === 'Default') continue;
      if (!category.path) continue;

      // Use pathMappings if available, otherwise use path (native setup)
      const appPath = (instanceId && category.pathMappings?.[instanceId]) || category.pathMappings?.[clientType] || category.path;
      if (!appPath) continue;

      // Normalize category path for matching
      const normalizedCategoryPath = category.path.replace(/\/+$/, '');

      if (normalizedClientPath.startsWith(normalizedCategoryPath) &&
          normalizedCategoryPath.length > bestMatchLength) {
        bestMatch = {
          clientPath: normalizedCategoryPath,
          appPath: appPath.replace(/\/+$/, '')
        };
        bestMatchLength = normalizedCategoryPath.length;
      }
    }

    if (bestMatch) {
      return normalizedClientPath.replace(bestMatch.clientPath, bestMatch.appPath);
    }

    // Fallback: Use Default category's pathMappings if available
    const defaultCategory = this.categories.get('Default');
    if (defaultCategory?.pathMappings) {
      const defaultAppPath = (instanceId && defaultCategory.pathMappings[instanceId]) || defaultCategory.pathMappings[clientType];
      if (defaultAppPath) {
        const normalizedDefaultAppPath = defaultAppPath.replace(/\/+$/, '');

        // Get the client's default/base path for this instance
        // This is what the client reports as its download directory
        const clientDefaultPath = defaultCategory.path || (instanceId ? this.clientDefaultPaths[instanceId] : null);
        if (clientDefaultPath) {
          const normalizedClientDefaultPath = clientDefaultPath.replace(/\/+$/, '');

          // If input path starts with or equals the client's default path, do prefix replacement
          if (normalizedClientPath === normalizedClientDefaultPath) {
            // Exact match - return the app path directly
            return normalizedDefaultAppPath;
          } else if (normalizedClientPath.startsWith(normalizedClientDefaultPath + '/')) {
            // Prefix match - replace prefix with app path
            const relativePath = normalizedClientPath.substring(normalizedClientDefaultPath.length);
            return normalizedDefaultAppPath + relativePath;
          }
        }

        // Legacy fallback for edge cases (last segment matching)
        const inputLastSegment = normalizedClientPath.split('/').pop();
        const defaultLastSegment = normalizedDefaultAppPath.split('/').pop();

        if (inputLastSegment === defaultLastSegment) {
          return normalizedDefaultAppPath;
        }
      }
    }

    return clientPath;
  }

  // ==========================================================================
  // STATIC COLOR UTILITIES (exported for frontend compatibility)
  // ==========================================================================

  static amuleColorToHex = amuleColorToHex;
  static hexColorToAmule = hexColorToAmule;
  static getRandomColor = getRandomColor;
}

// Export singleton and class
const categoryManager = new CategoryManager();

module.exports = categoryManager;
module.exports.CategoryManager = CategoryManager;
module.exports.amuleColorToHex = amuleColorToHex;
module.exports.hexColorToAmule = hexColorToAmule;
module.exports.getRandomColor = getRandomColor;
