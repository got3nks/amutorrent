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
    ports:
      - "4662:4662"
      - "4665:4665/udp"
      - "4672:4672/udp"
    environment:
      - PUID=1000
      - PGID=1000
      - GUI_PWD=your_password
      - WEBUI_PWD=your_password
      - INCOMING_DIR=/downloads
      - TEMP_DIR=/downloads/temp
    volumes:
      - ./data/aMule/config:/home/amule/.aMule
      - ./data/aMule/incoming:/downloads
      - ./data/aMule/temp:/downloads/temp
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
      - ./data/aMule/incoming:/downloads
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

---

## Shared Folder Management

aMuTorrent can manage the folders aMule shares on the ed2k/Kademlia network,
from the **Shared Files** view via the "Manage Shared Dirs" button, or per
instance from Settings.

The folder list is read from and written to aMule over the EC protocol, so
aMuTorrent needs no access to aMule's files and no shared volume. Paths are
resolved by aMule, on the machine aMule runs on.

### How It Works

- Add a folder by path, or browse for one
- Tick **Subfolders** to share everything beneath it - aMule expands the
  subtree itself, so there is no need to list child directories
- Saving replaces the whole list; aMule validates each path and reports any it
  refuses, applying the rest
- aMule rescans shortly after saving. "Rescan now" triggers one immediately

### Requirements

This needs an aMule core that supports configuring shared folders over EC
(amule-org/amule#530). Cores without it report so in the modal, and the folder
list can only be edited in aMule itself.

Note that #530 is not in a released aMule version yet, so a current release
(3.0.1 and earlier) will not have it - updating to the latest release is not
enough on its own.
