#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID == 0 && ${1:-} =~ ^(anlegen|pruefen)$ && $# -le 3 && ( $1 == pruefen || $# == 1 ) ]] || { echo 'Aufruf als root: mfa-schluessel.sh anlegen | pruefen [DATENBANK [SCHLÜSSELDATEI]]' >&2; exit 2; }
root=$(cd "$(dirname "$0")/.." && pwd)
node=/opt/timereal-node/bin/node
key=${3:-/etc/timereal/mfa.key}
database=${2:-timereal}
[[ $database =~ ^[a-z][a-z0-9_]*$ && $key == /* ]] || exit 2
sql=(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -At -d "$database")
rows='[]'
if [[ $("${sql[@]}" -c "select to_regclass('public.mfa_konto') is not null") == t ]]; then
  rows=$("${sql[@]}" -c "select coalesce(json_agg(t),'[]') from (select konto_id::text, geheimnis, vorbereitet from mfa_konto where geheimnis is not null or vorbereitet is not null) t")
fi
printf '%s' "$rows" | "$node" "$root/betrieb/mfa-schluessel.mjs" "$key" "$1" "$(id -g timereal_app)"
if [[ $key == /etc/timereal/mfa.key ]]; then runuser -u timereal_app -- test -r "$key"; fi
