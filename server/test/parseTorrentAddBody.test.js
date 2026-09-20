const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const bodyParser = require('body-parser');
const parseTorrentAddBody = require('../lib/qbittorrent/parseTorrentAddBody');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function request(port, { method = 'POST', path = '/add', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function buildMultipart(boundary, parts) {
  let payload = '';
  for (const part of parts) {
    payload += `--${boundary}\r\n`;
    if (part.filename) {
      payload += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`;
      payload += `Content-Type: application/octet-stream\r\n\r\n`;
      payload += `${part.value}\r\n`;
    } else {
      payload += `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`;
      payload += `${part.value}\r\n`;
    }
  }
  payload += `--${boundary}--\r\n`;
  return Buffer.from(payload);
}

describe('parseTorrentAddBody middleware', () => {
  let server;
  let port;
  let lastBody;

  before(async () => {
    const app = express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.post('/add', parseTorrentAddBody, (req, res) => {
      lastBody = req.body;
      res.status(200).json(req.body);
    });
    ({ server, port } = await listen(app));
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('passes through urlencoded requests unchanged', async () => {
    const body = 'urls=magnet%3A%3Fxt%3Durn%3Abtih%3Aabc&category=books';
    const response = await request(port, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    });

    assert.equal(response.status, 200);
    assert.equal(lastBody.urls, 'magnet:?xt=urn:btih:abc');
    assert.equal(lastBody.category, 'books');
  });

  it('parses multipart fields and dummy file', async () => {
    const boundary = '----cursor-test-boundary';
    const payload = buildMultipart(boundary, [
      { name: 'urls', value: 'magnet:?xt=urn:btih:abc' },
      { name: 'category', value: 'books' },
      { name: 'paused', value: 'false' },
      { name: '_dummy', filename: '_dummy', value: 'x' }
    ]);

    const response = await request(port, {
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      },
      body: payload
    });

    assert.equal(response.status, 200);
    assert.equal(lastBody.urls, 'magnet:?xt=urn:btih:abc');
    assert.equal(lastBody.category, 'books');
    assert.equal(lastBody.paused, 'false');
  });

  it('returns 400 for malformed multipart content-type', async () => {
    const response = await request(port, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Content-Length': 2
      },
      body: Buffer.from('x')
    });

    assert.equal(response.status, 400);
    assert.match(response.body, /Invalid multipart body/);
  });
});
