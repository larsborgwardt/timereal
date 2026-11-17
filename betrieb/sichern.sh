#!/usr/bin/env bash
set -euo pipefail
umask 077
ordner=${STATE_DIRECTORY:?Systemd-Sicherungsverzeichnis fehlt}
datei=$(mktemp "$ordner/.sicherung.XXXXXXXX")
trap 'rm -f "$datei"' EXIT
pg_dump --format=custom --file="$datei" timereal
pg_restore --list "$datei" >/dev/null
mv "$datei" "$ordner/timereal-$(date -u +%Y%m%dT%H%M%SZ).dump"
find "$ordner" -maxdepth 1 -type f -name 'timereal-*.dump' -mtime +14 -delete
