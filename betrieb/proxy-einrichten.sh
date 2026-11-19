#!/usr/bin/env bash
# Proxy-Patch 2: vorhandenes HTTPS im Testnetz hinter externem Nginx verwenden.
set -Eeuo pipefail
umask 077
usage() {
  echo 'Timereal Proxy-Patch 2'
  echo 'Prüfung: proxy-einrichten.sh --check DOMAIN CONTAINER_IP'
  echo 'Anwenden: proxy-einrichten.sh DOMAIN CONTAINER_IP'
  echo 'DOMAIN ist die öffentliche HTTPS-Domain; CONTAINER_IP die bisherige lokale IPv4-Adresse.'
  echo 'Voraussetzung: Timereal-Standardinstallation mit interner Test-CA und externem HTTPS-Proxy.'
}
if [[ ${1:-} == --help && $# == 1 ]]; then usage; exit 0; fi
check=false
if [[ ${1:-} == --check ]]; then check=true; shift; fi
[[ $# == 2 ]] || { usage >&2; exit 2; }
domain=$1
adresse=$2
if [[ ${#domain} -gt 253 || ! $domain =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9]([a-z0-9-]{0,57}[a-z0-9])?)$ ]]; then
  echo 'Domain als kleingeschriebenen DNS-Namen ohne Protokoll, Port oder Pfad angeben (IDN als Punycode).' >&2; exit 2
fi
if [[ ! $adresse =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo 'Container-IP als IPv4-Adresse ohne Port angeben.' >&2; exit 2
fi
IFS=. read -r -a teile <<<"$adresse"
for teil in "${teile[@]}"; do
  if (( 10#$teil > 255 )) || [[ ${#teil} -gt 1 && $teil == 0* ]]; then
    echo 'Ungültige IPv4-Adresse.' >&2; exit 2
  fi
done
[[ $EUID == 0 ]] || { echo 'Als root im Timereal-LXC ausführen.' >&2; exit 1; }
for datei in /etc/timereal/Caddyfile /etc/timereal/dienst.conf; do
  [[ -f $datei && ! -L $datei ]] || { echo "Konfiguration fehlt oder ist verlinkt: $datei" >&2; exit 1; }
done
node=/opt/timereal-node/bin/node
ca=/var/lib/timereal-https/caddy/pki/authorities/local/root.crt
[[ -x $node && -f $ca ]] || { echo 'Timereal-Laufzeit oder interne Test-CA fehlt.' >&2; exit 1; }
exec 9>/run/lock/timereal-install.lock
flock -n 9 || { echo 'Eine Einrichtung oder Aktualisierung läuft.' >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$work/"
cp -p "$work/Caddyfile" "$work/Caddyfile.vorher"
cp -p "$work/dienst.conf" "$work/dienst.conf.vorher"
echo '[1/4] Bestehende Konfiguration und gewünschten Host prüfen'
"$node" --input-type=commonjs - "$work" "$domain" "$adresse" <<'JS'
const fs = require('node:fs');
const [dir, domain, ip] = process.argv.slice(2);
const old = fs.readFileSync(`${dir}/Caddyfile`, 'utf8');
const env = fs.readFileSync(`${dir}/dienst.conf`, 'utf8');
const compact = text => text.replace(/\s+/g, '');
const template = host => `{
  admin off
  auto_https disable_redirects
  default_sni ${ip}
  skip_install_trust
}
https://${ip}${host ? `, https://${host}` : ''} {
  tls internal
  reverse_proxy 127.0.0.1:3040
}
`;
// Absichtliche Erlaubnisliste der Installer-Vorlage, kein allgemeiner Caddyfile-Parser.
const hosts = [...old.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map(m => m[1]);
const prior = hosts.length === 2 && hosts[0] === ip ? hosts[1] : '';
if (compact(old) !== compact(template(prior))) {
  console.error('Caddy-Konfiguration weicht von der Timereal-Standardinstallation ab. Keine Änderung.');
  process.exit(1);
}
const origins = env.split(/\r?\n/).filter(line => /^\s*PUBLIC_ORIGIN\s*=/.test(line));
if (origins.length !== 1 || ![`PUBLIC_ORIGIN=https://${ip}`, `PUBLIC_ORIGIN=https://${prior}`].includes(origins[0])) {
  console.error('PUBLIC_ORIGIN passt nicht eindeutig zur vorhandenen HTTPS-Konfiguration. Keine Änderung.');
  process.exit(1);
}
fs.writeFileSync(`${dir}/alter-host`, origins[0].slice('PUBLIC_ORIGIN=https://'.length));
fs.writeFileSync(`${dir}/Caddyfile`, template(domain));
fs.writeFileSync(`${dir}/dienst.conf`, env.replace(/^PUBLIC_ORIGIN=.*$/m, `PUBLIC_ORIGIN=https://${domain}`));
JS
old_host=$(cat "$work/alter-host")
health() {
  local host=$1 body
  body=$(curl --noproxy '*' -fsS --max-time 3 --cacert "$ca" --resolve "$host:443:127.0.0.1" "https://$host/health") || return 1
  [[ $body == '{"status":"ok"}' ]]
}
health "$old_host" >/dev/null || { echo 'Bisheriger HTTPS-Zugang ist nicht gesund. Keine Änderung.' >&2; exit 1; }
if ! caddy validate --config "$work/Caddyfile" --adapter caddyfile >"$work/caddy-pruefung.log" 2>&1; then
  cat "$work/caddy-pruefung.log" >&2
  exit 1
fi
echo 'Caddy-Konfiguration gültig.'
echo "Öffentliche Adresse: https://$domain:443"
echo "Proxy-Ziel: https://$adresse:443; Host-Header: $domain"
if [[ $check == true ]]; then
  echo 'Prüfung erfolgreich. Konfiguration und Dienste unverändert.'
  printf 'Anwenden: bash %q %q %q\n' "$0" "$domain" "$adresse"
  exit 0
fi
if cmp -s "$work/Caddyfile" "$work/Caddyfile.vorher" && cmp -s "$work/dienst.conf" "$work/dienst.conf.vorher"; then
  echo 'Domain bereits eingerichtet und bisheriger HTTPS-Zugang gesund. Kein Neustart nötig.'
  exit 0
fi
echo '[2/4] Konfiguration sichern'
install -d -m 700 /var/lib/timereal-proxy-wechsel
backup=$(mktemp -d /var/lib/timereal-proxy-wechsel/vorher.XXXXXXXX)
cp -p "$work/Caddyfile.vorher" "$backup/Caddyfile"
cp -p "$work/dienst.conf.vorher" "$backup/dienst.conf"
# Auch manuelle Änderungen zwischen Vorprüfung und Schreibbeginn bemerken.
if ! cmp -s /etc/timereal/Caddyfile "$backup/Caddyfile" || ! cmp -s /etc/timereal/dienst.conf "$backup/dienst.conf"; then
  echo 'Konfiguration wurde während der Prüfung geändert. Abbruch ohne Umschaltung.' >&2; exit 1;
fi
dienste_neu_starten() {
  # Geplante Konfigurationswechsel dürfen nicht an vorherigen Starts hängen bleiben.
  # Ein weiterhin defekter Dienst scheitert danach an Neustart oder HTTPS-Prüfung.
  systemctl reset-failed timereal.service timereal-https.service &&
    systemctl restart timereal.service timereal-https.service
}
rollback() {
  local code=$1 ok=false
  trap - ERR INT TERM
  set +e
  if cp -p "$backup/Caddyfile" /etc/timereal/Caddyfile && cp -p "$backup/dienst.conf" /etc/timereal/dienst.conf && dienste_neu_starten; then
    for _ in {1..20}; do
      if cmp -s "$backup/Caddyfile" /etc/timereal/Caddyfile && cmp -s "$backup/dienst.conf" /etc/timereal/dienst.conf && health "$old_host" >/dev/null 2>&1; then ok=true; break; fi
      sleep 1
    done
  fi
  echo "Proxy-Patch fehlgeschlagen (Exit $code). Sicherung: $backup" >&2
  if [[ $ok == true ]]; then echo 'Vorheriger Zugang wieder erreichbar.' >&2
  else echo 'Wiederherstellung nicht bestätigt. Prüfen: journalctl -u timereal -u timereal-https -n 80 --no-pager' >&2; fi
  exit 1
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
echo '[3/4] Domain übernehmen und Dienste kurz neu starten'
cp -p "$work/Caddyfile" /etc/timereal/Caddyfile.proxy-next
cp -p "$work/dienst.conf" /etc/timereal/dienst.conf.proxy-next
mv /etc/timereal/Caddyfile.proxy-next /etc/timereal/Caddyfile
mv /etc/timereal/dienst.conf.proxy-next /etc/timereal/dienst.conf
dienste_neu_starten
echo '[4/4] HTTPS mit öffentlichem Hostnamen und lokalem IP-Zugang prüfen'
ok=false
for _ in {1..20}; do
  if health "$domain" >/dev/null 2>&1 && health "$adresse" >/dev/null 2>&1; then ok=true; break; fi
  sleep 1
done
[[ $ok == true ]]
curl --noproxy '*' -fsS --max-time 5 --cacert "$ca" --resolve "$adresse:443:127.0.0.1" \
  -H "Host: $domain" "https://$adresse/" >"$work/startseite.html"
grep -qi '<html' "$work/startseite.html"
trap - ERR INT TERM
echo "Proxy-Patch erfolgreich. Browser-Adresse: https://$domain:443"
echo "Sicherung: $backup"
echo 'Ab jetzt über die öffentliche Domain anmelden; die lokale IP bleibt für HTTPS-Diagnosen erreichbar.'
echo 'Die Prüfung erfolgte im Container. Externen Nginx-Zugang anschließend im Browser prüfen.'
