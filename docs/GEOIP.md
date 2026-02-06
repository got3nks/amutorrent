# GeoIP Setup Guide

This guide explains how to set up MaxMind GeoLite2 databases to display geographic locations of peers in the uploads view.

## Overview

The application uses MaxMind GeoLite2 databases to show country flags and city information for upload peers. This is optional but enhances the user experience.

---

## Prerequisites

1. **Free MaxMind Account** - Register at https://www.maxmind.com/en/geolite2/signup
2. **License Key** - Generate a license key from your MaxMind account dashboard

---

## Setup with Docker (Recommended)

The easiest way to keep GeoIP databases updated is using the `geoip-updater` container.

### Step 1: Configure Volume Mounts

**Important:** The GeoIP database directory must be accessible by both the updater and the web controller. The simplest approach is to mount the same host directory in both containers.

Add the `geoip` service to your `docker-compose.yml`:

```yaml
services:
  amutorrent:
    volumes:
      - ./data:/usr/src/app/server/data    # GeoIP files go in ./data/geoip
      # ... other volumes ...

  geoip:
    image: crazymax/geoip-updater:latest
    container_name: geoip-updater
    environment:
      - EDITION_IDS=GeoLite2-ASN,GeoLite2-City,GeoLite2-Country
      - LICENSE_KEY=YOUR_LICENSE_KEY
      - DOWNLOAD_PATH=/data
      - SCHEDULE=0 0 * * 0    # Weekly on Sunday at midnight
      - LOG_LEVEL=info
      - LOG_JSON=false
    volumes:
      - ./data/geoip:/data    # Same directory as web controller expects
    restart: unless-stopped
```

### Understanding the Volume Mapping

| Container | Host Path | Mount | Purpose |
|-----------|-----------|-------|---------|
| amutorrent | `./data` | `/usr/src/app/server/data` | App data directory |
| geoip | `./data/geoip` | `/data` | GeoIP database downloads |

The web controller expects GeoIP files in `server/data/geoip/` by default. With the above configuration:
- The updater downloads files to `/data` inside its container
- This maps to `./data/geoip` on the host
- The web controller sees this as `server/data/geoip/` inside its container

### Step 2: Create Directories

```bash
mkdir -p data logs data/geoip
sudo chown -R 1000:1000 data logs
```

> **Note:** The `chown` command ensures the directories are owned by the same user specified in the `user: "1000:1000"` setting in your docker-compose.yml. These commands are safe to run even if the directories already exist.

### Step 3: Start the Containers

```bash
docker compose up -d
```

The updater will download the databases on first start and update them weekly.

---

## Manual Setup (Native Installation)

If not using Docker, download the databases manually:

1. Log in to your MaxMind account
2. Navigate to **Download Files**
3. Download:
   - `GeoLite2-City.mmdb`
   - `GeoLite2-Country.mmdb`
4. Place them in `server/data/geoip/`
5. Restart the application

**Note:** You'll need to manually update these files periodically as MaxMind updates their databases.

---

## Configuration

The GeoIP directory path can be configured in the Settings page under **Directories**.

Default path: `server/data/geoip`

The application looks for these files:
- `GeoLite2-City.mmdb` - Provides city-level location data
- `GeoLite2-Country.mmdb` - Provides country-level location data (fallback)

---

## Verification

After setup, the application will automatically detect and load the databases. You can verify it's working by:

1. Going to the **Uploads** view
2. Looking for country flags and location info displayed next to peer IP addresses (visible on both desktop and mobile)

Check the server logs for GeoIP initialization messages:
```
🌍 GeoIP City database loaded: /usr/src/app/server/data/geoip/GeoLite2-City.mmdb
🌍 GeoIP Country database loaded: /usr/src/app/server/data/geoip/GeoLite2-Country.mmdb
```

---

## Troubleshooting

### "GeoIP databases not found"

- Verify the files exist in the configured directory
- Check file permissions (readable by the application)
- Ensure volume mounts are correct in Docker

### Flags not showing

- The GeoIP lookup may fail for local/private IP addresses
- Some IP addresses may not have location data
- Try restarting the application after adding the database files

### Updater not downloading files

- Verify your LICENSE_KEY is correct
- Check the geoip-updater container logs: `docker logs geoip-updater`
- Ensure the container has write access to the volume

---

## Alternative: Using Existing GeoIP Databases

If you already have GeoIP databases from another application, you can point the web controller to that directory instead of running a separate updater.

In Settings, set the GeoIP Directory to the path where your existing databases are located.
