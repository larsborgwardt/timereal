// Ausschließlich eigener markierter Debian/systemd-Prüfgast; reale Sicherung und Ersatzdatenbank.
import assert from "node:assert/strict";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdtempSync,
  rmSync,
  openSync,
  closeSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { totp } from "../dist/mfa-crypto.js";
assert(existsSync("/root/TIMEREAL_WEGWERFTEST"));
const keyfile = "/etc/timereal/mfa.key";
assert(
  existsSync(keyfile),
  "Installation muss den dauerhaften MFA-Schlüssel anlegen",
);
const key = readFileSync(keyfile);
assert.equal(key.length, 32);
assert.equal(statSync(keyfile).mode & 0o777, 0o640);
const sql = (database, text) =>
  execFileSync(
    "runuser",
    [
      "-u",
      "postgres",
      "--",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-d",
      database,
    ],
    { input: text, encoding: "utf8" },
  ).trim();
const login = "native-mfa-" + randomBytes(8).toString("hex"),
  pass = randomBytes(24).toString("hex");
sql(
  "timereal",
  `insert into konto(login_referenz,passwort_hash) values('${login}','${await passwordHash(pass)}');`,
);
const origin = readFileSync("/etc/timereal/dienst.conf", "utf8").match(
  /^PUBLIC_ORIGIN=(.*)$/m,
)[1];
let cookie = "";
async function q(path, payload) {
  const r = await fetch("http://127.0.0.1:3040/api/v1" + path, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const c = r.headers.get("set-cookie");
  if (c) cookie = c.split(";")[0];
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
await q("/anmeldung", { login, passwort: pass });
const setup = await q("/mfa/einrichtung", { passwort: pass });
const bits = [...setup.secret]
  .map((c) =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0"),
  )
  .join("");
const seed = Buffer.from(bits.match(/.{8}/g).map((s) => parseInt(s, 2)));
await q("/mfa/aktivieren", {
  id: setup.id,
  code: totp(seed, Math.floor(Date.now() / 30000) - 1),
});
// Vorhandene Faktoren dürfen weder einen neuen Zufallsschlüssel erhalten noch
// mit einem anderen, formal gültigen Schlüssel als sicherbar gelten.
const keyscript = new URL("../betrieb/mfa-schluessel.sh", import.meta.url)
  .pathname;
renameSync(keyfile, keyfile + ".probe");
try {
  assert.notEqual(spawnSync("bash", [keyscript, "anlegen"]).status, 0);
  assert.equal(existsSync(keyfile), false);
  writeFileSync(keyfile, randomBytes(32), { mode: 0o600 });
  assert.notEqual(spawnSync("bash", [keyscript, "pruefen"]).status, 0);
} finally {
  rmSync(keyfile, { force: true });
  renameSync(keyfile + ".probe", keyfile);
}
execFileSync("systemctl", ["start", "timereal-backup.service"]);
const archive = execFileSync(
  "bash",
  ["-c", "ls -t /var/lib/timereal-backups/timereal-*.tar | head -n 1"],
  { encoding: "utf8" },
).trim();
assert(archive);
assert.equal(statSync(archive).mode & 0o777, 0o600);
const dir = mkdtempSync("/root/timereal-restore-"),
  database = "mfa_restore_" + randomBytes(6).toString("hex");
let created = false,
  app;
try {
  execFileSync("tar", ["-xf", archive, "-C", dir]);
  execFileSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: dir });
  assert.deepEqual(readFileSync(dir + "/mfa.key"), key);
  execFileSync("runuser", ["-u", "postgres", "--", "createdb", database]);
  created = true;
  const dump = openSync(dir + "/datenbank.dump", "r");
  try {
    execFileSync(
      "runuser",
      [
        "-u",
        "postgres",
        "--",
        "pg_restore",
        "--exit-on-error",
        "--dbname",
        database,
      ],
      { stdio: [dump, "pipe", "pipe"] },
    );
  } finally {
    closeSync(dump);
  }
  execFileSync("bash", [keyscript, "pruefen", database, dir + "/mfa.key"]);
  const dbPass = randomBytes(24).toString("hex");
  sql("postgres", `alter role timereal_app password '${dbPass}';`);
  const legacy = await import(
    process.env.TIMEREAL_ALT_APP || "/opt/timereal/dist/app.js"
  );
  const old = legacy.createApp(
    new pg.Pool({
      host: "127.0.0.1",
      database,
      user: "timereal_app",
      password: dbPass,
    }),
    { secure: true, origin: "https://restore.test" },
  );
  try {
    const rejected = await old.inject({
      method: "POST",
      url: "/api/v1/anmeldung",
      headers: { origin: "https://restore.test" },
      payload: { login, passwort: pass },
    });
    assert.notEqual(
      rejected.statusCode,
      200,
      "Alte Anwendung darf die MFA-Anmeldung nicht umgehen",
    );
    assert.equal(rejected.headers["set-cookie"], undefined);
  } finally {
    await old.close();
  }
  app = createApp(
    new pg.Pool({
      host: "127.0.0.1",
      database,
      user: "timereal_app",
      password: dbPass,
    }),
    {
      secure: true,
      origin: "https://restore.test",
      mfaKey: readFileSync(dir + "/mfa.key"),
    },
  );
  const pending = await app.inject({
    method: "POST",
    url: "/api/v1/anmeldung",
    headers: { origin: "https://restore.test" },
    payload: { login, passwort: pass },
  });
  assert.equal(pending.statusCode, 200, pending.body);
  assert.equal(pending.json().zweiterFaktor, true);
  const partial = [pending.headers["set-cookie"]]
    .flat()
    .find((c) => c.startsWith("timereal_mfa="))
    .split(";")[0];
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/profil",
        headers: { cookie: partial },
      })
    ).statusCode,
    401,
  );
  const final = await app.inject({
    method: "POST",
    url: "/api/v1/anmeldung/faktor",
    headers: { origin: "https://restore.test", cookie: partial },
    payload: { art: "totp", code: totp(seed, Math.floor(Date.now() / 30000)) },
  });
  assert.equal(final.statusCode, 200, final.body);
  const full = [final.headers["set-cookie"]]
    .flat()
    .find((c) => c.startsWith("timereal="))
    .split(";")[0];
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/profil",
        headers: { cookie: full },
      })
    ).statusCode,
    200,
  );
  console.log(
    "Native MFA-Probe: Installation, Dateirechte, tägliche Sicherung und Authenticator-Anmeldung aus rückgesicherter Datenbank bestanden.",
  );
} finally {
  await app?.close();
  if (created)
    execFileSync("runuser", ["-u", "postgres", "--", "dropdb", database]);
  rmSync(dir, { recursive: true, force: true });
}
