#!/usr/bin/env bash
set -euo pipefail
umask 022
if [[ ${1:-} == --help && $# == 1 ]]; then
  echo 'Aufruf: bash /opt/timereal/betrieb/install.sh'
  echo 'Erstinstallation als root im gestarteten Debian-13-Testcontainer.'
  echo 'Optional: TIMEREAL_HOST auf den DNS-Namen oder die IPv4-Adresse setzen.'
  echo 'Browserzugang: HTTPS auf Port 443. Port 3040 ist nur intern erreichbar.'
  echo 'Bestehende versionierte Installationen mit betrieb/update.sh aktualisieren.'
  exit 0
fi
[[ $# == 0 ]] || { echo 'Aufruf: install.sh [--help]' >&2; exit 2; }
phase='Voraussetzungen prüfen'
temp=''
cleanup() {
  code=$?
  set +e
  trap - EXIT INT TERM
  if [[ $code != 0 ]]; then
    printf '\nInstallation abgebrochen: %s (Exitcode %s).\n' "$phase" "$code" >&2
    echo 'Die Installation wurde nicht vollständig abgeschlossen. Beachte die Fehlermeldung darüber.' >&2
    echo 'Dienstprotokoll: journalctl -u timereal -u timereal-https -n 80 --no-pager' >&2
  fi
  if [[ -n $temp ]]; then rm -rf "$temp"; fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
schritt() { phase=$2; printf '\n[%s/8] %s\n' "$1" "$phase"; }
printf '\nTimereal installieren\n'
schritt 1 'Voraussetzungen und Browser-Adresse prüfen'
cd /opt/timereal
if [[ -L /opt/timereal-current && $(readlink -f /opt/timereal-current) != /opt/timereal ]]; then
  echo 'Ein versionierter Stand ist aktiv. Zum Aktualisieren betrieb/update.sh verwenden.' >&2; exit 2;
fi
source /etc/os-release
[[ $EUID == 0 && $ID == debian && $VERSION_ID == 13 && -d /run/systemd/system ]] || {
  echo 'Als root im gestarteten Debian-13-Testcontainer ausführen.' >&2; exit 2;
}
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Installation läuft bereits.' >&2; exit 1; }
adresse=${TIMEREAL_HOST:-$(hostname -I | awk '{print $1}')}
[[ $adresse =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || {
  echo 'Bitte TIMEREAL_HOST auf den DNS-Namen oder die IPv4-Adresse des Containers setzen.' >&2; exit 2;
}
printf 'Geplante Browser-Adresse: https://%s:443\n' "$adresse"
echo 'HTTPS: Port 443 (TCP). Port 3040 ist nur für den internen Anwendungsdienst.'
caddy_vorhanden=false
if systemctl cat caddy.service >/dev/null 2>&1; then caddy_vorhanden=true; fi
export DEBIAN_FRONTEND=noninteractive
schritt 2 'Systempakete installieren'
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils postgresql postgresql-contrib caddy
if [[ $caddy_vorhanden == false ]]; then systemctl disable --now caddy.service; fi
case "$(dpkg --print-architecture)" in
  amd64) arch=x64; sum=4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb;;
  arm64) arch=arm64; sum=6e51a2ada00f0011cc266f65d98922b403d7ad88f809ca2aa615a5fe1ce6e86c;;
  *) echo 'Unterstützt werden amd64 und arm64.' >&2; exit 2;;
esac
temp=$(mktemp -d)
schritt 3 'Node.js prüfen und Anwendung bauen'
if [[ ! -x /opt/timereal-node/bin/node || $(/opt/timereal-node/bin/node -v) != v24.22.3 ]]; then
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v24.22.3/node-v24.22.3-linux-$arch.tar.xz" -o "$temp/node.tar.xz"
  (cd "$temp" && echo "$sum  node.tar.xz" | sha256sum --check)
  mkdir -p /opt/timereal-node
  tar -xJf "$temp/node.tar.xz" --strip-components=1 -C /opt/timereal-node
fi
export PATH=/opt/timereal-node/bin:$PATH
npm ci --ignore-scripts --no-audit --no-fund
npm run build
version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json")).version')
ln -sfn /opt/timereal /opt/timereal-current
schritt 4 'Dienstkonten und Datenbank einrichten'
getent passwd timereal_app >/dev/null || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin timereal_app
getent passwd timereal_proxy >/dev/null || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin timereal_proxy
systemctl start postgresql
sql=(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1)
if [[ $("${sql[@]}" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='timereal'") != 1 ]]; then
  runuser -u postgres -- createdb timereal
fi
"${sql[@]}" -d timereal -f /opt/timereal/datenmodell/entwurf.sql
runuser -u timereal_app -- psql -X -d timereal -Atqc 'select current_user'
schritt 5 'HTTPS und tägliche Sicherung einrichten'
install -d -m 755 /etc/timereal
bash /opt/timereal/betrieb/mfa-schluessel.sh anlegen
printf 'PUBLIC_ORIGIN=https://%s\n' "$adresse" > /etc/timereal/dienst.conf
# Dieselbe Vorlage wie im Betriebsdienst: lokaler Zugang, Fehlerantwort für fremde Hostnamen.
/opt/timereal-node/bin/node --input-type=module -e 'import { caddyVorlage } from "/opt/timereal/betrieb/verwaltung/caddy-vorlage.mjs"; process.stdout.write(caddyVorlage(process.argv[1]));' "$adresse" > /etc/timereal/Caddyfile
/usr/bin/caddy validate --config /etc/timereal/Caddyfile --adapter caddyfile
install -m 644 betrieb/*.service betrieb/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable timereal.service timereal-https.service
systemctl enable --now timereal-backup.timer
systemctl reset-failed timereal.service timereal-https.service
schritt 6 'Dienste starten und HTTPS im Container prüfen'
systemctl restart timereal.service timereal-https.service
bash /opt/timereal/betrieb/verwaltung-einrichten.sh /opt/timereal
ca=/var/lib/timereal-https/caddy/pki/authorities/local/root.crt
for _ in $(seq 1 30); do
  if [[ -s $ca ]] && curl --connect-timeout 2 --max-time 3 -fsS --cacert "$ca" --resolve "$adresse:443:127.0.0.1" "https://$adresse/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl --connect-timeout 2 --max-time 3 -fsS --cacert "$ca" --resolve "$adresse:443:127.0.0.1" "https://$adresse/health" >/dev/null
install -m 644 "$ca" /root/timereal-test-ca.crt
schritt 7 'Erstes Administratorkonto prüfen'
if [[ $("${sql[@]}" -d timereal -Atqc 'select count(*) from konto') == 0 ]]; then
  read -r -p 'Anmeldename für dein Testkonto: ' login </dev/tty
  IFS= read -rs -p 'Passwort (mindestens 12 Zeichen): ' pass </dev/tty; echo
  printf '%s' "$pass" | runuser -u postgres -- env PGDATABASE=timereal /opt/timereal-node/bin/node dist/konto-cli.js anlegen "$login"
  unset pass
else
  echo 'Ein Konto ist bereits vorhanden; vorhandene Anmeldedaten verwenden.'
fi
schritt 8 'Installation abgeschlossen'
printf 'Timereal %s ist installiert. HTTPS wurde im Container erfolgreich geprüft.\n' "$version"
printf 'Browser-Adresse: https://%s:443\n' "$adresse"
echo 'HTTPS: Port 443 (TCP). Port 3040 ist nur intern erreichbar und keine Browser-Adresse.'
echo 'Vertraue auf deinen Testgeräten der öffentlichen Test-CA aus /root/timereal-test-ca.crt.'
echo 'Nächster Schritt: Adresse auf Laptop oder Smartphone öffnen und anmelden.'
echo 'Falls die Seite dort nicht lädt: Container-IP und Freigabe von TCP-Port 443 prüfen.'
echo 'Tägliche Sicherungen: /var/lib/timereal-backups'
