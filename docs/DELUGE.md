# Deluge Integration

aMuTorrent connects to Deluge via its WebUI JSON-RPC API, allowing you to manage BitTorrent downloads.

> **Alternative:** aMuTorrent also supports [rTorrent](./RTORRENT.md), [qBittorrent](./QBITTORRENT.md), and [Transmission](./TRANSMISSION.md). You can use multiple BitTorrent clients simultaneously.

## Requirements

- Deluge with WebUI enabled
- WebUI accessible over HTTP/HTTPS from aMuTorrent
- **Label plugin** must be enabled for category support (built-in on recent Deluge versions; aMuTorrent will attempt to enable it automatically on connect)

## Configuration

### Via Settings UI

1. Go to **Settings** in aMuTorrent
2. Expand the **BitTorrent Integration** section
3. Add a Deluge instance
4. Configure connection settings:
   - **Host**: Deluge WebUI hostname (e.g., `localhost` or `deluge`)
   - **Port**: WebUI port (default: `8112`)
   - **Password**: WebUI password (default: `deluge`)
   - **URL Path**: Base path if behind a reverse proxy (e.g., `/deluge`)
   - **Use SSL**: Enable if WebUI uses HTTPS

> **Note:** Deluge uses password-only authentication — there is no username field.

### Via Environment Variables

```bash
DELUGE_ENABLED=true
DELUGE_HOST=localhost
DELUGE_PORT=8112
DELUGE_PATH=              # Optional: URL path for reverse proxy (e.g., /deluge)
DELUGE_PASSWORD=deluge
DELUGE_USE_SSL=false
```

### Via config.json

```json
{
  "deluge": {
    "instances": [
      {
        "enabled": true,
        "host": "localhost",
        "port": 8112,
        "password": "deluge",
        "useSsl": false
      }
    ]
  }
}
```

## Docker Compose Example

```yaml
services:
  deluge:
    image: lscr.io/linuxserver/deluge:2.2.0-r1-ls364
    container_name: deluge
    ports:
      - "127.0.0.1:8112:8112"  # WebUI (localhost only)
      - "6883:6883"            # BitTorrent
      - "6883:6883/udp"        # BitTorrent DHT
    volumes:
      - ./data/Deluge/config:/config
      - ./data/Deluge/downloads:/downloads
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Rome
    restart: unless-stopped

  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - DELUGE_ENABLED=true
      - DELUGE_HOST=deluge
      - DELUGE_PORT=8112
      - DELUGE_PASSWORD=deluge
    ports:
      - "4000:4000"
    restart: unless-stopped
```

## Features

### Label Plugin (Categories)

Deluge uses the **Label plugin** for category support. When the Label plugin is available:

- Categories created in aMuTorrent are pushed to Deluge as labels
- Existing Deluge labels are imported on first connection
- aMuTorrent will attempt to enable the Label plugin automatically if it's not already active

> **Note:** If the Label plugin is not available, downloads will still work but without category/label assignment.

### Native File Operations

Deluge handles file moves and deletions natively via its API:

- **File moves** use Deluge's `move_storage()` — no shared volume mount needed for moves
- **File deletion** uses Deluge's `remove_torrent()` with `remove_data` — no shared volume mount needed for deletes

### Pause/Resume

Deluge does not distinguish between "pause" and "stop" — both map to the same paused state. The UI shows a single pause/resume toggle.

## Using Multiple BitTorrent Clients

You can run multiple BitTorrent clients simultaneously (rTorrent, qBittorrent, Deluge, Transmission), including multiple instances of the same client type. When multiple clients are connected:

- A **client selector** appears when adding downloads, letting you choose the target client
- The **ED2K/BT filter** in the header groups all BitTorrent clients together
- **Statistics** combine speeds and totals from all connected clients
- **Prowlarr** search results can be sent to any connected BitTorrent client
- Additional instances can be added through the **Settings** page

## Troubleshooting

### Connection Failed

- Verify Deluge is running and the WebUI is accessible
- Test with curl: `curl -X POST http://host:8112/json`
- Check firewall rules between containers/hosts
- Verify the password is correct (default: `deluge`)

### Label Plugin Not Available

- Open the Deluge WebUI directly
- Go to **Preferences** → **Plugins**
- Enable the **Label** plugin
- Restart Deluge if needed
- aMuTorrent will also attempt to enable it automatically on connect

### Downloads Not Appearing

- Ensure Deluge integration is enabled in Settings
- Check aMuTorrent logs for connection errors
- Verify the WebUI port is correct (default: `8112`)

### Permission Issues

- For file moves: Deluge handles moves natively, no extra permissions needed
- For volume mounts: ensure aMuTorrent and Deluge share the same UID/GID in Docker
