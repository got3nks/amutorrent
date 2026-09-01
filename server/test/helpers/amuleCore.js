/**
 * Shared setup for tests that talk to a real aMule core over EC.
 *
 * Connection details come from the environment and nothing is defaulted except
 * host and port — with no AMULE_TEST_PASSWORD set, the integration tests skip
 * rather than run, so no credential is ever committed:
 *
 *   AMULE_TEST_HOST      default 127.0.0.1
 *   AMULE_TEST_PORT      default 4712
 *   AMULE_TEST_PASSWORD  required; unset => tests skip
 *
 * These tests mutate the core they connect to (they create and delete
 * categories), so point them at a throwaway daemon, never a real one.
 */
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOST = process.env.AMULE_TEST_HOST || '127.0.0.1';
const PORT = Number(process.env.AMULE_TEST_PORT || 4712);
const PASSWORD = process.env.AMULE_TEST_PASSWORD || null;

/** Why the integration tests are skipped, or null when they can run. */
function skipReason(reachable) {
  if (!PASSWORD) return 'AMULE_TEST_PASSWORD not set';
  if (!reachable) return `no aMule core on ${HOST}:${PORT}`;
  return null;
}

/** Is something listening on the EC port? Resolves false rather than throwing. */
function isReachable(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: HOST, port: PORT });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
  });
}

/**
 * Boot an AmuleManager against the test core, with CategoryManager persistence
 * redirected to a temp file so a developer's real categories.json is untouched.
 * @returns {Promise<{mgr: Object, categoryManager: Object, instanceId: string, cleanup: Function}>}
 */
async function bootManager() {
  const { AmuleManager } = require('../../modules/amuleManager');
  const categoryManager = require('../../lib/CategoryManager');
  const registry = require('../../lib/ClientRegistry');

  const instanceId = `amule-${HOST}-${PORT}`;
  const catFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'amt-test-')), 'categories.json');
  categoryManager.filePath = catFile;
  await categoryManager.load();

  const mgr = new AmuleManager();
  mgr.setClientConfig({ enabled: true, host: HOST, port: PORT, password: PASSWORD, categorySync: true });
  if (registry.has(instanceId)) registry.unregister(instanceId);
  registry.register(instanceId, 'amule', mgr, { displayName: 'test core' });

  if (!(await mgr.initClient())) {
    registry.unregister(instanceId);
    throw new Error(`could not connect to aMule at ${HOST}:${PORT}`);
  }

  const cleanup = async () => {
    try { await resetCategories(mgr); } catch { /* best effort */ }
    try { mgr.client?.close?.(); } catch { /* already gone */ }
    try { registry.unregister(instanceId); } catch { /* already gone */ }
    try { fs.rmSync(path.dirname(catFile), { recursive: true, force: true }); } catch { /* ignore */ }
  };

  return { mgr, categoryManager, instanceId, cleanup };
}

/** Drop every non-default category from the core, highest index first. */
async function resetCategories(mgr) {
  const cats = await mgr.getCategories();
  for (const c of (cats || []).filter(x => x.id !== 0).sort((a, b) => b.id - a.id)) {
    await mgr.client.deleteCategory(c.id);
  }
}

/** The core's current categories, as plain rows. */
async function categoryRows(mgr) {
  const cats = await mgr.getCategories();
  return (cats || []).map(c => ({ id: c.id, title: c.title, path: c.path }));
}

/** Silence module logging for the duration of a test run. */
function muteLogs() {
  const logger = require('../../lib/logger');
  const original = logger._emit;
  logger._emit = () => {};
  return () => { logger._emit = original; };
}

module.exports = {
  HOST, PORT, PASSWORD,
  isReachable, skipReason, bootManager, resetCategories, categoryRows, muteLogs
};
