import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession } from "../dist/session.js";

test("Kundenpflege, Einstellungen und Woche rechnen echte Minuten über Tages- und Sommerzeitgrenzen", async () => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const {
    rows: [k, fremd],
  } = await db.query(
    "insert into konto(login_referenz) values('wochensicht'),('wochenfremd') returning id",
  );
  const token = await issueSession(db, k.id, "web"),
    other = await issueSession(db, fremd.id, "web");
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
    origin: "https://zeit.test",
  });
  const q = (method, path, payload, session = token) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      headers: { cookie: "timereal=" + session, origin: "https://zeit.test" },
      payload,
    });
  const ok = async (p, code = 200) => {
    const r = await p;
    assert.equal(r.statusCode, code, r.body);
    return r.json();
  };
  try {
    await ok(
      q("PATCH", "/einstellungen", { nachkommastellen: 3, pruefminuten: 360 }),
    );
    await ok(
      q("PATCH", "/einstellungen", { nachkommastellen: 4, pruefminuten: 0 }),
      400,
    );
    const profile = await ok(q("GET", "/profil"));
    assert.equal(profile.nachkommastellen, 3);
    assert.equal(profile.pruefminuten, 360);
    const project = await ok(
      q("POST", "/ziele", {
        kunde: "Alpha",
        art: "Projekt",
        bezeichnung: "Einführung",
      }),
    );
    const target = await ok(
      q("POST", "/ziele", {
        kunde: "Alpha",
        art: "Ticket",
        bezeichnung: "A",
        projektId: project.id,
      }),
    );
    const rows = await ok(q("GET", "/ziele"));
    const z = rows.find((x) => x.id === target.id);
    assert.equal(z.fassung, "1");
    const kunden = await ok(q("GET", "/kunden"));
    assert.equal(kunden.length, 1);
    await ok(
      q("PATCH", "/kunden/" + kunden[0].id, {
        fassung: "1",
        name: "Alpha GmbH",
      }),
    );
    await ok(
      q("PATCH", "/kunden/" + kunden[0].id, { fassung: "1", name: "Veraltet" }),
      409,
    );
    await ok(
      q(
        "PATCH",
        "/ziele/" + z.id,
        {
          fassung: "1",
          bezeichnung: "Geprüft",
          projektId: project.id,
          abrechenbar: true,
        },
        other,
      ),
      409,
    );
    await ok(
      q("PATCH", "/ziele/" + z.id, {
        fassung: "1",
        bezeichnung: "Geprüft",
        projektId: project.id,
        abrechenbar: true,
      }),
    );
    // Beide Felder gehören zu einem Speichern: veraltetes Ziel darf keinen Kundennamen ändern.
    await ok(
      q("PATCH", "/ziele/" + z.id, {
        fassung: "1",
        bezeichnung: "Konflikt",
        projektId: project.id,
        abrechenbar: true,
        kundeName: "Nicht speichern",
        kundeFassung: "2",
      }),
      409,
    );
    assert.equal((await ok(q("GET", "/kunden")))[0].name, "Alpha GmbH");
    await ok(
      q("PATCH", "/ziele/" + z.id, {
        fassung: "2",
        bezeichnung: "Geprüft",
        projektId: project.id,
        abrechenbar: true,
        kundeName: "Alpha GmbH",
        kundeFassung: "2",
      }),
    );
    const entry = async (beginn, ende, art = "zugeordnet") =>
      ok(
        q("POST", "/abschnitte", {
          art,
          ...(art === "zugeordnet" ? { zielId: z.id } : {}),
          beginn,
          ende,
          leistungstext: "Abstimmung",
        }),
      );
    await entry("2026-03-23T23:30:00+01:00", "2026-03-24T00:30:00+01:00");
    const uebernacht = await ok(
      q("GET", "/historie?von=2026-03-24&bis=2026-03-24"),
    );
    assert.equal(
      uebernacht.length,
      1,
      "Der am Vortag begonnene Abschnitt gehört auch in diesen Tag",
    );
    await entry("2026-03-29T01:30:00+01:00", "2026-03-29T03:30:00+02:00");
    await entry(
      "2026-03-24T10:00:00+01:00",
      "2026-03-24T10:30:00+01:00",
      "intern",
    );
    const storno = await entry(
      "2026-03-24T11:00:00+01:00",
      "2026-03-24T12:00:00+01:00",
    );
    await ok(
      q("POST", "/abschnitte/" + storno.id + "/storno", { fassung: "1" }),
    );
    const w = await ok(q("GET", "/woche?von=2026-03-25"));
    assert.equal(w.von, "2026-03-23");
    assert.equal(w.bis, "2026-03-29");
    assert.equal(w.erfasst, 150);
    assert.equal(w.abrechenbar, 120);
    assert.deepEqual(
      w.zeilen.map((x) => [x.tag, x.kunde, x.minuten]),
      [
        ["2026-03-23", "Alpha GmbH", 30],
        ["2026-03-24", "Alpha GmbH", 30],
        ["2026-03-24", null, 30],
        ["2026-03-29", "Alpha GmbH", 60],
      ],
    );
    const empty = await ok(q("GET", "/woche?von=2026-03-25", undefined, other));
    assert.equal(empty.erfasst, 0);
    assert.deepEqual(empty.zeilen, []);
    const [e] = await ok(q("GET", "/historie?von=2026-03-29&bis=2026-03-29"));
    await ok(
      q("POST", "/abschnitte/" + e.id + "/uebernahme", {
        fassung: e.fassung,
        stand: e.stand,
      }),
    );
    const parent = (await ok(q("GET", "/ziele"))).find(
      (x) => x.id === project.id,
    );
    await ok(
      q("PATCH", "/ziele/" + parent.id, {
        fassung: parent.fassung,
        bezeichnung: "Migration",
        projektId: null,
        abrechenbar: true,
      }),
    );
    const [changed] = await ok(
      q("GET", "/historie?von=2026-03-29&bis=2026-03-29"),
    );
    assert.equal(changed.status, "Erneut prüfen");
    assert.equal(changed.uebertragener_stand.projekt, "Einführung");
    assert.equal(changed.stand.projekt, "Migration");
  } finally {
    await app.close();
    await db.end();
  }
});
