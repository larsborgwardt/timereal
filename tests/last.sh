#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
out=${LAST_AUSGABE:-$(mktemp -d /tmp/timereal-last.XXXXXX)}
mkdir -p "$out"
db= api=
cleanup() {
  [[ -z "$api" ]] || docker logs "$api" > "$out/server.log" 2>&1 || true
  [[ -z "$api" ]] || docker stop -t 10 "$api" >/dev/null
  [[ -z "$db" ]] || docker stop -t 10 "$db" >/dev/null
}
trap cleanup EXIT
npm run build
password=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")
db=$(docker run -d --rm --cpus=2 --memory=1536m --memory-swap=1536m -p 127.0.0.1::5432 -p 127.0.0.1::3040 -e POSTGRES_PASSWORD="$password" "${POSTGRES_IMAGE:-postgres:18-alpine}")
for _ in $(seq 1 90); do
  if docker exec "$db" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then break; fi
  sleep 1
done
docker exec "$db" psql -X -U postgres -c 'CREATE TABLE timereal_lastprobe(id integer PRIMARY KEY CHECK(id=1)); INSERT INTO timereal_lastprobe VALUES(1);' > "$out/probe.log"
docker cp datenmodell "$db:/tmp/datenmodell"
docker exec "$db" mkdir -p /tmp/tests
docker cp tests/last-schema-v05.sql "$db:/tmp/tests/last-schema-v05.sql"
docker cp tests/last-bestand.sql "$db:/tmp/tests/last-bestand.sql"
docker exec "$db" psql -X -U postgres -f /tmp/tests/last-schema-v05.sql > "$out/schema-v05.log"
port=$(docker port "$db" 5432/tcp | cut -d: -f2)
httpport=$(docker port "$db" 3040/tcp | cut -d: -f2)
export TEST_DATABASE_URL="postgres://postgres:$password@127.0.0.1:$port/postgres"
export LAST_ORIGIN="http://127.0.0.1:$httpport" LAST_AUSGABE="$out"
node tests/last.mjs vorbereiten
docker exec "$db" psql -X -At -U postgres -f /tmp/tests/last-bestand.sql > "$out/bestand-vorher.txt"
docker exec "$db" psql -X -U postgres -f /tmp/datenmodell/entwurf.sql > "$out/migration.log"
docker exec "$db" psql -X -At -U postgres -f /tmp/tests/last-bestand.sql > "$out/bestand-nachher.txt"
cmp "$out/bestand-vorher.txt" "$out/bestand-nachher.txt"
docker exec "$db" psql -X -U postgres -c 'ANALYZE;' >/dev/null
node tests/last-plaene.mjs
api=$(docker run -d --rm --cpus=1 --memory=512m --memory-swap=512m --network="container:$db" -v "$PWD:/app:ro" -w /app -e PUBLIC_ORIGIN="$LAST_ORIGIN" -e NODE_ENV=production -e DATABASE_URL="postgres://timereal_app:kapazitaet-wegwerfrolle@127.0.0.1:5432/postgres" "${NODE_IMAGE:-node:24-alpine}" node tests/last-server.mjs)
for _ in $(seq 1 90); do
  if curl --fail --silent "$LAST_ORIGIN/health" >/dev/null; then break; fi
  sleep 1
done
export LAST_DB_CONTAINER="$db" LAST_API_CONTAINER="$api"
node tests/last.mjs messen
docker logs "$api" > "$out/server.log" 2>&1
printf 'Lastnachweis: %s/ergebnis.json\n' "$out"
