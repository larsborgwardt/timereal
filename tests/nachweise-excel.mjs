import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, digest } from "../dist/session.js";
import { leseXlsx } from "./hilfe/xlsx.mjs";
import { writeFile } from "node:fs/promises";

test("Excel enthält gefilterte persönliche Nachweise, Zahlen, Ortszeiten und sichere Texte", async (t) => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const {
    rows: [a, b],
  } = await db.query(
    "insert into konto(login_referenz,nachkommastellen) values('excel-a',3),('excel-b',2) returning id",
  );
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  await db.query(
    "alter role timereal_app login password 'nur-fuer-diese-wegwerfdatenbank'",
  );
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
  });
  t.after(async () => {
    await app.close();
    await db.end();
  });
  await db.query("update konto set ist_admin=true where id=$1", [b.id]);
  const session = await issueSession(db, a.id, "web"),
    foreign = await issueSession(db, b.id, "web");
  const extension = await issueSession(db, a.id, "erweiterung");
  const q = (method, path, payload, token = session, bearer = false) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      payload,
      headers: {
        host: "zeit.test",
        origin: "https://zeit.test",
        ...(bearer
          ? { authorization: "Bearer " + token }
          : { cookie: "timereal=" + token }),
      },
    });
  const ok = async (p) => {
    const r = await p;
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const path =
    "/nachweise/excel?von=2026-11-10&bis=2026-11-12&ansicht=historie";
  assert.equal((await q("GET", path, undefined, "")).statusCode, 401);
  const projekt = await ok(
    q("POST", "/ziele", {
      kunde: "Müller & Söhne",
      art: "Projekt",
      bezeichnung: "=SUM(1,2)",
    }),
  );
  const ziel = await ok(
    q("POST", "/ziele", {
      kunde: "Müller & Söhne",
      art: "Ticket",
      bezeichnung: "00123",
      projektId: projekt.id,
    }),
  );
  const note = '=HYPERLINK("https://example.org")\nPrüfung <&> äöß';
  const neu = async (beginn, ende, extra = {}) =>
    ok(
      q("POST", "/abschnitte", {
        art: "zugeordnet",
        zielId: ziel.id,
        beginn,
        ende,
        leistungstext: note,
        ...extra,
      }),
    );
  const nacht = await neu("2026-11-09T22:30:00Z", "2026-11-09T23:30:00Z");
  const bereit = await neu("2026-11-10T08:00:00Z", "2026-11-10T09:40:00Z");
  await neu("2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z", {
    art: "intern",
    zielId: undefined,
    leistungstext: "Interne Arbeit",
    abrechenbar: false,
  });
  await neu("2026-11-10T11:00:00Z", "2026-11-10T12:00:00Z", {
    art: "vorlaeufig",
    zielId: undefined,
    leistungstext: "Zuordnen",
  });
  const uebertragen = await neu("2026-11-11T08:00:00Z", "2026-11-11T09:00:00Z");
  const storno = await neu("2026-11-12T08:00:00Z", "2026-11-12T09:00:00Z");
  const historie = () =>
    ok(q("GET", "/historie?von=2026-11-10&bis=2026-11-12"));
  let h = await historie();
  const u = h.find((e) => e.id === uebertragen.id);
  await ok(
    q("POST", `/abschnitte/${u.id}/uebernahme`, {
      fassung: u.fassung,
      stand: u.stand,
    }),
  );
  await ok(q("POST", `/abschnitte/${storno.id}/storno`, { fassung: "1" }));
  await neu("2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z");
  await neu("2026-11-10T13:00:00Z", "2026-11-10T13:00:00Z");
  await db.query(
    "insert into zeitabschnitt(konto_id,art,beginn,ende,leistungstext,abrechenbar) values ($1,'intern','2026-11-10T08:00Z','2026-11-10T09:00Z','Fremd',false)",
    [b.id],
  );
  await db.query(
    "insert into zeitabschnitt(konto_id,art,beginn,abrechenbar) values ($1,'intern','2026-11-12T14:00Z',false)",
    [a.id],
  );
  h = await historie();
  const vorher = await db.query(
    "select id,fassung,uebertragene_fassung,uebertragener_stand from zeitabschnitt where konto_id=$1 order by id",
    [a.id],
  );
  for (const ansicht of ["historie", "uebernahme"]) {
    for (const suche of ["", "mÜLler", "00123", "=sum(", "%", "kein Treffer"]) {
      const r = await q(
        "GET",
        path.replace("ansicht=historie", "ansicht=" + ansicht) +
          "&suche=" +
          encodeURIComponent(suche),
      );
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(
        r.headers["content-type"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      assert.match(
        r.headers["content-disposition"],
        /attachment; filename="timereal-nachweise-2026-11-10-bis-2026-11-12.xlsx"/,
      );
      assert.equal(r.headers["cache-control"], "no-store");
      const workbook = leseXlsx(r.rawPayload),
        sheet = workbook.sheets[0];
      assert.deepEqual(
        workbook.sheets.map((s) => s.name),
        ["Nachweise", "Exportinfo"],
      );
      assert.equal(sheet.pane.ySplit, "1");
      assert.deepEqual(
        Object.values(sheet.rows[0]).map((c) => c.value),
        [
          "Datum",
          "Kunde",
          "Projekt",
          "Buchungsziel",
          "Art",
          "Leistungstext",
          "Beginn",
          "Ende",
          "Dauer",
          "Stunden",
          "Abrechenbar",
          "Status",
          "Buchungs-ID",
        ],
      );
      const expected = h
        .filter(
          (e) =>
            e.ende &&
            (ansicht === "historie" ||
              !["Storniert", "Nicht abrechenbar", "Übertragen"].includes(
                e.status,
              )) &&
            [e.kunde, e.ziel, e.projekt]
              .join(" ")
              .toLowerCase()
              .includes(suche.trim().toLowerCase()),
        )
        .sort(
          (a, b) =>
            b.tag.localeCompare(a.tag) ||
            a.beginn.localeCompare(b.beginn) ||
            Number(a.id) - Number(b.id),
        );
      assert.deepEqual(
        sheet.rows.slice(1).map((row, i) => row["M" + (i + 2)].value),
        expected.map((e) => e.id),
      );
      for (const s of workbook.sheets)
        for (const row of s.rows)
          for (const c of Object.values(row))
            assert.equal(c.formula, false, "Nutztext darf keine Formel werden");
      if (!suche && ansicht === "historie") {
        const i = sheet.rows.findIndex(
            (row, i) => row["M" + (i + 1)]?.value === bereit.id,
          ),
          n = i + 1,
          row = sheet.rows[i];
        assert.equal(row["F" + n].value, note);
        assert.equal(row["D" + n].value, "00123");
        assert.equal(row["D" + n].type, "s");
        assert.equal(row["J" + n].value, 1.667);
        assert.equal(row["J" + n].type, "n");
        assert.ok(Math.abs(row["I" + n].value - 100 / 1440) < 1e-10);
        assert.ok(Math.abs((row["G" + n].value % 1) - 9 / 24) < 1e-9);
        assert.ok(
          sheet.rows.some((row, i) => row["M" + (i + 1)]?.value === nacht.id),
        );
        if (process.env.EXCEL_TEST_AUSGABE)
          await writeFile(process.env.EXCEL_TEST_AUSGABE, r.rawPayload);
      }
    }
  }
  assert.deepEqual(
    (
      await db.query(
        "select id,fassung,uebertragene_fassung,uebertragener_stand from zeitabschnitt where konto_id=$1 order by id",
        [a.id],
      )
    ).rows,
    vorher.rows,
  );
  const fremd = leseXlsx((await q("GET", path, undefined, foreign)).rawPayload);
  assert.equal(fremd.sheets[0].rows.length, 2);
  assert.equal(fremd.sheets[0].rows[1].F2.value, "Fremd");
  assert.equal(
    (await q("GET", path, undefined, extension, true)).statusCode,
    200,
  );
  const dst = leseXlsx(
    (
      await q(
        "GET",
        "/nachweise/excel?von=2026-10-25&bis=2026-10-25&ansicht=historie",
      )
    ).rawPayload,
  ).sheets[0].rows[1];
  assert.equal(dst.J2.value, 2);
  assert.ok(Math.abs(dst.I2.value - 2 / 24) < 1e-10);
  assert.ok(Math.abs((dst.G2.value % 1) - 2.5 / 24) < 1e-9);
  assert.ok(Math.abs((dst.H2.value % 1) - 3.5 / 24) < 1e-9);
  // Korrektur und offener Storno bleiben in der Übernahmeansicht erkennbar.
  await ok(
    q("PATCH", `/abschnitte/${u.id}/notiz`, {
      fassung: u.fassung,
      leistungstext: "Korrektur nach Übernahme",
    }),
  );
  const aktuell = (await historie()).find((e) => e.id === bereit.id);
  await ok(
    q("POST", `/abschnitte/${bereit.id}/uebernahme`, {
      fassung: aktuell.fassung,
      stand: aktuell.stand,
    }),
  );
  await ok(
    q("POST", `/abschnitte/${bereit.id}/storno`, { fassung: aktuell.fassung }),
  );
  const korrigiert = leseXlsx(
    (await q("GET", path.replace("historie", "uebernahme"))).rawPayload,
  ).sheets[0].rows;
  assert.ok(
    korrigiert.some((r, i) => r["L" + (i + 1)]?.value === "Erneut prüfen"),
  );
  assert.ok(
    korrigiert.some((r, i) => r["L" + (i + 1)]?.value === "Storno offen"),
  );
  for (const bad of [
    path + "&kontoId=" + b.id,
    path.replace("2026-11-10", "2026-11-30"),
    path.replace("2026-11-10", "2026-02-30"),
    path.replace("historie", "alles"),
    path + "&suche=" + "a".repeat(241),
  ])
    assert.equal((await q("GET", bad)).statusCode, 400, bad);
  await db.query("update sitzung set widerrufen_am=now() where schluessel=$1", [
    digest(session),
  ]);
  assert.equal((await q("GET", path)).statusCode, 401);
  await db.query("update konto set aktiv=false where id=$1", [b.id]);
  assert.equal((await q("GET", path, undefined, foreign)).statusCode, 401);
});

test("Excel meldet eine zu große Auswahl statt unbemerkt Nachweise abzuschneiden", async (t) => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const {
    rows: [konto],
  } = await db.query(
    "insert into konto(login_referenz) values('excel-limit') returning id",
  );
  await db.query(
    "insert into zeitabschnitt(konto_id,art,beginn,ende,abrechenbar,leistungstext) select $1,'intern','2025-01-01T08:00Z'::timestamptz + n*interval '1 minute','2025-01-01T08:01Z'::timestamptz + n*interval '1 minute',false,case when n=5000 then 'Rand' else 'Bestand' end from generate_series(0,5000) n",
    [konto.id],
  );
  const token = await issueSession(db, konto.id, "web");
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
  });
  t.after(async () => {
    await app.close();
    await db.end();
  });
  const get = (suche = "") =>
    app.inject({
      url:
        "/api/v1/nachweise/excel?von=2025-01-01&bis=2025-01-31&ansicht=historie" +
        suche,
      headers: { cookie: "timereal=" + token },
    });
  const zuGross = await get();
  assert.equal(zuGross.statusCode, 413);
  assert.match(zuGross.json().fehler, /5.000/);
  assert.equal(
    leseXlsx((await get("&suche=kein-treffer")).rawPayload).sheets[0].rows
      .length,
    1,
  );
  // Derselbe Datenbestand liegt in der Übernahmeansicht unter dem Limit: intern.
  const leer = await app.inject({
    url: "/api/v1/nachweise/excel?von=2025-01-01&bis=2025-01-31&ansicht=uebernahme",
    headers: { cookie: "timereal=" + token },
  });
  assert.equal(leer.statusCode, 200);
  assert.equal(leseXlsx(leer.rawPayload).sheets[0].rows.length, 1);
  await db.query(
    "delete from zeitabschnitt where konto_id=$1 and leistungstext='Rand'",
    [konto.id],
  );
  const rand = await get();
  assert.equal(rand.statusCode, 200);
  assert.equal(leseXlsx(rand.rawPayload).sheets[0].rows.length, 5001);
});
