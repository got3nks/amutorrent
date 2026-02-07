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

// Singleton managers - imported directly instead of injected
const amuleManager = require('../modules/amuleManager');
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

/**
 * Map aMule/app category priority to rTorrent priority
 * aMule: 0=Normal, 1=High, 2=Low, 3=Auto
 * rTorrent: 0=off, 1=low, 2=normal, 3=high
 * @param {number} amulePriority - aMule/app priority value
 * @returns {number} rTorrent priority value
 */
function mapPriorityToRtorrent(amulePriority) {
  switch (amulePriority) {
    case 1: return 3;  // High → high
    case 2: return 1;  // Low → low
    case 0:            // Normal → normal
    case 3:            // Auto → normal (no equivalent in rTorrent)
    default: return 2; // Default to normal
  }
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
    // Store default paths from clients (for Default category display)
    this.clientDefaultPaths = { amule: null, rtorrent: null };
    // Store path validation warnings per category
    // Format: { categoryName: { path: 'warning', mappings: { amule: 'warning', rtorrent: 'warning' } } }
    this.pathWarnings = {};
  }

  /**
   * Check if aMule is connected
   * @returns {boolean}
   */
  isAmuleConnected() {
    return amuleManager && amuleManager.isConnected();
  }

  /**
   * Update a category in aMule and verify it was saved correctly
   * Wrapper that calls updateCategory then reads back to verify
   * @param {number} amuleId - aMule category ID
   * @param {string} title - Category title
   * @param {string} path - Download path
   * @param {string} comment - Comment
   * @param {number} color - BGR color integer
   * @param {number} priority - Priority value
   * @returns {Promise<{success: boolean, verified: boolean, mismatches: string[]}>}
   */
  async updateAmuleCategoryWithVerify(amuleId, title, path, comment, color, priority) {
    if (!this.isAmuleConnected()) {
      return { success: false, verified: false, mismatches: ['aMule not connected'] };
    }

    // If path is empty, use aMule's default directory
    // (aMule doesn't accept empty path - it means "use default")
    const effectivePath = path || this.clientDefaultPaths.amule || '';

    try {
      // Perform the update
      await amuleManager.getClient().updateCategory(
        amuleId,
        title,
        effectivePath,
        comment,
        color,
        priority
      );
      this.log(`📤 Updated category "${title}" in aMule (ID: ${amuleId}, path: "${effectivePath}")`);

      // Verify by reading back
      const amuleCategories = await amuleManager.getClient().getCategories();
      const savedCat = amuleCategories?.find(c => c.id === amuleId);

      if (!savedCat) {
        this.log(`⚠️ Verify: Category with amuleId ${amuleId} not found after update`);
        return { success: true, verified: false, mismatches: ['Category not found after update'] };
      }

      // Compare each field
      const mismatches = [];

      if (savedCat.title !== title) {
        mismatches.push(`title: expected "${title}", got "${savedCat.title}"`);
      }
      if ((savedCat.path || '') !== effectivePath) {
        mismatches.push(`path: expected "${effectivePath}", got "${savedCat.path || ''}"`);
      }
      if ((savedCat.comment || '') !== comment) {
        mismatches.push(`comment: expected "${comment}", got "${savedCat.comment || ''}"`);
      }
      if ((savedCat.color ?? 0xCCCCCC) !== color) {
        mismatches.push(`color: expected ${color.toString(16)}, got ${(savedCat.color ?? 0xCCCCCC).toString(16)}`);
      }
      if ((savedCat.priority ?? 0) !== priority) {
        mismatches.push(`priority: expected ${priority}, got ${savedCat.priority ?? 0}`);
      }

      if (mismatches.length > 0) {
        this.log(`⚠️ Verify: Category "${title}" mismatches: ${mismatches.join(', ')}`);
        return { success: true, verified: false, mismatches };
      }

      this.log(`✅ Verify: Category "${title}" saved correctly in aMule`);
      return { success: true, verified: true, mismatches: [] };
    } catch (err) {
      this.log(`⚠️ Failed to update category in aMule: ${err.message}`);
      return { success: false, verified: false, mismatches: [err.message] };
    }
  }

  /**
   * Set the default path for a client
   * @param {string} clientType - 'amule' or 'rtorrent'
   * @param {string} path - Default directory path
   */
  setClientDefaultPath(clientType, path) {
    if (clientType === 'amule' || clientType === 'rtorrent') {
      this.clientDefaultPaths[clientType] = path || null;
      this.log(`📂 Set ${clientType} default path: ${path || '(none)'}`);
    }
  }

  /**
   * Get the default paths for all clients
   * @returns {Object} { amule: string|null, rtorrent: string|null }
   */
  getClientDefaultPaths() {
    return { ...this.clientDefaultPaths };
  }

  // ==========================================================================
  // PATH VALIDATION
  // ==========================================================================

  /**
   * Validate all category paths and store warnings
   * Checks each category's path or mapped paths based on configuration
   * @returns {Promise<Object>} { hasWarnings: boolean, warnings: Object }
   */
  async validateAllPaths() {
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
      this.log(`⚠️ Path validation: ${warningCount} category/ies with path issues`);
    } else {
      this.log(`✅ Path validation: all category paths OK`);
    }

    return { hasWarnings, warnings: this.pathWarnings };
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
    const hasPathMapping = category.pathMappings &&
      (category.pathMappings.amule || category.pathMappings.rtorrent);

    if (isDefault) {
      // Default category: validate mapped paths if enabled, otherwise check client default paths
      if (hasPathMapping) {
        if (category.pathMappings.amule) {
          const result = await this._checkPath(category.pathMappings.amule);
          if (result) {
            warnings.mappings.amule = result;
            hasWarnings = true;
          }
        }
        if (category.pathMappings.rtorrent) {
          const result = await this._checkPath(category.pathMappings.rtorrent);
          if (result) {
            warnings.mappings.rtorrent = result;
            hasWarnings = true;
          }
        }
      } else {
        // No path mapping: check the client default paths
        if (this.clientDefaultPaths.amule) {
          const result = await this._checkPath(this.clientDefaultPaths.amule);
          if (result) {
            warnings.mappings.amule = result;
            hasWarnings = true;
          }
        }
        if (this.clientDefaultPaths.rtorrent) {
          const result = await this._checkPath(this.clientDefaultPaths.rtorrent);
          if (result) {
            warnings.mappings.rtorrent = result;
            hasWarnings = true;
          }
        }
      }
    } else {
      // Non-default category
      if (hasPathMapping) {
        // Path mapping enabled: check mapped paths only (not the client path)
        if (category.pathMappings.amule) {
          const result = await this._checkPath(category.pathMappings.amule);
          if (result) {
            warnings.mappings.amule = result;
            hasWarnings = true;
          }
        }
        if (category.pathMappings.rtorrent) {
          const result = await this._checkPath(category.pathMappings.rtorrent);
          if (result) {
            warnings.mappings.rtorrent = result;
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
          this.categories.set(name, {
            name,
            color: cat.color || '#CCCCCC',
            path: cat.path || null,
            pathMappings: cat.pathMappings || null,
            comment: cat.comment || '',
            priority: cat.priority ?? 0,
            amuleId: cat.amuleId ?? null,
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
        this.log('❌ Error loading categories:', err.message);
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
          amuleId: cat.amuleId,
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
      this.log('❌ Error saving categories:', err.message);
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
        amuleId: 0,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  // ==========================================================================
  // ACCESSORS
  // ==========================================================================

  /**
   * Get all categories as array
   * @returns {Array} Array of category objects
   */
  getAll() {
    return Array.from(this.categories.values());
  }

  /**
   * Get all categories formatted for frontend (with id field for compatibility)
   * @returns {Object} Object with categories array, clientDefaultPaths, and pathWarnings
   */
  getAllForFrontend() {
    const categories = this.getAll().map(cat => ({
      id: cat.amuleId ?? null,
      title: cat.name,
      color: hexColorToAmule(cat.color),
      path: cat.path || '',
      pathMappings: cat.pathMappings || null,
      comment: cat.comment || '',
      priority: cat.priority ?? 0,
      // Additional unified fields
      name: cat.name,
      hexColor: cat.color,
      amuleId: cat.amuleId,
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
   * Get category by aMule ID
   * @param {number} amuleId - aMule category ID
   * @returns {Object|null} Category object or null
   */
  getByAmuleId(amuleId) {
    if (amuleId === null || amuleId === undefined) {
      return null;
    }
    for (const cat of this.categories.values()) {
      if (cat.amuleId === amuleId) {
        return cat;
      }
    }
    return null;
  }

  /**
   * Get category name for an aMule category ID
   * @param {number} amuleId - aMule category ID
   * @returns {string} Category name (defaults to 'Default')
   */
  getCategoryNameByAmuleId(amuleId) {
    const cat = this.getByAmuleId(amuleId);
    return cat ? cat.name : 'Default';
  }

  /**
   * Get category name for an rTorrent label
   * @param {string} label - rTorrent label
   * @returns {string} Category name (defaults to 'Default' if empty/none)
   */
  getCategoryNameByLabel(label) {
    if (!label || label === '(none)') {
      return 'Default';
    }
    return this.categories.has(label) ? label : 'Default';
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a new category
   * Also creates in aMule if connected (unless skipAmule is set)
   * @param {string} name - Category name
   * @param {Object} options - Category options
   * @param {string} options.color - Hex color string
   * @param {string} options.path - Download path
   * @param {Object|null} options.pathMappings - Per-client path mappings { amule: '/path', rtorrent: '/path' }
   * @param {string} options.comment - Comment
   * @param {number} options.priority - Priority (0=Normal, 1=High, 2=Low, 3=Auto)
   * @param {number|null} options.amuleId - aMule category ID (null for rTorrent-only)
   * @param {boolean} options.skipAmule - Skip creating in aMule (used during sync)
   * @returns {Promise<Object>} Created category
   */
  async create(name, { color = null, path = null, pathMappings = null, comment = '', priority = 0, amuleId = null, skipAmule = false } = {}) {
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
      amuleId: amuleId ?? null,
      createdAt: now,
      updatedAt: now
    };

    // Create in aMule if connected (and not skipped)
    if (!skipAmule && this.isAmuleConnected() && category.amuleId === null) {
      try {
        // First check if category with same name already exists in aMule
        const amuleCategories = await amuleManager.getClient().getCategories();
        const existingCat = amuleCategories?.find(c => c.title === name);

        if (existingCat && existingCat.id != null) {
          // Link to existing aMule category instead of creating duplicate
          category.amuleId = existingCat.id;
          this.log(`🔗 Linked to existing aMule category "${name}" (ID: ${existingCat.id})`);
        } else {
          // Create new category in aMule
          const amuleColor = hexColorToAmule(finalColor);
          const result = await amuleManager.getClient().createCategory(
            name,
            category.path || '',
            category.comment || '',
            amuleColor,
            category.priority || 0
          );
          // Check for valid category ID (not null, not undefined)
          if (result.success && result.categoryId != null) {
            category.amuleId = result.categoryId;
            this.log(`📤 Created category "${name}" in aMule (ID: ${result.categoryId})`);
          } else if (result.success) {
            this.log(`⚠️ Category "${name}" created in aMule but no ID returned`);
          }
        }
      } catch (err) {
        this.log(`⚠️ Failed to create category in aMule: ${err.message}`);
        // Continue - category is still created in app
      }
    }

    this.categories.set(name, category);
    await this.save();

    this.log(`✅ Created category: ${name}${category.amuleId !== null ? ` (amuleId: ${category.amuleId})` : ''}`);
    return category;
  }

  /**
   * Update an existing category
   * Also updates in aMule if connected and category has amuleId
   * @param {string} name - Category name
   * @param {Object} updates - Fields to update
   * @param {boolean} options.skipAmule - Skip updating in aMule (used during sync)
   * @returns {Promise<{category: Object, amuleVerification: Object|null}>} Updated category and verification result
   */
  async update(name, { color, path, pathMappings, comment, priority, skipAmule = false } = {}) {
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

    // Update in aMule if connected and has amuleId
    let amuleVerification = null;
    if (!skipAmule && this.isAmuleConnected() && category.amuleId !== null) {
      const amuleColor = hexColorToAmule(category.color);
      amuleVerification = await this.updateAmuleCategoryWithVerify(
        category.amuleId,
        category.name,
        category.path || '',
        category.comment || '',
        amuleColor,
        category.priority || 0
      );
    }

    await this.save();

    this.log(`📝 Updated category: ${name}`);
    return { category, amuleVerification };
  }

  /**
   * Rename a category
   * Also renames in aMule if connected and category has amuleId
   * @param {string} oldName - Current name
   * @param {string} newName - New name
   * @returns {Promise<{category: Object, amuleVerification: Object|null}>} Renamed category and verification result
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

    // Rename in aMule if connected and has amuleId
    let amuleVerification = null;
    if (this.isAmuleConnected() && category.amuleId !== null) {
      const amuleColor = hexColorToAmule(category.color);
      amuleVerification = await this.updateAmuleCategoryWithVerify(
        category.amuleId,
        newName,  // New title
        category.path || '',
        category.comment || '',
        amuleColor,
        category.priority || 0
      );
    }

    // Update the category
    category.name = newName;
    category.updatedAt = new Date().toISOString();

    // Move to new key
    this.categories.delete(oldName);
    this.categories.set(newName, category);

    await this.save();

    this.log(`📝 Renamed category: ${oldName} -> ${newName}`);
    return { category, amuleVerification };
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

    // Delete from aMule if connected and has amuleId
    if (this.isAmuleConnected() && category.amuleId !== null) {
      try {
        await amuleManager.getClient().deleteCategory(category.amuleId);
        this.log(`📤 Deleted category "${name}" from aMule`);
      } catch (err) {
        this.log(`⚠️ Failed to delete category from aMule: ${err.message}`);
      }
    }

    this.categories.delete(name);
    await this.save();

    this.log(`🗑️  Deleted category: ${name}`);
    return true;
  }

  // ==========================================================================
  // CLIENT SYNC
  // ==========================================================================

  /**
   * Sync categories with aMule
   * Called when aMule connects
   * @param {Array} amuleCategories - Categories from aMule
   * @returns {Promise<Object>} Sync results
   */
  async syncWithAmule(amuleCategories) {
    if (!amuleCategories || !Array.isArray(amuleCategories)) {
      this.log('⚠️  No aMule categories to sync');
      return { imported: 0, updated: 0, linked: 0 };
    }

    let imported = 0;
    let updated = 0;
    let linked = 0;
    const toUpdateInAmule = [];

    for (const amuleCat of amuleCategories) {
      const amuleId = amuleCat.id;
      const amuleTitle = amuleCat.title || 'Untitled';

      // Find app category by amuleId
      let appCat = this.getByAmuleId(amuleId);

      if (appCat) {
        // Category exists with this amuleId
        // Check if params differ - app config wins
        // Exception: Don't modify Default category (amuleId 0) - it's aMule's built-in
        const isDefault = amuleId === 0 || appCat.name === 'Default';
        const appColor = hexColorToAmule(appCat.color);
        const amuleColor = amuleCat.color ?? 0xCCCCCC;

        // For path comparison: empty/null in app means "use default"
        // So treat app's empty path as equivalent to aMule's default path
        const amuleDefaultPath = this.clientDefaultPaths.amule || '';
        const appEffectivePath = appCat.path || amuleDefaultPath;
        const amulePath = amuleCat.path || '';

        // Collect differences for logging (skip path/comment for Default)
        const diffs = [];
        if (appCat.name !== amuleTitle && !isDefault) {
          diffs.push(`title: "${amuleTitle}" → "${appCat.name}"`);
        }
        if (appColor !== amuleColor && !isDefault) {
          diffs.push(`color: ${amuleColor.toString(16)} → ${appColor.toString(16)}`);
        }
        if (appEffectivePath !== amulePath && !isDefault) {
          diffs.push(`path: "${amulePath}" → "${appEffectivePath}"`);
        }
        if ((appCat.comment || '') !== (amuleCat.comment || '') && !isDefault) {
          diffs.push(`comment: "${amuleCat.comment || ''}" → "${appCat.comment || ''}"`);
        }
        if ((appCat.priority ?? 0) !== (amuleCat.priority ?? 0) && !isDefault) {
          diffs.push(`priority: ${amuleCat.priority ?? 0} → ${appCat.priority ?? 0}`);
        }

        if (diffs.length > 0) {
          // Queue update to aMule with app params (use effective path, not empty)
          toUpdateInAmule.push({
            categoryId: amuleId,
            title: appCat.name,
            path: appEffectivePath,
            comment: appCat.comment || '',
            color: appColor,
            priority: appCat.priority ?? 0
          });
          updated++;
          this.log(`🔄 Category "${appCat.name}" differs from aMule: ${diffs.join(', ')}`);
        }
      } else {
        // Not found by amuleId, check by name
        appCat = this.getByName(amuleTitle);

        if (appCat) {
          // Name match - link the amuleId
          appCat.amuleId = amuleId;
          appCat.updatedAt = new Date().toISOString();
          linked++;
          this.log(`🔗 Linked category "${amuleTitle}" to amuleId ${amuleId}`);
        } else {
          // No match - import from aMule
          const now = new Date().toISOString();
          const newCat = {
            name: amuleTitle,
            color: amuleColorToHex(amuleCat.color),
            path: amuleCat.path || null,
            pathMappings: null,
            comment: amuleCat.comment || 'Imported from aMule',
            priority: amuleCat.priority ?? 0,
            amuleId: amuleId,
            createdAt: now,
            updatedAt: now
          };
          this.categories.set(amuleTitle, newCat);
          imported++;
          this.log(`📥 Imported category "${amuleTitle}" from aMule (id: ${amuleId})`);
        }
      }
    }

    // Save changes from imports/links
    if (imported > 0 || linked > 0) {
      await this.save();
    }

    // Push app-only categories (amuleId: null) to aMule
    let pushed = 0;
    for (const [name, category] of this.categories) {
      if (category.amuleId === null && name !== 'Default') {
        try {
          const amuleColor = hexColorToAmule(category.color);
          const result = await amuleManager.getClient().createCategory(
            name,
            category.path || '',
            category.comment || '',
            amuleColor,
            category.priority || 0
          );
          if (result.success && result.categoryId != null) {
            category.amuleId = result.categoryId;
            category.updatedAt = new Date().toISOString();
            pushed++;
            this.log(`📤 Pushed category "${name}" to aMule (ID: ${result.categoryId})`);
          }
        } catch (err) {
          this.log(`⚠️ Failed to push category "${name}" to aMule: ${err.message}`);
        }
      }
    }

    // Save if we pushed any categories
    if (pushed > 0) {
      await this.save();
    }

    this.log(`📊 aMule sync complete: ${imported} imported, ${updated} to update, ${linked} linked, ${pushed} pushed`);

    return {
      imported,
      updated,
      linked,
      pushed,
      toUpdateInAmule
    };
  }

  /**
   * Sync categories with rTorrent
   * Called when rTorrent connects - creates categories for new labels
   * @param {Array} labels - Unique labels from rTorrent downloads
   * @returns {Promise<Object>} Sync results
   */
  async syncWithRtorrent(labels) {
    if (!labels || !Array.isArray(labels)) {
      this.log('⚠️  No rTorrent labels to sync');
      return { created: 0 };
    }

    let created = 0;
    const usedColors = new Set(Array.from(this.categories.values()).map(c => c.color));

    for (const label of labels) {
      // Skip empty labels - they map to Default
      if (!label || label === '(none)') {
        continue;
      }

      // Check if category already exists
      if (this.categories.has(label)) {
        continue;
      }

      // Create new category from label
      const now = new Date().toISOString();
      const newCat = {
        name: label,
        color: getRandomColor(usedColors),
        path: null,
        pathMappings: null,
        comment: 'Auto-created from rTorrent label',
        priority: 0,
        amuleId: null,
        createdAt: now,
        updatedAt: now
      };

      usedColors.add(newCat.color);
      this.categories.set(label, newCat);
      created++;
      this.log(`📥 Created category "${label}" from rTorrent label`);
    }

    // Save changes
    if (created > 0) {
      await this.save();
    }

    this.log(`📊 rTorrent sync complete: ${created} categories created`);

    return { created };
  }

  /**
   * Ensure category exists in aMule
   * Creates in aMule if connected and category doesn't have an amuleId yet
   * @param {string} name - Category name
   * @returns {Promise<number|null>} amuleId or null if not connected/failed
   */
  async ensureAmuleCategory(name) {
    const category = this.categories.get(name);
    if (!category) {
      throw new Error(`Category "${name}" not found`);
    }

    // Already has amuleId
    if (category.amuleId !== null) {
      return category.amuleId;
    }

    // Create in aMule if connected
    if (!this.isAmuleConnected()) {
      return null;
    }

    try {
      // First check if category with same name already exists in aMule
      const amuleCategories = await amuleManager.getClient().getCategories();
      const existingCat = amuleCategories?.find(c => c.title === category.name);

      if (existingCat && existingCat.id != null) {
        // Link to existing aMule category instead of creating duplicate
        category.amuleId = existingCat.id;
        category.updatedAt = new Date().toISOString();
        await this.save();
        this.log(`🔗 Linked to existing aMule category "${name}" (ID: ${existingCat.id})`);
        return existingCat.id;
      }

      // Create new category in aMule
      const amuleColor = hexColorToAmule(category.color);
      const result = await amuleManager.getClient().createCategory(
        category.name,
        category.path || '',
        category.comment || '',
        amuleColor,
        category.priority || 0
      );

      // Check for valid category ID (not null, not undefined)
      if (result.success && result.categoryId != null) {
        category.amuleId = result.categoryId;
        category.updatedAt = new Date().toISOString();
        await this.save();
        this.log(`📤 Created category "${name}" in aMule on demand (ID: ${result.categoryId})`);
        return result.categoryId;
      } else if (result.success) {
        this.log(`⚠️ Category "${name}" created in aMule but no ID returned`);
      }
    } catch (err) {
      this.log(`⚠️ Failed to create category in aMule: ${err.message}`);
    }

    return null;
  }

  /**
   * Set the amuleId for a category
   * Called after creating the category in aMule
   * @param {string} name - Category name
   * @param {number} amuleId - aMule category ID
   * @returns {Promise<Object>} Updated category
   */
  async setAmuleId(name, amuleId) {
    const category = this.categories.get(name);
    if (!category) {
      throw new Error(`Category "${name}" not found`);
    }

    category.amuleId = amuleId;
    category.updatedAt = new Date().toISOString();
    await this.save();

    this.log(`🔗 Set amuleId for "${name}": ${amuleId}`);
    return category;
  }

  // ==========================================================================
  // PATH TRANSLATION
  // ==========================================================================

  /**
   * Translate a client path to app path using category mappings
   * @param {string} clientPath - Full file path as reported by client
   * @param {string} clientType - Client type ('amule' or 'rtorrent')
   * @returns {string} Translated path or original if no mapping found
   */
  translatePath(clientPath, clientType) {
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
      const appPath = category.pathMappings?.[clientType] || category.path;
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
      const defaultAppPath = defaultCategory.pathMappings[clientType];
      if (defaultAppPath) {
        const normalizedDefaultPath = defaultAppPath.replace(/\/+$/, '');

        // Get the last segment of both paths to check if they match
        const inputLastSegment = normalizedClientPath.split('/').pop();
        const defaultLastSegment = normalizedDefaultPath.split('/').pop();

        // If the last segments match, the input is likely the base directory
        // (e.g., /downloads/temp -> /home/.../temp, both end in 'temp')
        // In this case, return the default path directly
        if (inputLastSegment === defaultLastSegment) {
          return normalizedDefaultPath;
        }

        // Otherwise, extract relative path after any common parent and append
        // For file paths like /downloads/temp/file.mkv -> /home/.../temp/file.mkv
        const lastSlashIndex = normalizedClientPath.lastIndexOf('/');
        if (lastSlashIndex > 0) {
          const fileName = normalizedClientPath.substring(lastSlashIndex + 1);
          return `${normalizedDefaultPath}/${fileName}`;
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
module.exports.mapPriorityToRtorrent = mapPriorityToRtorrent;
