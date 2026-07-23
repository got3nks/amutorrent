/**
 * Middleware for POST /api/v2/torrents/add
 *
 * qBittorrent clients (LazyLibrarian, Sonarr, Radarr) send multipart/form-data
 * with a dummy file field even for magnet/url adds. The global urlencoded parser
 * skips multipart bodies, so we parse fields here and discard file parts.
 */

const Busboy = require('busboy');
const logger = require('../logger');
const response = require('../responseFormatter');

const MULTIPART_LIMITS = {
  fields: 20,
  files: 1,
  parts: 21,
  fieldSize: 64 * 1024,
  fileSize: 1024 * 1024
};

function parseTorrentAddBody(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  let busboy;
  let settled = false;

  const finish = (handler) => {
    if (settled) return;
    settled = true;
    handler();
  };

  try {
    busboy = Busboy({
      headers: req.headers,
      limits: MULTIPART_LIMITS
    });
  } catch (error) {
    logger.error('[qBittorrent] Multipart setup error:', error);
    return response.badRequest(res, 'Invalid multipart body');
  }

  req.body = req.body || {};

  busboy.on('field', (name, value) => {
    req.body[name] = value;
  });

  busboy.on('file', (_name, file) => {
    file.resume();
  });

  busboy.on('error', (err) => {
    logger.error('[qBittorrent] Multipart parse error:', err);
    finish(() => response.badRequest(res, 'Invalid multipart body'));
  });

  busboy.on('finish', () => {
    finish(() => next());
  });

  req.pipe(busboy);
}

module.exports = parseTorrentAddBody;
