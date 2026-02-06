# rTorrent Integration

aMuTorrent connects to rTorrent via XML-RPC over HTTP, allowing you to manage BitTorrent downloads.

## Requirements

- rTorrent with XML-RPC enabled over HTTP
- Typically requires a web server (nginx, lighttpd) to expose XML-RPC

## Configuration

### Via Settings UI

1. Go to **Settings** in aMuTorrent
2. Expand the **rTorrent** section
3. Enable rTorrent integration
4. Configure connection settings:
   - **Host**: rTorrent XML-RPC hostname (e.g., `localhost` or `rtorrent`)
   - **Port**: XML-RPC port (default: `8080`)
   - **Path**: XML-RPC endpoint path (default: `/RPC2`)
   - **Username/Password**: If HTTP authentication is required

### Via Environment Variables

```bash
RTORRENT_ENABLED=true
RTORRENT_HOST=localhost
RTORRENT_PORT=8000
RTORRENT_PATH=/RPC2
RTORRENT_USERNAME=user
RTORRENT_PASSWORD=pass
```

### Via config.json

```json
{
  "rtorrent": {
    "enabled": true,
    "host": "localhost",
    "port": 8080,
    "path": "/RPC2",
    "username": "",
    "password": ""
  }
}
```

## rTorrent Setup

### Using ruTorrent's XML-RPC

If you're running ruTorrent, XML-RPC is already exposed. Use the same host/port as ruTorrent with path `/RPC2`.

### Standalone rTorrent with nginx

Add to your nginx configuration:

```nginx
location /RPC2 {
    scgi_pass unix:/path/to/rtorrent.sock;
    include scgi_params;
}
```

Or for TCP:

```nginx
location /RPC2 {
    scgi_pass 127.0.0.1:5000;
    include scgi_params;
}
```

### Docker Compose Example

```yaml
services:
  rtorrent:
    image: crazymax/rtorrent-rutorrent:latest
    container_name: rtorrent
    ports:
      - "127.0.0.1:8000:8000"  # XML-RPC (localhost only)
      - "6881:6881"            # BitTorrent
      - "6881:6881/udp"        # BitTorrent DHT
      - "50000:50000"          # Incoming connections
    volumes:
      - ./data/rTorrent/config:/data
      - ./data/rTorrent/downloads:/downloads
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Rome
    restart: unless-stopped

  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - RTORRENT_ENABLED=true
      - RTORRENT_HOST=rtorrent
      - RTORRENT_PORT=8000
      - RTORRENT_PATH=/RPC2
    volumes:
      # Download directories (optional): Required for moving/deleting files
      - ./data/rTorrent/downloads:/downloads
    ports:
      - "4000:4000"
    restart: unless-stopped
```

## Categories

Categories created in aMuTorrent map to rTorrent labels. When a category has a configured path:

1. New downloads with that category are saved to the category path
2. Existing downloads (active or completed) can be moved to their category path via the UI

## Troubleshooting

### Connection Failed

- Verify rTorrent is running and XML-RPC is accessible
- Test with curl: `curl http://host:port/RPC2`
- Check firewall rules between containers/hosts
- Verify username/password if authentication is enabled

### Downloads Not Appearing

- Ensure rTorrent integration is enabled in Settings
- Check the aMuTorrent logs for connection errors
- Verify the XML-RPC path is correct (usually `/RPC2`)

### Permission Issues

- Ensure aMuTorrent can write to download directories
- Check that rTorrent and aMuTorrent share the same UID/GID in Docker
