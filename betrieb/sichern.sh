#!/usr/bin/env bash
set -euo pipefail
umask 077
ordner=${STATE_DIRECTORY:?Systemd-Sicherungsverzeichnis fehlt}
[[ $EUID == 0 ]] || { echo 'Die Sicherung benötigt root für den geschützten MFA-Schlüssel.' >&2; exit 1; }
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Einrichtung, Aktualisierung oder Sicherung läuft.' >&2; exit 1; }
root=$(cd "$(dirname "$0")/.." && pwd)
bash "$root/betrieb/mfa-schluessel.sh" pruefen
stage=$(mktemp -d "$ordner/.sicherung.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT
runuser -u postgres -- pg_dump --format=custom timereal >"$stage/datenbank.dump"
pg_restore --list "$stage/datenbank.dump" >/dev/null
install -m 600 /etc/timereal/mfa.key "$stage/mfa.key"
cp "$root/release.json" "$stage/release.json"
printf 'timereal-backup-v1\n' >"$stage/format"
(cd "$stage" && sha256sum datenbank.dump mfa.key release.json format >SHA256SUMS)
tar -cf "$stage/paket.tar" -C "$stage" datenbank.dump mfa.key release.json format SHA256SUMS
sync -f "$stage/paket.tar"
mv "$stage/paket.tar" "$ordner/timereal-$(date -u +%Y%m%dT%H%M%SZ)-${stage##*.}.tar"
sync -f "$ordner"
# Alte .dump-Dateien bleiben unverändert; nur neue Pakete unterliegen der Aufbewahrung.
find "$ordner" -maxdepth 1 -type f -name 'timereal-*.tar' -mtime +14 -delete
