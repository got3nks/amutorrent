# aMule Integration

aMuTorrent connects to aMule via the EC (External Connections) protocol, allowing you to search the ED2K/Kad network and manage downloads.

## Requirements

- aMule (or amuled) with External Connections (EC) enabled
- EC password configured in aMule

## aMule EC Setup

Before connecting aMuTorrent, you must enable External Connections in aMule:

1. **Open aMule** (or edit amuled configuration file)
2. **Navigate to Preferences** → **Remote Controls** → **External Connections**
3. **Enable "Accept external connections"**
4. **Set an EC password** (remember this for aMuTorrent configuration)
5. **Note the EC port** (default: 4712)
6. **Optional:** Configure allowed IP addresses for security

### amuled Configuration

For headless setups using `amuled`, edit `~/.aMule/amule.conf`:

```ini
[ExternalConnect]
AcceptExternalConnections=1
ECPassword=<md5_hash_of_your_password>
ECPort=4712
```

To generate the MD5 hash of your password:
```bash
echo -n "your_password" | md5sum | cut -d ' ' -f 1
```

## Configuration

### Via Settings UI

1. Go to **Settings** in aMuTorrent
2. Expand the **aMule** section
3. Enable aMule integration
4. Configure connection settings:
   - **Host**: aMule hostname or IP (e.g., `localhost`, `amule`, or `host.docker.internal`)
   - **Port**: EC port (default: `4712`)
   - **Password**: Your EC password

### Via Environment Variables

```bash
AMULE_ENABLED=true
AMULE_HOST=localhost
AMULE_PORT=4712
AMULE_PASSWORD=your_ec_password
AMULE_SHARED_FILES_RELOAD_INTERVAL_HOURS=3
```

### Via config.json

```json
{
  "amule": {
    "enabled": true,
    "host": "localhost",
    "port": 4712,
    "password": "your_ec_password"
  }
}
```

## Docker Compose Example

### aMule on Host Machine

```yaml
services:
  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - AMULE_ENABLED=true
      - AMULE_HOST=host.docker.internal
      - AMULE_PORT=4712
      - AMULE_PASSWORD=your_password
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "4000:4000"
```

### aMule in Docker Container

```yaml
services:
  amule:
    image: ngosang/amule:latest
    container_name: amule
    environment:
      - PUID=1000
      - PGID=1000
      - GUI_PWD=your_password
      - WEBUI_PWD=your_password
    volumes:
      - ./data/aMule/config:/home/amule/.aMule
      - ./data/aMule/incoming:/incoming
      - ./data/aMule/temp:/temp
    ports:
      - "4662:4662"
      - "4665:4665/udp"
      - "4672:4672/udp"
    restart: unless-stopped

  amutorrent:
    image: g0t3nks/amutorrent:latest
    environment:
      - AMULE_ENABLED=true
      - AMULE_HOST=amule
      - AMULE_PORT=4712
      - AMULE_PASSWORD=your_password
    volumes:
      # Download directories (optional): Required for moving/deleting files
      - ./data/aMule/incoming:/incoming
    ports:
      - "4000:4000"
    restart: unless-stopped
```

## Categories

Categories created in aMuTorrent can be assigned to aMule downloads. When a category has a configured path:

1. New downloads with that category are saved to the category path
2. Existing downloads (active or completed) can be moved to their category path via the UI

## Troubleshooting

### Connection Failed

- Verify aMule is running and EC is enabled
- Check the EC password is correct (case-sensitive)
- Ensure the EC port (default 4712) is accessible
- Check firewall rules between aMuTorrent and aMule

### Docker: Can't reach aMule on host

- Add `extra_hosts` to your docker-compose.yml:
  ```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ```
- Use `host.docker.internal` as the aMule host

### Downloads Not Appearing

- Ensure aMule integration is enabled in Settings
- Check the aMuTorrent logs for connection errors
- Verify aMule has active downloads

### Wrong Password Error

- EC passwords are case-sensitive
- For amuled, ensure the password in `amule.conf` is the MD5 hash
- For aMule GUI, use the plain text password you set

### Connection Drops

- Check aMule's EC timeout settings
- Ensure aMule isn't being overloaded
- Check network stability between containers/hosts
