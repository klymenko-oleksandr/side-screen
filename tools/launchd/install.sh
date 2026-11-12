#!/usr/bin/env bash
# Builds Side Screen and installs the server as a launchd user agent (PRD N2).
# Safe to re-run: it replaces the existing agent. Usage: pnpm launchd:install
set -euo pipefail

LABEL="com.klymenko.side-screen"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/side-screen"
DOMAIN="gui/$(id -u)"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "launchd is macOS only." >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node not found on PATH." >&2
  exit 1
fi
# Resolve symlinks (Homebrew, nvm shims) so launchd gets a stable binary path.
NODE_BIN="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")"
NODE_DIR="$(dirname "$NODE_BIN")"

if [[ ! -f "$REPO/config/side-screen.config.json" ]]; then
  echo "Note: config/side-screen.config.json not found; the server will use the example config."
  echo "      cp config/side-screen.config.example.json config/side-screen.config.json"
fi

echo "→ Building ($REPO)"
(cd "$REPO" && pnpm build)

echo "→ Writing $PLIST"
mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
sed -e "s|__LABEL__|$LABEL|g" \
    -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__NODE_DIR__|$NODE_DIR|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    "$REPO/tools/launchd/side-screen.plist.template" > "$PLIST"
plutil -lint "$PLIST" >/dev/null

echo "→ Loading agent $LABEL"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL"

PORT="$(node -e "try{const c=require('$REPO/config/side-screen.config.json');console.log(c.server?.port??4300)}catch{console.log(4300)}")"
echo -n "→ Waiting for http://127.0.0.1:$PORT/api/health "
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "ok"
    echo
    echo "Side Screen is running: http://127.0.0.1:$PORT"
    echo "Logs: pnpm launchd:logs"
    exit 0
  fi
  echo -n "."
  sleep 0.5
done

echo " no answer."
echo "Check the logs: $LOG_DIR/server.err.log" >&2
exit 1
