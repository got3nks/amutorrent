# Rucio Integration

aMuTorrent connects to [Rucio](https://github.com/ogarcia/rucio) over its REST API, letting you search the network, manage downloads and shared files, and organize everything with categories — all from the same dashboard you use for your other clients.

Rucio is a P2P daemon built on libp2p and BLAKE3, with eMule/Kad compatibility. It is treated as its own network in aMuTorrent (separate from aMule), with its own filter toggle, chart series and status badge.

## Requirements

- A running Rucio daemon (`ruciod`) with its REST API reachable from aMuTorrent
- The API port (default: `3003`)

> **No authentication:** Rucio's API has no built-in authentication — access control is meant to be delegated to a reverse proxy. If you put Rucio behind HTTP basic auth, aMuTorrent can pass credentials (see Username/Password below).

## Rucio API Setup

The REST API is always served by the daemon; you only need to make sure it listens on an address aMuTorrent can reach.

By default the daemon binds to `127.0.0.1:3003`, which is **only reachable from the same host**. If aMuTorrent runs in a container or on another machine, bind the API to all interfaces:

```bash
RUCIOD_API_LISTEN=0.0.0.0:3003 ruciod
```

Or in Rucio's `config.toml`:

```toml
[api]
listen = "0.0.0.0:3003"
```

> When exposing the API beyond localhost, put Rucio behind a reverse proxy and restrict access there — the daemon itself does not authenticate requests.

## Configuration

### Via Settings UI

1. Go to **Settings** → **Download Clients** and click **Add Client**
2. Choose **Rucio**
3. Configure connection settings:
   - **Host**: Rucio daemon hostname or IP (e.g., `localhost`, `rucio`, or `host.docker.internal`)
   - **Port**: API port (default: `3003`)
   - **Base Path** *(optional)*: set this only when the daemon is served under a sub-path behind a reverse proxy (e.g., `/rucio`)
   - **Username / Password** *(optional)*: only if the daemon is behind HTTP basic auth
   - **Use SSL (HTTPS)**: enable when connecting through an HTTPS reverse proxy

### Via Environment Variables

```bash
RUCIO_ENABLED=true
RUCIO_HOST=localhost
RUCIO_PORT=3003
RUCIO_USE_SSL=false
RUCIO_BASE_PATH=
RUCIO_USERNAME=
RUCIO_PASSWORD=
```

### Via config.json

```json
{
  "rucio": {
    "enabled": true,
    "host": "localhost",
    "port": 3003,
    "useSsl": false
  }
}
```

## Docker Compose Example

### Rucio on Host Machine

```yaml
services:
  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - RUCIO_ENABLED=true
      - RUCIO_HOST=host.docker.internal
      - RUCIO_PORT=3003
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "4000:4000"
```

Make sure the daemon on the host binds to a reachable address (`RUCIOD_API_LISTEN=0.0.0.0:3003`).

### Rucio in Docker Container

```yaml
services:
  rucio:
    image: ghcr.io/ogarcia/rucio:latest
    container_name: rucio
    environment:
      - RUCIOD_API_LISTEN=0.0.0.0:3003
    ports:
      - "4321:4321"       # P2P (libp2p)
      - "4321:4321/udp"
    volumes:
      - ./data/rucio:/data
    restart: unless-stopped

  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - RUCIO_ENABLED=true
      - RUCIO_HOST=rucio
      - RUCIO_PORT=3003
    ports:
      - "4000:4000"
    restart: unless-stopped
```

> The Rucio API port (`3003`) does **not** need to be published to the host — aMuTorrent reaches it over the Docker network. Only publish it if you also want to access Rucio's own web UI directly.

## Features

### Search

Searches against Rucio run on the **unified search** alongside your other clients and surface in the same results view. Pick Rucio as the search target from the search widget; results can be queued straight to Rucio.

### Downloads

Add downloads via `rucio:` magnets or ED2K links, and pause, resume, rename, cancel and delete them from the UI like any other client.

### Shared Files

Rucio's shared files appear in the **Shared Files** view. Unsharing a file in aMuTorrent removes it from Rucio's share list without deleting the file on disk.

### Categories

Categories created in aMuTorrent are synced to Rucio, including their **color** and **download directory**. Editing a category in aMuTorrent updates it in Rucio, and downloads can be assigned to a category from the UI.

## Reverse Proxy / Sub-path

To serve Rucio under a sub-path (e.g., `https://example.com/rucio`), set `RUCIOD_BASE_PATH=/rucio/` on the daemon and enter `/rucio` as the **Base Path** in aMuTorrent. Enable **Use SSL** if the proxy terminates HTTPS.

## Troubleshooting

### Connection Failed

- Verify the daemon is running and the API is listening: `curl http://host:3003/health`
- If aMuTorrent runs in a container, the daemon must bind to `0.0.0.0` (not the default `127.0.0.1`) — set `RUCIOD_API_LISTEN=0.0.0.0:3003`
- Check the host/port and any firewall rules between aMuTorrent and Rucio

### Docker: Can't reach Rucio on host

- Add `extra_hosts` to your docker-compose.yml:
  ```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ```
- Use `host.docker.internal` as the Rucio host

### 401 / Authentication errors

- Rucio has no built-in auth — a 401 comes from a reverse proxy in front of it
- Enter the proxy's basic-auth Username/Password in the client settings

### Downloads or Shared Files Not Appearing

- Ensure the Rucio client is enabled in Settings
- Check the aMuTorrent logs for connection errors
- Confirm Rucio has active downloads or shared files of its own
