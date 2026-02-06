# Configuration Guide

This guide covers all configuration options for aMuTorrent.

## Table of Contents

- [Setup Wizard](#setup-wizard)
- [Settings Page](#settings-page)
- [Configuration Precedence](#configuration-precedence)
- [Environment Variables](#environment-variables)
- [Docker Network Configuration](#docker-network-configuration)

> **Download Clients:** See [aMule Integration](./AMULE.md) and [rTorrent Integration](./RTORRENT.md) for client-specific setup.
>
> **Integrations:** See [Prowlarr](./PROWLARR.md), [Notifications](./NOTIFICATIONS.md), and [Sonarr/Radarr](./INTEGRATIONS.md) guides.
>
> **GeoIP:** For displaying peer locations, see the [GeoIP Setup Guide](./GEOIP.md).

---

## Setup Wizard

When you first access the web interface (or if no configuration exists), an interactive setup wizard guides you through the initial configuration:

1. **Welcome** - Introduction to the setup process
2. **Security** - Configure web interface authentication (password protection)
3. **Download Clients** - Configure aMule and/or rTorrent connections (with testing)
4. **Directories** - Set data, logs, and GeoIP directories
5. **Integrations** - Optionally enable Prowlarr, Sonarr, and Radarr
6. **Review & Save** - Test all settings and save configuration

The wizard will:
- Auto-populate fields with environment variable values or sensible defaults
- Allow you to test each configuration section before proceeding
- Show Docker-specific warnings when running in a container
- Save configuration to `server/data/config.json` for persistence
- Enable authentication by default (recommended for security)

**Password Requirements:**
When authentication is enabled, the password must meet these requirements:
- At least 8 characters
- Contains at least one digit
- Contains at least one letter
- Contains at least one special character (`!@#$%^&*()_+-=[]{}|;:,.<>?`)

> **Note:** If you're running in Docker, the setup wizard will warn you that changing directory paths requires updating your `docker-compose.yml` volume mounts.

---

## Settings Page

After initial setup, access the Settings page anytime via the sidebar (desktop) or bottom navigation bar (mobile). The Settings page allows you to:

- View and edit all configuration options
- Test individual configuration sections (aMule, rTorrent, Directories, Prowlarr, Sonarr, Radarr)
- Test all configuration at once before saving
- Enable/disable integrations with toggle switches

**Environment Variable Indicators:**

- **Non-sensitive fields** (host, port, URLs): Show a "From Env" badge but remain editable. Your saved value will override the environment variable.
- **Sensitive fields** (passwords, API keys): When set via environment variable, the input field is hidden and replaced with a warning message. To change these values, update the environment variable and restart the server.

**Important:**
- Some changes (like PORT) may require a server restart to take effect
- Passwords are masked in the UI for security
- Changes take effect immediately after saving (except server port)

---

## Configuration Precedence

The application uses different precedence rules for sensitive and non-sensitive fields:

### Sensitive Fields (passwords, API keys)

**Precedence:** Environment Variables > Config File > Defaults

Sensitive fields include:
- `WEB_AUTH_PASSWORD` - Web UI authentication password
- `AMULE_PASSWORD` - aMule EC connection password
- `RTORRENT_PASSWORD` - rTorrent HTTP auth password
- `PROWLARR_API_KEY` - Prowlarr API key
- `SONARR_API_KEY` - Sonarr API key
- `RADARR_API_KEY` - Radarr API key

When these are set via environment variables:
- The environment variable **always takes precedence**
- The value is **never saved** to the config file
- The input field is **hidden** and replaced with a warning message
- Users cannot modify these values through the wizard or settings page

### Non-Sensitive Fields

**Precedence:** Config File > Environment Variables > Defaults

For all other fields:
- **User-saved configuration takes priority** - When you save settings via the UI, they override environment variables
- **Environment variables serve as initial defaults** - When you first run the wizard, it pre-populates fields with env var values
- **Easy configuration updates** - Change settings through the UI without touching environment variables

### Example Workflows

**Recommended: Use the Setup Wizard**
1. Start the container with minimal config (just PORT)
2. Access the web interface
3. Complete the interactive setup wizard
4. All settings saved to `config.json`

**Alternative: Pre-populate with Environment Variables**
1. Add environment variables to your `docker-compose.yml`
2. First run: Wizard auto-populates from these env vars
3. Review and save in the wizard
4. Later: Use Settings page to modify configuration

**Advanced: Skip Wizard Entirely**
1. Set all required environment variables
2. Set `SKIP_SETUP_WIZARD=true`
3. Application uses env vars directly (no wizard shown)

---

## Environment Variables

Environment variables are **completely optional**. The setup wizard is the recommended configuration method.

Add these to your `docker-compose.yml` if needed:

```yaml
services:
  amutorrent:
    environment:
      # Server Configuration
      - PORT=4000

      # Web UI Authentication (optional)
      - WEB_AUTH_ENABLED=true
      - WEB_AUTH_PASSWORD=your_secure_password  # Locks UI editing

      # aMule Connection (optional)
      - AMULE_ENABLED=true
      - AMULE_HOST=host.docker.internal
      - AMULE_PORT=4712
      - AMULE_PASSWORD=your_ec_password  # Locks UI editing

      # rTorrent Connection (optional)
      - RTORRENT_ENABLED=true
      - RTORRENT_HOST=rtorrent
      - RTORRENT_PORT=8000
      - RTORRENT_PATH=/RPC2
      - RTORRENT_USERNAME=user
      - RTORRENT_PASSWORD=pass  # Locks UI editing

      # Prowlarr Integration (optional - requires rTorrent)
      - PROWLARR_ENABLED=true
      - PROWLARR_URL=http://prowlarr:9696
      - PROWLARR_API_KEY=your_api_key  # Locks UI editing

      # Sonarr Integration (optional)
      - SONARR_URL=http://sonarr:8989
      - SONARR_API_KEY=your_api_key  # Locks UI editing
      - SONARR_SEARCH_INTERVAL_HOURS=6

      # Radarr Integration (optional)
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=your_api_key  # Locks UI editing
      - RADARR_SEARCH_INTERVAL_HOURS=6

      # Skip wizard (optional - only if all settings provided)
      - SKIP_SETUP_WIZARD=false
```

### Complete Reference

#### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Web server listening port |

#### Web UI Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_AUTH_ENABLED` | `false` | Enable password protection for the web UI |
| `WEB_AUTH_PASSWORD` | - | Password for web UI access (locks UI editing) |

#### aMule Connection

| Variable | Default | Description |
|----------|---------|-------------|
| `AMULE_ENABLED` | `true` | Enable aMule integration |
| `AMULE_HOST` | `127.0.0.1` | aMule daemon hostname or IP |
| `AMULE_PORT` | `4712` | aMule EC protocol port |
| `AMULE_PASSWORD` | - | aMule EC connection password (locks UI editing) |
| `AMULE_SHARED_FILES_RELOAD_INTERVAL_HOURS` | `3` | Interval to rescan shared folders |

#### rTorrent Connection

| Variable | Default | Description |
|----------|---------|-------------|
| `RTORRENT_ENABLED` | `false` | Enable rTorrent integration |
| `RTORRENT_HOST` | `localhost` | rTorrent XML-RPC hostname |
| `RTORRENT_PORT` | `8000` | rTorrent XML-RPC port |
| `RTORRENT_PATH` | `/RPC2` | XML-RPC endpoint path |
| `RTORRENT_USERNAME` | - | HTTP auth username (if required) |
| `RTORRENT_PASSWORD` | - | HTTP auth password (locks UI editing) |

#### Prowlarr Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `PROWLARR_ENABLED` | `false` | Enable Prowlarr integration |
| `PROWLARR_URL` | - | Prowlarr base URL |
| `PROWLARR_API_KEY` | - | Prowlarr API key (locks UI editing) |

#### Sonarr Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `SONARR_URL` | - | Sonarr base URL (auto-enables integration) |
| `SONARR_API_KEY` | - | Sonarr API key (locks UI editing) |
| `SONARR_SEARCH_INTERVAL_HOURS` | `6` | Hours between automatic searches |

#### Radarr Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `RADARR_URL` | - | Radarr base URL (auto-enables integration) |
| `RADARR_API_KEY` | - | Radarr API key (locks UI editing) |
| `RADARR_SEARCH_INTERVAL_HOURS` | `6` | Hours between automatic searches |

#### Download History

| Variable | Default | Description |
|----------|---------|-------------|
| `HISTORY_ENABLED` | `false` | Enable download history tracking |
| `HISTORY_USERNAME_HEADER` | - | HTTP header for username (e.g., `remote-user` for Authelia) |

#### Event Scripting

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRIPTING_ENABLED` | `false` | Enable custom event scripts |
| `SCRIPTING_SCRIPT_PATH` | `scripts/custom.sh` | Path to custom script |
| `SCRIPTING_TIMEOUT_MS` | `30000` | Script execution timeout |

#### ED2K Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `ED2K_SEARCH_DELAY_MS` | `5000` | Delay between searches (avoid flood protection) |
| `ED2K_CACHE_TTL_MS` | `600000` | Search result cache duration |

#### Advanced

| Variable | Default | Description |
|----------|---------|-------------|
| `SKIP_SETUP_WIZARD` | `false` | Skip the setup wizard entirely |

> **Note:** Fields marked with "locks UI editing" cannot be modified through the web interface when set via environment variables. This is a security feature to prevent accidental exposure of sensitive credentials.

---

## Docker Network Configuration

### Default Setup - Services on Host Machine

This is the most common scenario when aMule or rTorrent run on your host:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"  # Required!
```

- Use **`host.docker.internal`** as the hostname in settings
- The `extra_hosts` line creates a special hostname that points to your host machine
- Works on Docker Desktop (Mac/Windows) and Linux with recent Docker versions

### Services in Other Containers

If using the all-in-one setup or services are in separate containers:
- Use the **service name** as hostname (e.g., `amule`, `rtorrent`, `prowlarr`)
- Ensure all containers are on the same Docker network
- The `extra_hosts` line is not needed

### Remote Services

If services are running on different machines:
- Use the **IP address** or **hostname** of the remote machine
- Ensure required ports are accessible from your network
- The `extra_hosts` line is not needed
