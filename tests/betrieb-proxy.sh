#!/usr/bin/env bash
# Nur im eigenen nativen systemd-Prüfgast, nicht im Benutzercontainer ausführen.
# Ausgangskonfiguration entspricht betrieb/install.sh (tls internal, IP-Site).
set -euo pipefail
script=${1:?Pfad des Proxy-Patches fehlt}
[[ -f /root/TIMEREAL_WEGWERFTEST ]]
# /tmp kann noexec sein; der Fehleradapter muss tatsächlich ausführbar sein.
work=$(mktemp -d /root/timereal-proxytest.XXXXXXXX)
mkdir "$work/original"
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$work/"
cp -p /etc/timereal/{Caddyfile,dienst.conf} "$work/original/"
cleanup() {
  cp -p "$work/original/Caddyfile" /etc/timereal/Caddyfile
  cp -p "$work/original/dienst.conf" /etc/timereal/dienst.conf
  systemctl restart timereal.service timereal-https.service
  rm -rf "$work"
}
trap cleanup EXIT
ip=$(sed -n 's/^PUBLIC_ORIGIN=https:\/\///p' "$work/dienst.conf")
ca=/var/lib/timereal-https/caddy/pki/authorities/local/root.crt
domain=erste.proxyprobe.test
systemctl start postgresql timereal timereal-https
for _ in {1..20}; do
  if curl -fsS --cacert "$ca" --resolve "$ip:443:127.0.0.1" "https://$ip/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --cacert "$ca" --resolve "$ip:443:127.0.0.1" -H "Host: $domain" "https://$ip/" >"$work/vorher.html"
test ! -s "$work/vorher.html"
printf 'Rotfall am HTTPS-Dienst: öffentlicher Host liefert leeren Inhalt.\n'
pid=$(systemctl show timereal.service --property=MainPID --value)
bash "$script" --check "$domain" "$ip"
cmp "$work/Caddyfile" /etc/timereal/Caddyfile
cmp "$work/dienst.conf" /etc/timereal/dienst.conf
[[ $pid == "$(systemctl show timereal.service --property=MainPID --value)" ]]
bash "$script" "$domain" "$ip"
curl -fsS --cacert "$ca" --resolve "$ip:443:127.0.0.1" -H "Host: $domain" "https://$ip/" >"$work/nachher.html"
grep -q '<html' "$work/nachher.html"
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
echo 'Proxy-Patch: Prüfung, Hostrouting, Domainwechsel, Wiederholung, Origin und Rückbau erfolgreich.'
