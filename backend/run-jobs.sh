#!/usr/bin/env bash
# Runs the scheduled jobs once against the AI service on this Mac, the way Supabase's
# pg_cron does when the service is hosted. Start the service first with: npm run ai
#   npm run jobs                  runs all three
#   npm run jobs -- sunday-letters   runs one
set -euo pipefail

cd "$(dirname "$0")"
URL=${AI_URL:-http://localhost:8200}
JOBS=("${@:-nightly-patterns sunday-letters reminders-and-nudges}")

# The secret pg_cron would send. Made once and kept in backend/.env, which git ignores.
if ! grep -q '^JOB_SECRET=' .env 2>/dev/null; then
  echo "JOB_SECRET=$(openssl rand -hex 32)" >> .env
  echo "Added JOB_SECRET to backend/.env. Restart the AI service (npm run ai), then run this again."
  exit 1
fi
SECRET=$(grep '^JOB_SECRET=' .env | cut -d= -f2-)

for job in ${JOBS[@]}; do
  printf '%s: ' "$job"
  curl -sS --max-time 120 -X POST "$URL/jobs/$job" -H "X-Job-Secret: $SECRET" -w ' (HTTP %{http_code})\n'
done
