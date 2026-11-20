#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Wegwerf-Datenbank auf einem zufälligen Loopback-Port, getrennt vom Pilot.
password=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")
container=$(docker run -d --rm -p 127.0.0.1::5432 --tmpfs /var/lib/postgresql:rw -e POSTGRES_PASSWORD="$password" "${POSTGRES_IMAGE:-postgres:18-alpine}")
export DESIGN_PROBE_LOG="$(mktemp /tmp/timereal-design-proben.XXXXXXXX.jsonl)"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$DESIGN_PROBE_LOG"' EXIT
port=$(docker port "$container" 5432/tcp | cut -d: -f2)
export TEST_DATABASE_URL="postgres://postgres:$password@127.0.0.1:$port/postgres"
for _ in $(seq 1 90); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then break; fi
  sleep 1
done
docker cp datenmodell "$container:/tmp/datenmodell"
docker exec "$container" psql -X -U postgres -f /tmp/datenmodell/entwurf.sql
npm run build
node --test tests/icons.test.mjs
node --test tests/rollen.mjs
node --test tests/audit.mjs
npm run test:db
node --test tests/nachweise-excel.mjs
node --test tests/konten.mjs tests/ausbau.mjs tests/erweiterung.mjs tests/mfa.mjs
node --test tests/betrieb-api.mjs
node --test tests/herkunft.mjs
node --test tests/kapazitaet.mjs
node tests/kapazitaet-stoerungen.mjs
node --test tests/html-einfuegungen.test.mjs tests/passwort-hash.test.mjs tests/anmeldedrossel.test.mjs tests/mfa-crypto.test.mjs tests/mfa-schluessel.test.mjs tests/version.test.mjs tests/updates.test.mjs tests/update.test.mjs tests/mail-cli.test.mjs tests/zeit.test.mjs tests/erweiterung-client.test.mjs tests/betrieb.test.mjs
node --test tests/betriebsauftraege.test.mjs tests/betrieb-dienst.test.mjs tests/betrieb-system.test.mjs tests/betrieb-konfiguration.test.mjs tests/betrieb-fortschritt.test.mjs tests/systemkonsole.test.mjs
if [[ ${BROWSER_TEST:-0} == 1 ]]; then node tests/excel-browser.mjs; node tests/mfa-browser.mjs; node tests/audit-browser.mjs; node tests/footer-browser.mjs; node tests/browser.mjs; node tests/konten-browser.mjs; node tests/rollen-browser.mjs; node tests/arbeitsablauf-browser.mjs; node tests/design-browser.mjs; node tests/navigation-browser.mjs; node tests/betrieb-browser.mjs; node tests/betrieb-domain-browser.mjs; node tests/systemkonsole-browser.mjs; node scripts/erweiterung-bauen.mjs; node tests/erweiterung-browser.mjs; node scripts/erweiterung-bauen.mjs --target edge-store --zip; node tests/erweiterung-browser.mjs --edge-store; node tests/design-abdeckung.mjs; fi
