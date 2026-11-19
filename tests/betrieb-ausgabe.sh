#!/usr/bin/env bash
# Reale Skriptausführung im eigenen Debian/systemd-Prüfgast, nie im Benutzerpilot.
set -euo pipefail
[[ $EUID == 0 && -f /root/TIMEREAL_WEGWERFTEST ]] || { echo 'Nur im markierten Testgast.' >&2; exit 2; }
[[ $# == 2 ]] || { echo 'Aufruf: betrieb-ausgabe.sh UPDATE-SKRIPT VORHANDENER-TAG' >&2; exit 2; }
script=$(realpath "$1")
tag=$2
work=$(mktemp -d)
cp -p /etc/timereal/dienst.conf "$work/dienst.conf"
cleanup() { cp -p "$work/dienst.conf" /etc/timereal/dienst.conf; rm -rf "$work"; }
trap cleanup EXIT
pid=$(systemctl show timereal.service -p MainPID --value)
[[ $pid != 0 ]]
probe() {
  printf '%s\n' "$1" > /etc/timereal/dienst.conf
  # Darf weder ausgeführt noch in Fehlermeldungen gespiegelt werden.
  printf 'FREMDWERT=$(touch %s/ausgefuehrt)\n' "$work" >> /etc/timereal/dienst.conf
  bash "$script" --check "$tag" > "$work/ausgabe" 2>&1
  grep -Fq "Browser-Adresse: $2" "$work/ausgabe"
  grep -Fq 'Prüfung erfolgreich.' "$work/ausgabe"
  grep -Fq 'Port 3040 ist nur intern erreichbar' "$work/ausgabe"
  [[ ! -e $work/ausgefuehrt ]]
  [[ $(systemctl show timereal.service -p MainPID --value) == "$pid" ]]
}
probe 'PUBLIC_ORIGIN=https://192.0.2.42' 'https://192.0.2.42:443'
probe 'PUBLIC_ORIGIN=https://zeit.example.org:8443' 'https://zeit.example.org:8443'
probe 'PUBLIC_ORIGIN="https://zeit.example.org"' 'https://zeit.example.org:443'
probe "PUBLIC_ORIGIN='https://zeit.example.org'" 'https://zeit.example.org:443'
probe 'PUBLIC_ORIGIN=https://[2001:db8::42]' 'https://[2001:db8::42]:443'
probe 'PUBLIC_ORIGIN=http://localhost' 'http://localhost:80'
for value in '' 'https://user:verdeckter-testwert@example.org' 'ungueltig'; do
  printf 'PUBLIC_ORIGIN=%s\n' "$value" > /etc/timereal/dienst.conf
  bash "$script" --check "$tag" > "$work/ausgabe" 2>&1
  grep -Fq 'Browser-Adresse nicht ermittelbar' "$work/ausgabe"
  if grep -Eq 'Browser-Adresse:|verdeckter-testwert' "$work/ausgabe"; then
    echo 'Ungültige Konfiguration als Browser-Adresse oder mit Geheimnis ausgegeben.' >&2; exit 1
  fi
done
cp -p "$work/dienst.conf" /etc/timereal/dienst.conf
missing=v999999.0.0
if git -C /opt/timereal rev-parse --verify "refs/tags/$missing" >/dev/null 2>&1; then exit 2; fi
if bash "$script" --check "$missing" > "$work/fehler" 2>&1; then
  echo 'Fehlende Version wurde akzeptiert.' >&2; exit 1
fi
grep -Fq 'Update abgebrochen: Installation und Zielversion prüfen' "$work/fehler"
grep -Fq 'noch nicht angehalten' "$work/fehler"
grep -Fq 'journalctl -u timereal' "$work/fehler"
if grep -Fq 'Update abgeschlossen' "$work/fehler"; then exit 1; fi
[[ $(systemctl show timereal.service -p MainPID --value) == "$pid" ]]
echo 'Adressausgabe, fehlende Konfiguration, Geheimnisschutz und Prüfmodus ohne Neustart: bestanden.'
