#!/bin/bash
# Updates country flag SVGs from purecatamphetamine/country-flag-icons
# Usage: cd static/flags && ./update.sh

set -e

REPO="purecatamphetamine/country-flag-icons"
DIR="3x2"

echo "Fetching file list from $REPO/$DIR..."
URLS=$(curl -sL "https://api.github.com/repos/$REPO/contents/$DIR" \
  | python3 -c "import sys,json; [print(f['download_url']) for f in json.load(sys.stdin) if f['name'].endswith('.svg')]")

COUNT=$(echo "$URLS" | wc -l | tr -d ' ')
echo "Downloading $COUNT SVGs..."

echo "$URLS" | xargs -n 1 -P 10 curl -sLO

echo "Done. $COUNT flags updated."
