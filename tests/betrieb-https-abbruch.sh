#!/usr/bin/env bash
set -euo pipefail
script=${1:?Pfad des zu prüfenden Betriebsskripts fehlt}
[[ -f /root/TIMEREAL_WEGWERFTEST ]]
work=$(mktemp -d)
cp -p /etc/timereal/Caddyfile /etc/timereal/dienst.conf "$work/"
pid=''
cleanup() {
 if [[ -n $pid ]] && kill -0 "$pid" 2>/dev/null; then kill -TERM "$pid"; wait "$pid" || true; fi
 cp -p "$work/Caddyfile" /etc/timereal/Caddyfile
 cp -p "$work/dienst.conf" /etc/timereal/dienst.conf
 systemctl restart timereal.service timereal-https.service
 rm -rf "$work"
}
trap cleanup EXIT
bash "$script" probe.timereal.invalid >"$work/lauf.log" 2>&1 &
pid=$!
for _ in $(seq 1 20); do
 if ! cmp -s "$work/dienst.conf" /etc/timereal/dienst.conf; then break; fi
 sleep 1
done
! cmp -s "$work/dienst.conf" /etc/timereal/dienst.conf
kill -TERM "$pid"
if wait "$pid"; then echo 'Abbruch nicht als Fehler gemeldet'; exit 1; fi
pid=''
cmp "$work/dienst.conf" /etc/timereal/dienst.conf
cmp "$work/Caddyfile" /etc/timereal/Caddyfile
echo 'Abbruch stellte vorherige HTTPS-Konfiguration wieder her.'
