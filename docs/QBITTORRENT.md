# qBittorrent Integration

aMuTorrent connects to qBittorrent via its WebUI API, allowing you to manage BitTorrent downloads alongside aMule and rTorrent.

> **Alternative:** aMuTorrent also supports [rTorrent](./RTORRENT.md), [Deluge](./DELUGE.md), and [Transmission](./TRANSMISSION.md). You can use multiple BitTorrent clients simultaneously.

## Requirements

- qBittorrent with WebUI enabled (enabled by default)
- WebUI accessible over HTTP/HTTPS from aMuTorrent

## First-Time Setup

> **Important:** Recent versions of qBittorrent do **not** use a default password. Instead, a random password is generated at first boot. If running in Docker, check the container logs to find it:
>
> ```bash
> docker logs qbittorrent
> ```
>
> Look for a line like: `A temporary password is provided for this session: <password>`
>
> You **must** open the qBittorrent WebUI and set a permanent password before configuring aMuTorrent.

1. Open the qBittorrent WebUI (default: `http://localhost:8080`)
2. Log in with the temporary password from the logs
3. Go to **Tools** > **Options** > **Web UI**
4. Set a permanent username and password
5. Save the settings

## Configuration

### Via Settings UI

1. Go to **Settings** in aMuTorrent
2. Expand the **BitTorrent Integration** section
3. Enable qBittorrent
4. Configure connection settings:
   - **Host**: qBittorrent WebUI hostname (e.g., `localhost` or `qbittorrent`)
   - **Port**: WebUI port (default: `8080`)
   - **Username**: WebUI username (default: `admin`)
   - **Password**: WebUI password (set during first-time setup)
   - **URL Path**: Base path if behind a reverse proxy (e.g., `/qbittorrent`)
   - **Use SSL**: Enable if WebUI uses HTTPS

### Via Environment Variables

```bash
QBITTORRENT_ENABLED=true
QBITTORRENT_HOST=localhost
QBITTORRENT_PORT=8080
QBITTORRENT_PATH=              # Optional: URL path for reverse proxy (e.g., /qbittorrent)
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your_password
QBITTORRENT_USE_SSL=false
```

### Via config.json

```json
{
  "qbittorrent": {
    "enabled": true,
    "host": "localhost",
    "port": 8080,
    "username": "admin",
    "password": "your_password",
    "useSSL": false
  }
}
```

## Docker Compose Example

```yaml
services:
  qbittorrent:
    image: linuxserver/qbittorrent:latest
    container_name: qbittorrent
    ports:
      - "127.0.0.1:8080:8080"  # WebUI (localhost only)
      - "6882:6882"            # BitTorrent
      - "6882:6882/udp"        # BitTorrent DHT
    volumes:
      - ./data/qBittorrent/config:/config
      - ./data/qBittorrent/downloads:/downloads
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Rome
      - WEBUI_PORT=8080
      - TORRENTING_PORT=6882
    restart: unless-stopped

  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - QBITTORRENT_ENABLED=true
      - QBITTORRENT_HOST=qbittorrent
      - QBITTORRENT_PORT=8080
      - QBITTORRENT_USERNAME=admin
      - QBITTORRENT_PASSWORD=your_password
    ports:
      - "4000:4000"
    restart: unless-stopped
```

## Features

### Category Sync

Categories are automatically synced between aMuTorrent and qBittorrent:

- Categories created in aMuTorrent are pushed to qBittorrent
- Existing qBittorrent categories are imported on first connection
- Category path changes are kept in sync

### Native File Operations

Unlike rTorrent, qBittorrent handles file moves and deletions natively via its API:

- **File moves** use qBittorrent's `setLocation()` - no shared volume mount needed for moves
- **File deletion** uses qBittorrent's API - no shared volume mount needed for deletes

### Application Logs

View qBittorrent application logs directly in aMuTorrent's Logs page (requires qBittorrent to be connected).

## Using Multiple BitTorrent Clients

You can run multiple BitTorrent clients simultaneously (rTorrent, qBittorrent, Deluge, Transmission), including multiple instances of the same client type. When multiple clients are connected:

- A **client selector** appears when adding downloads, letting you choose the target client
- The **ED2K/BT filter** in the header groups all BitTorrent clients together
- **Statistics** combine speeds and totals from all connected clients
- **Prowlarr** search results can be sent to any connected BitTorrent client
- Additional instances can be added through the **Settings** page

## Troubleshooting

### Connection Failed

- Verify qBittorrent is running and WebUI is accessible
- Test with curl: `curl http://host:8080/api/v2/app/version`
- Check firewall rules between containers/hosts
- Verify username/password are correct

### "Temporary password" / Can't Log In

- New qBittorrent installs generate a random password at boot
- Check container logs: `docker logs qbittorrent`
- Open WebUI directly and set a permanent password first

### Downloads Not Appearing

- Ensure qBittorrent integration is enabled in Settings
- Check aMuTorrent logs for connection errors
- Verify the WebUI port is correct (default: `8080`)

### Categories Out of Sync

- Categories sync automatically when qBittorrent connects
- If categories seem wrong, restart aMuTorrent to trigger a fresh sync
- Check aMuTorrent logs for category sync messages

### Permission Issues

- For file moves: qBittorrent handles moves natively, no extra permissions needed
- For volume mounts: ensure aMuTorrent and qBittorrent share the same UID/GID in Docker
