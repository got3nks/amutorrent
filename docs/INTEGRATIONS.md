# Sonarr/Radarr Integration Guide

This guide provides complete instructions for integrating aMuTorrent with Sonarr and Radarr.

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

1. **Torznab Indexer API** - Allows Sonarr/Radarr to search the ED2K network
2. **qBittorrent-Compatible Download Client API** - Allows Sonarr/Radarr to manage downloads and import completed files

---

## How It Works

1. **Searching:** When Sonarr/Radarr searches for content, they query our Torznab API, which performs an ED2K search and returns results
2. **Downloading:** When a release is selected, Sonarr/Radarr sends the ED2K link to our qBittorrent-compatible API
3. **Monitoring:** Sonarr/Radarr monitors download progress via the Queue page
4. **Importing:** Once complete, Sonarr/Radarr imports the file from the download directory

---

## Step 1: Configure Categories

**This step is critical!** Categories determine where files are downloaded, and Sonarr/Radarr need to know these paths.

### In aMuTorrent:

1. Go to **Categories** page
2. Click **New Category**
3. Create categories for each *arr application:

**For Sonarr (TV Shows):**
- **Title:** `sonarr`
- **Path:** `/incoming/sonarr` (or your preferred path)

**For Radarr (Movies):**
- **Title:** `radarr`
- **Path:** `/incoming/radarr` (or your preferred path)

> **Important:** Remember these exact category names and paths - you'll need them when configuring the download client.

---

## Step 2: Add the Torznab Indexer

The Torznab indexer allows *arr applications to search the ED2K network.

### For Sonarr:

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

### For Radarr:

1. Go to **Settings** → **Indexers**
2. Click **+** (Add Indexer)
3. Select **Torznab** → **Custom**
4. Configure:

| Field | Value |
|-------|-------|
| **Name** | `aMule` (or any name) |
| **URL** | `http://YOUR-SERVER:4000/indexer/amule/api` |
| **API Key** | Your web UI password (see note below) |
| **Categories** | 2000 (Movies) or leave default |
| **Enable Automatic Search** | Your preference |
| **Enable Interactive Search** | Yes |

5. Click **Test** to verify connection
6. Click **Save**

> **Note:** Replace `YOUR-SERVER` with your actual server IP/hostname. If running in Docker, use the container name or `host.docker.internal`.

> **Authentication:** If web UI authentication is enabled in the Web Controller, the **API Key** field is required. Use the same password you use to log into the web interface. If authentication is disabled, leave the API Key field empty.

---

## Step 3: Add the Download Client

The qBittorrent-compatible API allows *arr applications to manage downloads.

### For Sonarr:

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

### For Radarr:

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
| **Category** | `radarr` (must match category created in Step 1) |
| **Remove Completed** | Your preference |

5. Click **Test** to verify connection
6. Click **Save**

> **Authentication:** If web UI authentication is enabled in the Web Controller, the **Username** and **Password** fields are required. The username can be any value (it's ignored), but the password must match your web UI login password. If authentication is disabled, leave both fields empty.

---

## Step 4: Docker Path Configuration

If you're running aMule and/or *arr applications in Docker, you need to ensure all containers can access the download directories.

### Understanding the Problem

Each Docker container has its own filesystem. When aMule downloads a file to `/incoming/sonarr/file.mkv`, Sonarr needs to access that same file. If Sonarr is in a different container, it might see that path differently.

### Solution 1: Shared Volume Mounts

Mount the same download directory in aMule and *arr containers:

```yaml
services:
  amule:
    volumes:
      - /path/on/host/temp:/temp          # aMule temp files
      - /path/on/host/incoming:/incoming  # aMule downloaded files
      - ./data/.aMule:/home/amule/.aMule

  sonarr:
    volumes:
      - /path/on/host/incoming:/incoming  # Same path!
      - ./sonarr/config:/config

  radarr:
    volumes:
      - /path/on/host/incoming:/incoming  # Same path!
      - ./radarr/config:/config
```

With this setup, aMule and *arr containers all see `/incoming` as the same location.

> **Note:** The web controller doesn't need access to the downloads directory - only aMule (which does the actual downloading) and Sonarr/Radarr (which import the files) need it.

### Solution 2: Remote Path Mappings

If containers use different internal paths for the same host directory, configure **Remote Path Mappings** in Sonarr/Radarr.

**When do you need this?** When aMule and Sonarr/Radarr mount the same host folder to *different* container paths.

**Example Setup:**

```
Host directory: /mnt/downloads

aMule container:      /mnt/downloads mounted as /incoming
Sonarr container:     /mnt/downloads mounted as /data/incoming
```

When aMule finishes downloading, it reports the file path as `/incoming/sonarr/show.mkv`. But Sonarr sees that same file as `/data/incoming/sonarr/show.mkv`. Remote Path Mapping tells Sonarr how to translate the path.

**Configure in Sonarr/Radarr:**

1. Go to **Settings** → **Download Clients**
2. Scroll to **Remote Path Mappings**
3. Click **+** (Add Mapping)
4. Configure:

| Field | Value |
|-------|-------|
| **Host** | `YOUR-SERVER` (same as download client host) |
| **Remote Path** | `/incoming/` (path reported by aMule/download client) |
| **Local Path** | `/data/incoming/` (path as Sonarr sees it) |

Sonarr will now translate `/incoming/sonarr/show.mkv` → `/data/incoming/sonarr/show.mkv`

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
2. Enable **Sonarr Integration** and/or **Radarr Integration**
3. Configure:
   - **URL:** `http://YOUR-SERVER:8989` (Sonarr) or `http://YOUR-SERVER:7878` (Radarr)
   - **API Key:** Found in *arr Settings → General → Security
   - **Search Interval:** Hours between automatic searches (e.g., `6`)

4. Click **Save**

### What This Does:

At the configured interval, the Web Controller will:
1. Connect to Sonarr/Radarr API
2. Trigger a search for missing episodes/movies
3. Sonarr/Radarr will then query the Torznab indexer for results

### Required: Enable Automatic Search on the Indexer

For this feature to work, you **must** enable **Automatic Search** on the aMule indexer in Sonarr/Radarr:

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
  - **Torznab indexer:** Enter your web UI password in the "API Key" field
  - **qBittorrent download client:** Enter any username and your web UI password
- Verify the password matches exactly (case-sensitive)
- If authentication is disabled in the Web Controller, leave credential fields empty

### Automatic search not triggering

1. Verify API key is correct in Settings
2. Check Sonarr/Radarr URL is accessible from Web Controller
3. Verify search interval is set (not 0)
4. Check server logs for errors