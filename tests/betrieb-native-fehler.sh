#!/usr/bin/env bash
set -euo pipefail
# Ausschließlich im eigenen, markierten Debian/systemd-Wegwerfgast ausführen.
# Echte Dateisysteme, pg_dump und systemd; keine ersetzten Produktionsprogramme.
[[ $EUID == 0 && ${TIMEREAL_WEGWERFTEST:-} == 1 && -f /root/TIMEREAL_WEGWERFTEST && $# == 1 ]] || exit 2
tag=$1
[[ $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
scratch=$(mktemp -d /root/timereal-fehlerprobe.XXXXXXXX)
previous=$(readlink -f /opt/timereal-current)
[[ $previous == /opt/timereal-releases/* && -d $previous ]] || exit 2
release_name=${previous##*/}
saved_releases=/opt/timereal-releases-fehlerprobe
[[ ! -e $saved_releases && ! -e /etc/systemd/system/timereal.service.d/fehlerprobe.conf ]] || exit 2
script=$scratch/update.sh
cp "$previous/betrieb/update.sh" "$script"
cleanup() {
  local rc=$?
  trap - EXIT
  set +e
  if [[ -d $saved_releases ]]; then
    mountpoint -q "/opt/timereal-releases/$release_name" && umount "/opt/timereal-releases/$release_name"
    mountpoint -q /opt/timereal-releases && umount /opt/timereal-releases
    rmdir /opt/timereal-releases
    mv "$saved_releases" /opt/timereal-releases
  fi
  mountpoint -q /var/lib/timereal-updates && umount /var/lib/timereal-updates
  rm -f /etc/systemd/system/timereal.service.d/fehlerprobe.conf
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -c 'DROP TABLE IF EXISTS public.timereal_sicherungsprobe' >/dev/null
  systemctl daemon-reload
  systemctl reset-failed timereal.service
  systemctl restart timereal.service
  printf 'Fehlerprobe-Belege im Wegwerfgast: %s\n' "$scratch"
  exit "$rc"
}
trap cleanup EXIT
export GIT_SSL_CAINFO=/etc/timereal/pruef-ca.pem
git -C /opt/timereal fetch https://github.com/larsborgwardt/timereal.git "refs/tags/$tag:refs/tags/$tag"
sha=$(git -C /opt/timereal rev-parse "$tag^{commit}")
health() {
  for _ in {1..30}; do
    if curl --fail --silent --max-time 3 http://127.0.0.1:3040/health >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
health
pid=$(systemctl show timereal.service -p MainPID --value)

# Unterhalb der realen 512-MiB-Schwelle. Der aktive Stand bleibt per Bindmount
# erreichbar, während df das kleine Vorbereitungs-Dateisystem misst.
mv /opt/timereal-releases "$saved_releases"
mkdir /opt/timereal-releases
mount -t tmpfs -o size=64m tmpfs /opt/timereal-releases
mkdir "/opt/timereal-releases/$release_name"
mount --bind "$saved_releases/$release_name" "/opt/timereal-releases/$release_name"
if TIMEREAL_BETRIEB_EVENTS=1 bash "$script" --prepare "$tag" 3>"$scratch/platz.events" >"$scratch/platz.log" 2>&1; then
  echo 'FEHLER: Vorbereitung trotz zu kleinem Dateisystem erfolgreich.' >&2; exit 1
fi
grep -q 'Mindestens 512 MiB' "$scratch/platz.log"
[[ $(systemctl show timereal.service -p MainPID --value) == "$pid" ]]
health
umount "/opt/timereal-releases/$release_name"
umount /opt/timereal-releases
rmdir /opt/timereal-releases
mv "$saved_releases" /opt/timereal-releases
echo 'Speicherknappheit: Abbruch vor Dienstunterbrechung; dieselbe Anwendung bleibt erreichbar.'

# Ein echter Dump überschreitet das kleine Sicherungs-Dateisystem. Zufallswerte
# verhindern, dass die Dump-Kompression die Probe unter die Grenze drückt.
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -c 'CREATE TABLE public.timereal_sicherungsprobe AS SELECT md5(random()::text) AS wert FROM generate_series(1,50000)' >/dev/null
bash "$script" --prepare "$tag" >"$scratch/sicherung-vorbereiten.log" 2>&1
mount -t tmpfs -o size=256k,mode=700 tmpfs /var/lib/timereal-updates
if TIMEREAL_BETRIEB_EVENTS=1 bash "$script" --install-prepared "$tag" "$sha" 3>"$scratch/sicherung.events" >"$scratch/sicherung.log" 2>&1; then
  echo 'FEHLER: Installation trotz fehlgeschlagenem Dump erfolgreich.' >&2; exit 1
fi
grep -q 'pg_dump: error:' "$scratch/sicherung.log"
grep -q '"phase":"vorherige_version_aktiv"' "$scratch/sicherung.events"
if grep -q '"phase":"migration"' "$scratch/sicherung.events"; then
  echo 'FEHLER: Migration trotz fehlgeschlagener Sicherung begonnen.' >&2; exit 1
fi
[[ $(readlink -f /opt/timereal-current) == "$previous" ]]
health
umount /var/lib/timereal-updates
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal -c 'DROP TABLE public.timereal_sicherungsprobe' >/dev/null
echo 'Echter pg_dump-Fehler: keine Migration/Umschaltung; vorherige Anwendung wieder erreichbar.'

# Eine defekte Startvoraussetzung trifft den Kandidaten und den Vorgänger.
bash "$script" --prepare "$tag" >"$scratch/start-vorbereiten.log" 2>&1
mkdir -p /etc/systemd/system/timereal.service.d
printf '[Service]\nExecStartPre=/usr/bin/false\n' > /etc/systemd/system/timereal.service.d/fehlerprobe.conf
systemctl daemon-reload
if TIMEREAL_BETRIEB_EVENTS=1 bash "$script" --install-prepared "$tag" "$sha" 3>"$scratch/start.events" >"$scratch/start.log" 2>&1; then
  echo 'FEHLER: Nicht startbare Dienste als erfolgreich gemeldet.' >&2; exit 1
fi
grep -q '"phase":"wiederherstellung_noetig"' "$scratch/start.events"
if grep -q '"phase":"vorherige_version_aktiv"' "$scratch/start.events"; then
  echo 'FEHLER: Nicht erreichbarer Vorgänger als aktiv gemeldet.' >&2; exit 1
fi
[[ $(readlink -f /opt/timereal-current) == "$previous" ]]
if curl --fail --silent --max-time 3 http://127.0.0.1:3040/health >/dev/null; then
  echo 'FEHLER: Startfehler wurde nicht ausgelöst.' >&2; exit 1
fi
rm /etc/systemd/system/timereal.service.d/fehlerprobe.conf
systemctl daemon-reload
systemctl reset-failed timereal.service
systemctl restart timereal.service
health
echo 'Nicht startbarer Vorgänger: Wiederherstellung ausdrücklich erforderlich; nach Entfernen der Prüfstörung wieder erreichbar.'
