# API Reference

This document describes the REST API and WebSocket protocol used by aMuTorrent.

## Table of Contents

- [Authentication](#authentication)
- [REST API](#rest-api)
  - [Metrics API](#metrics-api)
  - [History API](#history-api)
  - [Torznab API](#torznab-api)
  - [qBittorrent API](#qbittorrent-api)
- [WebSocket Protocol](#websocket-protocol)
  - [Client → Server Actions](#client--server-actions)
  - [Server → Client Messages](#server--client-messages)

---

## Authentication

When web UI authentication is enabled, the following authentication methods apply:

### Web UI & Internal APIs

The web interface and internal APIs (Metrics, History, Config) use **session-based authentication**. Users must log in through the web interface to obtain a session cookie.

**Protected endpoints:**
- `/api/metrics/*` - Metrics API
- `/api/history/*` - History API
- `/api/config/*` - Configuration API

### WebSocket

WebSocket connections are also protected when authentication is enabled. The WebSocket upgrade request must include a valid session cookie (`amule.sid`) from an authenticated web session.

### Torznab API (for Sonarr/Radarr)

The Torznab indexer API uses **API key authentication**.

- **API Key:** Use the same password as the web UI
- Pass the key via the `apikey` query parameter

**Example:**
```
GET /indexer/amule/api?t=search&q=test&apikey=YOUR_UI_PASSWORD
```

When configuring in Sonarr/Radarr, enter your web UI password in the "API Key" field.

### qBittorrent API (for Sonarr/Radarr)

The qBittorrent-compatible API uses **HTTP Basic Authentication**.

- **Username:** Any value (ignored)
- **Password:** Same password as the web UI

When configuring the download client in Sonarr/Radarr:
- **Username:** Enter any value (e.g., `admin`)
- **Password:** Enter your web UI password

---

## REST API

### Metrics API

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

### History API

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

### Torznab API

Torznab-compatible API for Sonarr/Radarr integration.

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

### qBittorrent API

qBittorrent Web API v2 compatible endpoints for *arr integration.

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
