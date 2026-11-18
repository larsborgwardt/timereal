#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Wegwerf-Datenbank auf einem zufälligen Loopback-Port, getrennt vom Pilot.
password=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")
container=$(docker run -d --rm -p 127.0.0.1::5432 --tmpfs /var/lib/postgresql:rw -e POSTGRES_PASSWORD="$password" "${POSTGRES_IMAGE:-postgres:18-alpine}")
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
port=$(docker port "$container" 5432/tcp | cut -d: -f2)
export TEST_DATABASE_URL="postgres://postgres:$password@127.0.0.1:$port/postgres"
for _ in $(seq 1 90); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then break; fi
  sleep 1
done
docker cp datenmodell "$container:/tmp/datenmodell"
docker exec "$container" psql -X -U postgres -f /tmp/datenmodell/entwurf.sql
npm run build
npm run test:db
node --test tests/konten.mjs tests/ausbau.mjs
node --test tests/version.test.mjs tests/update.test.mjs tests/mail-cli.test.mjs tests/zeit.test.mjs
if [[ ${BROWSER_TEST:-0} == 1 ]]; then node tests/browser.mjs; node tests/konten-browser.mjs; node tests/arbeitsablauf-browser.mjs; fi
