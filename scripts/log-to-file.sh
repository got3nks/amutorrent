#!/bin/bash
# =============================================================================
# Log-to-File Event Script
# =============================================================================
# Logs all received data (arguments, environment variables, stdin JSON)
# to execute.log in the same directory as this script.
#
# Useful for debugging and verifying what data your scripts receive.
#
# SETUP:
# 1. chmod +x scripts/log-to-file.sh
# 2. Enable Custom Event Script in Settings, set path to: scripts/log-to-file.sh
# =============================================================================

# Resolve the directory where this script lives (works with symlinks too)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/../server/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/events.log"

# Read stdin (full JSON payload)
EVENT_JSON=$(cat)

# Timestamp
TS=$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S')

{
    echo "================================================================================"
    echo "[$TS] Event received"
    echo "================================================================================"
    echo ""
    echo "--- Arguments ---"
    echo "\$1 (event type): $1"
    echo ""
    echo "--- Environment Variables ---"
    echo "EVENT_TYPE:         $EVENT_TYPE"
    echo "EVENT_HASH:         $EVENT_HASH"
    echo "EVENT_FILENAME:     $EVENT_FILENAME"
    echo "EVENT_CLIENT_TYPE:  $EVENT_CLIENT_TYPE"
    echo "EVENT_INSTANCE_ID:  $EVENT_INSTANCE_ID"
    echo "EVENT_INSTANCE_NAME:$EVENT_INSTANCE_NAME"
    echo "EVENT_OWNER:        $EVENT_OWNER"
    echo "EVENT_TRIGGERED_BY: $EVENT_TRIGGERED_BY"
    echo "EVENT_STATUS:       $EVENT_STATUS"
    echo "EVENT_PREVIOUS_STATUS: $EVENT_PREVIOUS_STATUS"
    echo "EVENT_ERROR:        $EVENT_ERROR"
    echo "EVENT_DOWNTIME_DURATION: $EVENT_DOWNTIME_DURATION"
    echo ""
    echo "--- Stdin (JSON) ---"
    if command -v jq &> /dev/null; then
        echo "$EVENT_JSON" | jq .
    else
        echo "$EVENT_JSON"
    fi
    echo ""
} >> "$LOG_FILE"

exit 0
