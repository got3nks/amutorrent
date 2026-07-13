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

function parseTorrentAddBody(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  const busboy = Busboy({ headers: req.headers });
  req.body = req.body || {};

  busboy.on('field', (name, value) => {
    req.body[name] = value;
  });

  busboy.on('file', (_name, file) => {
    file.resume();
  });

  busboy.on('error', (err) => {
    logger.error('[qBittorrent] Multipart parse error:', err);
    response.badRequest(res, 'Invalid multipart body');
  });

  busboy.on('finish', () => next());

  req.pipe(busboy);
}

module.exports = parseTorrentAddBody;
