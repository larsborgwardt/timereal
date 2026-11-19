#!/usr/bin/env bash
# Einmalige Fehlerprobe im markierten Prüfgast nach Installation von Kandidat 0.6.1.
# Erwartet /root/update-candidate.sh; die künstlichen Tags bleiben ausschließlich im Prüfgast.
set -euo pipefail
[[ $EUID == 0 && -f /root/TIMEREAL_WEGWERFTEST ]]
work=$(mktemp -d /root/timereal-ausgabe-fehler.XXXXXXXX)
active=$(readlink -f /opt/timereal-current)
pid=$(systemctl show timereal.service -p MainPID --value)
export PATH=/opt/timereal-node/bin:$PATH
snapshot() {
  for table in konto kunde buchungsziel zeitabschnitt; do
    runuser -u postgres -- psql -X -d timereal -Atqc "SELECT md5(coalesce(string_agg(r::text, '' ORDER BY r::text),'')) FROM (SELECT to_jsonb(t) r FROM $table t) x;"
  done
}
snapshot > "$work/vorher"
for mode in build start; do
  if [[ $mode == build ]]; then version=998001.0.0; else version=998002.0.0; fi
  candidate="$work/$mode"
  mkdir "$candidate"
  git -C /opt/timereal archive v0.6.1 | tar -xf - -C "$candidate"
  (cd "$candidate" && node --input-type=commonjs - "$version" "$mode" <<'JS'
const fs=require('fs'); const [version,mode]=process.argv.slice(2);
for(const path of ['package.json','package-lock.json','release.json']) {
  const x=JSON.parse(fs.readFileSync(path));x.version=version;
  if(x.packages) x.packages[''].version=version;
  fs.writeFileSync(path,JSON.stringify(x,null,2));
}
fs.writeFileSync('tests/version.test.mjs',fs.readFileSync('tests/version.test.mjs','utf8').replace('version: "0.6.1"',`version: "${version}"`));
fs.appendFileSync('src/server.ts',mode==='build'?'\nDieser_Bezeichner_existiert_absichtlich_nicht;\n':'\nprocess.exit(71);\n');
JS
  git init -q && git add . && git -c user.name=Timereal-Test -c user.email=test@example.test commit -qm "Absichtlicher Fehler im isolierten Prüfstand" && git tag "v$version")
  git -C /opt/timereal fetch "$candidate" "tag" "v$version"
  if bash /root/update-candidate.sh "v$version" > "$work/$mode.log" 2>&1; then
    echo "Defekter Kandidat $mode wurde akzeptiert." >&2; exit 1
  fi
  if grep -Fq 'Update abgeschlossen' "$work/$mode.log"; then exit 1; fi
  grep -Fq 'Update abgebrochen:' "$work/$mode.log"
  grep -Fq 'journalctl -u timereal' "$work/$mode.log"
  if [[ $mode == build ]]; then
    grep -Fq 'Update abgebrochen: Neue Anwendung bauen und prüfen' "$work/$mode.log"
    grep -Fq 'noch nicht angehalten' "$work/$mode.log"
    [[ $(systemctl show timereal.service -p MainPID --value) == "$pid" ]]
  else
    grep -Fq 'Update abgebrochen: Neue Version aktivieren und Anwendungsdienst prüfen' "$work/$mode.log"
    grep -Fq 'Vorherige Anwendung ist im Container wieder erreichbar.' "$work/$mode.log"
    grep -Eq 'Browser-Adresse: https://[^ ]+:443' "$work/$mode.log"
    grep -Fq 'Kein automatisches Zurückspielen der Datenbank.' "$work/$mode.log"
  fi
  [[ $(readlink -f /opt/timereal-current) == "$active" ]]
  systemctl is-active --quiet timereal.service
  snapshot > "$work/nachher"
  cmp "$work/vorher" "$work/nachher"
done
printf 'Buildabbruch ohne Neustart, Startfehler mit Rückwechsel, Datenerhalt: bestanden. Logs: %s\n' "$work"
