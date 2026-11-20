#!/usr/bin/env bash
# Frische Installation des Arbeitsstands in einem Debian-13/systemd-Container,
# danach Proxy- und Domainprobe mit echtem Caddy, TLS, PostgreSQL und
# Betriebsdienst. Für die CI; startet nur eigene Wegwerf-Container.
set -euo pipefail
cd "$(dirname "$0")/.."
image=timereal-ci-native:pruefung
guest="timereal-ci-native-$$"
out=${TIMEREAL_BELEGE:-$(mktemp -d /tmp/timereal-ci-native.XXXXXXXX)}
mkdir -p "$out"
cleanup() {
  local code=$?
  trap - EXIT
  if [[ $code != 0 ]]; then
    docker exec "$guest" journalctl -u timereal -u timereal-https -u timereal-betrieb -n 200 --no-pager >"$out/journal.log" 2>&1 || true
  fi
  docker rm -f "$guest" >/dev/null 2>&1 || true
  printf 'Prüfbelege: %s\n' "$out"
  exit "$code"
}
trap cleanup EXIT
docker build -q -t "$image" tests/nativ >/dev/null
git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf "$out/quellen.tar"
docker run -d --name "$guest" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock --tmpfs /tmp "$image" >/dev/null
docker exec "$guest" bash -c 'for _ in {1..60}; do if systemctl is-system-running 2>/dev/null | grep -qE "^(running|degraded)$"; then exit 0; fi; sleep 1; done; exit 1'
docker exec "$guest" test -f /root/TIMEREAL_WEGWERFTEST
docker exec "$guest" mkdir -p /opt/timereal
docker cp "$out/quellen.tar" "$guest:/root/quellen.tar"
docker exec "$guest" tar -xf /root/quellen.tar -C /opt/timereal
docker exec "$guest" git -C /opt/timereal init -q
# install.sh liest Anmeldename und Passwort vom Terminal; script stellt eins
# bereit. Die Antworten gehen erst nach der jeweiligen Abfrage hinaus, sonst
# verbrauchen frühere Installationsschritte die Eingabe.
passwort=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")
mkfifo "$out/eingabe"
docker exec -i "$guest" script -qec 'bash /opt/timereal/betrieb/install.sh' /dev/null <"$out/eingabe" >"$out/installation.log" 2>&1 &
installation=$!
exec 4>"$out/eingabe"
antworten() {
  local frage=$1 antwort=$2
  for _ in {1..900}; do
    if grep -q "$frage" "$out/installation.log"; then printf '%s\n' "$antwort" >&4; return 0; fi
    kill -0 "$installation" 2>/dev/null || return 1
    sleep 1
  done
  return 1
}
if ! antworten 'Anmeldename für dein Testkonto:' ci-pruefung ||
  ! antworten 'Passwort (mindestens 12 Zeichen):' "$passwort" ||
  ! wait "$installation"; then
  exec 4>&-
  tail -40 "$out/installation.log" >&2
  exit 1
fi
exec 4>&-
grep -q 'ist installiert. HTTPS wurde im Container erfolgreich geprüft.' "$out/installation.log"
echo 'Frische Installation mit HTTPS, PostgreSQL und Betriebsdienst bestanden.'
docker exec "$guest" bash /opt/timereal/tests/betrieb-proxy.sh /opt/timereal/betrieb/proxy-einrichten.sh >"$out/proxy.log" 2>&1 || {
  tail -40 "$out/proxy.log" >&2
  exit 1
}
echo 'Proxy-Skript: Fehlerantwort für fremde Hostnamen, kein HTTP/3, Herkunft Domain und lokale Adresse, Rückbau bestanden.'
# Die Proxyprobe stellt ihre Ausgangskonfiguration mit einem Dienstneustart wieder her.
docker exec "$guest" bash -c 'for _ in {1..30}; do if curl --fail --silent --max-time 3 http://127.0.0.1:3040/health >/dev/null; then exit 0; fi; sleep 1; done; exit 1'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_EINKLICK=1 /opt/timereal-node/bin/node /opt/timereal/tests/betrieb-native-domain.mjs >"$out/domain.log" 2>&1 || {
  tail -40 "$out/domain.log" >&2
  exit 1
}
echo 'Domain über den Betriebsdienst ohne Frist eingerichtet; Anmeldung über Domain und lokale Adresse bestanden.'
