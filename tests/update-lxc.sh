#!/usr/bin/env bash
# Im Wegwerf-LXC mit bereits installiertem 0.1-Piloten und Test-Tag v0.2.0.
set -euo pipefail
[[ $EUID == 0 && -f /root/TIMEREAL_WEGWERFTEST ]] || { echo 'Nur im markierten Testgast.' >&2; exit 2; }
psql=(runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d timereal)
snapshot() {
  "${psql[@]}" -Atqc "SELECT jsonb_build_object('konten',(SELECT jsonb_agg(to_jsonb(k) ORDER BY id) FROM konto k),'kunden',(SELECT jsonb_agg(to_jsonb(k) ORDER BY id) FROM kunde k),'ziele',(SELECT jsonb_agg(to_jsonb(z) ORDER BY id) FROM buchungsziel z),'zeiten',(SELECT jsonb_agg(to_jsonb(z) ORDER BY id) FROM zeitabschnitt z),'sitzungen',(SELECT jsonb_agg(to_jsonb(s) ORDER BY schluessel) FROM sitzung s))"
}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
snapshot > "$work/vorher"
sha256sum /etc/timereal/dienst.conf /etc/timereal/Caddyfile /root/timereal-test-ca.crt > "$work/config"
bash /root/update-candidate.sh --check v0.2.0
bash /root/update-candidate.sh v0.2.0
snapshot > "$work/nachher"
cmp "$work/vorher" "$work/nachher"
sha256sum --check "$work/config"
curl -fsS http://127.0.0.1:3040/api/v1/version | /opt/timereal-node/bin/node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>{if(JSON.parse(x).version!=="0.2.0")process.exit(1)})'
[[ -L /opt/timereal-current ]]
bash /root/update-candidate.sh v0.2.0
snapshot > "$work/wiederholt"
cmp "$work/nachher" "$work/wiederholt"
systemctl is-active timereal.service timereal-https.service
# Der letzte Update-Dump lässt sich in eine eigene Datenbank zurücklesen.
backup=$(find /var/lib/timereal-updates -name before.dump -print | sort | tail -n 1)
[[ -n $backup ]]
runuser -u postgres -- createdb timereal_update_restore
runuser -u postgres -- pg_restore --exit-on-error --single-transaction -d timereal_update_restore < "$backup"
runuser -u postgres -- psql -X -d timereal_update_restore -Atqc 'SELECT count(*) FROM konto'
echo 'Update, Wiederholung, Datenerhalt und Rücksicherung bestanden.'
