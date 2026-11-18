#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && -f /root/TIMEREAL_WEGWERFTEST ]]
repo=/opt/timereal
active=$(readlink -f /opt/timereal-current)
source_tag=v0.2.0
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$repo" archive "$source_tag" | tar -x -C "$work"
cd "$work"
/opt/timereal-node/bin/node --input-type=commonjs -e '
const fs=require("fs");for(const path of ["package.json","release.json","package-lock.json"]){const x=JSON.parse(fs.readFileSync(path));x.version="0.2.1";if(x.packages)x.packages[""].version="0.2.1";fs.writeFileSync(path,JSON.stringify(x,null,2))}let t=fs.readFileSync("tests/version.test.mjs","utf8").replaceAll("0.2.0","0.2.1");fs.writeFileSync("tests/version.test.mjs",t);fs.appendFileSync("src/server.ts","\nprocess.exit(71);\n");'
git init -q
git add .
git -c user.name=Test -c user.email=test@example.test commit -qm 'Nur Prüfstand: absichtlich scheiternder Dienststart'
git tag v0.2.1
git -C "$repo" fetch "$work" tag v0.2.1
if bash /root/update-candidate.sh v0.2.1; then echo 'Fehlerhafter Start wurde akzeptiert.' >&2; exit 1; fi
[[ $(readlink -f /opt/timereal-current) == "$active" ]]
systemctl is-active timereal.service
curl -fsS http://127.0.0.1:3040/api/v1/version | /opt/timereal-node/bin/node -e 'let x="";process.stdin.on("data",d=>x+=d).on("end",()=>{if(JSON.parse(x).version!=="0.2.0")process.exit(1)})'
echo 'Fehlerhafter Dienststart: vorherige Version wieder aktiv.'
