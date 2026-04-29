/**
 * Centralized Logger
 *
 * Structured, level-aware logging used everywhere in the server.
 *
 * Each log emission produces:
 *   - A line in `server.log` with the format:
 *       [ISO-8601] [LEVEL] [SOURCE] message
 *     `[SOURCE]` is omitted when no source is set (e.g. raw `logger.log(...)`).
 *   - A console call (stdout for log/info/debug, stderr for warn/error).
 *   - A record `{ ts, level, source, message }` pushed onto an in-memory ring
 *     buffer (last `RING_CAPACITY` entries) so `LogsView` and other consumers
 *     can fetch structured data without re-reading and re-parsing the file.
 *     ERROR/WARN records additionally land in a smaller dedicated ring
 *     (`IMPORTANT_RING_CAPACITY`) so a flood of DEBUG/INFO traffic can't
 *     evict the records operators rely on.
 *
 * Levels (numerically ordered, lower = higher severity):
 *   ERROR (0) — failures we want to surface
 *   WARN  (1) — recoverable / suspicious states
 *   INFO  (2) — normal operational messages (default for `log()`)
 *   DEBUG (3) — verbose / development output
 *
 * Sources:
 *   - `null` for top-level logger calls
 *   - A short string for module-prefixed calls (set via `child(prefix)` or by
 *     callers that provide a leading `[bracketed]` token in the message —
 *     parsed back so the LogsView can filter by source).
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LEVEL_NAMES = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

// In-memory ring of the most recent records — bounded so long-running
// processes don't grow unbounded memory.
const RING_CAPACITY = 2000;

// Secondary ring for ERROR/WARN records only. Chatty DEBUG/INFO traffic can
// fill the main ring and evict older warnings within minutes; this tier
// guarantees a deeper history for the records operators actually care about.
const IMPORTANT_RING_CAPACITY = 500;

// Match a leading bracketed source on a formatted message, e.g. "[NotificationManager] foo"
// — used by `_parseSource` to lift the source out of the message body so the
// frontend can filter by it. Tolerant of leading whitespace/emoji that some
// callers prefix.
const SOURCE_RE = /^(\s*[^\s\[]*\s*)\[([^\]]+)\]\s*/;

class Logger {
  constructor() {
    this.logStream = null;
    this.logLevel = LOG_LEVELS.INFO;
    this.logDir = null;
    this._ring = [];
    this._ringStart = 0;
    this._importantRing = [];
    this._importantStart = 0;
  }

  /**
   * Initialize the logger with a log directory.
   * @param {string} logDir - Directory for log files
   * @param {string} level - Log level ('error', 'warn', 'info', 'debug')
   */
  init(logDir, level = 'info') {
    this.logDir = logDir;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'server.log');

    // Seed the in-memory ring from the tail of the existing log file so the
    // LogsView shows recent history immediately after a restart instead of
    // starting from zero. Lines that match our structured prefix are parsed
    // back into records; anything else is kept as a plain INFO line.
    this._seedRingFromFile(logFile);

    this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    this.logLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  /**
   * Read the last RING_CAPACITY lines from the log file and replay them into
   * the ring as structured records. Best-effort — failures here never block
   * startup; we just end up with an empty ring.
   */
  _seedRingFromFile(logFile) {
    try {
      if (!fs.existsSync(logFile)) return;
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.split('\n');
      const tail = lines.slice(-RING_CAPACITY);
      for (const line of tail) {
        const parsed = this._parseFileLine(line);
        if (parsed) this._ringPush(parsed);
      }
    } catch {
      // Ignore — startup must not depend on this succeeding.
    }
  }

