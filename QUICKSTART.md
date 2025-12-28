# Quick Start Guide

Get aMule Web Controller running in under 5 minutes!

## Prerequisites

✅ **aMule installed and running** on your machine with External Connections (EC) enabled
(See [aMule EC Setup](#amule-ec-setup) below if you haven't enabled this yet)

## 🚀 Fastest Way to Start

### Using Docker (Recommended)

1. **Create required directories:**
```bash
mkdir -p data logs
sudo chown -R 1000:1000 data logs
```

2. **Create `docker-compose.yml`:**
```yaml
services:
  amule-web:
    image: g0t3nks/amule-web-controller:latest
    user: "1000:1000"
    container_name: amule-web-controller
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Required for host aMule connection
    volumes:
      - ./logs:/usr/src/app/server/logs
      - ./data:/usr/src/app/server/data
    restart: unless-stopped
```

3. **Start:**
```bash
docker compose up -d
```

4. **Configure:**
- Open http://localhost:4000
- Complete the 5-step setup wizard:
  - **aMule Host:** `host.docker.internal` (connects to aMule on your host)
  - **aMule Port:** `4712` (default EC port)
  - **aMule Password:** Your EC password
- Done! 🎉

**⚠️ Important:** The `extra_hosts` line is required to connect to aMule running on your host machine. Don't remove it!

## ⚙️ Configuration

### Option 1: Setup Wizard (Recommended)
Just start the container and follow the interactive wizard. It will guide you through:
- aMule connection settings
- Directory paths
- Optional integrations (Sonarr/Radarr, GeoIP)

### Option 2: Pre-configure with Environment Variables
Add environment variables to your `docker-compose.yml` to skip manual input:

```yaml
environment:
  - AMULE_HOST=host.docker.internal
  - AMULE_PORT=4712
  - AMULE_PASSWORD=your_password
```

The wizard will auto-populate with these values. Just review and save!

### Option 3: Skip Wizard Completely
For automated deployments, set all variables and skip the wizard:

```yaml
environment:
  - SKIP_SETUP_WIZARD=true
  - AMULE_HOST=host.docker.internal
  - AMULE_PORT=4712
  - AMULE_PASSWORD=your_password
  # ... all other settings
```

## 🎯 Common Scenarios

### aMule on Host Machine (Default Setup)
The default `docker-compose.yml` above is configured for this scenario.
- Use `host.docker.internal` as aMule host in the wizard
- The `extra_hosts` section is required for this to work

### aMule in Another Container (All-in-One)
If you want to run aMule in Docker too:
```bash
# Download the all-in-one compose file
curl -O https://raw.githubusercontent.com/got3nks/amule-web-controller/main/docker-compose.all-in-one.yml
docker compose -f docker-compose.all-in-one.yml up -d
```
- Use `amule` as aMule host in the wizard (service name)

### aMule on Remote Server
If aMule is running on a different machine:
- Use the server's IP address or hostname in the wizard
- Ensure aMule EC port is accessible from your network
- Remove the `extra_hosts` line (not needed)

### Add Sonarr/Radarr Integration
Use the Settings page (settings icon in top-right) after initial setup, or add env vars:
```yaml
environment:
  - SONARR_URL=http://sonarr:8989
  - SONARR_API_KEY=your_api_key
  - SONARR_SEARCH_INTERVAL_HOURS=6
  - RADARR_URL=http://localhost:7878
  - RADARR_API_KEY=your_api_key_here
  - RADARR_SEARCH_INTERVAL_HOURS=6
```

### Enable GeoIP
Add the GeoIP updater service (requires free MaxMind license):
```yaml
services:
  geoip:
    image: crazymax/geoip-updater:latest
    container_name: geoip-updater
    environment:
      - GEOIPUPDATE_ACCOUNT_ID=YOUR_ACCOUNT_ID
      - GEOIPUPDATE_LICENSE_KEY=YOUR_LICENSE_KEY
      - GEOIPUPDATE_EDITION_IDS=GeoLite2-City,GeoLite2-Country
      - GEOIPUPDATE_FREQUENCY=24h
    volumes:
      - ./data/geoip:/data
    restart: unless-stopped
```

Get free license: https://www.maxmind.com/en/geolite-free-ip-geolocation-data

## 📚 Next Steps

- **Manage Settings:** Click settings icon in top-right corner
- **Create Categories:** Go to Categories view
- **Add Downloads:** Search → Download → Assign category
- **View Statistics:** Check historical charts (24h/7d/30d)
- **Configure Integrations:** Enable Sonarr/Radarr in Settings

## ⚙️ aMule EC Setup

Before using this web controller, you must enable External Connections in aMule:

1. **Open aMule** (or edit `amule.conf` for amuled)
2. **Go to:** Preferences → Remote Controls → External Connections
3. **Enable:** "Accept external connections"
4. **Set EC password** (you'll need this for the web controller)
5. **Note the EC port** (default: 4712)
6. **Save and restart aMule**

**For amuled (headless aMule):**
Edit `~/.aMule/amule.conf`:
```ini
[ExternalConnect]
AcceptExternalConnections=1
ECPort=4712
ECPassword=<your_hashed_password>
```

## 🆘 Troubleshooting

**Can't connect to aMule?**
- Check aMule EC is enabled (Preferences → Remote Controls → External Connections)
- Verify EC password matches
- Ensure aMule EC port is 4712 (or update AMULE_PORT)

**Docker container won't start?**
- Check logs: `docker compose logs amule-web`
- Verify volumes are writable: `./logs` and `./data` directories

**Setup wizard not showing?**
- Clear browser cache
- Check http://localhost:4000 (not https)
- View browser console for errors

## 📖 Full Documentation

See [README.md](README.md) for complete documentation, including:
- Native installation
- Full environment variable reference
- API documentation
- Advanced configuration options
