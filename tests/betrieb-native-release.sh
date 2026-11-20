#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Nur eigene Wegwerf-Container. Basis ist ein lokal gesichertes 0.6.2-Testsystem,
# keine Benutzerinstallation. GitHub-Metadaten und Repository sind Testfixtures;
# TLS, Git, systemd, PostgreSQL und die Timereal-Betriebsschritte laufen real.
base=timereal-070-basis:local
docker image inspect "$base" >/dev/null
out=$(mktemp -d /tmp/timereal-betrieb-release.XXXXXXXX)
guest="timereal-betriebsprobe-$$"
mirror="timereal-releasemirror-$$"
cleanup(){ local code=$?; trap - EXIT; docker rm -f "$guest" "$mirror" >/dev/null 2>&1 || true; printf 'Prüfbelege: %s\n' "$out"; exit "$code"; }
trap cleanup EXIT
mkdir "$out/kandidat" "$out/mirror"
# Eigener Prüfschlüssel: Kandidaten ab 0.9.0 vertrauen nur diesem Schlüssel.
ssh-keygen -q -t ed25519 -N "" -C timereal-pruefung -f "$out/signatur"
git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf "$out/kandidat.tar"
git archive v0.8.2 | tar -x -C "$out/kandidat"
git -C "$out/kandidat" init -q
version(){
  node --input-type=module - "$out/kandidat" "$1" <<'JS'
import fs from 'node:fs';import path from 'node:path';
const [dir,version]=process.argv.slice(2);
for(const name of ['package.json','package-lock.json','release.json']){
 const p=path.join(dir,name),d=JSON.parse(fs.readFileSync(p));d.version=version;
 if(d.packages)d.packages[''].version=version;
 fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
}
const p=path.join(dir,'tests/version.test.mjs');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/version: "[0-9.]+"/,'version: "'+version+'"'));
JS
  git -C "$out/kandidat" add .
  git -C "$out/kandidat" -c user.name=Timereal-Pruefung -c user.email=probe@example.org commit -qm "Privater Prüfkandidat $1"
  if [[ ${2:-} == unsigniert ]]; then
    git -C "$out/kandidat" tag "v$1"
  else
    git -C "$out/kandidat" -c user.name=Timereal-Pruefung -c user.email=probe@example.org \
      -c gpg.format=ssh -c user.signingkey="$out/signatur" tag -s -m "Prüfrelease v$1" "v$1"
  fi
}
version 0.8.2
docker run -d --name "$guest" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock --tmpfs /tmp "$base" /sbin/init >/dev/null
docker exec "$guest" test -f /root/TIMEREAL_WEGWERFTEST
docker cp "$out/kandidat" "$guest:/root/kandidat"
docker exec "$guest" bash -c 'set -e; chown -R root:root /root/kandidat; for n in {1..60}; do if systemctl is-active --quiet postgresql; then break; fi; sleep 1; done; git -C /opt/timereal fetch /root/kandidat refs/tags/v0.8.2:refs/tags/v0.8.2; bash /root/kandidat/betrieb/update.sh v0.8.2' >"$out/bootstrap.log" 2>&1
echo 'Bootstrap 0.6.2 → 0.8.2 bestanden.'
if [[ ${TIMEREAL_NUR_MFA:-0} != 1 ]]; then
docker exec "$guest" bash /opt/timereal-current/tests/betrieb-native-bootstrap.sh /opt/timereal-current/betrieb/verwaltung-einrichten.sh >"$out/bootstrap-rueckbau.log" 2>&1
echo 'Fehlerhafter Betriebsdienst: Bootstrap stellt den bisherigen Dienst wieder her.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-domain.mjs >"$out/domain.log" 2>&1
echo 'Domainwechsel, neue Anmeldung und Bestätigung sowie Rückbau nach drei Minuten bestanden.'
fi
git -C "$out/kandidat" rm -qrf .
tar -xf "$out/kandidat.tar" -C "$out/kandidat"
printf 'timereal-release namespaces="git" %s\n' "$(cat "$out/signatur.pub")" > "$out/kandidat/betrieb/release-signierer"
# Läuft beim Bau jedes Kandidaten mit: unter root schlägt der Bau fehl.
printf '\ntest("Prüfkandidat wird nicht als root gebaut", () => {\n  if (process.getuid() === 0) throw new Error("Bau läuft als root");\n});\n' >> "$out/kandidat/tests/version.test.mjs"
version 0.9.0
# Ein baubarer, aber beim Start fehlerhafter Folgekandidat prüft den Rückbau.
printf '\nthrow new Error("Absichtlicher Startfehler im isolierten Prüfkandidaten");\n' >> "$out/kandidat/src/server.ts"
version 0.9.1
node --input-type=module - "$out/kandidat" <<'JS'
import fs from 'node:fs';import path from 'node:path';
const dir=process.argv[2],server=path.join(dir,'src/server.ts'),bootstrap=path.join(dir,'betrieb/verwaltung-einrichten.sh');
fs.writeFileSync(server,fs.readFileSync(server,'utf8').replace('\nthrow new Error("Absichtlicher Startfehler im isolierten Prüfkandidaten");\n',''));
const fault='\nif [[ ! -f /var/lib/timereal-betrieb/pruefabbruch ]]; then\n touch /var/lib/timereal-betrieb/pruefabbruch\n systemctl kill --kill-whom=all --signal=KILL timereal-betrieb.service\nfi\n';
fs.writeFileSync(bootstrap,fs.readFileSync(bootstrap,'utf8').replace('umask 022','umask 022'+fault));
JS
version 0.9.2
tar -xOf "$out/kandidat.tar" betrieb/verwaltung-einrichten.sh > "$out/kandidat/betrieb/verwaltung-einrichten.sh"
version 0.9.3
# Ein stabiles Release ohne Signatur darf nicht installiert werden.
version 0.9.4 unsigniert
git clone -q --bare "$out/kandidat" "$out/mirror/timereal.git"
git -C "$out/mirror/timereal.git" update-server-info
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$out/mirror/key.pem" -out "$out/mirror/cert.pem" -subj '/CN=Timereal-Pruefung' -addext 'subjectAltName=DNS:github.com,DNS:api.github.com' >"$out/tls.log" 2>&1
chmod 600 "$out/mirror/key.pem"
cat >"$out/mirror/server.mjs" <<'JS'
import https from 'node:https';import fs from 'node:fs';import path from 'node:path';
https.createServer({key:fs.readFileSync('/mirror/key.pem'),cert:fs.readFileSync('/mirror/cert.pem')},(req,res)=>{
 const url=new URL(req.url,'https://github.com');
 if(url.pathname.startsWith('/repos/larsborgwardt/timereal/releases/')){
  const tag=url.pathname.endsWith('/latest')?'v0.9.0':url.pathname.split('/').pop();
  if(!['v0.9.0','v0.9.1','v0.9.2','v0.9.3','v0.9.4'].includes(tag)){res.writeHead(404);res.end();return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({tag_name:tag,draft:false,prerelease:false,html_url:`https://github.com/larsborgwardt/timereal/releases/tag/${tag}`}));return;
 }
 const prefix='/larsborgwardt/timereal.git/';
 if(!url.pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 const file=path.resolve('/mirror/timereal.git',url.pathname.slice(prefix.length));
 if(!file.startsWith('/mirror/timereal.git/')){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();}else{res.setHeader('content-type','application/octet-stream');res.end(data);}});
}).listen(443,'0.0.0.0');
JS
docker run -d --name "$mirror" -v "$out/mirror:/mirror:ro" node:24-bookworm-slim node /mirror/server.mjs >/dev/null
ip=$(docker inspect "$mirror" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
docker cp "$out/mirror/cert.pem" "$guest:/etc/timereal/pruef-ca.pem"
docker exec -i "$guest" bash -s -- "$ip" <<'BASH'
set -euo pipefail
test -f /root/TIMEREAL_WEGWERFTEST
printf '%s github.com api.github.com\n' "$1" >> /etc/hosts
mkdir -p /etc/systemd/system/timereal-betrieb.service.d
printf '[Service]\nEnvironment=NODE_EXTRA_CA_CERTS=/etc/timereal/pruef-ca.pem\nEnvironment=GIT_SSL_CAINFO=/etc/timereal/pruef-ca.pem\n' > /etc/systemd/system/timereal-betrieb.service.d/pruefung.conf
systemctl daemon-reload
systemctl restart timereal-betrieb
for n in {1..30}; do if curl --fail --silent --cacert /etc/timereal/pruef-ca.pem https://api.github.com/repos/larsborgwardt/timereal/releases/tags/v0.9.0 >/dev/null; then break; fi; sleep 1; done
BASH
before=$(docker exec "$guest" systemctl show timereal-betrieb -p MainPID --value)
docker exec -i "$guest" bash -c 'cat > /opt/timereal-current/tests/betrieb-native-update.mjs' < tests/betrieb-native-update.mjs
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_TAG=v0.9.0 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/webupdate.log" 2>&1
for _ in {1..30}; do
  after=$(docker exec "$guest" systemctl show timereal-betrieb -p MainPID --value)
  if [[ $after != 0 && $before != "$after" ]]; then break; fi
  sleep 1
done
[[ $after != 0 && $before != "$after" ]]
docker exec "$guest" bash -c '[[ $(readlink -f /opt/timereal-betrieb-current) == /opt/timereal-betrieb/0.9.0-* ]]'
echo 'Webupdate 0.8.2 → 0.9.0 und eigenständiger Dienstneustart bestanden.'
docker exec "$guest" /opt/timereal-node/bin/node /opt/timereal-current/tests/mfa-native.mjs >"$out/mfa-restore.log" 2>&1
echo 'MFA-Schlüssel und echte Rücksicherung bestanden.'
if [[ ${TIMEREAL_NUR_MFA:-0} == 1 ]]; then exit 0; fi
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_EINKLICK=1 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-domain.mjs >"$out/domain-einklick.log" 2>&1
echo "Domain in einem Auftrag gespeichert; Zugriff über Domain und lokale Adresse ohne Frist geprüft."
docker exec "$guest" bash /opt/timereal-current/tests/betrieb-proxy.sh /opt/timereal-betrieb-current/proxy-einrichten.sh >"$out/proxy-vorlage.log" 2>&1
# Die Probe stellt ihre Ausgangskonfiguration mit einem Dienstneustart wieder her.
docker exec "$guest" bash -c 'for _ in {1..30}; do if curl --fail --silent --max-time 3 http://127.0.0.1:3040/health >/dev/null; then exit 0; fi; sleep 1; done; exit 1'
echo 'Proxy-Skript am Kandidaten: Fehlerantwort für fremde Hostnamen, kein HTTP/3, lokale Anmeldung neben der Domain bestanden.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_EINKLICK=1 TIMEREAL_TEST_TAG=v0.9.1 TIMEREAL_TEST_ERGEBNIS=vorherige_version_aktiv /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/rueckbau.log" 2>&1
echo 'Startfehler 0.9.1 → wieder erreichbare Version 0.9.0 bestanden.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_EINKLICK=1 TIMEREAL_TEST_TAG=v0.9.2 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/wiederanlauf.log" 2>&1
for _ in {1..30}; do
  current=$(docker exec "$guest" readlink -f /opt/timereal-betrieb-current)
  if [[ $current == /opt/timereal-betrieb/0.9.2-* ]]; then break; fi
  sleep 1
done
[[ $current == /opt/timereal-betrieb/0.9.2-* ]] || { echo 'FEHLER: Anwendung meldet Erfolg, der abgebrochene Betriebsdienstwechsel wurde aber nicht nachgeholt.' >&2; exit 1; }
echo 'SIGKILL während des Dienstwechsels: Anwendung und eigener Betriebsdienst wiederhergestellt.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_EINKLICK=1 TIMEREAL_TEST_TAG=v0.9.4 TIMEREAL_TEST_ERGEBNIS=fehlgeschlagen TIMEREAL_TEST_VERSION=0.9.2 TIMEREAL_TEST_MELDUNG='nicht signiert' /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/unsigniert.log" 2>&1
echo 'Unsigniertes Release v0.9.4 abgewiesen; installierte Version 0.9.2 unverändert.'
docker exec "$guest" env TIMEREAL_WEGWERFTEST=1 TIMEREAL_LOG_ABSCHLUSS=1 /opt/timereal-node/bin/node /opt/timereal-current/tests/systemkonsole-native.mjs >"$out/systemkonsole.log" 2>&1
echo 'Systemkonsole mit echtem journald, Dienstquellen und realen Updateabschlüssen bestanden.'
docker exec "$guest" bash -c 'for _ in {1..30}; do if curl --fail --silent --max-time 3 --unix-socket /run/timereal-betrieb/dienst.sock -H "Content-Type: application/json" -d "{\"aktion\":\"status\"}" http://localhost/; then exit 0; fi; sleep 1; done; exit 1' >"$out/status.json"
docker exec "$guest" env TIMEREAL_WEGWERFTEST=1 bash /opt/timereal-current/tests/betrieb-native-fehler.sh v0.9.3 >"$out/fehlerfaelle.log" 2>&1
echo 'Speicherknappheit, echter Sicherungsfehler und nicht startbarer Vorgänger bestanden.'
