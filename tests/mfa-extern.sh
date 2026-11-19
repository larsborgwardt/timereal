#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID == 0 && -f /root/TIMEREAL_WEGWERFTEST ]] || exit 2
# Echte SFTP-/Restic-Runtime im wegwerfbaren Gast. Der Hostschlüssel stammt
# unmittelbar vom erzeugten Server, nicht von einem ungeprüften Netzabruf.
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d /root/timereal-sftp.XXXXXXXX)
pid=''
cleanup() {
  local code=$?
  trap - EXIT
  [[ -z $pid ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
  if [[ -f $work/ssh-vorher ]]; then cp "$work/ssh-vorher" /root/.ssh/config; else rm -f /root/.ssh/config; fi
  rm -rf /etc/timereal/extern
  if [[ -d $work/extern-vorher ]]; then mv "$work/extern-vorher" /etc/timereal/extern; fi
  rm -rf "$work"
  exit "$code"
}
trap cleanup EXIT
mkdir -p /root/.ssh
[[ ! -f /root/.ssh/config ]] || cp /root/.ssh/config "$work/ssh-vorher"
[[ ! -e /etc/timereal/extern ]] || mv /etc/timereal/extern "$work/extern-vorher"
apt-get update -qq >"$work/pakete.log" 2>&1
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server restic >>"$work/pakete.log" 2>&1
ssh-keygen -q -t ed25519 -N '' -f "$work/host"
ssh-keygen -q -t ed25519 -N '' -f "$work/client"
cp "$work/client.pub" "$work/authorized"
printf '[127.0.0.1]:2222 %s\n' "$(cat "$work/host.pub")" >"$work/known_hosts"
cat >"$work/sshd.conf" <<EOF
Port 2222
ListenAddress 127.0.0.1
HostKey $work/host
PidFile $work/sshd.pid
AuthorizedKeysFile $work/authorized
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM yes
Subsystem sftp internal-sftp
EOF
mkdir -p /run/sshd
/usr/sbin/sshd -D -e -f "$work/sshd.conf" >"$work/sshd.log" 2>&1 & pid=$!
cat >/root/.ssh/config <<EOF
Host timereal-sftp-probe
  HostName 127.0.0.1
  Port 2222
  User root
  IdentityFile $work/client
  IdentitiesOnly yes
  UserKnownHostsFile $work/known_hosts
EOF
[[ ! -f $work/ssh-vorher ]] || cat "$work/ssh-vorher" >>/root/.ssh/config
for _ in {1..20}; do
  if ssh -oBatchMode=yes -oStrictHostKeyChecking=yes timereal-sftp-probe true 2>/dev/null; then break; fi
  sleep 1
done
ssh -oBatchMode=yes -oStrictHostKeyChecking=yes timereal-sftp-probe true
install -d -m 700 /etc/timereal/extern
printf 'sftp:root@timereal-sftp-probe:%s/repository\n' "$work" >/etc/timereal/extern/repository
openssl rand -hex 32 >/etc/timereal/extern/password
source "$root/betrieb/backup-lib.sh"
backup_config=/etc/timereal/extern
backup_restic init >/dev/null
bash "$root/betrieb/extern-sichern.sh" sichern
bash "$root/betrieb/extern-sichern.sh" check
bash "$root/betrieb/extern-sichern.sh" pruefen
echo 'SFTP/Restic: verschlüsselte Sicherung einschließlich MFA-Schlüssel und echte getrennte PostgreSQL-Rücksicherung bestanden.'
