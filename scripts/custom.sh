#!/bin/bash
# =============================================================================
# Custom Event Script Example
# =============================================================================
# This script is called when download events occur (if enabled in Settings).
#
# SETUP:
# 1. Make this script executable: chmod +x custom.sh
# 2. Enable Custom Event Script in Settings and set the path
#
# INVOCATION:
# - Event type is passed as the first argument: $1
# - Environment variables are set for common fields
# - Full event JSON is passed via stdin
#
# EVENTS:
# - downloadAdded      : A new download was added
# - downloadFinished   : A download completed
# - categoryChanged    : A download's category was changed
# - fileMoved          : A file was moved to a new location
# - fileDeleted        : A file was deleted
# - clientUnavailable  : A download client went offline
# - clientAvailable    : A download client came back online
#
# =============================================================================

# -----------------------------------------------------------------------------
# METHOD 1: Read event type from argument
# -----------------------------------------------------------------------------
EVENT_TYPE="$1"

# -----------------------------------------------------------------------------
# METHOD 2: Read common fields from environment variables
# -----------------------------------------------------------------------------
# EVENT_TYPE         - Same as $1
# EVENT_HASH         - Download hash/ID
# EVENT_FILENAME     - File name
# EVENT_CLIENT_TYPE  - Client type (amule, qbittorrent, rtorrent, deluge)
# EVENT_INSTANCE_ID  - Client instance identifier
# EVENT_INSTANCE_NAME- Display name of the client instance
# EVENT_OWNER        - Username of the file owner (empty if untracked/no multi-user)
# EVENT_TRIGGERED_BY - Username who triggered the action (empty for system events)
# EVENT_STATUS       - Client health status: available/unavailable (health events only)
# EVENT_PREVIOUS_STATUS - Previous health status (health events only)
# EVENT_ERROR        - Error message (clientUnavailable events only)
# EVENT_DOWNTIME_DURATION - Outage duration in ms (clientAvailable events only)

echo "Event: $EVENT_TYPE"
echo "Hash: $EVENT_HASH"
echo "Filename: $EVENT_FILENAME"
echo "Client: $EVENT_CLIENT_TYPE"
echo "Owner: $EVENT_OWNER"
echo "Triggered by: $EVENT_TRIGGERED_BY"

# -----------------------------------------------------------------------------
# METHOD 3: Read full JSON from stdin (requires jq)
# -----------------------------------------------------------------------------
# The full event data is passed as JSON via stdin
# Use jq to parse specific fields

EVENT_JSON=$(cat)

if command -v jq &> /dev/null; then
    # Parse fields from JSON
    HASH=$(echo "$EVENT_JSON" | jq -r '.hash // empty')
    FILENAME=$(echo "$EVENT_JSON" | jq -r '.filename // empty')
    CLIENT_TYPE=$(echo "$EVENT_JSON" | jq -r '.clientType // empty')
    SIZE=$(echo "$EVENT_JSON" | jq -r '.size // empty')
    OWNER=$(echo "$EVENT_JSON" | jq -r '.owner // empty')
    TRIGGERED_BY=$(echo "$EVENT_JSON" | jq -r '.triggeredBy // empty')

    # Event-specific fields
    case "$EVENT_TYPE" in
        categoryChanged)
            OLD_CAT=$(echo "$EVENT_JSON" | jq -r '.oldCategory // "Default"')
            NEW_CAT=$(echo "$EVENT_JSON" | jq -r '.newCategory // "Default"')
            echo "Category changed from '$OLD_CAT' to '$NEW_CAT'"
            ;;
        fileMoved)
            DEST_PATH=$(echo "$EVENT_JSON" | jq -r '.destPath // empty')
            echo "File moved to: $DEST_PATH"
            ;;
        fileDeleted)
            DELETED_FROM_DISK=$(echo "$EVENT_JSON" | jq -r '.deletedFromDisk // false')
            echo "Deleted from disk: $DELETED_FROM_DISK"
            ;;
        clientUnavailable)
            ERROR=$(echo "$EVENT_JSON" | jq -r '.error // empty')
            echo "Client offline: $EVENT_INSTANCE_NAME — $ERROR"
            ;;
        clientAvailable)
            DOWNTIME=$(echo "$EVENT_JSON" | jq -r '.downtimeDuration // empty')
            echo "Client online: $EVENT_INSTANCE_NAME (downtime: ${DOWNTIME}ms)"
            ;;
    esac

    echo ""
    echo "Full JSON:"
    echo "$EVENT_JSON" | jq .
else
    echo ""
    echo "Install jq to parse JSON: apk add jq (Alpine) or apt install jq (Debian)"
    echo ""
    echo "Raw JSON:"
    echo "$EVENT_JSON"
fi

# -----------------------------------------------------------------------------
# EXAMPLES: What you can do with events
# -----------------------------------------------------------------------------

# Example: Send to a webhook
# curl -X POST "https://your-webhook.example.com/notify" \
#     -H "Content-Type: application/json" \
#     -d "$EVENT_JSON"

# Example: Log to a file
# echo "$(date -Iseconds) [$EVENT_TYPE] $EVENT_FILENAME" >> /path/to/events.log

# Example: Send email (requires mailx)
# echo "Download complete: $EVENT_FILENAME" | mailx -s "Download Alert" you@example.com

# Example: Run a command on download complete
# if [ "$EVENT_TYPE" = "downloadFinished" ]; then
#     /path/to/post-process.sh "$EVENT_FILENAME"
# fi

exit 0
