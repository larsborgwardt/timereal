#!/usr/bin/env bash
set -euo pipefail
umask 022

usage() {
  echo 'Aufruf: bash update.sh [--check] vMAJOR.MINOR.PATCH'
  echo 'Vorher im Repository: git fetch --tags origin'
  echo '--check prüft Ausgangsstand und Ziel, ohne Dienste oder Daten zu ändern.'
  echo '--prepare vMAJOR.MINOR.PATCH baut das Ziel, ohne die laufende Anwendung anzuhalten.'
  echo '--install-prepared vMAJOR.MINOR.PATCH COMMIT installiert nur den zuvor gebauten Commit.'
  echo 'Die Ausgabe nennt die konfigurierte Browser-Adresse einschließlich Port.'
  echo 'Standard: HTTPS-Port 443; Port 3040 ist nur für den internen Anwendungsdienst.'
}
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
check=false
prepare=false
prepared=false
expected_sha=''
if [[ ${1:-} == --check ]]; then check=true; shift
elif [[ ${1:-} == --prepare ]]; then prepare=true; shift
elif [[ ${1:-} == --install-prepared ]]; then
  prepared=true; shift
  [[ $# == 2 && $2 =~ ^[a-f0-9]{40}$ ]] || { echo 'Aufruf: --install-prepared VERSION COMMIT (40 Hex-Zeichen)' >&2; exit 2; }
  expected_sha=$2
  set -- "$1"
fi
[[ $# == 1 && $1 =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Eine feste Version ist erforderlich. Aufruf: update.sh [--check] vMAJOR.MINOR.PATCH' >&2; exit 2;
}
tag=$1
phase='Voraussetzungen prüfen'
stage=''
receipt=''
stopped=false
switched=false
done=false
ereignis() {
  if [[ ${TIMEREAL_BETRIEB_EVENTS:-} == 1 ]]; then
    printf '{"phase":"%s"}\n' "$1" >&3
  fi
}
schritt() {
  phase=$2; printf '\n[%s/6] %s\n' "$1" "$phase"
  case "$1" in 1) ereignis pruefung;; 2) ereignis vorbereitung;; 3) ereignis sicherung;; 4) ereignis migration;; 5) ereignis neustart;; 6) ereignis erfolgreich;; esac
}
# Bau und Tests des neuen Stands laufen nicht als root, sondern unter einem
# eigenen Dienstkonto ohne Datenbankzugang. Danach gehört der Stand wieder root;
# übrig gebliebene Prozesse des Kontos werden beendet.
ohne_root() {
  local dir=$1 befehl=$2 heim code=0
  getent passwd timereal_build >/dev/null ||
    useradd --system --user-group --no-create-home --shell /usr/sbin/nologin timereal_build
  heim=$(mktemp -d /var/tmp/timereal-build.XXXXXXXX)
  chown timereal_build:timereal_build "$heim"
  chown -R timereal_build:timereal_build "$dir"
  # Ereigniskanal (3) und Betriebssperre (9) bleiben dem Bau verschlossen.
  runuser -u timereal_build -- env -i HOME="$heim" PATH=/opt/timereal-node/bin:/usr/bin:/bin \
    npm_config_cache="$heim/npm" bash -c 'cd -- "$1" && eval "$2"' bauen "$dir" "$befehl" 3>&- 9>&- || code=$?
  pkill -KILL -u timereal_build 2>/dev/null || true
  chown -R root:root "$dir"
  find "$heim" -mindepth 1 -delete
  rmdir "$heim"
  return "$code"
}
zugang_anzeigen() {
  local url
  # dienst.conf ist eine systemd-Umgebungsdatei, kein auszuführendes Shellskript.
  if url=$("$node" --input-type=commonjs -e '
    const fs=require("node:fs");
    try {
      const lines=fs.readFileSync("/etc/timereal/dienst.conf","utf8").split(/\r?\n/);
      let value;
      for(const line of lines) {
        const m=line.match(/^\s*PUBLIC_ORIGIN\s*=\s*(.*?)\s*$/);
        if(m) value=m[1];
      }
      if(!value) process.exit(1);
      if((value.startsWith("\"")&&value.endsWith("\""))||(value.startsWith("\x27")&&value.endsWith("\x27"))) value=value.slice(1,-1);
      if(/[\s\x00-\x1f\x7f]/.test(value)) process.exit(1);
      const u=new URL(value);
      if(!["https:","http:"].includes(u.protocol)||u.username||u.password||u.pathname!=="/"||u.search||u.hash) process.exit(1);
      process.stdout.write(`${u.protocol}//${u.hostname}:${u.port||(u.protocol==="https:"?"443":"80")}`);
    } catch { process.exit(1); }
  '); then
    printf 'Browser-Adresse: %s\n' "$url"
    echo 'Port 3040 ist nur intern erreichbar und keine Browser-Adresse.'
  else
    echo 'Hinweis: Browser-Adresse nicht ermittelbar. PUBLIC_ORIGIN in /etc/timereal/dienst.conf prüfen.' >&2
  fi
}
cleanup() {
  code=$?
  set +e
  trap - EXIT INT TERM
  if [[ $code != 0 ]]; then
    printf '\nUpdate abgebrochen: %s (Exitcode %s).\n' "$phase" "$code" >&2
    echo 'Beachte die Fehlermeldung darüber.' >&2
  fi
  if [[ $done != true && $stopped == true ]]; then
    echo 'Vorherigen Anwendungsstand wiederherstellen ...' >&2
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
      ereignis vorherige_version_aktiv
      echo 'Vorherige Anwendung ist im Container wieder erreichbar.' >&2
      zugang_anzeigen >&2
    else
      ereignis wiederherstellung_noetig
      echo 'Vorherige Anwendung startet nicht fehlerfrei. Dienstprotokoll prüfen.' >&2
    fi
    echo "Sicherung und Diagnose: $receipt. Kein automatisches Zurückspielen der Datenbank." >&2
    code=1
  elif [[ $code != 0 && $stopped != true ]]; then
    ereignis fehlgeschlagen
    echo 'Der Anwendungsdienst wurde durch dieses Update noch nicht angehalten.' >&2
  fi
  if [[ $code != 0 ]]; then
    echo 'Dienstprotokoll: journalctl -u timereal -u timereal-https -n 80 --no-pager' >&2
    if [[ -n $receipt ]]; then printf 'Migrationsprotokoll, falls angelegt: %s/migration.log\n' "$receipt" >&2; fi
  fi
  if [[ -n $stage ]]; then rm -rf "$stage"; fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '\nTimereal aktualisieren\n'
schritt 1 'Installation und Zielversion prüfen'
[[ $EUID == 0 && -d /run/systemd/system ]] || { echo 'Im Testcontainer als root ausführen.' >&2; exit 2; }
source /etc/os-release
[[ $ID == debian && $VERSION_ID == 13 ]] || { echo 'Debian 13 erforderlich.' >&2; exit 2; }
if [[ ${TIMEREAL_BETRIEB_LOCK:-} == 1 ]]; then
  [[ $(readlink /proc/$$/fd/9) == /run/lock/timereal-install.lock ]] || { echo 'Gemeinsame Betriebssperre fehlt.' >&2; exit 1; }
else
  exec 9>/run/lock/timereal-install.lock
fi
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
[[ -z $expected_sha || $sha == "$expected_sha" ]] || { echo 'Release-Tag wurde seit der Vorbereitung verändert.' >&2; exit 1; }
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
zugang_anzeigen
if [[ $check == true ]]; then
  echo 'Prüfung erfolgreich. Es wurden keine Dienste angehalten und keine Anwendungsdaten geändert.'
  printf 'Update starten: bash %q %q\n' "$0" "$tag"
  exit 0
fi
target="/opt/timereal-releases/${tag#v}-$sha"
if [[ $previous == "$target" ]]; then
  curl --connect-timeout 2 --max-time 3 -fsS http://127.0.0.1:3040/health >/dev/null
  echo 'Diese Version ist bereits aktiv. Kein Update erforderlich; Anwendung im Container geprüft.'; exit 0
fi
[[ $old_version != "${tag#v}" ]] || { echo 'Dieselbe Versionsnummer hat einen anderen Stand. Abbruch.' >&2; exit 1; }
[[ ! -e $target ]] || { echo "Releaseverzeichnis existiert bereits: $target. Vor einem neuen Versuch den fehlgeschlagenen Stand prüfen." >&2; exit 1; }
install -d -m 755 /opt/timereal-releases
ready="/opt/timereal-releases/.bereit-${tag#v}-$sha"
if [[ $prepared == true || ( $prepare == true && -e $ready ) ]]; then
  [[ -d $ready && ! -L $ready && -f $ready/.timereal-commit && $(cat "$ready/.timereal-commit") == "$sha" && -f $ready/dist/server.js ]] || {
    echo 'Der vorbereitete Anwendungsstand fehlt oder passt nicht zum Auftrag.' >&2; exit 1;
  }
  if [[ $prepare == true ]]; then
    ohne_root "$ready" 'node --test tests/version.test.mjs tests/update.test.mjs'
    echo "Bereits vorbereiteten Stand erneut geprüft: $tag ($sha). Die bisherige Anwendung läuft weiter."
    ereignis bereit
    exit 0
  fi
  stage=$ready
else
  [[ ! -e $ready ]] || { echo 'Ein vorbereiteter Stand existiert bereits. Diesen prüfen und gezielt installieren.' >&2; exit 1; }
  frei=$(df -Pk /opt/timereal-releases | awk 'NR==2 {print $4}')
  [[ $frei =~ ^[0-9]+$ && $frei -ge 524288 ]] || { echo 'Mindestens 512 MiB freier Platz für die Vorbereitung erforderlich.' >&2; exit 1; }
  stage=$(mktemp -d /opt/timereal-releases/.vorbereitung.XXXXXXXX)
  chmod 755 "$stage"
  schritt 2 'Neue Anwendung bauen und prüfen (bisherige Anwendung läuft weiter)'
  git -C "$repo" archive "$sha" | tar -x -C "$stage"
  ohne_root "$stage" 'npm ci --ignore-scripts --no-audit --no-fund && npm run build && node --test tests/version.test.mjs tests/update.test.mjs'
  printf '%s\n' "$sha" > "$stage/.timereal-commit"
fi
if [[ $prepare == true ]]; then
  sync -f "$stage"
  mv "$stage" "$ready"
  sync -f /opt/timereal-releases
  stage=''
  echo "Vorbereitung abgeschlossen: $tag ($sha). Die bisherige Anwendung läuft weiter."
  ereignis bereit
  exit 0
fi
install -d -m 700 /var/lib/timereal-updates
receipt=$(mktemp -d "/var/lib/timereal-updates/${tag#v}.XXXXXXXX")
cp /etc/systemd/system/timereal.service /etc/systemd/system/timereal-backup.service "$receipt/"
printf '%s\n' "vorher=$previous" "version=$old_version" "ziel=$target" "schema=$schema" > "$receipt/stand.txt"
schritt 3 'Anwendung kurz anhalten und Datenbanksicherung erstellen'
printf 'Sicherung: %s/before.dump\n' "$receipt"
stopped=true
systemctl stop timereal.service
# Der dauerhafte Schlüssel bleibt außerhalb des Releasebaums. Niemals bei vorhandenen Faktoren ersetzen.
bash "$stage/betrieb/mfa-schluessel.sh" anlegen
cp -p /etc/timereal/mfa.key "$receipt/mfa.key"
cp -a /etc/timereal "$receipt/konfiguration"
cp "$previous/release.json" "$receipt/release.json"
sync -f "$receipt/mfa.key"
# Shell öffnet die geschützte Datei; pg_dump läuft weiterhin als postgres.
runuser -u postgres -- pg_dump --format=custom timereal > "$receipt/before.dump"
runuser -u postgres -- pg_restore --list < "$receipt/before.dump" > "$receipt/inhalte.txt"
sync -f "$receipt/before.dump"
sync -f "$receipt"
schritt 4 'Datenbankschema aktualisieren (Anwendung bleibt angehalten)'
printf 'Migrationsprotokoll: %s/migration.log\n' "$receipt"
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -f "$stage/datenmodell/entwurf.sql" > "$receipt/migration.log" 2>&1
actual=$(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -Atqc 'SELECT max(version) FROM timereal_migration')
[[ $actual == "$schema_target" ]] || { echo 'Datenbankschema stimmt nach Migration nicht.' >&2; exit 1; }
schritt 5 'Neue Version aktivieren und Anwendungsdienst prüfen'
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
if [[ -f $target/betrieb/verwaltung-einrichten.sh ]]; then
  bash "$target/betrieb/verwaltung-einrichten.sh" "$target"
fi
done=true
printf '%s\n' 'Ergebnis: erfolgreich' >> "$receipt/stand.txt"
schritt 6 'Update abgeschlossen'
echo "Timereal ${tag#v} ist aktiv. Der Anwendungsdienst wurde im Container erfolgreich geprüft."
zugang_anzeigen
echo 'Nächster Schritt: Browser neu laden und gegebenenfalls die Erweiterung aktualisieren.'
printf 'Sicherung vor dem Update: %s/before.dump\n' "$receipt"
echo 'Falls die Browser-Adresse nicht lädt: HTTPS-Dienst und Freigabe des angezeigten Ports prüfen.'
