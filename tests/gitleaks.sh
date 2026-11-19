#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
binary=${GITLEAKS_BIN:-gitleaks}
"$binary" version
probe=$(mktemp -d /tmp/timereal-gitleaks.XXXXXXXX)
trap 'rm -rf "$probe"' EXIT
git -C "$probe" init -q
git -C "$probe" config user.name Timereal-Pruefung
git -C "$probe" config user.email probe@example.org
printf 'Öffentlicher Text ohne Zugangsdaten.\n' > "$probe/README.md"
git -C "$probe" add README.md
git -C "$probe" commit -qm 'Unkritischer Prüfbestand'

# Derselbe Scanner muss einen sauberen Bestand akzeptieren und ein aus dem
# aktuellen Baum gelöschtes Geheimnis weiterhin in der Historie erkennen.
"$binary" git --no-banner --no-color --redact --log-opts='--all' "$probe" > "$probe/sauber.log" 2>&1
python3 - "$probe" <<'PY'
import secrets, string, sys
from pathlib import Path
token = 'ghp_' + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(36))
(Path(sys.argv[1]) / 'probe.env').write_text('SYNTHETIC_GITHUB_TOKEN=' + token + '\n')
PY
git -C "$probe" add probe.env
git -C "$probe" commit -qm 'Synthetischer und nie verwendeter Testtoken'
git -C "$probe" rm -q probe.env
git -C "$probe" commit -qm 'Token aus aktuellem Baum entfernt'
code=0
"$binary" git --no-banner --no-color --redact --log-opts='--all' --report-format json --report-path "$probe/funde.json" "$probe" > "$probe/fund.log" 2>&1 || code=$?
[[ $code == 1 ]] || { echo 'Gitleaks hat den synthetischen Historientreffer nicht abgewiesen.' >&2; exit 1; }
python3 - "$probe/funde.json" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1]))
assert len(rows) == 1 and rows[0]['RuleID'] == 'github-pat' and rows[0]['File'] == 'probe.env', 'Der Fehler muss vom Testtoken stammen.'
PY
echo 'Gitleaks-Gegenprobe bestanden: sauberer Bestand akzeptiert, gelöschter Testtoken in Historie abgewiesen.'
"$binary" git --no-banner --no-color --redact --log-opts='--all' .
