#!/usr/bin/env bash
set -euo pipefail
umask 022

usage() {
  echo 'Aufruf: bash update.sh [--check] vMAJOR.MINOR.PATCH'
  echo 'Vorher im Repository: git fetch --tags origin'
  echo '--check prüft Ausgangsstand und Ziel, ohne Dienste oder Daten zu ändern.'
}
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
check=false
if [[ ${1:-} == --check ]]; then check=true; shift; fi
[[ $# == 1 && $1 =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Eine feste Version ist erforderlich. Aufruf: update.sh [--check] vMAJOR.MINOR.PATCH' >&2; exit 2;
}
tag=$1
[[ $EUID == 0 && -d /run/systemd/system ]] || { echo 'Im Testcontainer als root ausführen.' >&2; exit 2; }
source /etc/os-release
[[ $ID == debian && $VERSION_ID == 13 ]] || { echo 'Debian 13 erforderlich.' >&2; exit 2; }
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Installation oder Aktualisierung läuft bereits.' >&2; exit 1; }
repo=/opt/timereal
node=/opt/timereal-node/bin/node
export PATH=/opt/timereal-node/bin:$PATH
[[ -x $node && -d $repo/.git && -f /etc/timereal/dienst.conf ]] || {
  echo 'Bestehende Pilotinstallation nicht gefunden.' >&2; exit 1;
}
sha=$(git -C "$repo" rev-parse --verify "refs/tags/$tag^{commit}") || {
  echo 'Version nicht vorhanden. Zuerst git -C /opt/timereal fetch --tags origin ausführen.' >&2; exit 1;
}
previous=$(readlink -f /opt/timereal-current 2>/dev/null || true)
if [[ ! -d $previous ]]; then previous=$repo; fi
[[ -f $previous/dist/server.js && -f $previous/package.json ]] || { echo 'Vorheriger Anwendungsstand fehlt.' >&2; exit 1; }
old_version=$("$node" -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).version' "$previous/package.json")
manifest=$(git -C "$repo" show "$sha:release.json")
schema=$(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -Atqc 'SELECT max(version) FROM timereal_migration')
# Daten werden als JSON und Argumente geprüft, nie als Shellcode ausgewertet.
schema_target=$(printf '%s' "$manifest" | "$node" --input-type=commonjs -e '
let data="";process.stdin.on("data",d=>data+=d).on("end",()=>{
  const m=JSON.parse(data),[tag,old,schema]=process.argv.slice(1);
  const newer=(a,b)=>{const x=a.split(".").map(Number),y=b.split(".").map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return true};
  if(m.version!==tag.slice(1)||m.apiVersion!==1||!Number.isInteger(m.schemaVersion)||!Number.isInteger(m.minimumSchemaVersion)||!m.additiveMigrations||!newer(m.version,old)||Number(schema)<m.minimumSchemaVersion||Number(schema)>m.schemaVersion) throw Error("Nicht unterstützter Versions- oder Datenbankwechsel");
  process.stdout.write(String(m.schemaVersion));
});' "$tag" "$old_version" "$schema")
echo "Installiert: $old_version · Ziel: ${tag#v} · Datenbankschema: $schema → $schema_target"
if [[ $check == true ]]; then exit 0; fi
target="/opt/timereal-releases/${tag#v}-$sha"
if [[ $previous == "$target" ]]; then
  curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3040/health >/dev/null
  echo 'Diese Version ist bereits aktiv.'; exit 0
fi
[[ $old_version != "${tag#v}" ]] || { echo 'Dieselbe Versionsnummer hat einen anderen Stand. Abbruch.' >&2; exit 1; }
[[ ! -e $target ]] || { echo "Releaseverzeichnis existiert bereits: $target. Vor einem neuen Versuch den fehlgeschlagenen Stand prüfen." >&2; exit 1; }
install -d -m 755 /opt/timereal-releases
stage=$(mktemp -d /opt/timereal-releases/.vorbereitung.XXXXXXXX)
chmod 755 "$stage"
receipt=''
stopped=false
switched=false
done=false
cleanup() {
  code=$?
  set +e
  trap - EXIT INT TERM
  if [[ $done != true && $stopped == true ]]; then
    echo 'Update fehlgeschlagen. Vorherigen Anwendungsstand wiederherstellen.' >&2
    systemctl stop timereal.service
    if [[ $switched == true ]]; then
      ln -sfn "$previous" /opt/timereal-current.next
      mv -Tf /opt/timereal-current.next /opt/timereal-current
      cp "$receipt/timereal.service" /etc/systemd/system/timereal.service
      cp "$receipt/timereal-backup.service" /etc/systemd/system/timereal-backup.service
      systemctl daemon-reload || true
    fi
    systemctl reset-failed timereal.service
    systemctl start timereal.service
    recovered=false
    for _ in $(seq 1 30); do
      if curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3040/health >/dev/null 2>&1; then recovered=true; break; fi
      sleep 1
    done
    if [[ $recovered == true ]]; then
      echo 'Vorherige Anwendung ist wieder erreichbar.' >&2
    else
      echo 'Vorherige Anwendung ist nicht erreichbar. Bitte Dienstprotokoll prüfen.' >&2
    fi
    echo "Sicherung und Diagnose: $receipt. Kein automatisches Zurückspielen der Datenbank." >&2
    code=1
  fi
  rm -rf "$stage"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
git -C "$repo" archive "$sha" | tar -x -C "$stage"
(cd "$stage" && npm ci --ignore-scripts --no-audit --no-fund && npm run build && node --test tests/version.test.mjs tests/update.test.mjs)
install -d -m 700 /var/lib/timereal-updates
receipt=$(mktemp -d "/var/lib/timereal-updates/${tag#v}.XXXXXXXX")
cp /etc/systemd/system/timereal.service /etc/systemd/system/timereal-backup.service "$receipt/"
printf '%s\n' "vorher=$previous" "version=$old_version" "ziel=$target" "schema=$schema" > "$receipt/stand.txt"
stopped=true
systemctl stop timereal.service
# Shell öffnet die geschützte Datei; pg_dump läuft weiterhin als postgres.
runuser -u postgres -- pg_dump --format=custom timereal > "$receipt/before.dump"
runuser -u postgres -- pg_restore --list < "$receipt/before.dump" > "$receipt/inhalte.txt"
sync -f "$receipt/before.dump"
sync -f "$receipt"
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -f "$stage/datenmodell/entwurf.sql" > "$receipt/migration.log" 2>&1
actual=$(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -Atqc 'SELECT max(version) FROM timereal_migration')
[[ $actual == "$schema_target" ]] || { echo 'Datenbankschema stimmt nach Migration nicht.' >&2; exit 1; }
mv "$stage" "$target"
chmod -R a+rX "$target"
switched=true
ln -s "$target" /opt/timereal-current.next
mv -Tf /opt/timereal-current.next /opt/timereal-current
install -m 644 "$target/betrieb/timereal.service" "$target/betrieb/timereal-backup.service" /etc/systemd/system/
systemctl daemon-reload
systemctl start timereal.service
healthy=false
for _ in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3040/health >/dev/null 2>&1 &&
     curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3040/api/v1/version | "$node" --input-type=commonjs -e '
       let x="";process.stdin.on("data",d=>x+=d).on("end",()=>{const m=JSON.parse(x);if(m.version!==process.argv[1]||m.apiVersion!==1||m.schemaVersion!==Number(process.argv[2]))process.exit(1)});
     ' "${tag#v}" "$schema_target"; then healthy=true; break; fi
  sleep 1
done
[[ $healthy == true ]] || { echo 'Neue Anwendung startet nicht fehlerfrei.' >&2; exit 1; }
done=true
printf '%s\n' 'Ergebnis: erfolgreich' >> "$receipt/stand.txt"
echo "Timereal ${tag#v} ist aktiv. Browser neu laden. Sicherung: $receipt/before.dump"
