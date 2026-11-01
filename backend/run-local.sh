#!/usr/bin/env bash
# Starts the AI service so a phone on the same Wi-Fi can reach it, and points the
# Expo app at this Mac. Run it from the repo root with: npm run ai
set -euo pipefail

cd "$(dirname "$0")"
PORT=8200

if [ ! -x .venv/bin/uvicorn ]; then
  echo "First run: installing the AI service..."
  PYTHON=$(command -v python3.13 || command -v python3)
  "$PYTHON" -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -z "$IP" ]; then
  echo "This Mac isn't on Wi-Fi, so a phone can't reach it. Connect and try again."
  exit 1
fi

URL="http://$IP:$PORT"
ENV_FILE=../mobile/.env
PREVIOUS=$(grep '^EXPO_PUBLIC_AI_URL=' "$ENV_FILE" | cut -d= -f2- || true)
if [ "$PREVIOUS" != "$URL" ]; then
  grep -v '^EXPO_PUBLIC_AI_URL=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  echo "EXPO_PUBLIC_AI_URL=$URL" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "Updated mobile/.env. Restart Expo with: npx expo start -c"
fi

echo "AI service: $URL"
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
