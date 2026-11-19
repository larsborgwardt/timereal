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
  const domain =
    origin === "https://example.org" ? "example.net" : "example.org";
  const automatisch = process.env.TIMEREAL_TEST_EINKLICK === "1";
  const j = await q(
    "/verwaltung/betrieb/domain/" + (automatisch ? "speichern" : "pruefen"),
    { domain },
  );
  if (!automatisch) {
    await warten(j.id, "geprueft");
    await q(`/verwaltung/betrieb/domain/${j.id}/uebernehmen`, { passwort });
  }
  await warten(j.id, "bestaetigung_ausstehend");
  await assert.rejects(
    q(`/verwaltung/betrieb/domain/${j.id}/bestaetigen`, {}),
    /403/,
  );
  origin = "https://" + domain;
  cookie = "";
  await q("/anmeldung", { login, passwort });
  await q(`/verwaltung/betrieb/domain/${j.id}/bestaetigen`, {});
  await warten(j.id, "erfolgreich");
  console.log(
    "Domain mit realem Caddy/TLS übernommen; neue Anmeldung und Bestätigung erfolgreich; alter Ursprung abgewiesen.",
  );
  if (!automatisch) {
    const vorher = await readFile("/etc/timereal/dienst.conf", "utf8");
    const zweite = await q("/verwaltung/betrieb/domain/pruefen", {
      domain: domain === "example.org" ? "example.net" : "example.org",
    });
    await warten(zweite.id, "geprueft");
    await q(`/verwaltung/betrieb/domain/${zweite.id}/uebernehmen`, {
      passwort,
    });
    await warten(zweite.id, "bestaetigung_ausstehend");
    console.log(
      "Unbestätigter Wechsel: automatische Rücknahme nach echter Dreiminutenfrist wird geprüft.",
    );
    await warten(zweite.id, "zurueckgesetzt");
    assert.equal(await readFile("/etc/timereal/dienst.conf", "utf8"), vorher);
    cookie = "";
    await q("/anmeldung", { login, passwort });
    console.log(
      "Automatischer Rückbau und erneute Anmeldung an der vorherigen Adresse bestanden.",
    );
  }
} finally {
  await db.end();
}
