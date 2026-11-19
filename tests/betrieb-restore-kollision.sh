#!/usr/bin/env bash
set -euo pipefail
script=${1:?Pfad des zu prüfenden Betriebsskripts fehlt}
[[ -f /root/TIMEREAL_WEGWERFTEST && ! -e /usr/local/bin/createdb ]]
work=$(mktemp -d /tmp/timereal-kollision.XXXXXXXX)
chmod 755 "$work"
touch "$work/name"; chown postgres:postgres "$work/name"
cat > "$work/createdb" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 && $1 == timereal_restore_* ]]
/usr/bin/createdb "$1"
printf '%s' "$1" > "__MARKER__"
exec /usr/bin/createdb "$1"
WRAPPER
chmod 755 "$work/createdb"
cleanup() { rm -f /usr/local/bin/createdb; if [[ -s $work/name ]]; then runuser -u postgres -- /usr/bin/dropdb --if-exists "$(cat "$work/name")"; fi; rm -rf "$work"; }
trap cleanup EXIT
sed -i "s|__MARKER__|$work/name|" "$work/createdb"
install -m 755 "$work/createdb" /usr/local/bin/createdb
[[ $(runuser -u postgres -- which createdb) == /usr/local/bin/createdb ]]
if bash "$script" pruefen >/root/restore-kollision-lauf.log 2>&1; then echo 'Kollision wurde angenommen'; exit 1; fi
name=$(cat "$work/name")
[[ -n $name ]]
[[ $(runuser -u postgres -- psql -XAt -d postgres -c "select count(*) from pg_database where datname='$name'") == 1 ]]
echo 'Kollision abgelehnt, bereits bestehende Datenbank erhalten.'
