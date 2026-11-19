// Echte API, PostgreSQL, Unix-Dienst und Betriebsskripte im markierten Prüfgast.
import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { passwordHash } from "../dist/session.js";
assert.equal(process.env.TIMEREAL_WEGWERFTEST, "1");
const tag = process.env.TIMEREAL_TEST_TAG;
assert.match(tag, /^v0\.7\.[123]$/);
const erwartet = process.env.TIMEREAL_TEST_ERGEBNIS ?? "erfolgreich";
const db = new pg.Client({
  host: "/var/run/postgresql",
  database: "timereal",
  user: "postgres",
});
await db.connect();
const login = "update-probe-" + randomUUID(),
  passwort = randomBytes(24).toString("hex");
await db.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true)",
  [login, await passwordHash(passwort)],
);
const origin = (await readFile("/etc/timereal/dienst.conf", "utf8")).match(
  /^PUBLIC_ORIGIN=(.*)$/m,
)[1];
let cookie = "";
async function q(path, body, key = randomUUID()) {
  const r = await fetch("http://127.0.0.1:3040/api/v1" + path, {
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(6000),
    headers: {
      origin,
      cookie,
      "content-type": "application/json",
      "idempotency-key": key,
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
  for (let n = 0; n < 600; n++) {
    try {
      const j = await q("/verwaltung/betrieb/auftraege/" + id);
      if (j.zustand === ziel) return j;
      if (
        [
          "fehlgeschlagen",
          "wiederherstellung_noetig",
          "vorherige_version_aktiv",
        ].includes(j.zustand)
      )
        throw new Error(JSON.stringify(j));
    } catch (e) {
      if (!/fetch failed|ECONNREFUSED|503/.test(e.message)) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Zeitlimit bei " + ziel);
}
try {
  await q("/anmeldung", { login, passwort });
  const key = randomUUID(),
    url = "/verwaltung/betrieb/updates/vorbereiten";
  const [a, b] = await Promise.all([
    q(url, { tag }, key),
    q(url, { tag }, key),
  ]);
  assert.equal(a.id, b.id);
  await warten(a.id, "bereit");
  console.log(
    "Vorbereitung über echte API und HTTPS-Releasequelle abgeschlossen; doppelte Anfrage hat dieselbe Auftrags-ID.",
  );
  const startKey = randomUUID(),
    startUrl = `/verwaltung/betrieb/updates/${a.id}/installieren`;
  const started = await q(startUrl, { passwort }, startKey);
  assert.equal(started.id, a.id);
  const ende = await warten(a.id, erwartet);
  assert.equal(ende.tag, tag);
  assert.equal(
    (await q("/version")).version,
    erwartet === "erfolgreich" ? tag.slice(1) : "0.7.1",
  );
  console.log(
    `Echter Webauftrag ${tag}: ${erwartet}; Version und API nach Neustart geprüft.`,
  );
} finally {
  await db.end();
}
