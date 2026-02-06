# Custom Event Scripts

This directory contains an example script for the Custom Event Script feature, which allows power users to run custom commands when download events occur.

> **Note:** For most users, the **Notifications** page in the web UI is the recommended way to set up notifications. It provides a simple form-based interface for configuring Discord, Telegram, Slack, and many other services via Apprise.

## Files

- **`custom.sh`** - Example script showing how to handle events

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
| `downloadAdded` | New download started | size |
| `downloadFinished` | Download completed | size, downloaded, uploaded, ratio, trackerDomain |
| `categoryChanged` | Category changed | oldCategory, newCategory |
| `fileMoved` | File moved | sourcePath, destPath |
| `fileDeleted` | File deleted | deletedFromDisk |

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
    FILENAME="$EVENT_FILENAME"

    # Extract archives
    case "$FILENAME" in
        *.rar) unrar x "/downloads/$FILENAME" /extracted/ ;;
        *.zip) unzip "/downloads/$FILENAME" -d /extracted/ ;;
    esac
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
echo '{"hash":"abc123","filename":"test.mkv","clientType":"qbittorrent"}' | \
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
