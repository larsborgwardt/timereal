#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname "$0")/backup-lib.sh"
usage() {
  echo 'Aufruf: backup-einrichten.sh --check|neu|vorhanden sftp:benutzer@ssh-host:/absoluter/pfad'
  echo 'Benötigt restic, einen SSH-Schlüssel und den vorher geprüften Hostschlüssel in /root/.ssh/known_hosts.'
  echo 'neu initialisiert ein eigenes Repository; vorhanden verwendet ein bestehendes. Passwort wird verdeckt abgefragt.'
}
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
[[ $# == 2 && $1 =~ ^(--check|neu|vorhanden)$ ]] || { usage >&2; exit 2; }
backup_ziel_pruefen "$2"
[[ $EUID == 0 && -d /etc/timereal ]] || { echo 'Als root im Timereal-Container ausführen.' >&2; exit 1; }
command -v restic >/dev/null || { echo 'Zuerst apt-get install restic openssh-client ausführen.' >&2; exit 1; }
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Einrichtung oder Aktualisierung läuft.' >&2; exit 1; }
host=${2#sftp:}; host=${host%%:*}
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 "$host" -s sftp </dev/null
if [[ $1 == --check ]]; then echo 'SSH-Verbindung mit geprüftem Hostschlüssel funktioniert. Repository und Passwort werden bei der Einrichtung geprüft.'; exit 0; fi
[[ ! -e /etc/timereal/extern ]] || { echo 'Externe Sicherung ist bereits eingerichtet. Bestehende Konfiguration bleibt erhalten.' >&2; exit 1; }
backup_config=$(mktemp -d /etc/timereal/.extern.XXXXXXXX)
trap 'rm -rf "$backup_config"' EXIT
printf '%s\n' "$2" >"$backup_config/repository"
IFS= read -rs -p 'Passwort des verschlüsselten Sicherungsbestands (mindestens 16 Zeichen): ' password </dev/tty; echo
[[ ${#password} -ge 16 ]] || { echo 'Passwort zu kurz.' >&2; exit 2; }
if [[ $1 == neu ]]; then
  IFS= read -rs -p 'Passwort wiederholen: ' repeat </dev/tty; echo
  [[ $password == "$repeat" ]] || { echo 'Passwörter stimmen nicht überein.' >&2; exit 2; }
  unset repeat
fi
printf '%s' "$password" >"$backup_config/password"
unset password
if [[ $1 == neu ]]; then backup_restic init; else backup_restic snapshots >/dev/null; fi
backup_restic check
mv "$backup_config" /etc/timereal/extern
trap - EXIT
install -m 644 "$(dirname "$0")"/timereal-extern.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now timereal-extern.timer
echo 'Externe Sicherung eingerichtet. Passwort zusätzlich außerhalb des Containers sicher aufbewahren.'
echo 'Erste Sicherung: bash /opt/timereal-current/betrieb/extern-sichern.sh sichern'
