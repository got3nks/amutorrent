# API Reference

This document describes the REST API and WebSocket protocol used by aMuTorrent.

## Table of Contents

- [Authentication](#authentication)
- [REST API v1](#rest-api-v1) — General-purpose API for downloads, categories, search, logs
  - [Data Endpoints](#data-endpoints)
  - [Download Management](#download-management)
  - [Download Control](#download-control)
  - [Permission Checks](#permission-checks)
  - [Categories](#categories)
  - [Search (ED2K)](#search-ed2k)
  - [aMule Specific](#amule-specific)
  - [Logs](#logs)
- [Metrics API](#metrics-api)
- [History API](#history-api)
- [Torznab API](#torznab-api) — Exposes aMule ED2K search as a Torznab indexer for Sonarr/Radarr
- [qBittorrent-Compatible API](#qbittorrent-compatible-api) — Exposes aMule as a qBittorrent-compatible download client for Sonarr/Radarr
- [WebSocket Protocol](#websocket-protocol)
  - [Client → Server Actions](#client--server-actions)
  - [Server → Client Messages](#server--client-messages)

---

## Authentication

When web UI authentication is enabled, the following authentication methods apply:

### Web UI & Internal APIs

The web interface and internal APIs use **session-based authentication**. Users must log in through the web interface to obtain a session cookie, or provide an API key via the `X-API-Key` header.

**Session login:**
```bash
curl -c cookies.txt -X POST http://host:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"yourpass"}'

# Use the cookie in subsequent requests
curl -b cookies.txt http://host:4000/api/v1/categories
```

**API key:**
```bash
curl -H 'X-API-Key: your-api-key' http://host:4000/api/v1/categories
```

API keys are per-user and can be found/regenerated in Settings → User Management.

**Protected endpoints:**
- `/api/v1/*` - REST API v1 (capability-gated per endpoint)
- `/api/metrics/*` - Metrics API
- `/api/history/*` - History API
- `/api/config/*` - Configuration API

### WebSocket

WebSocket connections are also protected when authentication is enabled. The WebSocket upgrade request must include a valid session cookie (`amule.sid`) from an authenticated web session.

### Torznab API (for Sonarr/Radarr)

The Torznab indexer API uses **API key authentication** (admin-only).

- **API Key:** Use your admin user's API key (found in Settings → User Management)
- Pass the key via the `apikey` query parameter

**Example:**
```
GET /indexer/amule/api?t=search&q=test&apikey=YOUR_API_KEY
```

When configuring in Sonarr/Radarr, enter your admin API key in the "API Key" field.

### qBittorrent-Compatible API (for Sonarr/Radarr)

The qBittorrent-compatible API uses **HTTP Basic Authentication** (admin-only). Two credential methods are supported:

1. **Username + password** — use your aMuTorrent admin username and password
2. **API key as password** — use any username with your admin API key as the password

When configuring the download client in Sonarr/Radarr:
- **Username:** Your admin username (or any value when using API key)
- **Password:** Your admin password or API key

---

## REST API v1

General-purpose REST API for managing downloads, categories, search, and more. All endpoints are under `/api/v1/`.

### Authentication

All `/api/v1/` endpoints require authentication when auth is enabled. Two methods are supported:

1. **Session cookie** — Log in via `POST /api/auth/login` and include the session cookie in subsequent requests
2. **API key** — Pass the `X-API-Key` header with a user's API key (found in Settings → User Management)

Each endpoint requires specific **capabilities** (permissions). Admin users have all capabilities. Non-admin users need the listed capability assigned to their account.

### Response Format

All responses are JSON objects with a `type` field indicating the response type. On error, the response has `type: "error"` with a `message` field.

### Data Endpoints

#### GET `/api/v1/data/snapshot`

Returns the current state of all downloads, shared files, and statistics. This is the same data the WebSocket sends on connection.

**Capabilities:** None (any authenticated user)

**Response:**
```json
{
  "type": "batch-update",
  "data": {
    "stats": {
      "instanceSpeeds": { "amule-host-4712": { "uploadSpeed": 1024, "downloadSpeed": 0 } },
      "instances": { "amule-host-4712": { "type": "amule", "connected": true, "name": "aMule" } }
    },
    "items": [
      {
        "hash": "abc123...",
        "name": "file.mkv",
        "client": "amule",
        "instanceId": "amule-host-4712",
        "status": "active",
        "progress": 45.2,
        "size": 1073741824,
        "downloadSpeed": 512000,
        "uploadSpeed": 0
      }
    ]
  }
}
```

### Download Management

#### POST `/api/v1/downloads/magnets`

Add magnet links to a BitTorrent client.

**Capabilities:** `add_downloads`

**Request Body:**
```json
{
  "links": ["magnet:?xt=urn:btih:..."],
  "instanceId": "rtorrent-host-8000",
  "categoryName": "Default"
}
```

**Response:**
```json
{
  "type": "magnet-added",
  "results": [{ "link": "magnet:?...", "success": true }],
  "clientId": "rtorrent"
}
```

#### POST `/api/v1/downloads/ed2k`

Add ED2K links to an aMule instance.

**Capabilities:** `add_downloads`

**Request Body:**
```json
{
  "links": ["ed2k://|file|name|size|hash|/"],
  "instanceId": "amule-host-4712",
  "categoryName": "Default"
}
```

**Response:**
```json
{
  "type": "ed2k-added",
  "results": [{ "link": "ed2k://...", "success": true }]
}
```

#### POST `/api/v1/downloads/torrent`

Add a torrent file (base64-encoded in JSON body).

**Capabilities:** `add_downloads`

**Request Body:**
```json
{
  "data": "base64-encoded-torrent-data",
  "fileName": "file.torrent",
  "instanceId": "rtorrent-host-8000",
  "categoryName": "Default"
}
```

#### POST `/api/v1/downloads/search-results`

Download files from an ED2K search result (aMule).

**Capabilities:** `add_downloads`

**Request Body:**
```json
{
  "fileHashes": ["abc123...", "def456..."],
  "instanceId": "amule-host-4712",
  "categoryName": "Default"
}
```

**Response:**
```json
{
  "type": "batch-download-complete",
  "results": [{ "fileHash": "abc123...", "success": true }],
  "message": "Downloaded 2/2 files"
}
```

### Download Control

All control endpoints accept an `items` array with `fileHash` and `instanceId` per item.

#### POST `/api/v1/downloads/pause`

**Capabilities:** `pause_resume`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000" }]
}
```

**Response:**
```json
{
  "type": "batch-pause-complete",
  "results": [{ "fileHash": "abc123...", "success": true, "instanceId": "rtorrent-host-8000" }],
  "message": "1/1 successful"
}
```

#### POST `/api/v1/downloads/resume`

**Capabilities:** `pause_resume`

Same request/response format as pause.

#### POST `/api/v1/downloads/stop`

**Capabilities:** `pause_resume`

Same request/response format as pause. Fully closes the torrent (releases file handles).

#### POST `/api/v1/downloads/delete`

**Capabilities:** `remove_downloads`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000", "fileName": "file.mkv" }],
  "deleteFiles": false
}
```

**Response:**
```json
{
  "type": "batch-delete-complete",
  "results": [{ "fileHash": "abc123...", "success": true, "instanceId": "rtorrent-host-8000" }],
  "message": "Deleted 1/1 files"
}
```

#### POST `/api/v1/downloads/move`

Move files to a destination path without changing category.

**Capabilities:** `edit_downloads`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000" }],
  "destPath": "/downloads/movies"
}
```

#### POST `/api/v1/downloads/category`

Change the category/label of downloads.

**Capabilities:** `assign_categories`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000" }],
  "categoryName": "Movies",
  "moveFiles": true
}
```

#### POST `/api/v1/downloads/rename`

Rename a file.

**Capabilities:** `rename_files`

**Request Body:**
```json
{
  "fileHash": "abc123...",
  "instanceId": "rtorrent-host-8000",
  "newName": "new-name.mkv"
}
```

### Permission Checks

Pre-flight checks to verify paths are accessible before performing operations.

#### POST `/api/v1/permissions/delete`

**Capabilities:** `remove_downloads`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000" }]
}
```

**Response:**
```json
{
  "type": "delete-permissions",
  "results": [{ "fileHash": "abc123...", "canDelete": true, "path": "/downloads/file.mkv" }],
  "isDocker": true
}
```

#### POST `/api/v1/permissions/move`

Check permissions for category-based move.

**Capabilities:** `move_files`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000" }],
  "categoryName": "Movies"
}
```

#### POST `/api/v1/permissions/move-to`

Check permissions for direct path move.

**Capabilities:** `edit_downloads`

**Request Body:**
```json
{
  "items": [{ "fileHash": "abc123...", "instanceId": "rtorrent-host-8000" }],
  "destPath": "/downloads/movies"
}
```

**Response:**
```json
{
  "type": "move-to-permissions",
  "results": [{ "fileHash": "abc123...", "canMove": true, "reason": "ok" }],
  "canMove": true,
  "destPath": "/downloads/movies"
}
```

### Categories

#### GET `/api/v1/categories`

List all categories.

**Capabilities:** None (any authenticated user)

**Response:**
```json
{
  "type": "categories-update",
  "data": [
    { "name": "Default", "title": "Default", "path": "", "color": 13421772, "comment": "", "priority": 0 }
  ]
}
```

#### POST `/api/v1/categories`

Create a new category.

**Capabilities:** `manage_categories`

**Request Body:**
```json
{
  "title": "Movies",
  "path": "/downloads/movies",
  "comment": "Movie downloads",
  "color": 255,
  "priority": 0
}
```

#### PUT `/api/v1/categories`

Update an existing category.

**Capabilities:** `manage_categories`

**Request Body:**
```json
{
  "name": "Movies",
  "path": "/downloads/movies-updated",
  "comment": "Updated path"
}
```

#### DELETE `/api/v1/categories`

Delete a category.

**Capabilities:** `manage_categories`

**Request Body:**
```json
{
  "name": "Movies"
}
```

### Search (ED2K)

#### POST `/api/v1/search`

Start an ED2K search. By default this is a **blocking call** that waits for aMule to return results (up to 120 seconds). Set `wait: false` for non-blocking mode.

**Capabilities:** `search`

**Request Body:**
```json
{
  "query": "ubuntu",
  "type": "global",
  "instanceId": "amule-host-4712",
  "wait": true
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `query` | (required) | Search query string |
| `type` | `global` | Search type: `global`, `local`, `kad` |
| `instanceId` | (first aMule) | Target aMule instance ID |
| `wait` | `true` | If `true`, blocks until results are ready (up to 120s). If `false`, returns immediately. |

**Response (blocking, `wait: true`):**
```json
{
  "type": "search-results",
  "data": [
    { "fileName": "ubuntu-24.04.iso", "fileSize": 5120000000, "fileHash": "abc123...", "sourceCount": 42 }
  ]
}
```

**Response (non-blocking, `wait: false`):**
```json
{
  "type": "search-started",
  "message": "Search started. Poll GET /api/v1/search/results for results."
}
```

When using non-blocking mode, poll `GET /api/v1/search/results` to retrieve results once the search completes.

#### GET `/api/v1/search/results`

Get cached results from the last search.

**Capabilities:** `search`

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `instanceId` | aMule instance ID (optional — defaults to first connected) |

**Response:**
```json
{
  "type": "previous-search-results",
  "data": [...]
}
```

### aMule Specific

#### GET `/api/v1/amule/servers`

List ED2K servers.

**Capabilities:** `view_servers`

#### POST `/api/v1/amule/servers/action`

Connect, disconnect, or remove an ED2K server.

**Capabilities:** `view_servers`

**Request Body:**
```json
{
  "action": "connect",
  "ip": "45.82.80.155",
  "port": 5687,
  "instanceId": "amule-host-4712"
}
```

Actions: `connect`, `disconnect`, `remove`

#### GET `/api/v1/amule/server-info`

Get ED2K server info (message of the day).

**Capabilities:** `view_servers`

#### GET `/api/v1/amule/stats-tree`

Get aMule statistics tree.

**Capabilities:** `view_statistics`

#### POST `/api/v1/amule/refresh-shared`

Trigger a shared files rescan.

**Capabilities:** `view_shared`

**Request Body:**
```json
{
  "instanceId": "amule-host-4712"
}
```

### Logs

#### GET `/api/v1/logs/app`

Get aMuTorrent application log.

**Capabilities:** `view_logs`

#### GET `/api/v1/logs/amule`

Get aMule log.

**Capabilities:** `view_logs`

#### GET `/api/v1/logs/qbittorrent`

Get qBittorrent log.

**Capabilities:** `view_logs`

### Instance Selection

Most endpoints accept an `instanceId` field to target a specific client instance. Instance IDs can be found in the snapshot response (`data.stats.instances`). If omitted, the server selects the first connected instance of the expected type.

---

## Metrics API

Historical metrics for speed and transfer data.

#### GET `/api/metrics/speed-history`

Returns speed data with different granularities based on time range.

**Query Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `range` | `24h`, `7d`, `30d` | Time range |

**Granularity:**
- **24h:** 15-second buckets (~5,760 points)
- **7d:** 15-minute buckets (672 points)
- **30d:** 1-hour buckets (720 points)

**Response:**
```json
{
  "range": "24h",
  "data": [
    {
      "timestamp": 1234567890000,
      "uploadSpeed": 102400,
      "downloadSpeed": 512000
    }
  ]
}
```

#### GET `/api/metrics/history`

Returns data transferred with time buckets.

**Query Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `range` | `24h`, `7d`, `30d` | Time range |

**Granularity:**
- **24h:** 15-minute buckets (96 bars)
- **7d:** 2-hour buckets (84 bars)
- **30d:** 6-hour buckets (120 bars)

**Response:**
```json
{
  "range": "24h",
  "data": [
    {
      "timestamp": 1234567890000,
      "uploadSpeed": 102400,
      "downloadSpeed": 512000,
      "uploadedDelta": 1024000,
      "downloadedDelta": 5120000
    }
  ]
}
```

#### GET `/api/metrics/stats`

Returns summary statistics for a time range.

**Query Parameters:**

| Parameter | Values | Description |
|-----------|--------|-------------|
| `range` | `24h`, `7d`, `30d` | Time range |

**Response:**
```json
{
  "range": "24h",
  "totalUploaded": 10737418240,
  "totalDownloaded": 53687091200,
  "avgUploadSpeed": 124108,
  "avgDownloadSpeed": 620540,
  "peakUploadSpeed": 1048576,
  "peakDownloadSpeed": 5242880
}
```

---

## History API

Download history tracking.

#### GET `/api/history`

Returns paginated download history.

**Query Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | `50` | Items per page |
| `offset` | `0` | Pagination offset |
| `sortBy` | `started_at` | Sort field |
| `sortDir` | `desc` | Sort direction (`asc`/`desc`) |
| `search` | - | Filter by filename |
| `status` | - | Filter by status |

**Response:**
```json
{
  "entries": [
    {
      "hash": "abc123...",
      "filename": "file.mkv",
      "size": 1073741824,
      "status": "completed",
      "started_at": "2024-01-15T10:00:00Z",
      "completed_at": "2024-01-15T12:00:00Z",
      "username": "user1"
    }
  ],
  "total": 150,
  "trackUsername": true
}
```

#### DELETE `/api/history/:hash`

Deletes a history entry by file hash.

---

## Torznab API

Exposes aMule's ED2K search as a Torznab-compatible indexer, allowing Sonarr, Radarr, and other *arr apps to search the ED2K network directly. See [authentication](#torznab-api-for-sonarrradarr) above.

#### GET `/indexer/amule/api?t=caps`

Returns indexer capabilities.

**Response:** XML with supported categories and search capabilities.

#### GET `/indexer/amule/api?t=search`

Performs an ED2K search.

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `q` | Search query |
| `cat` | Category filter (optional) |
| `limit` | Max results |
| `offset` | Pagination offset |

**Response:** XML in Torznab format with search results.

---

## qBittorrent-Compatible API

Exposes aMule as a qBittorrent-compatible download client, allowing Sonarr, Radarr, and other *arr apps to add ED2K downloads, monitor progress, and manage categories through aMule. See [authentication](#qbittorrent-compatible-api-for-sonarrradarr) above.

#### GET `/api/v2/app/version`

Returns application version.

**Response:** `v4.5.0`

#### GET `/api/v2/app/webapiVersion`

Returns Web API version.

**Response:** `2.8.3`

#### GET `/api/v2/torrents/info`

Lists current downloads.

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `filter` | Filter by status (`all`, `downloading`, `completed`, etc.) |
| `category` | Filter by category |
| `hashes` | Filter by specific hashes |

**Response:**
```json
[
  {
    "hash": "abc123...",
    "name": "file.mkv",
    "size": 1073741824,
    "progress": 0.75,
    "dlspeed": 512000,
    "upspeed": 102400,
    "state": "downloading",
    "category": "sonarr",
    "content_path": "/downloads/sonarr/file.mkv",
    "save_path": "/downloads/sonarr"
  }
]
```

#### POST `/api/v2/torrents/add`

Adds a download from ED2K link.

**Form Data:**

| Field | Description |
|-------|-------------|
| `urls` | ED2K link(s), one per line |
| `category` | Category name |

#### POST `/api/v2/torrents/pause`

Pauses download(s).

**Form Data:**

| Field | Description |
|-------|-------------|
| `hashes` | Hash(es) to pause, `all` for all |

#### POST `/api/v2/torrents/resume`

Resumes download(s).

**Form Data:**

| Field | Description |
|-------|-------------|
| `hashes` | Hash(es) to resume, `all` for all |

#### POST `/api/v2/torrents/delete`

Deletes download(s).

**Form Data:**

| Field | Description |
|-------|-------------|
| `hashes` | Hash(es) to delete |
| `deleteFiles` | `true` to also delete files |

#### GET `/api/v2/torrents/categories`

Returns configured categories.

**Response:**
```json
{
  "sonarr": {
    "name": "sonarr",
    "savePath": "/downloads/sonarr"
  },
  "radarr": {
    "name": "radarr",
    "savePath": "/downloads/radarr"
  }
}
```

---

## WebSocket Protocol

The server exposes a WebSocket endpoint at `ws://HOST:PORT` for real-time communication.

### Client → Server Actions

All messages are JSON objects with an `action` field.

#### Search

```json
{ "action": "search", "query": "file name", "type": "global" }
```

#### Downloads

```json
{ "action": "getDownloads" }
{ "action": "pauseDownload", "fileHash": "..." }
{ "action": "resumeDownload", "fileHash": "..." }
{ "action": "delete", "fileHash": "..." }
{ "action": "download", "fileHash": "..." }
```

#### Uploads

```json
{ "action": "getUploadingQueue" }
```

#### Shared Files

```json
{ "action": "getShared" }
{ "action": "reloadSharedFiles" }
```

#### Statistics

```json
{ "action": "getStats" }
{ "action": "getStatsTree" }
```

#### Servers

```json
{ "action": "getServers" }
{ "action": "connectServer", "serverAddress": "ip:port" }
{ "action": "disconnectServer" }
{ "action": "removeServer", "serverAddress": "ip:port" }
```

#### Logs

```json
{ "action": "getLog" }
{ "action": "getServerInfo" }
```

#### Categories

```json
{ "action": "getCategories" }
{ "action": "createCategory", "category": { "title": "...", "path": "...", "color": 0xCCCCCC, "priority": 0 } }
{ "action": "updateCategory", "id": 1, "category": { ... } }
{ "action": "deleteCategory", "id": 1 }
{ "action": "setFileCategory", "fileHash": "...", "categoryId": 1 }
```

#### ED2K Links

```json
{ "action": "addEd2kLink", "link": "ed2k://...", "categoryId": 0 }
```

### Server → Client Messages

All messages are JSON objects with a `type` field.

#### Search Results

```json
{ "type": "search-results", "data": [...] }
```

#### Downloads Update

```json
{ "type": "downloads-update", "data": [...] }
```

#### Uploads Update

```json
{ "type": "uploads-update", "data": [...] }
```

#### Stats Update

```json
{ "type": "stats-update", "data": { ... } }
```

#### Shared Files Update

```json
{ "type": "shared-update", "data": [...] }
```

#### Servers Update

```json
{ "type": "servers-update", "data": [...] }
```

#### Categories Update

```json
{ "type": "categories-update", "data": [...] }
```

#### Log Updates

```json
{ "type": "log-update", "data": [...] }
{ "type": "serverinfo-update", "data": [...] }
```

#### Error Messages

```json
{ "type": "error", "message": "Error description" }
```

#### Connection Status

```json
{ "type": "connection-status", "connected": true }
```
