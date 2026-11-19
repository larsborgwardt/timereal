#!/usr/bin/env bash
set -euo pipefail
# Eigener markierter systemd-Prüfgast; benötigt timereal-070-basis:local und Tag v0.9.2.
cd "$(dirname "$0")/.."
out=$(mktemp -d /tmp/timereal-domain-diagnose.XXXXXXXX)
guest="timereal-domain-diagnose-$$"
printf '%s\n' "$guest" > "$out/gast"
trap 'docker rm -f "$guest" >/dev/null 2>&1 || true; printf "Belege: %s\n" "$out"' EXIT
mkdir "$out/kandidat"
git archive v0.9.2 | tar -x -C "$out/kandidat"
git -C "$out/kandidat" init -q
git -C "$out/kandidat" add .
git -C "$out/kandidat" -c user.name=Timereal-Test -c user.email=probe@example.org commit -qm 'Isolierter 0.9.2-Pruefstand'
git -C "$out/kandidat" tag v0.9.2
docker run -d --name "$guest" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock --tmpfs /tmp timereal-070-basis:local /sbin/init >/dev/null
docker exec "$guest" test -f /root/TIMEREAL_WEGWERFTEST
docker cp "$out/kandidat" "$guest:/root/kandidat"
docker exec "$guest" bash -c 'set -e; chown -R root:root /root/kandidat; for n in {1..60}; do if systemctl is-active --quiet postgresql; then break; fi; sleep 1; done; git -C /opt/timereal fetch /root/kandidat refs/tags/v0.9.2:refs/tags/v0.9.2; bash /root/kandidat/betrieb/update.sh v0.9.2' > "$out/update.log" 2>&1
docker cp betrieb/verwaltung/aktionen.mjs "$guest:/opt/timereal-betrieb-current/verwaltung/aktionen.mjs"
docker cp betrieb/verwaltung/dienst.mjs "$guest:/opt/timereal-betrieb-current/verwaltung/dienst.mjs"
docker exec -i "$guest" bash -s <<'BASH'
set -euo pipefail
systemctl restart timereal-betrieb
cat > /usr/local/bin/timereal-domain-fehler <<'WRAPPER'
#!/usr/bin/env bash
if [[ $PUBLIC_ORIGIN == https://example.org ]]; then exit 42; fi
exec /opt/timereal-node/bin/node /opt/timereal-current/dist/server.js
WRAPPER
chmod 755 /usr/local/bin/timereal-domain-fehler
mkdir -p /etc/systemd/system/timereal.service.d
printf '[Service]\nExecStart=\nExecStart=/usr/local/bin/timereal-domain-fehler\n' > /etc/systemd/system/timereal.service.d/domain-probe.conf
systemctl daemon-reload
BASH
docker cp tests/betrieb-domain-diagnose-native.mjs "$guest:/opt/timereal-current/tests/domain-diagnose.mjs"
set +e
docker exec "$guest" runuser -u postgres -- env TIMEREAL_WEGWERFTEST=1 /opt/timereal-node/bin/node /opt/timereal-current/tests/domain-diagnose.mjs > "$out/domain.log" 2>&1
result=$?
set -e
docker exec "$guest" journalctl -u timereal-betrieb --no-pager -o cat > "$out/journal.log"
cat "$out/domain.log"
if [[ $result == 0 ]]; then grep -F 'lokale HTTPS-Prüfung mit Domain und Container-IP' "$out/journal.log"; fi
exit "$result"
