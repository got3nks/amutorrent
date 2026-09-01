/**
 * Import a frontend ES module from the CommonJS test runner.
 *
 * Files under static/ are ES modules the browser loads directly, but they have
 * a .js extension inside a package with no "type": "module", so Node parses
 * them as CommonJS and dynamic import fails on the first `export`. Inlining the
 * source as a data: URL sidesteps the extension-based decision entirely.
 *
 * Only suitable for self-contained modules: a data: URL has no file location,
 * so relative imports inside the module cannot resolve.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const STATIC_DIR = path.join(__dirname, '..', '..', '..', 'static');

/**
 * @param {...string} segments - Path segments under static/, e.g. 'utils', 'x.js'
 * @returns {Promise<Object>} The module's exports
 */
async function importStatic(...segments) {
  const file = path.join(STATIC_DIR, ...segments);
  const source = await fs.readFile(file, 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

module.exports = { importStatic };
