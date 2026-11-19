#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /root/TIMEREAL_WEGWERFTEST && $# == 1 ]] || exit 2
script=$(readlink -f "$1")
before=$(readlink -f /opt/timereal-betrieb-current)
scratch=$(mktemp -d /root/timereal-bootstrap-probe.XXXXXXXX)
candidate=$(mktemp -d /opt/timereal-releases/bootstrap-probe.XXXXXXXX)
cp /etc/systemd/system/timereal-betrieb.service "$scratch/unit"
cleanup() {
  local rc=$?
  trap - EXIT
  ln -sfn "$before" /opt/timereal-betrieb-current
  cp "$scratch/unit" /etc/systemd/system/timereal-betrieb.service
  systemctl daemon-reload
  systemctl reset-failed timereal-betrieb.service
  systemctl restart timereal-betrieb.service
  rm -rf "$candidate" "$scratch"
  exit "$rc"
}
trap cleanup EXIT
cp /opt/timereal-current/release.json "$candidate/"
mkdir "$candidate/betrieb"
cp -a /opt/timereal-betrieb-current/. "$candidate/betrieb/"
# Reale systemd-Fehlerprobe: vorhandenen gültigen Dienst durch einen nicht
# startfähigen Kandidaten ersetzen. Nur im ausdrücklich markierten Prüfgast.
sed -i 's|^ExecStart=.*|ExecStart=/usr/bin/false|' "$candidate/betrieb/timereal-betrieb.service"
printf '\n// Isolierter Bootstrap-Fehlerfall\n' >> "$candidate/betrieb/verwaltung/start.mjs"
if bash "$script" "$candidate" > "$scratch/ausgabe.log" 2>&1; then
  echo 'FEHLER: Defekter Dienst wurde als erfolgreich eingerichtet.' >&2
  exit 1
fi
[[ $(readlink -f /opt/timereal-betrieb-current) == "$before" ]] || {
  echo 'FEHLER: Nach fehlgeschlagenem Bootstrap zeigt der Dienstlink auf den defekten Kandidaten.' >&2
  exit 1
}
cmp "$scratch/unit" /etc/systemd/system/timereal-betrieb.service
for _ in {1..20}; do
  if curl --fail --silent --max-time 3 --unix-socket /run/timereal-betrieb/dienst.sock -H 'Content-Type: application/json' -d '{"aktion":"status"}' http://localhost/ >/dev/null; then
    echo 'Bootstrap: fehlgeschlagener Dienststart, ursprüngliche Unit und Dienstlink sowie erneut erreichbarer Unix-Dienst geprüft.'
    exit 0
  fi
  sleep 1
done
echo 'FEHLER: Vorheriger Dienst nach Rückbau nicht erreichbar.' >&2
exit 1
