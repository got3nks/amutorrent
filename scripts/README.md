# Custom Event Scripts

This directory contains an example script for the Custom Event Script feature, which allows power users to run custom commands when download events occur.

> **Note:** For most users, the **Notifications** page in the web UI is the recommended way to set up notifications. It provides a simple form-based interface for configuring Discord, Telegram, Slack, and many other services via Apprise.

## Files

- **`custom.sh`** - Example script showing how to handle events
- **`log-to-file.sh`** - Debug script that logs all received data to `server/logs/events.log`

## When to Use Custom Scripts

Custom scripts are useful when you need to:
- Run post-processing commands (e.g., extract archives, convert files)
- Integrate with systems not supported by Apprise
- Implement complex conditional logic
- Log events to a custom format or location
- Trigger home automation actions

## Quick Start

### 1. Edit the Script

Modify `scripts/custom.sh` (or create your own script) to handle events:

```bash
#!/bin/bash
EVENT_TYPE="$1"
EVENT_JSON=$(cat)

if [ "$EVENT_TYPE" = "downloadFinished" ]; then
    FILENAME=$(echo "$EVENT_JSON" | jq -r '.filename')
    # Your custom logic here
    echo "Download complete: $FILENAME"
fi
```

### 2. Make Script Executable

```bash
chmod +x scripts/custom.sh
```

### 3. Enable in Settings

Go to **Settings → Custom Event Script**:
- Toggle "Enable Custom Event Script" to ON
- Set the script path to `scripts/custom.sh`
- Click "Test Script Path" to verify

## Script Invocation

When an event occurs, your script receives:

| Source | Description |
|--------|-------------|
| `$1` (first argument) | Event type (e.g., `downloadFinished`) |
| Environment variables | Common fields as individual variables |
| Stdin | Full event data as JSON |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `EVENT_TYPE` | Event type (same as `$1`) |
| `EVENT_HASH` | Download hash/ID |
| `EVENT_FILENAME` | File name |
| `EVENT_CLIENT_TYPE` | Client type (amule, qbittorrent, rtorrent) |

### Event Types

| Event | Trigger | Additional JSON Fields |
|-------|---------|----------------------|
| `downloadAdded` | New download started | size, username, category |
| `downloadFinished` | Download completed | size, downloaded, uploaded, ratio, trackerDomain, category, path, multiFile |
| `categoryChanged` | Category changed | oldCategory, newCategory, path, multiFile |
| `fileMoved` | File moved | category, sourcePath, destPath |
| `fileDeleted` | File deleted | deletedFromDisk, category, path, multiFile |

**Common fields** (present in all events): `hash`, `filename`, `clientType`

The `category` field contains the item's category name (e.g., `"Movies"`, `"TV Shows"`), or `null` if uncategorized/Default.

The `path` field contains the full path to the file (or the content directory for multi-file torrents). When `multiFile` is `true`, `path` points to a directory containing multiple files.

## JSON Payload Examples

### downloadAdded

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "filename": "ubuntu-24.04-desktop-amd64.iso",
  "size": 6114770944,
  "username": "admin",
  "clientType": "qbittorrent",
  "category": "Linux ISOs"
}
```

### downloadFinished

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "filename": "ubuntu-24.04-desktop-amd64.iso",
  "size": 6114770944,
  "clientType": "qbittorrent",
  "downloaded": 6114770944,
  "uploaded": 1528692736,
  "ratio": 0.25,
  "trackerDomain": "torrent.ubuntu.com",
  "category": "Linux ISOs",
  "path": "/downloads/ubuntu-24.04-desktop-amd64.iso",
  "multiFile": false
}
```

Multi-file torrent example (path points to the content directory):

```json
{
  "hash": "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
  "filename": "My.Series.S01.Complete",
  "size": 15032385536,
  "clientType": "rtorrent",
  "downloaded": 15032385536,
  "uploaded": 7516192768,
  "ratio": 0.5,
  "trackerDomain": "tracker.example.com",
  "category": "TV Shows",
  "path": "/downloads/My.Series.S01.Complete",
  "multiFile": true
}
```

### categoryChanged

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "filename": "ubuntu-24.04-desktop-amd64.iso",
  "clientType": "rtorrent",
  "oldCategory": "Default",
  "newCategory": "Linux ISOs",
  "path": "/downloads/ubuntu-24.04-desktop-amd64.iso",
  "multiFile": false
}
```

### fileDeleted

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "filename": "old-file.zip",
  "clientType": "qbittorrent",
  "deletedFromDisk": true,
  "category": "Movies",
  "path": "/downloads/old-file.zip",
  "multiFile": false
}
```

### fileMoved

```json
{
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "filename": "movie.mkv",
  "clientType": "rtorrent",
  "category": "Movies",
  "sourcePath": "/downloads/movie.mkv",
  "destPath": "/media/movies/movie.mkv"
}
```

## Examples

### Parse JSON with jq

```bash
#!/bin/bash
EVENT_TYPE="$1"
EVENT_JSON=$(cat)

FILENAME=$(echo "$EVENT_JSON" | jq -r '.filename')
SIZE=$(echo "$EVENT_JSON" | jq -r '.size')

echo "[$EVENT_TYPE] $FILENAME ($SIZE bytes)"
```

### Post-Processing on Download Complete

```bash
#!/bin/bash
if [ "$1" = "downloadFinished" ]; then
    EVENT_JSON=$(cat)
    FILEPATH=$(echo "$EVENT_JSON" | jq -r '.path')
    MULTI=$(echo "$EVENT_JSON" | jq -r '.multiFile')

    # Extract archives (single-file only)
    if [ "$MULTI" = "false" ] && [ "$FILEPATH" != "null" ]; then
        case "$FILEPATH" in
            *.rar) unrar x "$FILEPATH" /extracted/ ;;
            *.zip) unzip "$FILEPATH" -d /extracted/ ;;
        esac
    fi
fi
```

### Send to Custom Webhook

```bash
#!/bin/bash
EVENT_JSON=$(cat)

curl -X POST "https://your-webhook.example.com/notify" \
    -H "Content-Type: application/json" \
    -d "$EVENT_JSON"
```

### Log Events to File

```bash
#!/bin/bash
echo "$(date -Iseconds) [$1] $EVENT_FILENAME" >> /var/log/downloads.log
```

## Testing

### Test Script Manually

```bash
echo '{"hash":"abc123","filename":"test.mkv","clientType":"qbittorrent","path":"/downloads/test.mkv","multiFile":false}' | \
    ./scripts/custom.sh downloadFinished
```

### Test from Settings

Use the "Test Script Path" button in Settings → Custom Event Script.

## Troubleshooting

**Script not executing:**
- Verify the script is executable: `chmod +x scripts/custom.sh`
- Check the script path in Settings matches exactly
- Look at application logs for `[EventScript]` messages

**jq not found (non-Docker only):**
- Debian/Ubuntu: `apt install jq`
- macOS: `brew install jq`
- Alpine: `apk add jq`

**Docker path issues:**
- The default path `scripts/custom.sh` is relative to the app directory
- For custom locations, use absolute paths like `/usr/src/app/scripts/my-script.sh`
