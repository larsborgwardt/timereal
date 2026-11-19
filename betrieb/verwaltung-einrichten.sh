#!/usr/bin/env bash
set -euo pipefail
umask 022
[[ $EUID == 0 && $# == 1 && -d /run/systemd/system ]] || { echo 'Aufruf als root: verwaltung-einrichten.sh RELEASEVERZEICHNIS' >&2; exit 2; }
release=$(readlink -f "$1")
case "$release" in /opt/timereal|/opt/timereal-releases/*) ;; *) echo 'Kein unterstütztes Releaseverzeichnis.' >&2; exit 2;; esac
[[ -f $release/release.json && -f $release/betrieb/verwaltung/start.mjs ]] || { echo 'Betriebsdienst fehlt im Release.' >&2; exit 1; }
node=/opt/timereal-node/bin/node
for datei in "$release"/betrieb/verwaltung/*.mjs; do "$node" --check "$datei"; done
version=$("$node" -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1])).version' "$release/release.json")
[[ $version =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Ungültige Releaseversion.' >&2; exit 1; }
hash=$(cd "$release/betrieb" && sha256sum update.sh proxy-einrichten.sh verwaltung-einrichten.sh timereal-betrieb.service verwaltung/*.mjs | sha256sum | cut -d' ' -f1)
target="/opt/timereal-betrieb/$version-$hash"
install -d -m 755 /opt/timereal-betrieb
if [[ ! -d $target ]]; then
  temp=$(mktemp -d /opt/timereal-betrieb/.vorbereitung.XXXXXXXX)
  trap 'rm -rf "$temp"' EXIT
  cp -a "$release/betrieb/." "$temp/"
  chown -R root:root "$temp"
  chmod -R u+rwX,go+rX,go-w "$temp"
  mv "$temp" "$target"
  sync -f /opt/timereal-betrieb
fi
backup=$(mktemp -d /opt/timereal-betrieb/.sicherung.XXXXXXXX)
chmod 700 "$backup"
vorher=$(readlink -f /opt/timereal-betrieb-current 2>/dev/null || true)
unit=/etc/systemd/system/timereal-betrieb.service
[[ ! -f $unit ]] || cp -a "$unit" "$backup/unit"
aktiv=false; systemctl is-active --quiet timereal-betrieb.service && aktiv=true
enabled=false; systemctl is-enabled --quiet timereal-betrieb.service 2>/dev/null && enabled=true
fertig=false
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  set +e
  if [[ $fertig != true ]]; then
    echo 'Betriebsdienst konnte nicht eingerichtet werden. Vorherigen Dienststand wiederherstellen.' >&2
    if [[ $enabled != true ]]; then systemctl disable timereal-betrieb.service; fi
    if [[ -n $vorher && -d $vorher ]]; then
      ln -sfn "$vorher" /opt/timereal-betrieb-current.next
      mv -Tf /opt/timereal-betrieb-current.next /opt/timereal-betrieb-current
    else
      rm -f /opt/timereal-betrieb-current
    fi
    if [[ -f $backup/unit ]]; then cp -a "$backup/unit" "$unit"; else rm -f "$unit"; fi
    sync -f /opt
    sync -f /etc/systemd/system
    systemctl daemon-reload
    if [[ -z ${TIMEREAL_BETRIEB_AUFTRAG:-} ]]; then
      systemctl reset-failed timereal-betrieb.service
      if [[ $aktiv == true ]]; then systemctl restart timereal-betrieb.service; else systemctl stop timereal-betrieb.service; fi
    fi
    code=1
  fi
  rm -rf "$backup"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ln -sfn "$target" /opt/timereal-betrieb-current.next
mv -Tf /opt/timereal-betrieb-current.next /opt/timereal-betrieb-current
sync -f /opt
install -m 644 "$release/betrieb/timereal-betrieb.service" /etc/systemd/system/timereal-betrieb.service
systemctl daemon-reload
systemctl enable timereal-betrieb.service
if [[ -z ${TIMEREAL_BETRIEB_AUFTRAG:-} ]]; then
  systemctl restart timereal-betrieb.service
  for _ in {1..20}; do
    if [[ -S /run/timereal-betrieb/dienst.sock ]]; then
      if curl --fail --silent --show-error --max-time 5 --unix-socket /run/timereal-betrieb/dienst.sock -H 'Content-Type: application/json' -d '{"aktion":"status"}' http://localhost/ >/dev/null; then fertig=true; exit 0; fi
    fi
    sleep 1
  done
  echo 'Betriebsdienst startet nicht. journalctl -u timereal-betrieb prüfen.' >&2
  exit 1
fi
fertig=true
echo 'Neuer Betriebsdienst vorbereitet. Aktivierung nach dauerhaftem Abschluss des Updateauftrags.'
