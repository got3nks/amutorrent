# Installation

aMuTorrent can be installed using Docker (recommended) or natively.

**Prerequisites:** At least one of: aMule with External Connections enabled, rTorrent with XML-RPC over HTTP, or qBittorrent with WebUI enabled.

## Docker Installation (Recommended)

Available on [Docker Hub](https://hub.docker.com/r/g0t3nks/amutorrent). Supports `linux/amd64` and `linux/arm64`.

### 1. Pull the image

```bash
docker pull g0t3nks/amutorrent:latest
```

### 2. Create directories

```bash
mkdir -p data logs
sudo chown -R 1000:1000 data logs
```

### 3. Create `docker-compose.yml`

```yaml
services:
  amutorrent:
    image: g0t3nks/amutorrent:latest
    user: "1000:1000"
    container_name: amutorrent
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./logs:/usr/src/app/server/logs
      - ./data:/usr/src/app/server/data
    restart: unless-stopped
```

### 4. Start and configure

```bash
docker compose up -d
```

Open `http://localhost:4000` and follow the setup wizard to configure your download clients.

> **All-in-One Setup:** For a complete setup with aMule, rTorrent, and qBittorrent in Docker, see [docker-compose.all-in-one.yml](https://github.com/got3nks/amutorrent/blob/main/docker-compose.all-in-one.yml).

## Native Installation

### Prerequisites

- Node.js 18 or later
- npm

### Steps

1. Clone the repository:

```bash
git clone https://github.com/got3nks/amutorrent.git
cd amutorrent
```

2. Install dependencies and build:

```bash
cd server && npm install && cd ..
npm install && npm run build
```

3. Start the server:

```bash
node server/server.js
```

4. Open `http://localhost:4000` and complete the setup wizard

## First Run Setup

On first launch, aMuTorrent will display a setup wizard to configure:

- **Download clients** - Enable at least one: aMule, rTorrent, qBittorrent, or any combination
- **Web authentication** (optional) - Protect the web interface with a password

## Next Steps

After completing the setup wizard, explore additional features:

> **Configuration:** Settings, environment variables, and Docker networking. See [Configuration](./CONFIGURATION.md).
>
> **Download Clients:** Detailed setup for [aMule](./AMULE.md), [rTorrent](./RTORRENT.md), and [qBittorrent](./QBITTORRENT.md).
>
> **Prowlarr:** Search torrents directly from the web UI. See [Prowlarr Setup](./PROWLARR.md).
>
> ***arr Apps:** Use aMuTorrent as an indexer and download client for Sonarr, Radarr, and other *arr apps. See [*arr Integration](./INTEGRATIONS.md).
>
> **Notifications:** Get notified when downloads complete. See [Notifications](./NOTIFICATIONS.md).
>
> **Scripting:** Run custom scripts on download events. See [Scripting](../scripts/README.md).
>
> **GeoIP:** Display peer locations on a map. See [GeoIP Setup](./GEOIP.md).
