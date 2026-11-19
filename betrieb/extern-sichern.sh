#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(dirname "$0")/backup-lib.sh"
usage() { echo 'Aufruf: extern-sichern.sh sichern|liste|check|pruefen [SNAPSHOT]'; echo 'pruefen restauriert einen Snapshot ausschließlich in eine neue, anschließend entfernte Prüfdatenbank.'; }
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
mode=${1:-}; snapshot=${2:-latest}
[[ $mode =~ ^(sichern|liste|check|pruefen)$ && ( $# == 1 || ( $mode == pruefen && $# == 2 ) ) ]] || { usage >&2; exit 2; }
[[ $snapshot == latest || $snapshot =~ ^[a-f0-9]{8,64}$ ]] || { echo 'Snapshot als latest oder hexadezimatische Kennung angeben.' >&2; exit 2; }
backup_config=/etc/timereal/extern
[[ $EUID == 0 && -s $backup_config/repository && -s $backup_config/password ]] || { echo 'Externe Sicherung zuerst als root einrichten.' >&2; exit 1; }
backup_ziel_pruefen "$(cat "$backup_config/repository")"
# Auch ein paralleles Update darf keinen wechselnden Konfigurationsstand archivieren.
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Einrichtung, Aktualisierung oder Sicherung läuft.' >&2; exit 1; }
if [[ $mode == liste ]]; then backup_restic snapshots --tag timereal; exit; fi
if [[ $mode == check ]]; then backup_restic check --read-data; exit; fi
install -d -m 700 /var/lib/timereal-extern
stage=/var/lib/timereal-extern/staging
probe=''; database=''; database_created=false
cleanup() {
  if [[ $database_created == true ]]; then runuser -u postgres -- dropdb --if-exists "$database"; fi
  [[ -z $probe ]] || rm -rf "$probe"
  rm -rf "$stage"
}
trap cleanup EXIT
if [[ $mode == sichern ]]; then
  bash "$(dirname "$0")/mfa-schluessel.sh" pruefen
  rm -rf "$stage"
  install -d -m 700 "$stage"
  runuser -u postgres -- pg_dump --format=custom timereal >"$stage/datenbank.dump"
  pg_restore --list "$stage/datenbank.dump" >/dev/null
  runuser -u postgres -- pg_dumpall --roles-only >"$stage/rollen.sql"
  cp -a /etc/timereal "$stage/konfiguration"
  cp -a /var/lib/timereal-https "$stage/https"
  cp /opt/timereal-current/release.json "$stage/release.json"
  (cd "$stage" && sha256sum datenbank.dump rollen.sql release.json konfiguration/mfa.key >SHA256SUMS)
  sync -f "$stage/datenbank.dump"
  sync -f "$stage"
  backup_restic backup --tag timereal --host timereal --one-file-system "$stage"
  echo 'Verschlüsselte externe Sicherung abgeschlossen.'
else
  probe=$(mktemp -d /var/lib/timereal-extern/pruefung.XXXXXXXX)
  backup_restic restore "$snapshot" --tag timereal --host timereal --verify --target "$probe"
  restored="$probe$stage"
  [[ -s $restored/datenbank.dump && -s $restored/konfiguration/dienst.conf && -s $restored/rollen.sql ]]
  (cd "$restored" && sha256sum -c SHA256SUMS)
  database="timereal_restore_$(date +%s)_$$"
  runuser -u postgres -- createdb "$database"
  database_created=true
  # Stream statt Öffnung des root-privaten Verzeichnisses durch postgres.
  runuser -u postgres -- pg_restore --exit-on-error --dbname "$database" <"$restored/datenbank.dump"
  schema=$(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -At -d "$database" -c 'select max(version) from timereal_migration')
  if [[ $schema -ge 9 ]]; then
    bash "$(dirname "$0")/mfa-schluessel.sh" pruefen "$database" "$restored/konfiguration/mfa.key"
  fi
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d "$database" -c 'SELECT count(*) AS konten FROM konto; SELECT count(*) AS zeitabschnitte FROM zeitabschnitt;'
  echo 'Externe Sicherung entschlüsselt und in getrennter PostgreSQL-Prüfdatenbank wiederhergestellt. Aktive Datenbank unverändert.'
fi
