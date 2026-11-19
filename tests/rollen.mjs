import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, passwordHash } from "../dist/session.js";

test("Rollen trennen Verwaltung, widerrufen Sitzungen und schützen den letzten Administrator auch bei Konkurrenz", async (t) => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  assert.equal(
    (await db.query("select count(*)::int n from konto")).rows[0].n,
    0,
    "Eigene leere Rollen-Prüfdatenbank erforderlich",
  );
  await db.query(
    "alter role timereal_app password 'nur-fuer-diese-wegwerfdatenbank'",
  );
  const hash = await passwordHash("Rollenprobe!2026abcd");
  const {
    rows: [admin, kunde],
  } = await db.query(
    "insert into konto(login_referenz,passwort_hash,ist_admin) values('rollen-admin',$1,true),('rollen-berater',$1,false) returning id",
    [hash],
  );
  const a = await issueSession(db, admin.id, "web", hash);
  let b = await issueSession(db, kunde.id, "web", hash);
  const ext = await issueSession(db, kunde.id, "erweiterung", hash);
  const adminExt = await issueSession(db, admin.id, "erweiterung", hash);
  const dir = await mkdtemp(join(tmpdir(), "timereal-rollen-"));
  const socket = join(dir, "dienst.sock");
  const empfangen = [];
  // Nur der privilegierte Prozess ist ersetzt; HTTP, Sitzungen, RLS und SQL sind echt.
  const dienst = createServer(async (req, res) => {
    const teile = [];
    for await (const teil of req) teile.push(teil);
    empfangen.push(JSON.parse(Buffer.concat(teile).toString()));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ erreichbar: true, zeilen: [] }));
  });
  await new Promise((resolve) => dienst.listen(socket, resolve));
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
    origin: "https://zeit.test",
    betriebSocket: socket,
  });
  t.after(async () => {
    await app.close();
    await db.end();
    await new Promise((resolve) => dienst.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const q = (s, method, path, payload, headers = {}) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      payload,
      headers: {
        cookie: "timereal=" + s,
        origin: "https://zeit.test",
        "idempotency-key": crypto.randomUUID(),
        ...headers,
      },
    });
  const ok = async (p, code = 200) => {
    const r = await p;
    assert.equal(r.statusCode, code, r.body);
    return r.json();
  };
  const rolle = (s, ziel, wert) =>
    q(s, "PATCH", "/verwaltung/konten/" + ziel + "/rolle", { rolle: wert });
  await ok(rolle(a, kunde.id, "berater"));
  await ok(q(b, "GET", "/profil"));
  await ok(rolle(b, admin.id, "berater"), 403);
  await ok(
    q(
      "",
      "PATCH",
      "/verwaltung/konten/" + kunde.id + "/rolle",
      { rolle: "betrieb" },
      { authorization: "Bearer " + adminExt },
    ),
    403,
  );
  await ok(rolle(a, kunde.id, "root"), 400);
  await ok(rolle(a, "999999999999", "betrieb"), 409);
  await ok(q(b, "GET", "/verwaltung/betrieb/status"), 403);
  assert.equal(empfangen.length, 0);
  await ok(q(b, "POST", "/timer/start", { version: "0", art: "intern" }));
  await ok(rolle(a, kunde.id, "betrieb"));
  await ok(q(b, "GET", "/profil"), 401);
  await ok(
    q("", "GET", "/timer", undefined, { authorization: "Bearer " + ext }),
    401,
  );
  b = await issueSession(db, kunde.id, "web", hash);
  assert.equal((await ok(q(b, "GET", "/profil"))).rolle, "betrieb");
  assert.ok(
    (await ok(q(b, "GET", "/timer"))).aktiv,
    "Rollenwechsel beendet keine persönliche Arbeit",
  );
  for (const path of [
    "/verwaltung/konten",
    "/verwaltung/einladungen",
    "/verwaltung/mail",
  ])
    await ok(q(b, "GET", path), 403);
  for (const path of ["/verwaltung/betrieb/status", "/verwaltung/betrieb/logs"])
    await ok(q(b, "GET", path));
  await ok(
    q(b, "POST", "/verwaltung/betrieb/domain/pruefen", {
      domain: "zeit.example.org",
    }),
    202,
  );
  assert.equal(empfangen.at(-1).anfrage.konto, String(kunde.id));
  const erhalten = empfangen.length;
  const betriebExt = await issueSession(db, kunde.id, "erweiterung", hash);
  await ok(
    q("", "GET", "/verwaltung/betrieb/logs", undefined, {
      authorization: "Bearer " + betriebExt,
    }),
    403,
  );
  assert.equal(empfangen.length, erhalten);
  await db.query(
    "insert into kunde(konto_id,name) values($1,'Persönlicher Kunde des Administrators')",
    [admin.id],
  );
  assert.deepEqual((await ok(q(b, "GET", "/arbeitsstand"))).kunden, []);
  const direkt = new pg.Client({ connectionString: url.href });
  await direkt.connect();
  try {
    await direkt.query("begin");
    await direkt.query("select set_config('app.konto_id',$1,true)", [
      String(kunde.id),
    ]);
    assert.equal(
      (await direkt.query("select count(*)::int n from kunde")).rows[0].n,
      0,
    );
    await assert.rejects(
      direkt.query(
        "update konto set ist_admin=true where id=aktuelles_konto()",
      ),
      { code: "42501" },
    );
    await direkt.query("rollback");
  } finally {
    await direkt.end();
  }
  await ok(rolle(a, kunde.id, "betrieb"));
  await ok(q(b, "GET", "/profil"));
  await ok(rolle(a, admin.id, "berater"), 409);
  await ok(
    q(a, "PATCH", "/verwaltung/konten/" + admin.id, { aktiv: false }),
    409,
  );
  await ok(rolle(a, kunde.id, "administrator"));
  b = await issueSession(db, kunde.id, "web", hash);
  async function gleichzeitig(anfragen) {
    // Beide Anfragen müssen wirklich vor der Sitzungssperre am selben Schloss warten.
    await db.query("select pg_advisory_lock(734995512)");
    let rennen;
    try {
      rennen = Promise.all(anfragen.map((fn) => fn()));
      let wartende = 0;
      for (let i = 0; i < 100 && wartende < 2; i++) {
        wartende = (
          await db.query(
            "select count(*)::int n from pg_stat_activity where usename='timereal_app' and wait_event='advisory'",
          )
        ).rows[0].n;
        if (wartende < 2)
          await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        wartende,
        2,
        "Beide Rollenänderungen erreichen die Serialisierung vor dem Kontoschloss",
      );
    } finally {
      await db.query("select pg_advisory_unlock(734995512)");
    }
    return rennen;
  }
  const antworten = await gleichzeitig([
    () => rolle(a, kunde.id, "berater"),
    () => rolle(b, admin.id, "berater"),
  ]);
  assert.deepEqual(antworten.map((r) => r.statusCode).sort(), [200, 401]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from konto where aktiv and ist_admin",
      )
    ).rows[0].n,
    1,
  );
  // Zweiter Konkurrenzfall: gegenseitige Sperre, erneut mit zwei aktiven Admins.
  await db.query(
    "update konto set ist_admin=true,ist_betrieb=false,aktiv=true",
  );
  const neuA = await issueSession(db, admin.id, "web", hash);
  const neuB = await issueSession(db, kunde.id, "web", hash);
  const sperren = await gleichzeitig([
    () => q(neuA, "PATCH", "/verwaltung/konten/" + kunde.id, { aktiv: false }),
    () => q(neuB, "PATCH", "/verwaltung/konten/" + admin.id, { aktiv: false }),
  ]);
  assert.deepEqual(sperren.map((r) => r.statusCode).sort(), [200, 401]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from konto where aktiv and ist_admin",
      )
    ).rows[0].n,
    1,
  );
  // Bestehende 0.8.0-Kontoabfragen bleiben auf Schema 7 ausführbar.
  const aktiv = (
    await db.query("select id from konto where aktiv and ist_admin")
  ).rows[0].id;
  const alt = new pg.Client({ connectionString: url.href });
  await alt.connect();
  try {
    await alt.query("begin");
    await alt.query("select set_config('app.konto_id',$1,true)", [aktiv]);
    assert.equal(
      (await alt.query("select * from konten_lesen()")).rows.length,
      2,
    );
    assert.equal(
      (
        await alt.query(
          "select ist_admin from konto where id=aktuelles_konto()",
        )
      ).rows[0].ist_admin,
      true,
    );
    await alt.query("rollback");
  } finally {
    await alt.end();
  }
});
