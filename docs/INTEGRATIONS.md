# *arr Integration Guide

aMuTorrent integrates with any *arr application (Sonarr, Radarr, Lidarr, Readarr, etc.) by providing a **Torznab indexer API** for searching and a **qBittorrent-compatible API** for download management.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Step 1: Configure Categories](#step-1-configure-categories)
- [Step 2: Add the Torznab Indexer](#step-2-add-the-torznab-indexer)
- [Step 3: Add the Download Client](#step-3-add-the-download-client)
- [Step 4: Docker Path Configuration](#step-4-docker-path-configuration)
- [Step 5: Automatic Search (Optional)](#step-5-automatic-search-optional)
- [Rate Limiting & Caching](#rate-limiting--caching)
- [Troubleshooting](#troubleshooting)

---

## Overview

aMuTorrent provides two APIs for *arr integration:

1. **Torznab Indexer API** - Allows Sonarr/Radarr/Lidarr/Readarr to search the ED2K network
2. **qBittorrent-Compatible Download Client API** - Allows Sonarr/Radarr/Lidarr/Readarr to manage downloads and import completed files

---

## How It Works

1. **Searching:** When Sonarr/Radarr/Lidarr/Readarr searches for content, they query our Torznab API, which performs an ED2K search and returns results
2. **Downloading:** When a release is selected, Sonarr/Radarr/Lidarr/Readarr sends the ED2K link to our qBittorrent-compatible API
3. **Monitoring:** Sonarr/Radarr/Lidarr/Readarr monitors download progress via the Queue page
4. **Importing:** Once complete, Sonarr/Radarr/Lidarr/Readarr imports the file from the download directory

---

## Step 1: Configure Categories

**This step is critical!** Categories determine where files are downloaded, and Sonarr/Radarr/Lidarr/Readarr need to know these paths.

### In aMuTorrent:

1. Go to **Categories** page
2. Click **New Category**
3. Create categories for each *arr application:

**For Sonarr (TV Shows):**
- **Title:** `sonarr`
- **Path:** `/downloads/sonarr` (or your preferred path)

**For Radarr (Movies):**
- **Title:** `radarr`
- **Path:** `/downloads/radarr` (or your preferred path)

**For Lidarr (Music):**
- **Title:** `lidarr`
- **Path:** `/downloads/lidarr` (or your preferred path)

**For Readarr (Books):**
- **Title:** `readarr`
- **Path:** `/downloads/readarr` (or your preferred path)

> **Important:** Remember these exact category names and paths - you'll need them when configuring the download client.

---

## Step 2: Add the Torznab Indexer

The Torznab indexer allows *arr applications to search the ED2K network.

### For Sonarr / Radarr / Lidarr / Readarr:

1. Go to **Settings** → **Indexers**
2. Click **+** (Add Indexer)
3. Select **Torznab** → **Custom**
4. Configure:

| Field | Value |
|-------|-------|
| **Name** | `aMule` (or any name) |
| **URL** | `http://YOUR-SERVER:4000/indexer/amule/api` |
| **API Key** | Your web UI password (see note below) |
| **Categories** | 5000 (TV) or leave default |
| **Enable Automatic Search** | Your preference (see [Automatic Search](#step-5-automatic-search-optional)) |
| **Enable Interactive Search** | Yes |

5. Click **Test** to verify connection
6. Click **Save**

Use the same Torznab endpoint in all *arr apps:

| Field | Value |
|-------|-------|
| **Name** | `aMule` (or any name) |
| **URL** | `http://YOUR-SERVER:4000/indexer/amule/api` |
| **API Key** | Your web UI password (see note below) |
| **Enable Automatic Search** | Your preference |
| **Enable Interactive Search** | Yes |

Suggested category presets by app:

| App | Suggested Torznab Category |
|-----|----------------------------|
| Sonarr | 5000 (TV) |
| Radarr | 2000 (Movies) |
| Lidarr | 3000 (Audio) |
| Readarr | 7000 (Books) |

> **Note:** Replace `YOUR-SERVER` with your actual server IP/hostname. If running in Docker, use the container name or `host.docker.internal`.

> **Authentication:** If web UI authentication is enabled, the **API Key** field is required. Use your personal API key (found in Settings → *arr integration info). If authentication is disabled, leave the API Key field empty.

---

## Step 3: Add the Download Client

The qBittorrent-compatible API allows *arr applications to manage downloads.

### For Sonarr / Radarr / Lidarr / Readarr:

1. Go to **Settings** → **Download Clients**
2. Click **+** (Add Download Client)
3. Select **qBittorrent**
4. Configure:

| Field | Value |
|-------|-------|
| **Name** | `aMule` (or any name) |
| **Host** | `YOUR-SERVER` (IP or hostname) |
| **Port** | `4000` |
| **Username** | Any value, e.g. `admin` (see note below) |
| **Password** | Your web UI password (see note below) |
| **Category** | `sonarr` (must match category created in Step 1) |
| **Remove Completed** | Your preference |

5. Click **Test** to verify connection
6. Click **Save**

Use the same download client endpoint in all *arr apps:

| Field | Value |
|-------|-------|
| **Name** | `aMule` (or any name) |
| **Host** | `YOUR-SERVER` (IP or hostname) |
| **Port** | `4000` |
| **Username** | Any value, e.g. `admin` (see note below) |
| **Password** | Your web UI password (see note below) |
| **Remove Completed** | Your preference |

Set category by app (must match Step 1):

| App | Category |
|-----|----------|
| Sonarr | `sonarr` |
| Radarr | `radarr` |
| Lidarr | `lidarr` |
| Readarr | `readarr` |

> **Authentication:** If web UI authentication is enabled, fill **either** the API Key field (preferred, newer Sonarr/Radarr) **or** the Username + Password fields — see the next section.

### Authentication modes

If you have web UI authentication enabled, aMuTorrent's qBittorrent-compatible API accepts three modes. Use whichever your client supports:

| Mode | What to enter in Sonarr/Radarr | Notes |
|---|---|---|
| **API Key (Bearer)** | Leave Username blank; set the **API Key** field to your personal API key (found in Settings → Sonarr/Radarr integration info). | Recommended for Sonarr ≥ May 2026 / Radarr ≥ equivalent. No login round-trip; the key is sent on every request as `Authorization: Bearer <key>`. |
| **Username + Password (session cookie)** | **Username**: your aMuTorrent username. **Password**: your aMuTorrent password *or* your personal API key. | The classic qBittorrent flow: client logs in once via `/api/v2/auth/login`, gets a `SID` cookie, reuses it. |
| **HTTP Basic Auth** | Same field values as username/password mode. | Fallback for direct tooling (`curl`, scripts). Most *arr clients won't use this. |

All three require an **admin** account; non-admin users can't operate the qBit-compatible API. If authentication is disabled server-side, all fields can be left blank.

---

## Step 4: Docker Path Configuration

If you're running aMule and/or *arr applications in Docker, you need to ensure all containers can access the download directories.

### Understanding the Problem

Each Docker container has its own filesystem. When aMule downloads a file to `/downloads/sonarr/file.mkv`, Sonarr needs to access that same file. If Sonarr is in a different container, it might see that path differently.

### Solution 1: Shared Volume Mounts

Mount the same download directory in aMule and *arr containers:

```yaml
services:
  amule:
    volumes:
      - ./data/aMule/config:/home/amule/.aMule
      - ./data/aMule/incoming:/downloads
      - ./data/aMule/temp:/downloads/temp

  sonarr:
    volumes:
      - ./data/aMule/incoming:/downloads  # Same path as aMule!
      - ./data/sonarr/config:/config

  radarr:
    volumes:
      - ./data/aMule/incoming:/downloads  # Same path as aMule!
      - ./data/radarr/config:/config
```

With this setup, aMule and *arr containers all see `/downloads` as the same directory on the host (`./data/aMule/incoming`).

> **Note:** The web controller doesn't need access to the downloads directory - only aMule (which does the actual downloading) and Sonarr/Radarr/Lidarr/Readarr (which import the files) need it.

### Solution 2: Remote Path Mappings

If containers use different internal paths for the same host directory, configure **Remote Path Mappings** in Sonarr/Radarr/Lidarr/Readarr.

**When do you need this?** When aMule and Sonarr/Radarr/Lidarr/Readarr mount the same host folder to *different* container paths.

**Example Setup:**

```
Host directory: ./data/aMule/incoming

aMule container:      mounted as /downloads
Sonarr container:     mounted as /data/downloads
```

When aMule finishes downloading, it reports the file path as `/downloads/sonarr/show.mkv`. But Sonarr sees that same file as `/data/downloads/sonarr/show.mkv`. Remote Path Mapping tells Sonarr how to translate the path.

**Configure in Sonarr/Radarr/Lidarr/Readarr:**

1. Go to **Settings** → **Download Clients**
2. Scroll to **Remote Path Mappings**
3. Click **+** (Add Mapping)
4. Configure:

| Field | Value                                                  |
|-------|--------------------------------------------------------|
| **Host** | `YOUR-SERVER` (same as download client host)           |
| **Remote Path** | `/downloads/` (path reported by aMule/download client) |
| **Local Path** | `/data/downloads/` (path as Sonarr sees it)            |

Sonarr will now translate `/downloads/sonarr/show.mkv` → `/data/downloads/sonarr/show.mkv`

### Native Installation (No Docker)

If aMule and *arr applications all run on the same machine without Docker:
- Use the same absolute paths everywhere
- No Remote Path Mappings needed
- Ensure file permissions allow all applications to read/write

---

## Step 5: Automatic Search (Optional)

You can configure automatic searches to periodically check for missing content.

### In aMuTorrent:

1. Go to **Settings**
2. Enable **Sonarr Integration**, **Radarr Integration**, **Lidarr Integration**, and/or **Readarr Integration**
3. Configure:
  - **URL:** `http://YOUR-SERVER:8989` (Sonarr), `http://YOUR-SERVER:7878` (Radarr), `http://YOUR-SERVER:8686` (Lidarr), or `http://YOUR-SERVER:8787` (Readarr)
   - **API Key:** Found in *arr Settings → General → Security
   - **Search Interval:** Hours between automatic searches (e.g., `6`)

4. Click **Save**

### What This Does:

At the configured interval, the Web Controller will:
1. Connect to Sonarr/Radarr/Lidarr/Readarr API
2. Trigger a search for missing episodes/movies/albums/books
3. Sonarr/Radarr/Lidarr/Readarr will then query the Torznab indexer for results

### Required: Enable Automatic Search on the Indexer

For this feature to work, you **must** enable **Automatic Search** on the aMule indexer in Sonarr/Radarr/Lidarr/Readarr:

1. Go to **Settings** → **Indexers**
2. Edit the aMule indexer
3. Ensure **Enable Automatic Search** is checked
4. Click **Save**

---

## Rate Limiting & Caching

ED2K servers have flood protection that can temporarily ban clients making too many searches. The Web Controller implements protective measures:

### Rate Limiting

- **Default:** 10 seconds between consecutive ED2K searches
- **Configurable via:** `ED2K_SEARCH_DELAY_MS` environment variable
- **Recommendation:** 5000-10000ms (5-10 seconds)

---

## Troubleshooting

### "Connection refused" when testing indexer/download client

- Verify the Web Controller is running
- Check the URL/host is correct
- If using Docker, ensure network connectivity between containers
- Check firewall rules

### "Unauthorized" or "Invalid API key" errors

- If web UI authentication is enabled, you **must** provide credentials:
  - **Torznab indexer:** Enter your personal API key in the "API Key" field (found in Settings)
  - **qBittorrent download client:** Enter your username and password, or use your API key as the password
- Only admin users can access the external APIs
- Verify the key/password matches exactly (case-sensitive)
- If authentication is disabled in the Web Controller, leave credential fields empty

### Automatic search not triggering

1. Verify API key is correct in Settings
2. Check Sonarr/Radarr/Lidarr/Readarr URL is accessible from Web Controller
3. Verify search interval is set (not 0)
4. Check server logs for errors