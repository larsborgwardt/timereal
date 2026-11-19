#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID == 0 && -x /opt/timereal-node/bin/node && -d /opt/timereal-current ]] || { echo 'Als root im Timereal-Container ausführen.' >&2; exit 2; }
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Einrichtung oder Aktualisierung läuft.' >&2; exit 1; }
read -r -p 'SMTP-Server: ' host </dev/tty
read -r -p 'SMTP-Port (z. B. 587 oder 465): ' port </dev/tty
read -r -p 'Direktes TLS, gewöhnlich bei Port 465 (ja/nein): ' secure </dev/tty
read -r -p 'Absender-E-Mail-Adresse: ' from </dev/tty
read -r -p 'SMTP-Benutzername (leer bei lokalem Relay): ' user </dev/tty
IFS= read -rs -p 'SMTP-Passwort: ' password </dev/tty; echo
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf '%s\n%s\n%s\n%s\n%s\n%s' "$host" "$port" "$secure" "$from" "$user" "$password" | /opt/timereal-node/bin/node /opt/timereal-current/dist/mail-cli.js "$work/mail.json"
unset password
if [[ -f /etc/timereal/mail.json ]]; then cp -p /etc/timereal/mail.json "$work/vorher.json"; fi
install -m 640 -o root -g timereal_app "$work/mail.json" /etc/timereal/mail.json.next
mv /etc/timereal/mail.json.next /etc/timereal/mail.json
ok=false
if systemctl restart timereal.service; then
for _ in $(seq 1 20); do
 if curl --max-time 3 -fsS http://127.0.0.1:3040/health >/dev/null 2>&1; then ok=true; break; fi
 sleep 1
done
fi
if [[ $ok != true ]]; then
 if [[ -f $work/vorher.json ]]; then cp -p "$work/vorher.json" /etc/timereal/mail.json; else rm /etc/timereal/mail.json; fi
 systemctl reset-failed timereal.service
 systemctl restart timereal.service
 echo 'Anwendungsprüfung fehlgeschlagen; vorherige Mailkonfiguration wiederhergestellt.' >&2; exit 1
fi
echo 'Mailversand eingerichtet. Du kannst Berater in der Verwaltung einladen.'
