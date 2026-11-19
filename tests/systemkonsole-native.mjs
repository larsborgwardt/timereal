// Nur eigener markierter Debian/systemd-Prüfgast. Die Logprobe entsteht in echten
// Service-Cgroups; JSON-Format und Berechtigungen kommen vom echten journald.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { passwordHash } from "../dist/session.js";

assert.equal(process.env.TIMEREAL_WEGWERFTEST, "1");
if (process.argv.includes("--api")) {
  const db = new pg.Client({
    host: "/var/run/postgresql",
    database: "timereal",
    user: "postgres",
  });
  await db.connect();
  try {
    const login = "journalprobe-" + randomUUID(),
      passwort = randomBytes(24).toString("hex");
    await db.query(
      "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true)",
      [login, await passwordHash(passwort)],
    );
    const origin = (await readFile("/etc/timereal/dienst.conf", "utf8")).match(
      /^PUBLIC_ORIGIN=(.*)$/m,
    )[1];
    const anmeldung = await fetch("http://127.0.0.1:3040/api/v1/anmeldung", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ login, passwort }),
    });
    assert.equal(anmeldung.status, 200);
    const cookie = anmeldung.headers.get("set-cookie").split(";")[0];
    const q = (query = "") =>
      fetch("http://127.0.0.1:3040/api/v1/verwaltung/betrieb/logs" + query, {
        headers: { cookie },
        signal: AbortSignal.timeout(6000),
      });
    const res = await q();
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    const marker = process.env.TIMEREAL_LOG_MARKER;
    for (const quelle of ["anwendung", "betrieb", "https"]) {
      assert.ok(
        data.zeilen.some(
          (z) =>
            z.quelle === quelle &&
            z.text === "Journalprobe " + marker &&
            z.level === "error",
        ),
        quelle + " fehlt",
      );
      const filtered = await (
        await q("?quelle=" + quelle + "&level=error&suche=" + marker)
      ).json();
      assert.ok(filtered.zeilen.length > 0);
      assert.ok(
        filtered.zeilen.every(
          (z) => z.quelle === quelle && z.level === "error",
        ),
      );
    }
    assert.doesNotMatch(JSON.stringify(data), /NICHT_ANZEIGEN/);
    assert.ok(data.zeilen.some((z) => z.text === "Anwendung gestartet."));
    assert.ok(data.zeilen.some((z) => z.text === "Betriebsdienst gestartet."));
    if (process.env.TIMEREAL_LOG_ABSCHLUSS === "1") {
      assert.ok(
        data.zeilen.some(
          (z) => z.level === "complete" && z.text === "Update abgeschlossen.",
        ),
      );
      assert.ok(
        data.zeilen.some(
          (z) =>
            z.level === "success" &&
            z.text === "Update zur Installation bereit.",
        ),
      );
    }
    assert.equal((await q("?quelle=ssh.service")).status, 400);
    assert.equal(
      (await fetch("http://127.0.0.1:3040/api/v1/verwaltung/betrieb/logs"))
        .status,
      401,
    );
    console.log(
      "Native Systemkonsole: Anwendung → Unix-Socket → journalctl, Dienstfilter, echte Prioritäten, Bereinigung und Anmeldung bestanden.",
    );
  } finally {
    await db.end();
  }
} else {
  assert.equal(process.getuid(), 0);
  await readFile("/root/TIMEREAL_WEGWERFTEST");
  const marker = randomUUID();
  const probe = "/opt/timereal-journalprobe-" + marker + ".mjs";
  const units = [
    "timereal.service",
    "timereal-betrieb.service",
    "timereal-https.service",
  ];
  await writeFile(
    probe,
    `console.log(JSON.stringify({level:"error",msg:${JSON.stringify("Journalprobe " + marker)},request:{headers:{Authorization:"Bearer NICHT_ANZEIGEN"}}}));\n`,
    { mode: 0o644 },
  );
  try {
    for (const unit of units) {
      const dir = "/etc/systemd/system/" + unit + ".d";
      await mkdir(dir, { recursive: true });
      await writeFile(
        dir + "/journalprobe.conf",
        `[Service]\nExecStartPost=/opt/timereal-node/bin/node ${probe}\n`,
      );
    }
    execFileSync("systemctl", ["daemon-reload"]);
    execFileSync("systemctl", ["restart", ...units]);
    execFileSync("journalctl", ["--sync"]);
    for (let i = 0; i < 30; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3040/api/v1/version")).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    execFileSync(
      "runuser",
      [
        "-u",
        "postgres",
        "--",
        "env",
        "TIMEREAL_WEGWERFTEST=1",
        "TIMEREAL_LOG_MARKER=" + marker,
        "TIMEREAL_LOG_ABSCHLUSS=" + (process.env.TIMEREAL_LOG_ABSCHLUSS ?? "0"),
        process.execPath,
        fileURLToPath(import.meta.url),
        "--api",
      ],
      { stdio: "inherit" },
    );
  } finally {
    for (const unit of units)
      await rm("/etc/systemd/system/" + unit + ".d/journalprobe.conf");
    await rm(probe);
    execFileSync("systemctl", ["daemon-reload"]);
    execFileSync("systemctl", ["restart", ...units]);
  }
}