  /**
   * Parse a single log file line back into a structured record.
   * Expected format: `[ISO] [LEVEL] [source]? message`. Lines that don't
   * match (legacy, or a partial last line) return null and are skipped.
   */
  _parseFileLine(line) {
    if (!line) return null;
    const m = line.match(/^\[([^\]]+)\] \[(ERROR|WARN|INFO|DEBUG)\](?: \[([^\]]+)\])? (.*)$/);
    if (!m) return null;
    return {
      ts: m[1],
      level: m[2].toLowerCase(),
      source: m[3] || null,
      message: m[4]
    };
  }

  /**
   * Stringify one log argument the same way `console.log` would, but with
   * compact handling for Errors and objects so file lines stay grep-able.
   */
  _stringifyArg(arg) {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack || ''}`.trim();
    }
    if (typeof arg === 'object' && arg !== null) {
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }
    return String(arg);
  }

  /**
   * Build the message body from `console`-style args. When the first arg is a
   * string carrying a leading `[bracketed]` token and no explicit source was
   * passed, lift that token out as the source.
   */
  _buildMessage(args, explicitSource) {
    const message = args.map(a => this._stringifyArg(a)).join(' ');
    if (explicitSource) return { source: explicitSource, message };
    const m = message.match(SOURCE_RE);
    if (m) {
      // Preserve any leading prefix (e.g. emoji) and strip the [Source] token.
      const before = m[1] || '';
      const stripped = before + message.slice(m[0].length);
      return { source: m[2], message: stripped };
    }
    return { source: null, message };
  }

  /**
   * Internal: emit a log record at the given level. All public methods funnel
   * through here so the ring buffer, file, and console stay in sync.
   */
  _emit(levelNum, args, explicitSource = null) {
    if (this.logLevel < levelNum) return;
    const ts = new Date().toISOString();
    const levelName = LEVEL_NAMES[levelNum];
    const { source, message } = this._buildMessage(args, explicitSource);

    // File line
    if (this.logStream) {
      const sourcePart = source ? ` [${source}]` : '';
      this.logStream.write(`[${ts}] [${levelName}]${sourcePart} ${message}\n`);
    }

    // Console
    const consoleMethod = levelNum === LOG_LEVELS.ERROR ? 'error'
      : levelNum === LOG_LEVELS.WARN ? 'warn'
      : 'log';
    const consolePrefix = source ? `[${ts}] [${levelName}] [${source}]` : `[${ts}] [${levelName}]`;
    console[consoleMethod](consolePrefix, message);

    // Ring buffer record
    this._ringPush({ ts, level: levelName.toLowerCase(), source, message });
  }

  _ringPush(record) {
    if (this._ring.length < RING_CAPACITY) {
      this._ring.push(record);
    } else {
      this._ring[this._ringStart] = record;
      this._ringStart = (this._ringStart + 1) % RING_CAPACITY;
    }
    const lvl = LOG_LEVELS[record.level.toUpperCase()];
    if (lvl <= LOG_LEVELS.WARN) {
      if (this._importantRing.length < IMPORTANT_RING_CAPACITY) {
        this._importantRing.push(record);
      } else {
        this._importantRing[this._importantStart] = record;
        this._importantStart = (this._importantStart + 1) % IMPORTANT_RING_CAPACITY;
      }
    }
  }

  /**
   * Snapshot the ring buffer in chronological order. Optionally filter by
   * minimum level and/or source.
   * @param {Object} opts
   * @param {string} [opts.minLevel] - 'error' | 'warn' | 'info' | 'debug' — include records at or above this severity
   * @param {string|string[]} [opts.source] - filter by exact source match
   * @param {number} [opts.limit] - max records to return (most recent N)
   * @returns {Array<{ts:string, level:string, source:?string, message:string}>}
   */
  getRecords(opts = {}) {
    const minLevelNum = opts.minLevel
      ? (LOG_LEVELS[opts.minLevel.toUpperCase()] ?? LOG_LEVELS.DEBUG)
      : LOG_LEVELS.DEBUG;
    const sourceFilter = opts.source
      ? new Set(Array.isArray(opts.source) ? opts.source : [opts.source])
      : null;

    // When the caller wants only WARN+ records, walk the important ring —
    // it has guaranteed retention for warnings and errors regardless of how
    // much DEBUG/INFO chatter has flowed through the main ring.
    const useImportant = minLevelNum <= LOG_LEVELS.WARN;
    const ring = useImportant ? this._importantRing : this._ring;
    const start = useImportant ? this._importantStart : this._ringStart;

    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const idx = (start + i) % ring.length;
      const r = ring[idx];
      const lvl = LOG_LEVELS[r.level.toUpperCase()];
      if (lvl > minLevelNum) continue;
      if (sourceFilter && !sourceFilter.has(r.source)) continue;
      out.push(r);
    }
    if (opts.limit && out.length > opts.limit) {
      return out.slice(out.length - opts.limit);
    }
    return out;
  }

  /**
   * Distinct sources currently present in the ring buffer (for UI filter dropdown).
   * @returns {string[]} Sorted list of sources, plus null if any unsourced records exist.
   */
  getSources() {
    const seen = new Set();
    for (const r of this._ring) seen.add(r.source);
    for (const r of this._importantRing) seen.add(r.source);
    const out = Array.from(seen).filter(s => s !== null).sort();
    if (seen.has(null)) out.unshift(null);
    return out;
  }

  // ─── Public API: per-level emitters ────────────────────────────────────

  /** General log (treated as INFO). Source is sniffed from a leading [bracket] token. */
  log(...args) { this._emit(LOG_LEVELS.INFO, args); }
  info(...args) { this._emit(LOG_LEVELS.INFO, args); }
  warn(...args) { this._emit(LOG_LEVELS.WARN, args); }
  error(...args) { this._emit(LOG_LEVELS.ERROR, args); }
  debug(...args) { this._emit(LOG_LEVELS.DEBUG, args); }

  /**
   * Per-level emitters that take an explicit source — used by BaseModule
   * so module-level logs get a stable source label without having to embed
   * `[Source]` in every message string.
   */
  logFor(source, ...args) { this._emit(LOG_LEVELS.INFO, args, source); }
  infoFor(source, ...args) { this._emit(LOG_LEVELS.INFO, args, source); }
  warnFor(source, ...args) { this._emit(LOG_LEVELS.WARN, args, source); }
  errorFor(source, ...args) { this._emit(LOG_LEVELS.ERROR, args, source); }
  debugFor(source, ...args) { this._emit(LOG_LEVELS.DEBUG, args, source); }

  /**
   * Create a child logger with a stable source. Same shape as before, but
   * each method now goes through the structured emit path so the ring/file
   * record carries the source explicitly.
   */
  child(source) {
    return {
      log: (...args) => this._emit(LOG_LEVELS.INFO, args, source),
      info: (...args) => this._emit(LOG_LEVELS.INFO, args, source),
      warn: (...args) => this._emit(LOG_LEVELS.WARN, args, source),
      error: (...args) => this._emit(LOG_LEVELS.ERROR, args, source),
      debug: (...args) => this._emit(LOG_LEVELS.DEBUG, args, source)
    };
  }

  /**
   * Read the last N lines of the log file as raw text (legacy callers).
   * Prefer `getRecords()` for structured access.
   */
  async readLog(lines = 200) {
    if (!this.logDir) return 'Logger not initialized';
    const logFile = path.join(this.logDir, 'server.log');
    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines);
      return lastLines.join('\n');
    } catch (err) {
      if (err.code === 'ENOENT') return 'No log file found';
      return `Error reading log: ${err.message}`;
    }
  }

  getLogPath() {
    if (!this.logDir) return null;
    return path.join(this.logDir, 'server.log');
  }

  /**
   * Extract detailed error message including cause chain.
   * Node.js fetch() wraps the real error (ECONNRESET, ECONNREFUSED, etc.) in err.cause
   */
  errorDetail(err) {
    if (err.cause) return `${err.message} (${err.cause.code || err.cause.message})`;
    return err.message;
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

const logger = new Logger();

module.exports = logger;
module.exports.LOG_LEVELS = LOG_LEVELS;
module.exports.LEVEL_NAMES = LEVEL_NAMES;
