#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PI_WEB_PORT:-30141}"
URL="http://localhost:${PORT}"
LOG_DIR="${PI_WEB_LOG_DIR:-$HOME/Library/Logs/Pi Web}"
LOG_FILE="$LOG_DIR/pi-web.log"
PID_FILE="$LOG_DIR/pi-web.pid"

mkdir -p "$LOG_DIR"

is_ready() {
  curl -fsS --max-time 1 "$URL/" >/dev/null 2>&1
}

start_server() {
  if [ ! -d "$APP_DIR/node_modules" ]; then
    (
      cd "$APP_DIR"
      npm install
    ) >>"$LOG_FILE" 2>&1
  fi

  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
    return
  fi

  (
    cd "$APP_DIR"
    npm run dev
  ) >>"$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
}

open_app_window() {
  if osascript -e 'id of application "Google Chrome"' >/dev/null 2>&1; then
    open -a "Google Chrome" --args --app="$URL"
  else
    open "$URL"
  fi
}

if ! is_ready; then
  start_server
  for _ in $(seq 1 80); do
    if is_ready; then
      break
    fi
    sleep 0.5
  done
fi

open_app_window
