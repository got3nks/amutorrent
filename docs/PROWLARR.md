# Prowlarr Integration

aMuTorrent integrates with [Prowlarr](https://prowlarr.com/) to search for torrents across multiple indexers and add them directly to rTorrent.

## Requirements

- Prowlarr instance with configured indexers
- rTorrent enabled in aMuTorrent (Prowlarr results are added to rTorrent)

## Configuration

### Via Settings UI

1. Go to **Settings** in aMuTorrent
2. Expand the **rTorrent** section (Prowlarr settings are nested here)
3. Enable Prowlarr integration
4. Configure:
   - **Prowlarr URL**: Full URL to your Prowlarr instance (e.g., `http://prowlarr:9696`)
   - **API Key**: Your Prowlarr API key (found in Prowlarr → Settings → General)

### Via Environment Variables

```bash
PROWLARR_ENABLED=true
PROWLARR_URL=http://prowlarr:9696
PROWLARR_API_KEY=your-api-key-here
```

### Via config.json

```json
{
  "integrations": {
    "prowlarr": {
      "enabled": true,
      "url": "http://prowlarr:9696",
      "apiKey": "your-api-key-here"
    }
  }
}
```

## Finding Your API Key

1. Open Prowlarr web interface
2. Go to **Settings** → **General**
3. Under **Security**, find **API Key**
4. Copy the key and paste it in aMuTorrent settings

## Docker Compose Example

```yaml
services:
  prowlarr:
    image: linuxserver/prowlarr:latest
    container_name: prowlarr
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - ./data/prowlarr/config:/config
    ports:
      - "9696:9696"
    restart: unless-stopped

  rtorrent:
    image: crazymax/rtorrent-rutorrent:latest
    container_name: rtorrent
    # ... rtorrent config ...

  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - RTORRENT_ENABLED=true
      - RTORRENT_HOST=rtorrent
      - RTORRENT_PORT=8000
      - PROWLARR_ENABLED=true
      - PROWLARR_URL=http://prowlarr:9696
      - PROWLARR_API_KEY=your-api-key
    volumes:
      # Download directories (optional): Required for moving/deleting files
      - ./data/rTorrent/downloads:/downloads
    ports:
      - "4000:4000"
    restart: unless-stopped
```

## Troubleshooting

### "Prowlarr not configured"

- Verify Prowlarr URL and API key in Settings
- Ensure Prowlarr is accessible from aMuTorrent (check Docker networking)

### No Search Results

- Verify indexers are configured and working in Prowlarr
- Check Prowlarr logs for indexer errors
- Some indexers may be rate-limited or require authentication

### Download Fails

- Ensure rTorrent is connected and working
- Check if the torrent/magnet link is valid
- Some indexers may require Prowlarr to proxy downloads

### API Key Invalid

- Regenerate the API key in Prowlarr if needed
- Ensure no extra spaces when copying the key
- API keys are case-sensitive
