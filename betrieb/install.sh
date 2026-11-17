#!/usr/bin/env bash
set -euo pipefail
umask 022
cd /opt/timereal
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
caddy_vorhanden=false
if systemctl cat caddy.service >/dev/null 2>&1; then caddy_vorhanden=true; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils postgresql postgresql-contrib caddy
if [[ $caddy_vorhanden == false ]]; then systemctl disable --now caddy.service; fi
case "$(dpkg --print-architecture)" in
  amd64) arch=x64; sum=4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb;;
  arm64) arch=arm64; sum=6e51a2ada00f0011cc266f65d98922b403d7ad88f809ca2aa615a5fe1ce6e86c;;
  *) echo 'Unterstützt werden amd64 und arm64.' >&2; exit 2;;
esac
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT
if [[ ! -x /opt/timereal-node/bin/node || $(/opt/timereal-node/bin/node -v) != v24.22.3 ]]; then
  curl --fail --silent --show-error --location "https://nodejs.org/dist/v24.22.3/node-v24.22.3-linux-$arch.tar.xz" -o "$temp/node.tar.xz"
  (cd "$temp" && echo "$sum  node.tar.xz" | sha256sum --check)
  mkdir -p /opt/timereal-node
  tar -xJf "$temp/node.tar.xz" --strip-components=1 -C /opt/timereal-node
fi
export PATH=/opt/timereal-node/bin:$PATH
npm ci --ignore-scripts --no-audit --no-fund
npm run build
getent passwd timereal_app >/dev/null || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin timereal_app
getent passwd timereal_proxy >/dev/null || useradd --system --user-group --no-create-home --shell /usr/sbin/nologin timereal_proxy
systemctl start postgresql
sql=(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1)
if [[ $("${sql[@]}" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='timereal'") != 1 ]]; then
  runuser -u postgres -- createdb timereal
fi
"${sql[@]}" -d timereal -f /opt/timereal/datenmodell/entwurf.sql
runuser -u timereal_app -- psql -X -d timereal -Atqc 'select current_user'
install -d -m 755 /etc/timereal
printf 'PUBLIC_ORIGIN=https://%s\n' "$adresse" > /etc/timereal/dienst.conf
cat > /etc/timereal/Caddyfile <<EOF
{
  admin off
  auto_https disable_redirects
  default_sni $adresse
  skip_install_trust
}
https://$adresse {
  tls internal
  reverse_proxy 127.0.0.1:3040
}
EOF
/usr/bin/caddy validate --config /etc/timereal/Caddyfile --adapter caddyfile
install -m 644 betrieb/*.service betrieb/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable timereal.service timereal-https.service
systemctl enable --now timereal-backup.timer
systemctl reset-failed timereal.service timereal-https.service
systemctl restart timereal.service timereal-https.service
ca=/var/lib/timereal-https/caddy/pki/authorities/local/root.crt
for _ in $(seq 1 30); do
  if [[ -s $ca ]] && curl -fsS --cacert "$ca" --resolve "$adresse:443:127.0.0.1" "https://$adresse/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --cacert "$ca" --resolve "$adresse:443:127.0.0.1" "https://$adresse/health"
install -m 644 "$ca" /root/timereal-test-ca.crt
if [[ $("${sql[@]}" -d timereal -Atqc 'select count(*) from konto') == 0 ]]; then
  read -r -p 'Anmeldename für dein Testkonto: ' login </dev/tty
  IFS= read -rs -p 'Passwort (mindestens 12 Zeichen): ' pass </dev/tty; echo
  printf '%s' "$pass" | runuser -u postgres -- env PGDATABASE=timereal /opt/timereal-node/bin/node dist/konto-cli.js anlegen "$login"
  unset pass
fi
echo "Timereal ist unter https://$adresse erreichbar."
echo 'Vertraue auf deinen Testgeräten der öffentlichen Test-CA aus /root/timereal-test-ca.crt.'
