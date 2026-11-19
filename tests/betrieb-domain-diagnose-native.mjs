// Nur über den markierten Debian-Prüfgast ausführen; Aufruf im Betriebsprüfskript.
import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { passwordHash } from "../dist/session.js";

assert.equal(process.env.TIMEREAL_WEGWERFTEST, "1");
const db = new pg.Client({
  host: "/var/run/postgresql",
  database: "timereal",
  user: "postgres",
});
await db.connect();
const login = "betrieb-probe-" + randomUUID(),
  passwort = randomBytes(24).toString("hex");
await db.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true)",
  [login, await passwordHash(passwort)],
);
let origin = (await readFile("/etc/timereal/dienst.conf", "utf8")).match(
    /^PUBLIC_ORIGIN=(.*)$/m,
  )[1],
  cookie = "";
async function q(path, body, forceOrigin = origin) {
  const r = await fetch("http://127.0.0.1:3040/api/v1" + path, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(6000),
    headers: {
      origin: forceOrigin,
      cookie,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  const data = await r.json();
  if (!r.ok) throw new Error(r.status + " " + JSON.stringify(data));
  return data;
}
async function warten(id, ziel) {
  for (let n = 0; n < 210; n++) {
    try {
      const j = await q("/verwaltung/betrieb/auftraege/" + id);
      if (j.zustand === ziel) return j;
      if (["fehlgeschlagen", "wiederherstellung_noetig"].includes(j.zustand))
        throw new Error(JSON.stringify(j));
    } catch (e) {
      if (!/fetch failed|ECONNREFUSED/.test(e.message)) throw e;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Zeitlimit bei " + ziel);
}
try {
  await q("/anmeldung", { login, passwort });
  const job = await q("/verwaltung/betrieb/domain/pruefen", {
    domain: "example.org",
  });
  await warten(job.id, "geprueft");
  await q(`/verwaltung/betrieb/domain/${job.id}/uebernehmen`, { passwort });
  const result = await warten(job.id, "zurueckgesetzt");
  assert.match(
    result.meldung,
    /lokale HTTPS-Prüfung mit Domain und Container-IP.*Exit 1/,
  );
  assert.match(result.meldung, /Vorherige Konfiguration wiederhergestellt/);
  console.log(result.meldung);
  cookie = "";
  await q("/anmeldung", { login, passwort });
  console.log(
    "Realer Startfehler, Rückbau, Ursachenanzeige und erneute Anmeldung bestanden.",
  );
} finally {
  await db.end();
}
