#!/usr/bin/env bash
# Nur im eigenen nativen systemd-Prüfgast, nicht im Benutzercontainer ausführen.
# Ausgangskonfiguration entspricht betrieb/install.sh (tls internal, IP-Site).
set -euo pipefail
script=${1:?Pfad des Proxy-Patches fehlt}
[[ -f /root/TIMEREAL_WEGWERFTEST ]]
# /tmp kann noexec sein; der Fehleradapter muss tatsächlich ausführbar sein.
work=$(mktemp -d /root/timereal-proxytest.XXXXXXXX)
override=/run/systemd/system/timereal.service.d/timereal-proxy-test.conf
[[ ! -e $override ]]
mkdir "$work/original"
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$work/"
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$work/original/"
cleanup() {
  rm -f "$override"
  systemctl daemon-reload
  cp -p "$work/original/Caddyfile" /etc/timereal/Caddyfile
  cp -p "$work/original/dienst.conf" /etc/timereal/dienst.conf
  systemctl reset-failed timereal.service timereal-https.service
  systemctl restart timereal.service timereal-https.service
  rm -rf "$work"
}
trap cleanup EXIT
ip=$(sed -n 's/^[[:space:]]*default_sni[[:space:]]\{1,\}//p' "$work/Caddyfile")
[[ $ip =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
ca=/var/lib/timereal-https/caddy/pki/authorities/local/root.crt
domain=erste.proxyprobe.test
systemctl start postgresql timereal timereal-https
# Schon der zweite geplante Neustart trifft ohne Rücksetzung die reale Startsperre.
mkdir -p "$(dirname "$override")"
printf '[Unit]\nStartLimitIntervalSec=120\nStartLimitBurst=1\n' > "$override"
systemctl daemon-reload
systemctl reset-failed timereal.service timereal-https.service
systemctl restart timereal.service timereal-https.service
for _ in {1..20}; do
  if curl -fsS --cacert "$ca" --resolve "$ip:443:127.0.0.1" "https://$ip/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
vorher=$(curl -sS --cacert "$ca" --resolve "$ip:443:127.0.0.1" -H "Host: $domain" -o "$work/vorher.html" -w '%{http_code}' "https://$ip/")
# Bestand bis 0.9.4: 200 ohne Inhalt. Aktuelle Vorlage: 421 mit Hinweis. Nie eine Seite.
if [[ $vorher == 200 ]]; then test ! -s "$work/vorher.html"; else [[ $vorher == 421 ]]; fi
printf 'Ausgangslage: nicht eingerichteter Host erhält keine Seite (HTTP %s).\n' "$vorher"
pid=$(systemctl show timereal.service --property=MainPID --value)
bash "$script" --check "$domain" "$ip"
cmp "$work/Caddyfile" /etc/timereal/Caddyfile
cmp "$work/dienst.conf" /etc/timereal/dienst.conf
[[ $pid == "$(systemctl show timereal.service --property=MainPID --value)" ]]
bash "$script" "$domain" "$ip"
curl -fsS --cacert "$ca" --resolve "$ip:443:127.0.0.1" -H "Host: $domain" "https://$ip/" >"$work/nachher.html"
grep -q '<html' "$work/nachher.html"
# Fremde Hostnamen erhalten einen nicht speicherbaren Fehler statt einer leeren Erfolgsantwort.
curl -sS --cacert "$ca" --resolve "$ip:443:127.0.0.1" -H 'Host: fremd.proxyprobe.test' -D "$work/fremd.kopf" -o "$work/fremd.txt" "https://$ip/app.js"
grep -Eqi '^HTTP/[0-9.]+ 421' "$work/fremd.kopf"
grep -qi '^cache-control: no-store' "$work/fremd.kopf"
test -s "$work/fremd.txt"
# HTTP/3 wird nicht angekündigt: hinter einem fremden Proxy wäre es nicht erreichbar.
curl -sS --cacert "$ca" --resolve "$ip:443:127.0.0.1" -D "$work/eigen.kopf" -o /dev/null "https://$ip/health"
grep -Eqi '^HTTP/[0-9.]+ 200' "$work/eigen.kopf"
if grep -qi '^alt-svc:' "$work/eigen.kopf" "$work/fremd.kopf"; then echo 'HTTP/3 wird weiterhin angekündigt.' >&2; exit 1; fi
# Zweite, beliebige Domain statt fest eingebauter Nutzer-Domain.
domain=zweite.proxyprobe.test
bash "$script" "$domain" "$ip"
grep -Fxq "PUBLIC_ORIGIN=https://$domain" /etc/timereal/dienst.conf
if grep -q erste.proxyprobe.test /etc/timereal/Caddyfile; then exit 1; fi
pid=$(systemctl show timereal.service --property=MainPID --value)
bash "$script" "$domain" "$ip"
[[ $pid == "$(systemctl show timereal.service --property=MainPID --value)" ]]
# Origin-Vertrag über echte HTTPS-Anfragen; kein Konto wird angelegt.
for origin in "https://$domain" https://fremd.example.org; do
  status=$(curl -sS --cacert "$ca" --resolve "$domain:443:127.0.0.1" \
    -H "Origin: $origin" -H 'Content-Type: application/json' -d '{}' \
    "https://$domain/api/v1/anmeldung" -o "$work/anmeldung.json" -w '%{http_code}')
  if [[ $origin == "https://$domain" ]]; then [[ $status == 400 ]]; else [[ $status == 403 ]]; fi
done
# Die lokale Adresse bleibt neben der Domain als Herkunft zulässig; fremde Herkünfte auch dort nicht.
for origin in "https://$ip" https://fremd.example.org; do
  status=$(curl -sS --cacert "$ca" --resolve "$ip:443:127.0.0.1" \
    -H "Origin: $origin" -H 'Content-Type: application/json' -d '{}' \
    "https://$ip/api/v1/anmeldung" -o "$work/anmeldung.json" -w '%{http_code}')
  if [[ $origin == "https://$ip" ]]; then [[ $status == 400 ]]; else [[ $status == 403 ]]; fi
done
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$work/"
# Einmaliger Neustartfehler; Rückbau verwendet anschließend echtes systemctl.
mkdir "$work/bin"
cat >"$work/bin/systemctl" <<'SH'
#!/usr/bin/env bash
if [[ $1 == restart && ! -e "$PROXY_TEST_FAILURE" ]]; then
  touch "$PROXY_TEST_FAILURE"
  exit 42
fi
exec /usr/bin/systemctl "$@"
SH
chmod +x "$work/bin/systemctl"
if PROXY_TEST_FAILURE="$work/failure" PATH="$work/bin:$PATH" bash "$script" dritte.proxyprobe.test "$ip" >"$work/abbruch.log" 2>&1; then
  cat "$work/abbruch.log" >&2
  echo 'Neustartfehler wurde nicht als Fehler gemeldet.' >&2; exit 1
fi
test -f "$work/failure"
grep -q 'Vorheriger Zugang wieder erreichbar' "$work/abbruch.log"
cmp "$work/Caddyfile" /etc/timereal/Caddyfile
cmp "$work/dienst.conf" /etc/timereal/dienst.conf
curl -fsS --cacert "$ca" --resolve "$domain:443:127.0.0.1" "https://$domain/health"
# Benutzerdefinierte Konfiguration darf nicht überschrieben werden.
printf '\n# eigene Anpassung\n' >> /etc/timereal/Caddyfile
cp -p /etc/timereal/Caddyfile "$work/custom"
if bash "$script" --check vierte.proxyprobe.test "$ip" >"$work/custom.log" 2>&1; then
  echo 'Angepasste Konfiguration wurde ungeprüft akzeptiert.' >&2; exit 1
fi
cmp "$work/custom" /etc/timereal/Caddyfile
cmp "$work/dienst.conf" /etc/timereal/dienst.conf
echo 'Proxy-Patch: Prüfung, Hostrouting, Fehlerantwort für fremde Hostnamen, kein HTTP/3, Domainwechsel, Wiederholung, Origin (Domain und lokale Adresse) und Rückbau erfolgreich.'
