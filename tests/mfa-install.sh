#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(mktemp -d /tmp/timereal-mfa-install.XXXXXXXX)
guest="timereal-mfa-install-$$"
cleanup(){ local code=$?; trap - EXIT; docker rm -f "$guest" >/dev/null 2>&1 || true; printf 'Installationsbelege: %s\n' "$out"; exit "$code"; }
trap cleanup EXIT
git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf "$out/quellen.tar"
docker run -d --name "$guest" --privileged --cgroupns=private --tmpfs /run --tmpfs /run/lock --tmpfs /tmp timereal-070-basis:local /sbin/init >/dev/null
docker exec "$guest" bash -c 'set -e; test -f /root/TIMEREAL_WEGWERFTEST; for n in {1..60}; do if systemctl is-active --quiet postgresql; then break; fi; sleep 1; done; systemctl stop timereal.service timereal-https.service timereal-backup.timer; systemctl stop timereal-betrieb.service 2>/dev/null || true; runuser -u postgres -- dropdb --force timereal; runuser -u postgres -- dropuser timereal_app; mv /opt/timereal /opt/timereal-vorgaenger; mkdir /opt/timereal; mv /etc/timereal /root/timereal-vorgaenger-config; rm -f /opt/timereal-current /opt/timereal-betrieb-current'
docker cp "$out/quellen.tar" "$guest:/root/quellen.tar"
docker exec "$guest" tar -xf /root/quellen.tar -C /opt/timereal
python3 - "$guest" "$out/installation.log" <<'PY'
import pexpect,sys,secrets
child=pexpect.spawn('docker',['exec','-it',sys.argv[1],'env','TIMEREAL_HOST=127.0.0.1','bash','/opt/timereal/betrieb/install.sh'],encoding='utf8',timeout=240)
with open(sys.argv[2],'w') as log:
    try:
        child.expect('Anmeldename für dein Testkonto:')
    except (pexpect.EOF, pexpect.TIMEOUT):
        log.write(child.before)
        raise SystemExit('Installationsabbruch vor Kontoanlage; siehe installation.log')
    log.write(child.before)
    child.sendline('installationstest')
    child.expect('Passwort \\(mindestens 12 Zeichen\\):')
    child.sendline(secrets.token_hex(24))
    child.expect(pexpect.EOF);log.write(child.before)
child.close()
if child.exitstatus != 0: raise SystemExit('Installation fehlgeschlagen')
PY
docker exec "$guest" env TIMEREAL_ALT_APP=/opt/timereal-vorgaenger/dist/app.js /opt/timereal-node/bin/node /opt/timereal/tests/mfa-native.mjs >"$out/mfa.log" 2>&1
docker exec "$guest" bash /opt/timereal/tests/mfa-extern.sh >"$out/extern.log" 2>&1
echo 'Neuinstallation mit leerer Datenbank, MFA, lokaler und verschlüsselter SFTP-Sicherung bestanden.'
