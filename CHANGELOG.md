# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.5.1] - IPv6 Fallback & Setup Wizard Auth Fix

### 🐛 Fixed

- **IPv6 fallback for server listen** — server now tries `::` (dual-stack) first and automatically falls back to `0.0.0.0` if IPv6 is not available (`EAFNOSUPPORT` / `EADDRNOTAVAIL`), fixing startup failures on IPv4-only hosts (#38)
- **Setup wizard blocked by auth on first run** — when `WEB_AUTH_ENABLED=true` was set without a `WEB_AUTH_PASSWORD` (the default in the Unraid template), the login page blocked access to the setup wizard. Auth is now automatically disabled for the setup wizard when no password is configured, and re-enabled once the user sets one during setup (#39)
- **Config status endpoint auth** — `/api/config/status` (returns only `firstRun` and `isDocker`) no longer requires admin authentication, allowing the frontend to detect first-run state before login

---

## [3.5.0] - REST API v1, Reverse Proxy Support & Connection Improvements

### ✨ Added

- **REST API v1** — full HTTP REST API at `/api/v1/` exposing all download management features: add/pause/resume/stop/delete downloads, categories CRUD, ED2K search (blocking and non-blocking), move files, permission checks, logs, and data snapshots. Zero code duplication — bridges directly to existing WebSocket handlers
- **API key authentication for REST API** — `X-API-Key` header support in the auth middleware, allowing stateless REST API access without session cookies. Populates session from the user's API key for seamless capability/ownership checks
- **API keys for all users** — API keys are now generated for all users (not just admins), enabling scoped REST API access with limited capabilities (e.g., a user with only `add_downloads` permission). Torznab and qBittorrent-compatible APIs remain admin-only
- **Reverse proxy URL path for qBittorrent and Deluge** — optional URL path field (e.g., `/qbittorrent`) for clients behind a reverse proxy. Available in Settings UI, Setup Wizard, and via `QBITTORRENT_PATH` / `DELUGE_PATH` environment variables

### ♻️ Improved

- **getStats disconnect detection** — all client managers (rTorrent, qBittorrent, Deluge, Transmission) now trigger reconnect on stats fetch failure, not just data fetch failure. Fixes cases where client goes offline but health events don't fire
- **API documentation** — comprehensive docs for all REST API v1 endpoints with request/response examples, capability requirements, and authentication methods

### 🐛 Fixed

- **aMule category creation** — aMule EC protocol returns no category ID on creation (`EC_OP_NOOP`); now re-fetches category list after successful creation to discover the new ID by name
- **Batch delete event clientType resolution** — delete event emission now uses the manager's `clientType` (always reliable) instead of relying on request body or cache lookup, fixing "Unknown client type: undefined" errors
- **aMule segment bar corruption** — direct EC calls from qBittorrent-compatible API were interfering with aMule's server-side incremental diff state for `getUpdate()`, causing XOR buffer corruption in segment visualization data. `getTorrentsInfo` now reads from cached DataFetchService data instead of calling `getDownloadQueue()`/`getSharedFiles()` directly on the EC connection, preventing aMule incremental diff state corruption
- **Metrics recording** — skips recording when `getStats()` returns empty data (client unresponsive), preventing zero-value rows that drag down chart averages
- **SCGI socket config validation** — config validation correctly requires `socketPath` instead of `host`/`port` for SCGI socket mode. Fixes "host is required" error blocking config saves and version-seen tracking
- **Deluge and Transmission in wizard review step** — setup wizard now shows all 5 client configurations in the final review step

---

## [3.4.4] - Move to..., Search Re-download, Segments Fix & rTorrent Improvements

### ✨ Added

- **"Move to..." feature** — standalone file move action in context menus (Downloads & Shared views) with category quick links, manual path input, permission pre-check, and batch support. Works with all clients via `MoveOperationManager`
- **Per-instance download tracking** — search results track which client instances have each download, allowing re-download to different clients.
- **Magnet name resolution** — rTorrent magnet downloads show the real name from history DB instead of `HASH.meta`, with `(resolving)` indicator that clears automatically when metadata resolves
- **SCGI connection info** — Settings client cards show `SCGI TCP: host:port` or `SCGI Socket: /path` instead of "Not configured"

### ♻️ Improved

- **rTorrent post-load property setting** — label, directory, and priority are now set via separate `system.multicall` after `load.raw_start` instead of inline arguments, avoiding rTorrent's 4KB execute arg buffer overflow (`exec_file.cc buffer_size = 4096`)
- **Tooltip component** — Improved dark mode contrast with lighter background and border
- **aMule EC timeout** — increased from 30s to 60s for large shared file lists
- **Reconnection resilience** — requests are skipped during EC reconnection to prevent "Invalid request" spam on the aMule side

### 🐛 Fixed

- **aMule segment bar corruption** — qBittorrent compatibility API was calling `getDownloadQueue()` / `getSharedFiles()` directly on the EC connection, interfering with aMule's server-side incremental diff state for `getUpdate()`. Now reads from cached data instead
- **aMule EC XOR reconstruction** — fixed buffer resize logic to match aMule's `Realloc` + XOR algorithm. Clears client-side XOR state on reconnection to prevent stale diff corruption
- **rTorrent completed status** — stopped torrents at 100% now correctly show "Stopped" instead of "Seeding" in Shared Files view (`completed` status no longer mapped to `seeding`)
- **Client disconnect detection** — all client managers now trigger reconnect on any fetch error, not just specific error codes (fixes SCGI socket `ENOENT` not being detected)
- **Search result delete tracking** — deletion from one client only removes that instance from the per-instance download map, preserving other instances' status. Alias lookup handles Prowlarr GUID → real hash mapping

---

## [3.4.3] - Client Health Events, Notifications & Flood Prevention

### ✨ Added

- **Client health events** — new `clientUnavailable` and `clientAvailable` events fire on connection state transitions, with debouncing (3 consecutive failures before declaring offline, immediate recovery on first success)
- **Health notifications** — push notifications via Apprise when a client goes offline or comes back online, with configurable event toggles in the Notifications settings
- **Notification flood prevention** — per-client per-event-type rate limiter: after 3 notifications of the same type within 10 minutes, further notifications are suppressed for 1 hour. The last notification before suppression includes a warning. Online and offline notifications are tracked independently
- **Health event scripting** — new `EVENT_STATUS`, `EVENT_PREVIOUS_STATUS`, `EVENT_ERROR`, `EVENT_DOWNTIME_DURATION` environment variables for custom event scripts. Scripts receive all health events without flood suppression

### ♻️ Improved

- **aMule EC connection recovery** — consecutive request timeouts now trigger automatic socket destruction and reconnection, fixing stale connections that would hang indefinitely

### 🐛 Fixed

- **aMule null stats crash** — fixed `Cannot read properties of null (reading 'EC_TAG_STATS_UL_SPEED')` error during EC reconnection when `getStats()` returned null from the request queue

---

## [3.4.2] - Direct SCGI Connection for rTorrent & Diagnostic Logging

### ✨ Added

- **rTorrent SCGI connection modes** — connect directly to rTorrent via SCGI TCP or Unix socket, bypassing the need for an HTTP proxy (nginx/ruTorrent). Three modes available: HTTP (default, existing behavior), SCGI (direct TCP), and SCGI Socket (Unix domain socket)
- **Connection mode selector** — new dropdown in both Settings and Setup Wizard for rTorrent instances, with conditional field visibility based on the selected mode (host/port for TCP modes, socket path for Unix socket, XML-RPC path/auth/SSL for HTTP only)
- **SCGI environment variables** — `RTORRENT_MODE` and `RTORRENT_SOCKET_PATH` for Docker/env-based configuration
- **Data fetch diagnostics** — warnings logged when a connected client suddenly returns empty data, when an individual client fetch takes >10s, or when the full batch cycle exceeds 15s
- **aMule fetch diagnostics** — warning logged when `getUpdate()` returns no data, indicating potential connection issues
- **Config test error logging** — failed connection tests now log the error message (previously only showed pass/fail emoji)

---

## [3.4.1] - Global Drag-and-Drop, Loading States & Bug Fixes

### ✨ Added

- **Global .torrent drag-and-drop** — drop `.torrent` files anywhere in the app to open the Add Download modal with files pre-loaded, not just from the Downloads view. Visual overlay guides the drop
- **FileInfoModal loading spinner** — shows a spinner while fetching item detail data (raw fields, trackers) instead of blank sections
- **EmptyState loading spinner** — all table views (Downloads, Uploads, History, Shared) now show a spinner alongside loading messages instead of plain text

### 🐛 Fixed

- **Setup wizard auth blocking** — fixed a bug where enabling authentication during first-run setup would fail with "Cannot enable authentication without an admin account", because the admin-account guard ran before the admin user was created by the migration step

### ♻️ Improved

- **Move operation timeouts** — timeout now scales with file size (assumes ~25 MB/s for 5200 RPM HDD under concurrent I/O, with 50% margin + 30s overhead, rounded to 30s intervals) instead of a fixed 2-minute limit
- **Move operation logging** — deduplicated failure logs from 3 redundant messages down to 1 with full context (file name, error cause, timeout duration)
- **Unified native move naming** — renamed `executeQBittorrentNativeMove` to `executeNativeMove` and made all log messages use the actual client type (qBittorrent, Deluge, or Transmission) dynamically
- **Unified LoadingSpinner** — replaced all 17 instances of the CSS `.loader` class with the `LoadingSpinner` React component and removed the custom CSS rule/keyframes

---

## [3.4.0] - WebSocket Optimization, Username in Events & Notifications

### ✨ Added

- **WebSocket delta updates** — new DeltaEngine sends only changed fields per item instead of full snapshots, with seq-based synchronization and automatic snapshot recovery on gaps. Includes peer-level diffing (by peer ID, only changed fields transmitted — ~26KB → ~2KB per cycle) and flat array format for segment data (~56% smaller)
- **Subscription-based segment data** — `gapStatus`/`reqStatus` only sent to clients subscribed to the `segmentData` channel (DownloadsView, FileInfoModal), with reference-counted subscribe/unsubscribe and automatic re-subscribe on reconnect. Saves ~27KB per update for all other views
- **Username in notifications** — Apprise notifications now show the file owner and, when different, who triggered the action (e.g. `👤 john (by admin) · 🏷️ Linux`)
- **Username in event scripts** — new `EVENT_OWNER` and `EVENT_TRIGGERED_BY` environment variables and JSON fields for custom event scripts
- **EC_TAG_PARTFILE_SHARED support** — aMule downloads that are also being shared now appear in SharedView, matching BitTorrent behavior where all items have `shared = true`
- **FileInfoModal auto-refresh** — detail API call refreshes every 5 seconds while the modal is open

### 🐛 Fixed

- **SegmentsBar colors** — fixed gap/requested segment colors in the progress bar visualization
- **FileInfoModal tree auto-expand** — file tree nodes now auto-expand correctly on open
- **Category path mapping not shown in edit modal** — when only one instance of a client type is connected, stored instanceId-based path mappings were not loaded into the edit form (showed placeholder instead of actual path)

---

## [3.3.0] - Unified Peers, Incremental Updates, File Rename

### ✨ Added

- **aMule incremental updates** — new `getUpdate()` method in amule-ec-node uses `EC_OP_GET_UPDATE` with `EC_DETAIL_INC_UPDATE` for stateful incremental polling. Only changed fields are transferred after the initial full response, significantly reducing bandwidth and CPU usage for aMule connections. Replaces the previous full-queue polling approach (`getDownloadQueue` + `getSharedFiles` + `getClients`)
- **Download Sources table in FileInfoModal** — aMule download sources (peers we download from) now have a dedicated table section with columns for User, State, Source origin, Queue rank, Downloaded, and DL speed. Previously only upload peers were shown
- **aMule peer state labels** — download states (Downloading, On Queue, Connecting, etc.), upload states, and source origin labels (Server, Kad, Exchange, etc.) are displayed in human-readable form in the peers tables
- **File rename** — rename downloads and shared files from the context menu (aMule only). Gated by `renameFile` client capability and `rename_files` user permission. New `FileRenameModal` with smart filename selection (selects name without extension)
- **Rename files user capability** — new `rename_files` capability in the Downloads group, configurable per-user in the User Management UI. Included by default in Full preset and SSO auto-provisioned users

### ♻️ Refactored

- **Unified peers model** — replaced three separate peer arrays (`peersDetailed`, `activeUploads`, `downloadSources`) with a single `item.peers` array across all 5 client types. Each peer carries a `role` field: `'peer'` (BitTorrent), `'upload'` (aMule upload), `'download'` (aMule source). Eliminates ~200 lines of duplicated peer extraction/normalization code
- **Peers embedded in source objects** — managers now embed peers directly into download/shared file objects instead of returning separate arrays. Simplifies the data pipeline from 5 parameters to 3 in `assembleUnifiedItems()`
- **Removed source names caching from QueuedAmuleClient** — the `getDownloadQueueWithCache` wrapper and `mergeSourceNames` logic are replaced by amule-ec-node's native incremental update with deep merge, which handles the aMule EC protocol's ID-based source name diffing correctly
- **Removed dead `ipToString`** — IP decoding now lives solely in amule-ec-node (EC protocol-specific little-endian uint32 conversion). Removed unused function and imports from `networkUtils.js`, `downloadNormalizer.js`, `geoIPManager.js`, `hostnameResolver.js`

### 🐛 Fixed

- **Stale item removal** — aMule `getUpdate()` uses set-based reconciliation to remove disconnected peers, completed downloads, and unshared files from the incremental cache
- **Deep merge for incremental EC updates** — raw tag tree merging uses deep merge with ID-based array reconciliation, matching aMule GUI's `CPartFile_Encoder` behaviour. Fixes Source Reported Filenames disappearing after incremental updates replaced nested objects with partial data
- **Empty download source rows** — peers in "Connecting" state with no IP are now filtered out in `amuleManager.fetchData()`
- **UploadsView duplicate rows** — peer IDs generated from `address:port` and row keys include `parentHash` to prevent duplicates when the same peer appears across multiple torrents

---

## [3.2.3] - Unraid Template & Empty Env Var Fix

### ✨ Added

- **Unraid Community Applications template** — Docker template XML (`unraid/amutorrent.xml`) for one-click install from the Unraid CA store. Includes all client configurations, SSL toggles, screenshots, and Prowlarr integration

### 🐛 Fixed

- **Empty env vars treated as unset** — environment variables set to empty strings (e.g. `PASSWORD=''` from Unraid/Portainer templates) are now correctly ignored, allowing the setup wizard to collect values interactively instead of treating them as blank overrides

---

## [3.2.2] - Performance, Memory & Idle Optimization

### ⚡ Performance

- **Remove unused Deluge file tree fetch** — the bulk torrent refresh was requesting the full file list for every torrent every ~3 seconds, parsing tens of MB per cycle that was never used. This drastically reduces memory and CPU usage for large Deluge libraries (#29)
- **Cap tracker/peer refresh concurrency** — per-torrent tracker and peer requests are now batched (10 concurrent) instead of firing all at once. Applied to Deluge, qBittorrent, and Transmission to prevent request storms with large torrent counts (#29)
- **Skip data fetching when idle** — when no browser tabs are connected and download history updates aren't due, the app skips the expensive data fetch cycle entirely, reducing CPU and network usage to near zero in the background
- **Auto-disconnect WebSocket on hidden tabs** — when the browser tab is hidden (sleep, tab switch, minimize), the WebSocket disconnects cleanly and reconnects when the tab becomes visible again. Prevents stale connection buildup and Chrome renderer hangs after sleep/wake

### ✨ Added

- **Debug API for memory diagnostics** — opt-in endpoints (`/api/debug/memory` and `/api/debug/heapsnapshot`) for analyzing memory usage. Enable with `NODE_INSPECT=true` environment variable. Admin-only access
- **Node.js inspector support** — setting `NODE_INSPECT=true` also enables the V8 inspector on port 9229 for remote profiling via Chrome DevTools

### 🐛 Fixed

- **History view tracker label** — tracker labels were not showing in the desktop table view due to a column key mismatch. Now displays correctly in both desktop and mobile views

---

## [3.2.1] - rTorrent HTTPS, Self-Hosted Flags & Script Debugging

### ✨ Added

- **rTorrent HTTPS Support** - Connect to rTorrent XML-RPC endpoints over HTTPS/SSL, matching qBittorrent, Deluge, and Transmission. Configurable via Settings UI, `RTORRENT_USE_SSL` env var, or config.json
- **Self-Hosted Country Flags** - Country flag SVGs are now bundled locally instead of loading from an external CDN, eliminating Content Security Policy issues and external dependencies
- **Self-Hosted Chart.js** - Chart.js is now bundled locally instead of loading from jsdelivr CDN, removing the last external script dependency
- **Event Script CRLF Detection** - Scripts with Windows line endings (CRLF) are detected before execution with a clear warning and fix command in logs

### 🐛 Fixed

- **Event Script Error Logging** - stderr output is now always logged regardless of exit code, and stdout is included on failures for easier debugging
- **Settings Auto-Scroll on Mobile** - Fixed section auto-scroll not working on mobile when expanding sections that stretch the page content

### 🔒 Security

- **Tighter CSP** - Removed `cdn.jsdelivr.net` from `script-src` Content Security Policy directive — all assets are now self-hosted

---

## [3.2.0] - Five-Client Support, Multi-Instance & User Management

### 🎉 Major Release - Five Download Clients & Multi-User

This release adds **Deluge** and **Transmission** as fully supported clients, introduces **multi-instance support** allowing multiple instances of the same client type, and a complete **user management system** with capability-based authorization. The entire client architecture has been rebuilt around an abstract, capability-driven model.

### ✨ Added

#### **Deluge Integration**
- **Full Deluge Support** - Connect to Deluge via its WebUI JSON-RPC API
- **Category Sync** - Bidirectional label synchronization between aMuTorrent and Deluge
- **Torrent Management** - Add magnets and torrent files, pause/resume/delete
- **Transfer Statistics** - Upload/download speeds and totals tracked in metrics
- **File Browser** - View torrent file trees via `GET /api/deluge/files/:hash`
- **Configuration** - Setup via Settings page or environment variables (`DELUGE_ENABLED`, `DELUGE_HOST`, `DELUGE_PORT`, `DELUGE_PASSWORD`)

#### **Transmission Integration**
- **Full Transmission Support** - Connect to Transmission via its RPC API
- **Category Sync** - Bidirectional category synchronization between aMuTorrent and Transmission
- **Torrent Management** - Add magnets and torrent files, pause/resume/stop/delete
- **Transfer Statistics** - Upload/download speeds and totals tracked in metrics
- **File Browser** - View torrent file trees via `GET /api/transmission/files/:hash`
- **Configuration** - Setup via Settings page or environment variables (`TRANSMISSION_ENABLED`, `TRANSMISSION_HOST`, `TRANSMISSION_PORT`, `TRANSMISSION_USERNAME`, `TRANSMISSION_PASSWORD`)

#### **Multi-Instance Support**
- **Multiple Instances Per Client Type** - Run multiple aMule, rTorrent, qBittorrent, Deluge, or Transmission instances simultaneously
- **Dynamic Instance Management** - Add, configure, and remove client instances from Settings without restart
- **Deterministic Instance IDs** - Stable `{type}-{host}-{port}` identifiers for each instance
- **Compound Item Keys** - Downloads identified by `instanceId:hash` for cross-instance uniqueness
- **Per-Instance Category Sync** - Each instance syncs categories independently on connect
- **Environment Variable Configuration** - First instance of each client type configurable via env vars; additional instances managed through Settings UI

#### **User Management**
- **Multi-User Authentication** - Create and manage multiple user accounts with username/password login
- **Trusted Proxy SSO** - Single sign-on via trusted proxy headers (e.g., Authelia, Authentik) with auto-provisioning of SSO users
- **Capability-Based Authorization** - Fine-grained permissions: `add_downloads`, `edit_downloads`, `edit_all_downloads`, `delete_downloads`, `clear_history`, `manage_categories`
- **Admin Users** - Full system access with user management abilities
- **Download Ownership** - Downloads are owned by the user who added them; mutation restricted to owner (or users with `edit_all_downloads`)
- **Per-User WebSocket Filtering** - Each user only sees downloads they own (admins see all)
- **Per-User API Keys** - External API integrations (Torznab, qBittorrent compat) use individual API keys instead of shared password
- **User Management UI** - Admin panel to create, edit, disable, and delete users with capability presets
- **Profile Management** - Self-service password change
- **Session Invalidation** - Disabling a user or changing capabilities force-disconnects their active sessions and WebSocket connections

#### **Client Abstraction Layer**
- **BaseClientManager** - Shared base class for all client managers with common category/download CRUD interface
- **ClientRegistry** - Runtime client dispatch by instance ID, replacing hardcoded client-type lookups
- **clientMeta.js** - Static capability registry (`categories`, `nativeMove`, `sharedFiles`, `stopReplacesPause`, `logs`, `trackers`, `search`, etc.)
- **Capability-Driven Logic** - Frontend and backend use capabilities instead of `clientType === 'x'` checks
- **Field Registry** - Modular field definitions replacing monolithic field formatters

### 🐛 Fixed

- **IPv6 Peer Address Parsing** - Fixed parsing of IPv6 addresses in qBittorrent peer data
- **Healthcheck Dual-Stack Binding** - Healthcheck no longer fails when server binds to `::` (IPv6 dual-stack)
- **Table Column Alignment** - Fixed column alignment and width consistency across views
- **Mobile Download Speed** - Error state items now show download speed in mobile card view
- **Login Delay Timer** - Countdown timer correctly shown on page load after refresh

### 🔧 Changed

#### **Docker**
- **Node 22** - Upgraded Docker base image from Node 18 to Node 22
- **Improved Layer Caching** - npm install runs before source copy for faster rebuilds
- **Simplified docker-compose** - Uses `env_file` directive pointing to `.env` instead of inline commented environment variables
- **Removed qBittorrent Volume** - No download directory mount needed (uses native API for moves/deletes)

#### **Architecture**
- **CategoryManager Refactored** - Per-instance category sync, propagation to other clients on connect, `importCategory()`/`linkAmuleId()`/`getCategoriesSnapshot()` primitives
- **Per-Instance aMule IDs** - Category-to-aMule-ID mapping is now per-instance instead of global
- **Download Normalizer** - Extended with Deluge and Transmission normalizers
- **Unified Item Builder** - `isTorrentClient()` helper, torrent utilities extracted to `torrentUtils.js`
- **WebSocket Handlers** - Capability-gated actions, per-item ownership checks, filtered broadcasts

#### **Frontend**
- **Client Instance Management** - Add/edit/remove client instances from Settings UI
- **Capability-Gated Navigation** - Nav items, action buttons, and views filtered by user capabilities
- **Header User Dropdown** - Profile and logout accessible from header
- **aMule Instance Selector** - Dropdown to select target aMule instance for ED2K downloads
- **New Client Logos** - Dedicated SVG icons for Deluge and Transmission

### 📦 Dependencies

#### Added
- `helmet` - HTTP security headers
- `ipaddr.js` - IP address parsing and validation
- `express-rate-limit` - Request rate limiting

#### Updated
- `xmlbuilder2` 3.x → 4.x

#### Removed
- `js-yaml` - No longer needed

### 📝 Documentation

- **Deluge Integration Guide** - New `docs/DELUGE.md` covering setup, Docker, and label sync
- **Transmission Integration Guide** - New `docs/TRANSMISSION.md` covering setup, Docker, and group mapping
- **User Management Guide** - New `docs/USERS.md` covering multi-user setup, capabilities, SSO, and API keys
- **Updated Configuration Docs** - Multi-instance env vars, new client configs, user management settings
- **Updated Client Docs** - aMule, rTorrent, qBittorrent docs refreshed for multi-instance

---

## [3.1.3] - Configurable Bind Address & Security Hardening

### ✨ Added

- **Configurable Bind Address** - New `BIND_ADDRESS` env var and `server.host` config field to control which network interface the server listens on (default: `0.0.0.0`). Select dropdown in Settings and Setup Wizard shows detected interfaces. Restart warning shown when changed.
- **Network Interfaces API** - New `GET /api/config/interfaces` endpoint returns available IPv4 network interfaces for bind address selection
- **Global Rate Limit** - Second layer of brute force protection: 50 failed login attempts across all IPs within 15 minutes triggers lockout, defending against IPv6 rotation attacks
- **Login Delay Countdown** - Live countdown timer on login button during server-side delay; countdown also shown in error message when rate-limited (429)
- **Exponential Login Delay** - Replace fixed delay tiers with exponential formula (`count * 1.5^(count-1) * 500ms`) starting from first failed attempt
- **curl in Docker Image** - Added `curl` to the Docker image for custom scripting use

### 🐛 Fixed

- **Login Delay Rounding** - Round login delay to whole seconds for clean UI countdown alignment
- **Error Logging** - Improved error logging with cause detail for all download clients
- **Website Carousel** - Fixed slide counts after screenshot cleanup

### 🔧 Changed

- **Password Validator** - Broadened special character validation to accept any non-alphanumeric character
- **Request Validation** - Removed `validateRequest` middleware, inlined validation into `authAPI` and `metricsAPI`

---

## [3.1.2] - UI Polish & Fixes

### ✨ Added

- **Notification Emojis & Redesign** - Apprise notifications now use emoji titles (⬇️ ✅ 🏷️ 📦 🗑️), show client type in title with dot separator, and category with 🏷️ tag
- **MobileStatusTabs Icons** - Status filter pills now show icons from STATUS_DISPLAY_MAP
- **CategoryModal qBittorrent Info** - Path mapping section shows message that qBittorrent doesn't need mapping (uses native API)

### 🐛 Fixed

- **Demo Mode Environment Variable** - `DEMO_MODE=true` env var was overridden by config.json; now reads directly from `process.env`
- **Website Stale Screenshots** - Removed 12 stale screenshots, updated carousels from 12→6 desktop slides and 4→2 mobile slide groups
- **Docs Sync Script** - Screenshot sync now cleans destination before copying to prevent stale files

---

## [3.1.1] - Bug Fixes & Improvements

### ✨ Added

- **File Browser for Script Path** - Settings page script path field now has a browse button that opens a file picker modal
- **Category in Download Events** - `downloadAdded`, `downloadFinished`, `fileDeleted`, and `fileMoved` events now include the `category` field
- **Delete Event** - Now includes `category` field in the event payload

### 🐛 Fixed

- **fileMoved Event Category** - Category was always `null` in fileMoved events due to missing field in DB row mapping and missing parameter in move queue calls
- **fileMoved Notification Destination** - Apprise notification showed "To: Unknown" due to field name mismatch (`destination` vs `destPath`)
- **aMule Category Name Resolution** - aMule category IDs are resolved to human-readable names for event scripting
- **aMule Relative Path in History** - `downloadFinished` events showed relative `.part` paths (e.g., `003.part/file.mkv`) instead of absolute paths; now only uses absolute paths from aMule shared files
- **Path Validation Race Condition** - Multiple client connections triggering concurrent `validateAllPaths()` calls caused inconsistent results; now debounced with 500ms delay
- **Path Validation Error Detail** - Permission check failures now show detailed diagnostics (uid, gid, directory ownership, file mode) instead of generic "Missing write permission"
- **qBittorrent Downloaded Bytes** - Fixed incorrect field name (`sizeDownloaded` → `downloaded`) in history metadata for qBittorrent
- **qBittorrent Peer Data** - Normalize peer data at source to match rTorrent format
- **qBittorrent Peer Counter** - Fix peer counter for qBittorrent downloads in Active Downloads widget
- **Download History Ratio** - Ratio values now rounded to 2 decimal places

### 🔧 Changed

- **UI Path Display** - AlertBox supports `breakAll` prop for better word-breaking of long paths and hashes
- **Client Selector** - BitTorrentClientSelector supports `showFullName` prop to always display full client name
- **Download Normalizer** - rTorrent hash lowercased for consistency, added `category` alias and `finishedTime` field
- **File Selection Mode in Directory Browser** - `DirectoryBrowserModal` supports `mode="file"` to browse and select files (directories still navigable)

### 📝 Documentation

- **Event Scripting README** - Updated `downloadAdded` event documentation with new `category` field and JSON examples
- **Installation Docs** - Updated for three-client support
- **Landing Page** - Updated for three-client support

---

## [3.1.0] - qBittorrent Support

### 🎉 Major Release - Three-Client Support

This release adds full **qBittorrent** integration, making aMuTorrent a unified download manager for aMule, rTorrent, and qBittorrent simultaneously.

### ✨ Added

#### **qBittorrent Integration**
- **Full qBittorrent Support** - Connect to qBittorrent via its WebUI API
- **Auto-Reconnect** - Automatic connection recovery on disconnect
- **Torrent Management** - Add magnets and torrent files, pause/resume/stop/delete
- **Category Sync** - Bidirectional category synchronization between aMuTorrent and qBittorrent
- **Native File Moves** - Uses qBittorrent's `setLocation()` API for efficient moves (no filesystem access needed)
- **Native File Deletion** - Deletes via API (no volume mount required for delete operations)
- **Transfer Statistics** - Upload/download speeds and totals tracked in metrics
- **Connection Status** - Real-time status with port information in footer
- **Application Logs** - View qBittorrent logs in the Logs page
- **Configuration** - Full setup via Settings page or environment variables (`QBITTORRENT_ENABLED`, `QBITTORRENT_HOST`, `QBITTORRENT_PORT`, `QBITTORRENT_USERNAME`, `QBITTORRENT_PASSWORD`, `QBITTORRENT_USE_SSL`)

#### **Event Scripting Enhancements**
- **File Path in Events** - `downloadFinished`, `fileDeleted`, and `categoryChanged` events now include `path` (full file/directory path) and `multiFile` fields
- **Debug Script** - New `scripts/log-to-file.sh` logs all event data to `server/logs/events.log` for debugging
- **JSON Payload Examples** - Complete examples for all 5 event types in `scripts/README.md`

### 🔧 Changed

#### **UI Restructuring**
- **Unified BitTorrent Section** - Settings page combines rTorrent and qBittorrent under "BitTorrent Integration" with sub-sections
- **Client Filter Toggle** - Header ED2K/BT toggle filters all BitTorrent clients (rTorrent + qBittorrent) as one group
- **Multi-Client Footer** - Speed totals from all connected clients with per-client tooltip breakdown
- **Statistics Charts** - Renamed from "rTorrent" to "BitTorrent" to reflect all BT clients
- **Client Display Names** - New `CLIENT_NAMES` constant as single source of truth for client names across the UI
- **Client Icons** - Distinct icons for rTorrent (dedicated SVG) and qBittorrent (dedicated SVG); generic BitTorrent icon for the BT filter toggle

#### **Architecture Improvements**
- **Download Normalizer** - Extended with `normalizeQBittorrentDownload()` for unified item format
- **Unified Item Builder** - Renamed `RTORRENT_DEFAULTS` to `TORRENT_DEFAULTS`, added `isTorrentClient()` helper
- **Data Fetch Service** - qBittorrent added as data source alongside aMule and rTorrent
- **Metrics Collection** - qBittorrent speeds and totals tracked (uses all-time totals, no restart detection needed)
- **Auto Refresh Manager** - Extended refresh loop with qBittorrent stats, history tracking, and external download detection
- **Config Tester** - Added qBittorrent connection testing with detailed diagnostics
- **Field Formatters** - Support for 50+ qBittorrent-specific field labels and state formatting

#### **Category Management**
- **qBittorrent Category Sync** - Categories created/updated/deleted in aMuTorrent are synced to qBittorrent
- **Path Validation** - Enhanced logging showing specific paths and reasons for each warning
- **Default Paths** - Tracked per client (aMule, rTorrent, qBittorrent) for accurate Default category display

#### **Move Operations**
- **qBittorrent Native Moves** - Uses API-based `setLocation()` instead of manual file operations
- **Improved Size Verification** - Uses actual measured size for incomplete downloads
- **Cross-Filesystem Fallback** - Falls back from rename to copy with logging

### 🐛 Fixed

- **aMule Delete Event** - `deletedFromDisk` now correctly reports `true` when cancelling aMule downloads (aMule always deletes temp files)
- **Move Size Verification** - Fixed incorrect size comparison for incomplete downloads
- **Path Translation** - Fixed path mapping to handle both prefix matching and fallback patterns

### 📝 Documentation

- **qBittorrent Integration Guide** - New `docs/QBITTORRENT.md` covering setup, Docker, categories, and first-time password configuration
- **Updated All Docs** - CONFIGURATION.md, RTORRENT.md, PROWLARR.md, and README.md updated to reflect three-client support
- **Event Scripting README** - Added full JSON payload examples for all event types, documented `path` and `multiFile` fields
- **Debug Script** - New `scripts/log-to-file.sh` with usage documentation
- **Documentation Website** - Added GitHub Pages deployment with Starlight, qBittorrent added to sidebar

---

## [3.0.2]

### ✨ Added

- **Demo Mode** - Generate random data for screenshots and showcasing the app without real clients. Enable with `DEMO_MODE=true` environment variable.

### 🐛 Fixed

- **Apprise CLI Detection** - Fix detection of Apprise installed via pipx. Now searches common paths including `~/.local/bin`, `/usr/local/bin`, and other standard locations.

## [3.0.1]

### 🐛 Fixed

- **Path Resolution** - Fix path resolution for categories with `pathMappings: null`. Categories with a `path` but no `pathMappings` now correctly use `path` as the local path instead of falling back to Default category.
- **Version Check** - Handle HTTP redirects in version check to support repo renames. Old images checking the previous repo name will now correctly follow the redirect to find new releases.

## [3.0.0] - aMuTorrent

### 🎉 Major Release - Multi-Client Support & App Rebrand

This release transforms the app from an aMule-only controller into a unified download manager supporting multiple clients. The app has been rebranded to **aMuTorrent** to reflect its expanded capabilities.

### ✨ Added

#### **rTorrent Integration**
- **Full rTorrent Support** - Connect to rTorrent via XML-RPC over HTTP
- **Unified Download Views** - Manage aMule and rTorrent downloads in a single interface
- **Torrent File Upload** - Add torrents via file upload or magnet links
- **Label/Category Support** - Automatic directory assignment based on categories
- **Tracker Information** - Display tracker domain for torrent downloads

#### **Prowlarr Integration**
- **Torrent Search** - Search for torrents via Prowlarr indexer manager
- **Direct Downloads** - Add search results directly to rTorrent
- **Indexer Filtering** - Filter search results by indexer source
- **Category Mapping** - Assign categories when adding from search results

#### **Notifications System**
- **Apprise Integration** - Push notifications via 80+ services (Discord, Telegram, Slack, Pushover, ntfy, Gotify, Email, Webhooks, and more)
- **Form-Based Configuration** - Easy service setup through web UI (no YAML editing)
- **Event Selection** - Choose which events trigger notifications (download added, completed, moved, deleted, category changed)
- **Test Notifications** - Verify service configuration before enabling
- **Apprise Detection** - Graceful handling when Apprise CLI is not installed

#### **Custom Event Scripting**
- **Script Execution** - Run custom scripts when download events occur
- **Multiple Input Methods** - Event data via argument, environment variables, and JSON stdin
- **Example Script** - Included `scripts/custom.sh` with documentation and examples
- **Timeout Protection** - Configurable script timeout to prevent hung processes

#### **Enhanced Search View**
- **Multi-Selection** - Select multiple search results for batch download
- **Category Selection** - Assign category when downloading search results
- **Improved Results Display** - Better formatting and source information

#### **Configurable Table Columns**
- **Column Visibility** - Show/hide columns per view
- **Column Reordering** - Drag to reorder columns
- **Secondary Sorting** - Configure secondary sort column for tie-breaking
- **Persistent Settings** - Column preferences saved to localStorage
- **Per-View Configuration** - Different column setups for each view

#### **Category Path Management**
- **Move to Category Path** - Move downloads (active or completed) to their category's configured directory
- **Directory Browser** - Visual directory picker for category path configuration
- **Background Move Operations** - File moves tracked with progress indication

#### **Selection Mode Improvements**
- **Frozen Sorting** - Sort order locked while in selection mode to prevent confusion
- **Select All/Page** - Quick shortcuts to select all items or current page
- **Visual Indicators** - Clear feedback for selected items count

#### **Shared Files Enhancements**
- **Upload Speed Indicator** - Real-time upload speed per shared file
- **Peer Count in Info Modal** - See connected peers for each shared file
- **Automatic Folder Reload** - Configurable interval to rescan shared folders

#### **App Logs**
- **Application Logs View** - View aMuTorrent server logs in the Logs tab
- **Log Rotation** - Automatic log file management
- **Real-time Updates** - Live log streaming via WebSocket

#### **UI Improvements**
- **Client Icons** - Visual indicators showing which client (aMule/rTorrent) each item belongs to
- **Combined Statistics** - Unified speed and transfer charts for both clients
- **Sticky View Headers** - Headers stay visible while scrolling on mobile
- **Improved Tooltips** - Tooltips now use portals to avoid clipping issues

### 🔧 Changed

#### **History System Overhaul**
- **Background Status Tracking** - Download status now maintained by background task instead of computed on each request
- **Improved aMule Tracking** - Downloads correctly marked as completed after full download
- **Username Tracking Fix** - Fixed username capture for Prowlarr-initiated downloads
- **Performance Improvements** - Reduced database queries for history operations

#### **View Consolidation**
- **Unified Item Views** - Downloads, uploads, and shared files use consistent item components
- **Combined Columns** - Merged related columns with partial sorting for compact views
- **Responsive Breakpoints** - Better adaptation between mobile, tablet, and desktop

#### **Architecture Improvements**
- **Modular Client Handlers** - Separate handler classes for rTorrent and Prowlarr
- **Unified Item Builder** - Common data structure for items from different clients
- **Download Normalizer** - Consistent download representation across clients
- **Category Manager** - Centralized category handling with path mapping

### 🐛 Fixed

- **History Completion Status** - aMule downloads now correctly marked as completed
- **Tooltip Positioning** - Fixed tooltips being clipped by container overflow
- **Selection Mode Sorting** - Prevented confusing reorder while items are selected
- **Username in History** - Fixed username not being recorded for some download methods
- **Chart Memory Leaks** - Proper cleanup of Chart.js instances on unmount
- **WebSocket Reconnection** - Improved handling of connection drops

### 📝 Documentation

- **aMule Integration Guide** - EC protocol setup in `docs/AMULE.md`
- **rTorrent Integration Guide** - XML-RPC setup in `docs/RTORRENT.md`
- **Prowlarr Integration Guide** - Torrent search setup in `docs/PROWLARR.md`
- **Notifications Guide** - Apprise configuration in `docs/NOTIFICATIONS.md`
- **Custom Scripting Guide** - Event script development in `scripts/README.md`
- **Configuration Guide Updated** - New environment variables and multi-client setup

### ⚠️ Breaking Changes

- **App Renamed** - Project renamed from "aMule Web Controller" to "aMuTorrent"
- **Repository Renamed** - GitHub repository URL changed
- **Docker Image** - New Docker Hub repository (old image deprecated)

---

## [2.2.0]

### ✨ Added

#### **Authentication & Security**
- **Web UI Password Protection** - Optional password authentication with brute force protection (exponential backoff and IP lockout after 10 failed attempts)
- **API Authentication** - Torznab and qBittorrent APIs now require authentication when web UI auth is enabled (API key = UI password)

#### **Download History**
- **History Tracking** - Optional persistent download history with filtering and search

#### **Mobile Redesign**
- **New Home Dashboard** - Mobile-optimized widgets for quick overview
- **Bottom Navigation Bar** - Easy thumb-accessible navigation
- **Optimized Card Views** - Improved mobile layouts for all views
- **Mobile Table Features** - Sort and filter controls adapted for touch

#### **Bulk Actions**
- **Download Selection Mode** - Mass pause/resume, category assignment, and delete
- **Shared Files Selection** - Bulk ED2K link export

#### **Enhanced File Views**
- **Detailed Info Modals** - Rich information dialogs for downloads and shared files
- **Context Menus** - Right-click quick actions on downloads and shared files
- **Filter by Filename** - Text filter for downloads, uploads, shared files, and search results
- **Items-per-page Selector** - Configurable page sizes for all views
- **ED2K Link Export** - Export links from shared files

#### **System Monitoring**
- **Disk Space Indicator** - Real-time disk usage in footer
- **CPU Usage Indicator** - System CPU load in footer
- **Hostname Resolution** - Peer hostnames displayed in uploads view

#### **UI Enhancements**
- **Version Badge** - Automatic update check and app version info
- **Font Size Toggle** - Adjustable UI font size
- **Reload Shared Folders Button** - New button in Shared Files view to rescan shared folders from disk

### 🔧 Changed

#### **Build & Deployment**
- **JavaScript Bundling** - All frontend JS bundled into single file using esbuild
- **Updated bcrypt** - Version 6.0.0 removes deprecated dependencies

#### **Code Refactoring**
- **Config Management** - Refactored config.js/configAPI.js with improved secrets handling
- **Sensitive Env Vars** - Environment variables for passwords/API keys now always override config.json and lock UI fields
- **Torznab/qBittorrent APIs** - Refactored indexer and download client implementations
- **Frontend Architecture** - Massive app.js refactoring with contexts, consolidated state management, simplified views
- **Batched WebSocket Updates** - Reduced UI re-renders via autoRefreshManager
- **Deduplicated Code** - Consolidated Sonarr/Radarr logic in configTester.js and arrManager.js

#### **UI Improvements**
- **Server Disconnect Button** - Only shown on currently connected server
- **Header Tooltips** - Added tooltips on navigation buttons
- **Tablet Layout Fixes** - Improved sidebar and view layouts for tablets
- **Form Element Styles** - Unified form styling across views
- **Settings Page** - Reduced horizontal padding on mobile for more content width

### 🐛 Fixed

- **Arr Integration** - Fixed automatic search not initializing when enabled from settings after startup
- **Sonarr TBA Episodes** - Unreleased episodes (TBA) no longer trigger searches
- **Loading States** - Fixed "no files" message shown instead of "loading" on slow connections
- **Chart Rendering** - Fixed laggy home view by deferring chart rendering
- **Mobile Scroll** - Fixed viewport auto-scroll to top on page changes
- **Theme Persistence** - Theme selection now properly remembered
- **Light Mode** - Fixed progress bar text visibility in downloads
- **iOS Safari** - Fixed CSS viewport issues on iOS Safari
- **Loading Spinner** - Fixed spinner CSS styling

### 📝 Documentation

- **Restructured Docs** - Separated into focused guides (Configuration, Integrations, GeoIP, API, Development)
- **Docker Hub Link** - Added link to Docker Hub repository
- **Auth Documentation** - Added authentication setup for Torznab and qBittorrent APIs

## [2.1.0]

### ✨ Added
- Comprehensive monitoring dashboard on Home view (desktop)
- Real-time active downloads and uploads widgets
- 24h statistics with charts and metric cards
- Quick search integration on dashboard
- Auto-refresh every 15 seconds

### 🔧 Changed
- Improve Torznab category support for Prowlarr

## [2.0.0]

### 🎉 Major Release - Complete Refactoring & New Features

This is a major release featuring a complete codebase refactoring and numerous new features that significantly enhance functionality and user experience.

### ✨ Added

#### **Configuration Management**
- **Interactive Setup Wizard** - First-run guided configuration with real-time validation and testing
- **Settings Page** - Manage all configuration through the web interface with live testing
- **Persistent Configuration** - Settings saved to `config.json` with environment variable fallback
- **Configuration Precedence** - Clear hierarchy: config file > env vars > defaults
- **Test Before Save** - Validate individual sections or all settings before applying changes

#### **Sonarr/Radarr Integration**
- **Torznab Indexer API** - Full Torznab compatibility for ED2K network searches
- **qBittorrent Download Client Compatibility** - Works as download client for *arr apps
- **Automatic Library Scanning** - Configurable interval-based searches for missing content
- **Quality Profile Support** - Respects quality upgrade preferences from Sonarr/Radarr
- **Interactive Search Support** - Manual searches from Sonarr/Radarr interface
- **ED2K Rate Limiting** - Prevents server flood protection bans
- **Search Result Caching** - Efficient pagination handling for *arr apps

#### **GeoIP Integration**
- **MaxMind GeoLite2 Support** - Display geographic location of upload peers
- **Country Flags** - Visual country indicators in uploads view
- **City Information** - Detailed location data when available
- **Docker Integration** - GeoIP updater container for automatic database updates
- **Optional Feature** - Works without databases, gracefully degrades

#### **Download Management**
- **Category Management** - Create, edit, and delete download categories
- **Color-Coded Categories** - Customizable colors for visual organization
- **Category Assignment** - Assign downloads to categories via UI
- **Category Filtering** - Filter downloads by category
- **Pause/Resume Downloads** - Control individual download states
- **Multiple ED2K Link Support** - Add multiple ED2K links at once (one per line)
- **Segments Bar Visualization** - Visual representation of file parts availability
- **Detailed Source Counts** - Shows total, current, transferring, and A4AF sources
- **Last Seen Complete** - Color-coded indicators for source freshness

#### **User Experience**
- **Persistent Sorting Preferences** - Sort preferences saved to localStorage
- **Secondary Sorting** - Files with equal values sorted alphabetically by name
- **Improved Mobile UI** - Better touch interactions and responsive design
- **Enhanced Dark Mode** - Improved contrast and visual hierarchy

#### **Historical Statistics**
- **Interactive Charts** - Chart.js integration for speed and transfer visualization
- **Multiple Time Ranges** - 24h, 7d, and 30d views with appropriate aggregation
- **Accurate Calculations** - Fixed statistics calculation bugs (totals, averages, peaks)
- **Peak Speed Tracking** - True peak speeds from raw data, not averaged buckets
- **Database Optimization** - Efficient queries for large datasets

### 🔧 Changed

#### **Codebase Refactoring**
- **Modular Server Architecture** - Separated concerns into focused modules
  - `amuleHandler.js` - aMule EC protocol handling
  - `metricsAPI.js` - Historical statistics endpoints
  - `torznabAPI.js` - Torznab indexer implementation
  - `qbittorrentAPI.js` - qBittorrent API compatibility
  - `geoIPManager.js` - GeoIP database management
  - `config.js` - Centralized configuration
  - `categoriesManager.js` - Category operations
  - `sonarrClient.js` / `radarrClient.js` - *arr integration
- **Component-Based Frontend** - Organized React components
  - `components/common/` - Reusable UI components
  - `components/layout/` - Layout components (Header, Sidebar, Footer)
  - `components/views/` - Page view components
  - `components/modals/` - Modal dialogs
  - `hooks/` - Custom React hooks
  - `utils/` - Utility functions (formatters, validators, sorters)
- **Improved Code Reusability** - Extracted common patterns and utilities
- **Better Error Handling** - Comprehensive try-catch blocks and user feedback
- **Performance Optimizations** - Memoization, efficient queries, reduced re-renders
- **Code Readability** - Consistent naming, better comments, clear structure
- **Maintainability** - Easier to extend, test, and debug

#### **API Improvements**
- **RESTful Endpoints** - Proper HTTP methods and status codes
- **Consistent Response Format** - Standardized JSON responses
- **Better Error Messages** - Actionable error information
- **WebSocket Protocol** - Cleaner message structure
- **Rate Limiting** - Configurable delays for ED2K operations

#### **Database Changes**
- **Efficient Queries** - Added helper methods for common operations
  - `getFirstMetric()` - Get earliest record in range
  - `getLastMetric()` - Get latest record in range
  - `getPeakSpeeds()` - Get true peak speeds from raw data
- **Better Indexing** - Optimized timestamp lookups
- **Cleanup Routines** - Automatic old data retention management

### 🐛 Fixed

- **Statistics Calculation Bugs**:
  - Fixed 30d total upload/download showing less than 7d (100k record limit issue)
  - Fixed peak speeds calculated from averaged buckets instead of raw data
  - Fixed average speeds incorrectly averaging already-averaged bucket data
  - Now uses proper calculations: total/time for averages, MAX() for peaks
- **Secondary Sorting** - Files with equal sort values now alphabetically sorted
- **Dark Mode Consistency** - Improved color schemes across all views
- **Mobile Touch Interactions** - Better tap targets and touch feedback
- **Category Color Display** - Proper hex color rendering
- **WebSocket Reconnection** - More stable connection handling
- **Search Result Caching** - Prevents duplicate ED2K searches
- **Progress Bar Rendering** - Smooth animations and accurate percentages

### 📝 Documentation

- **Comprehensive README** - Updated with all new features and configuration options
- **Setup Instructions** - Clear Docker and native installation guides
- **Configuration Guide** - Detailed explanation of configuration precedence
- **Integration Guides** - Step-by-step Sonarr/Radarr setup
- **API Documentation** - Torznab and qBittorrent API endpoints
- **Troubleshooting Section** - Common issues and solutions
- **GeoIP Setup Guide** - MaxMind license and database configuration

### 📦 Dependencies

#### Added
- `maxmind` - GeoIP database reader
- Chart.js (via CDN) - Interactive charts

#### Updated
- React 18 - Latest stable version
- Tailwind CSS - Latest utilities
- better-sqlite3 - Latest database driver

---

## [1.0.1]

### Added
- Interactive charts for historical statistics
- Support for multiple ED2K links
- Improved statistics visualization

### Fixed
- Various bug fixes and performance improvements

---

## [1.0.0] - Initial Release

### Added
- Real-time search functionality
- Download management
- Upload monitoring
- Shared files view
- Historical statistics (24h/7d/30d)
- Dark mode support
- Responsive design
- WebSocket real-time updates
- Docker support
- Native installation support