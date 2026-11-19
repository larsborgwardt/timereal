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
git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf "$out/kandidat.tar"
tar -xf "$out/kandidat.tar" -C "$out/kandidat"
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
  git -C "$out/kandidat" tag "v$1"
}
version 0.7.0
docker run -d --name "$guest" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock --tmpfs /tmp "$base" /sbin/init >/dev/null
docker exec "$guest" test -f /root/TIMEREAL_WEGWERFTEST
docker cp "$out/kandidat" "$guest:/root/kandidat"
docker exec "$guest" bash -c 'set -e; chown -R root:root /root/kandidat; for n in {1..60}; do if systemctl is-active --quiet postgresql; then break; fi; sleep 1; done; git -C /opt/timereal fetch /root/kandidat refs/tags/v0.7.0:refs/tags/v0.7.0; bash /root/kandidat/betrieb/update.sh v0.7.0' >"$out/bootstrap.log" 2>&1
echo 'Bootstrap 0.6.2 → 0.7.0 bestanden.'
docker exec "$guest" bash /opt/timereal-current/tests/betrieb-native-bootstrap.sh /opt/timereal-current/betrieb/verwaltung-einrichten.sh >"$out/bootstrap-rueckbau.log" 2>&1
echo 'Fehlerhafter Betriebsdienst: Bootstrap stellt den bisherigen Dienst wieder her.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-domain.mjs >"$out/domain.log" 2>&1
echo 'Domainwechsel, neue Anmeldung und Bestätigung sowie Rückbau nach drei Minuten bestanden.'
version 0.7.1
# Ein baubarer, aber beim Start fehlerhafter Folgekandidat prüft den Rückbau.
printf '\nthrow new Error("Absichtlicher Startfehler im isolierten Prüfkandidaten");\n' >> "$out/kandidat/src/server.ts"
version 0.7.2
node --input-type=module - "$out/kandidat" <<'JS'
import fs from 'node:fs';import path from 'node:path';
const dir=process.argv[2],server=path.join(dir,'src/server.ts'),bootstrap=path.join(dir,'betrieb/verwaltung-einrichten.sh');
fs.writeFileSync(server,fs.readFileSync(server,'utf8').replace('\nthrow new Error("Absichtlicher Startfehler im isolierten Prüfkandidaten");\n',''));
const fault='\nif [[ ! -f /var/lib/timereal-betrieb/pruefabbruch ]]; then\n touch /var/lib/timereal-betrieb/pruefabbruch\n systemctl kill --kill-whom=all --signal=KILL timereal-betrieb.service\nfi\n';
fs.writeFileSync(bootstrap,fs.readFileSync(bootstrap,'utf8').replace('umask 022','umask 022'+fault));
JS
version 0.7.3
git clone -q --bare "$out/kandidat" "$out/mirror/timereal.git"
git -C "$out/mirror/timereal.git" update-server-info
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$out/mirror/key.pem" -out "$out/mirror/cert.pem" -subj '/CN=Timereal-Pruefung' -addext 'subjectAltName=DNS:github.com,DNS:api.github.com' >"$out/tls.log" 2>&1
chmod 600 "$out/mirror/key.pem"
cat >"$out/mirror/server.mjs" <<'JS'
import https from 'node:https';import fs from 'node:fs';import path from 'node:path';
https.createServer({key:fs.readFileSync('/mirror/key.pem'),cert:fs.readFileSync('/mirror/cert.pem')},(req,res)=>{
 const url=new URL(req.url,'https://github.com');
 if(url.pathname.startsWith('/repos/larsborgwardt/timereal/releases/')){
  const tag=url.pathname.endsWith('/latest')?'v0.7.1':url.pathname.split('/').pop();
  if(!['v0.7.1','v0.7.2','v0.7.3'].includes(tag)){res.writeHead(404);res.end();return;}
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
for n in {1..30}; do if curl --fail --silent --cacert /etc/timereal/pruef-ca.pem https://api.github.com/repos/larsborgwardt/timereal/releases/tags/v0.7.1 >/dev/null; then break; fi; sleep 1; done
BASH
before=$(docker exec "$guest" systemctl show timereal-betrieb -p MainPID --value)
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_TAG=v0.7.1 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/webupdate.log" 2>&1
for _ in {1..30}; do
  after=$(docker exec "$guest" systemctl show timereal-betrieb -p MainPID --value)
  if [[ $after != 0 && $before != "$after" ]]; then break; fi
  sleep 1
done
[[ $after != 0 && $before != "$after" ]]
docker exec "$guest" bash -c '[[ $(readlink -f /opt/timereal-betrieb-current) == /opt/timereal-betrieb/0.7.1-* ]]'
echo 'Webupdate 0.7.0 → 0.7.1 und eigenständiger Dienstneustart bestanden.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_TAG=v0.7.2 TIMEREAL_TEST_ERGEBNIS=vorherige_version_aktiv /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/rueckbau.log" 2>&1
echo 'Startfehler 0.7.2 → wieder erreichbare Version 0.7.1 bestanden.'
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 TIMEREAL_TEST_TAG=v0.7.3 /opt/timereal-node/bin/node /opt/timereal-current/tests/betrieb-native-update.mjs >"$out/wiederanlauf.log" 2>&1
for _ in {1..30}; do
  current=$(docker exec "$guest" readlink -f /opt/timereal-betrieb-current)
  if [[ $current == /opt/timereal-betrieb/0.7.3-* ]]; then break; fi
  sleep 1
done
[[ $current == /opt/timereal-betrieb/0.7.3-* ]] || { echo 'FEHLER: Anwendung meldet Erfolg, der abgebrochene Betriebsdienstwechsel wurde aber nicht nachgeholt.' >&2; exit 1; }
echo 'SIGKILL während des Dienstwechsels: Anwendung und eigener Betriebsdienst wiederhergestellt.'
docker exec "$guest" bash -c 'curl --fail --silent --unix-socket /run/timereal-betrieb/dienst.sock -H "Content-Type: application/json" -d "{\"aktion\":\"status\"}" http://localhost/' >"$out/status.json"
