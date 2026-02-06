# Notifications

aMuTorrent can send push notifications when download events occur using [Apprise](https://github.com/caronc/apprise), which supports 80+ notification services.

## Requirements

- **Apprise CLI** must be installed on the system running aMuTorrent
- Docker image includes Apprise pre-installed
- For standalone installations: `pipx install apprise` or `brew install apprise`

## Supported Services

Configure notifications for any of these services through the web UI:

| Service | Description |
|---------|-------------|
| **Discord** | Send to Discord channels via webhook |
| **Telegram** | Send via Telegram Bot |
| **Slack** | Send to Slack channels |
| **Pushover** | Push notifications to mobile devices |
| **ntfy** | Simple pub-sub notification service |
| **Gotify** | Self-hosted notification server |
| **Email (SMTP)** | Send email notifications |
| **Webhook (JSON)** | POST to custom webhook URLs |
| **Custom URL** | Any Apprise-supported URL scheme |

For the full list of 80+ supported services, see the [Apprise Wiki](https://github.com/caronc/apprise/wiki).

## Configuration

### Via Web UI (Recommended)

1. Go to **Notifications** in the sidebar
2. Enable notifications with the master toggle
3. Select which **Events** should trigger notifications
4. Click **Add Service** to configure notification destinations
5. Test your configuration with the **Test** button

### Events

| Event | Triggered When |
|-------|----------------|
| Download Added | A new download is started |
| Download Finished | A download completes successfully |
| Category Changed | A file's category/label is changed |
| File Moved | A file is moved to a new location |
| File Deleted | A file is deleted from the client |

## Adding Services

### Discord

1. Create a webhook in Discord (Server Settings → Integrations → Webhooks)
2. Copy the webhook URL: `https://discord.com/api/webhooks/{ID}/{TOKEN}`
3. In aMuTorrent, add a Discord service with:
   - **Webhook ID**: The ID from the URL
   - **Webhook Token**: The token from the URL

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot)
3. In aMuTorrent, add a Telegram service with:
   - **Bot Token**: Token from BotFather
   - **Chat ID**: Your user or group chat ID

### Pushover

1. Sign up at [pushover.net](https://pushover.net)
2. Create an application to get an API token
3. In aMuTorrent, add a Pushover service with:
   - **User Key**: Your Pushover user key
   - **API Token**: Your application token

### ntfy

1. Choose a topic name (or use [ntfy.sh](https://ntfy.sh) public server)
2. In aMuTorrent, add an ntfy service with:
   - **Topic**: Your topic name
   - **Host**: Optional, defaults to ntfy.sh

### Email (SMTP)

1. Get your SMTP server settings
2. For Gmail: Enable 2FA and create an App Password
3. In aMuTorrent, add an Email service with:
   - **SMTP Host**: e.g., smtp.gmail.com
   - **SMTP Port**: 587 (TLS) or 465 (SSL)
   - **Username**: Your email address
   - **Password**: Your password or app password
   - **Recipient**: Email to send notifications to

### Custom Apprise URL

For services not in the form list, use Custom URL with any valid Apprise URL:

```
slack://TokenA/TokenB/TokenC
matrix://user:pass@hostname/#room
json://webhook.example.com/notify
```

See [Apprise URL formats](https://github.com/caronc/apprise/wiki) for all options.

## Docker Setup

The Docker image includes Apprise pre-installed. No additional configuration needed.

```yaml
services:
  amutorrent:
    image: g0t3nks/amutorrent:latest
    ports:
      - "4000:4000"
    # Apprise is already installed in the image
```

## Standalone Setup

For non-Docker installations, install Apprise:

```bash
# macOS
brew install apprise

# Linux (modern systems with externally-managed Python)
pipx install apprise

# Linux (older systems)
pip install apprise
```

Verify installation:

```bash
apprise --version
```

## Custom Event Scripts

For advanced use cases beyond notifications, see [Custom Scripting](../scripts/README.md) to run your own scripts on download events.

## Troubleshooting

### "Apprise CLI Not Installed"

- Install Apprise using `pipx install apprise` or `brew install apprise`
- Verify with `apprise --version`
- Ensure Apprise is in the system PATH

### Notifications Not Sending

- Click **Test** on the service card to verify configuration
- Check aMuTorrent logs for error messages
- Verify the service credentials are correct
- Some services have rate limits

### Test Works But Events Don't

- Ensure the master notifications toggle is enabled
- Verify the specific event type is enabled
- Check that downloads are actually triggering events

### Docker Networking Issues

- Services like Discord/Telegram work from anywhere
- Self-hosted services (Gotify, ntfy) must be accessible from the container
- Use Docker network names for container-to-container communication
