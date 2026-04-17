# User Management

aMuTorrent supports multi-user authentication with fine-grained capabilities, trusted proxy SSO, and per-user API keys.

## Table of Contents

- [Overview](#overview)
- [Authentication Modes](#authentication-modes)
- [Enabling Authentication](#enabling-authentication)
- [User Management](#user-management)
- [Capabilities Reference](#capabilities-reference)
- [Trusted Proxy SSO](#trusted-proxy-sso)
- [Per-User API Keys](#per-user-api-keys)
- [Download Ownership](#download-ownership)
- [Environment Variables](#environment-variables)

---

## Overview

aMuTorrent provides flexible authentication options:

- **No authentication** — Open access (default)
- **Password protection** — Enable auth via the setup wizard or environment variables; an admin user account is created automatically
- **Multi-user** — Add more users with individual capabilities through the Settings page
- **Trusted proxy SSO** — Automatic login via reverse proxy headers (e.g., Authelia, Authentik)

All modes are configured through the setup wizard or Settings page.

---

## Authentication Modes

### No Authentication

The default mode. Anyone who can reach the web UI has full access. Suitable for trusted networks or when aMuTorrent is behind an external authentication layer.

### Password Protection (User System)

When authentication is enabled, aMuTorrent always uses its built-in user system. Setting a password in the setup wizard (or via `WEB_AUTH_PASSWORD`) creates an **admin user** account automatically. This admin account has full access and a personal API key for external integrations.

You can then add more users through **Settings** → **User Management**, each with their own password and capabilities.

When authentication is active:
- The login page shows username and password fields
- Each user sees only the features their capabilities allow
- Download ownership is tracked per user
- Navigation and actions are filtered based on capabilities
- Each admin user gets a personal API key for Sonarr/Radarr integration

### Trusted Proxy SSO

Users are authenticated by a reverse proxy (e.g., Authelia, Authentik) that sets a username header. aMuTorrent trusts this header from allowed IP ranges and automatically creates or logs in the corresponding user.

---

## Enabling Authentication

### Via Setup Wizard

1. On the **Security** step, enable authentication
2. Set a password (this creates the admin account)
3. After setup, go to **Settings** → **User Management** to add more users

### Via Environment Variables

```bash
WEB_AUTH_ENABLED=true
WEB_AUTH_PASSWORD=your_secure_password
```

**Password Requirements:**
- At least 8 characters
- At least one digit
- At least one letter
- At least one special character (any non-alphanumeric character)

---

## User Management

Access user management through **Settings** → **User Management** (admin only).

### Creating Users

1. Click **Add User**
2. Enter username and password
3. Select a capability preset or customize individual capabilities
4. Click **Save**

### Capability Presets

When creating or editing a user, quick presets help configure capabilities:

- **Full Access** — All capabilities enabled
- **Read Only** — View-only access (search, history, shared files, uploads, statistics, logs, view all downloads)
- **Custom** — Automatically detected when individual checkboxes are toggled manually

The admin flag is a separate toggle — admin users bypass all capability checks regardless of which capabilities are selected.

### Editing Users

- Change username, password, admin flag, and capabilities
- Enable or disable a user account (preserves data but prevents login)
- When capabilities change, active sessions are invalidated and WebSocket connections are closed

### Profile

Users can change their own password via the profile menu (click username in the header).

---

## Capabilities Reference

| Capability | Description |
|------------|-------------|
| `search` | Search ED2K network and Prowlarr indexers |
| `add_downloads` | Add new downloads (ED2K links, magnets, torrents) |
| `remove_downloads` | Remove/delete downloads |
| `pause_resume` | Pause, resume, and stop downloads |
| `assign_categories` | Change the category of a download |
| `move_files` | Move download files to category paths |
| `rename_files` | Rename download and shared files |
| `set_comment` | Set rating and comment on shared files (aMule) |
| `manage_categories` | Create, edit, and delete categories |
| `view_history` | View download history |
| `clear_history` | Delete history entries |
| `view_shared` | View shared files (aMule) |
| `view_uploads` | View active uploads |
| `view_statistics` | View statistics and charts |
| `view_logs` | View application logs |
| `view_servers` | View ED2K server list |
| `view_all_downloads` | See downloads added by other users |
| `edit_all_downloads` | Modify/delete downloads owned by other users |

> **Note:** Admin users bypass all capability checks — they always have full access regardless of assigned capabilities.

---

## Trusted Proxy SSO

Trusted proxy SSO allows a reverse proxy to handle authentication and pass the authenticated username to aMuTorrent via an HTTP header.

### How It Works

1. User authenticates with the reverse proxy (e.g., Authelia)
2. Proxy forwards the request with a username header (e.g., `X-Remote-User`)
3. aMuTorrent reads the header and creates a session for that user
4. If auto-provisioning is enabled, new users are created automatically

### Configuration

#### Via Settings UI

1. Go to **Settings** → **Trusted Proxy** section
2. Enable **Trusted Proxy SSO**
3. Set the **Username Header** (e.g., `X-Remote-User`)
4. Optionally enable **Auto-Provision** to create users automatically

#### Via Environment Variables

```bash
TRUSTED_PROXY_ENABLED=true
TRUSTED_PROXY_USERNAME_HEADER=X-Remote-User
TRUSTED_PROXY_AUTO_PROVISION=true
```

### Security

aMuTorrent validates that requests come from trusted IP ranges before accepting the username header. Only the actual TCP peer address (`req.socket.remoteAddress`) is checked — forwarded headers like `X-Forwarded-For` are never trusted.

**Default trusted IP ranges** (when no custom ranges are configured):

| Range | Description |
|-------|-------------|
| `127.0.0.0/8` | IPv4 loopback |
| `10.0.0.0/8` | RFC 1918 private |
| `172.16.0.0/12` | RFC 1918 private (includes Docker networks) |
| `192.168.0.0/16` | RFC 1918 private |
| `::1/128` | IPv6 loopback |
| `fc00::/7` | IPv6 unique local |
| `fe80::/10` | IPv6 link-local |

To restrict further, set custom CIDR ranges via `TRUSTED_PROXY_IPS` or the Settings UI.

### Auto-Provisioned User Capabilities

Auto-provisioned SSO users receive a restricted set of capabilities by default (all capabilities except `edit_all_downloads`, `manage_categories`, `view_servers`, and `view_logs`). An admin can adjust capabilities for any user after provisioning.

### Example: Authelia

```yaml
# authelia configuration.yml (excerpt)
access_control:
  default_policy: deny
  rules:
    - domain: amutorrent.example.com
      policy: one_factor

# nginx reverse proxy
location / {
    proxy_pass http://amutorrent:4000;
    proxy_set_header X-Remote-User $upstream_http_remote_user;

    # Authelia auth_request
    auth_request /authelia;
    auth_request_set $upstream_http_remote_user $upstream_http_remote_user;
}
```

### Example: Authentik

1. In Authentik, create a **Proxy Provider** for aMuTorrent
2. Under the provider settings, add a custom header mapping that sends the authenticated username as `X-Remote-User`
3. Configure your reverse proxy to forward the header:

```nginx
# nginx reverse proxy for Authentik
location / {
    proxy_pass http://amutorrent:4000;

    # Authentik forward auth
    auth_request /outpost.goauthentik.io/auth/nginx;
    auth_request_set $authentik_username $upstream_http_x_authentik_username;
    proxy_set_header X-Remote-User $authentik_username;
}

location /outpost.goauthentik.io {
    proxy_pass http://authentik-outpost:9000/outpost.goauthentik.io;
}
```

---

## Per-User API Keys

When authentication is enabled, each admin user gets a unique API key for external API access (Torznab indexer and qBittorrent-compatible API).

### Viewing Your API Key

1. Go to **Settings** → any integration section that shows API configuration (e.g., Sonarr/Radarr)
2. Your personal API key is displayed with a copy button

### Using API Keys

- **Torznab indexer** — Use the API key in the "API Key" field in Sonarr/Radarr
- **qBittorrent-compatible API** — Use your username and password, or use the API key as the password

> **Note:** Only admin users have API keys and can access the external APIs. See [*arr Integration](./INTEGRATIONS.md) for full setup instructions.

---

## Download Ownership

When authentication is active, aMuTorrent tracks which user added each download.

### How It Works

- When a user adds a download through the web UI, their user ID is recorded
- Downloads added via the qBittorrent-compatible API (e.g., Sonarr/Radarr) are attributed to the authenticated API user

### Visibility

- `view_all_downloads` controls whether a user sees all downloads or only their own
- `edit_all_downloads` controls whether a user can modify/delete all downloads or only their own

### Notifications & Scripts

When authentication is active, [notifications](./NOTIFICATIONS.md) and [custom event scripts](../scripts/README.md) include ownership information:

- **Owner** — the username who owns the download (from the ownership table)
- **Triggered by** — the username who initiated the action (empty for system-detected events like download completion or file move)

For example, if an admin deletes another user's file, the notification shows "👤 john (by admin)".

Custom scripts receive these as `EVENT_OWNER` and `EVENT_TRIGGERED_BY` environment variables, and as `owner`/`triggeredBy` fields in the JSON payload.

### Broadcast Filtering

WebSocket real-time updates respect ownership — users only receive updates for downloads they're allowed to see.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_AUTH_ENABLED` | `false` | Enable authentication |
| `WEB_AUTH_PASSWORD` | - | Admin password (locks UI editing) |
| `TRUSTED_PROXY_ENABLED` | `false` | Enable trusted proxy SSO |
| `TRUSTED_PROXY_USERNAME_HEADER` | - | HTTP header containing the username (e.g., `X-Remote-User`) |
| `TRUSTED_PROXY_AUTO_PROVISION` | `false` | Automatically create users from proxy header |
| `TRUSTED_PROXY_IPS` | - | Comma-separated CIDR ranges (empty = default private ranges) |
