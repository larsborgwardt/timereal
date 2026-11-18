#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
usage() { echo 'Prüfung: https-einrichten.sh --check DOMAIN'; echo 'Umschaltung: https-einrichten.sh DOMAIN'; echo 'Vorher DNS auf diesen Container richten und TCP 80/443 erreichbar machen.'; }
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
check=false
if [[ ${1:-} == --check ]]; then check=true; shift; fi
domain=${1:-}
if [[ $# != 1 || ${#domain} -gt 253 || ! $domain =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; then
  echo 'Domain als kleingeschriebenen DNS-Namen ohne Protokoll oder Pfad angeben.' >&2; exit 2
fi
[[ $EUID == 0 && -f /etc/timereal/Caddyfile && -f /etc/timereal/dienst.conf ]] || { echo 'Als root im eingerichteten Timereal-Container ausführen.' >&2; exit 1; }
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Einrichtung oder Aktualisierung läuft.' >&2; exit 1; }
getent ahosts "$domain" >/dev/null || { echo 'Domain ist noch nicht auflösbar.' >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat >"$work/Caddyfile" <<EOF
{
  admin off
}
$domain {
  reverse_proxy 127.0.0.1:3040
}
EOF
caddy validate --config "$work/Caddyfile" --adapter caddyfile
if [[ $check == true ]]; then
  echo "Konfiguration für https://$domain gültig. Öffentliche Erreichbarkeit und Zertifikatausstellung werden erst beim Umschalten geprüft."
  exit 0
fi
install -d -m 700 /var/lib/timereal-https-wechsel
backup=$(mktemp -d /var/lib/timereal-https-wechsel/vorher.XXXXXXXX)
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$backup/"
old_origin=$(sed -n 's/^PUBLIC_ORIGIN=//p' "$backup/dienst.conf")
old_host=${old_origin#https://}
old_https() {
  curl -fsS --max-time 2 --resolve "$old_host:443:127.0.0.1" "$old_origin/health" >/dev/null 2>&1 ||
    curl -fsS --max-time 2 --cacert /var/lib/timereal-https/caddy/pki/authorities/local/root.crt --resolve "$old_host:443:127.0.0.1" "$old_origin/health" >/dev/null 2>&1
}
rollback() {
  trap - ERR INT TERM
  set +e
  cp -p "$backup/Caddyfile" /etc/timereal/Caddyfile
  cp -p "$backup/dienst.conf" /etc/timereal/dienst.conf
  systemctl stop timereal.service timereal-https.service
  systemctl reset-failed timereal.service timereal-https.service
  systemctl start timereal.service timereal-https.service
  recovered=false
  for _ in $(seq 1 20); do
    if systemctl is-active --quiet timereal-https.service && old_https; then recovered=true; break; fi
    sleep 1
  done
  echo "HTTPS-Umschaltung fehlgeschlagen. Vorherige Konfiguration zurückgespielt: $backup; Dienstprüfung: $recovered" >&2
  exit 1
}
trap rollback ERR INT TERM
awk '!/^PUBLIC_ORIGIN=/' /etc/timereal/dienst.conf >"$work/dienst.conf"
printf 'PUBLIC_ORIGIN=https://%s\n' "$domain" >>"$work/dienst.conf"
install -m 644 "$work/Caddyfile" /etc/timereal/Caddyfile.next
install -m 644 "$work/dienst.conf" /etc/timereal/dienst.conf.next
mv /etc/timereal/Caddyfile.next /etc/timereal/Caddyfile
mv /etc/timereal/dienst.conf.next /etc/timereal/dienst.conf
systemctl restart timereal.service timereal-https.service
ok=false
for _ in $(seq 1 45); do
  if curl -fsS --max-time 2 --resolve "$domain:443:127.0.0.1" "https://$domain/health" >/dev/null 2>&1; then ok=true; break; fi
  sleep 1
done
[[ $ok == true ]]
trap - ERR INT TERM
echo "HTTPS mit geprüftem Zertifikat aktiv: https://$domain. Vorherige Konfiguration: $backup"
