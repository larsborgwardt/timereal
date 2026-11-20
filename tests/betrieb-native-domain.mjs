// Nur über den markierten Debian-Prüfgast ausführen; Aufruf im Betriebsprüfskript.
import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
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
  const fertig = await warten(j.id, "erfolgreich");
  // Kein Bestätigungsfenster mehr: Der Auftrag endet ohne Frist und ohne Rücknahme.
  assert.equal(fertig.frist, undefined);
  const ip = new URL(fertig.proxyZiel).hostname;
  assert.match(
    fertig.meldung,
    new RegExp("https://" + ip.replaceAll(".", "\\.")),
  );
  const conf = await readFile("/etc/timereal/dienst.conf", "utf8");
  assert.match(conf, new RegExp("^PUBLIC_ORIGIN=https://" + domain + "$", "m"));
  // Anmeldung über die lokale Adresse bleibt möglich. Caddy reicht den
  // angefragten Host durch; hier setzt ihn die Probe selbst.
  const lokal = (herkunft) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: 3040,
          path: "/api/v1/anmeldung",
          method: "POST",
          headers: {
            host: ip,
            origin: herkunft,
            "content-type": "application/json",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ login, passwort }));
    });
  assert.equal(await lokal("https://" + ip), 200);
  assert.equal(await lokal("https://fremd.example.org"), 403);
  // Eine zuvor eingerichtete, jetzt ersetzte Domain ist keine zulässige Herkunft mehr.
  if (origin !== "https://" + ip)
    await assert.rejects(q("/anmeldung", { login, passwort }), /403/);
  origin = "https://" + domain;
  cookie = "";
  await q("/anmeldung", { login, passwort });
  assert.equal(
    (await q("/verwaltung/betrieb/auftraege/" + j.id)).zustand,
    "erfolgreich",
  );
  console.log(
    "Domain mit realem Caddy/TLS eingerichtet; Anmeldung über Domain und lokale Adresse möglich, fremde und ersetzte Herkunft abgewiesen; keine Frist.",
  );
} finally {
  await db.end();
}
