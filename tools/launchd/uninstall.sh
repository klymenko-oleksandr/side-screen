#!/usr/bin/env bash
# Stops the Side Screen agent and removes it from login items. Logs are kept.
set -euo pipefail

LABEL="com.klymenko.side-screen"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed $LABEL. Logs stay in ~/Library/Logs/side-screen."
