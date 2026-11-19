import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, passwordHash } from "../dist/session.js";

test("Betriebs-API lässt nur aktive Admin-Websitzungen und bestätigte Schreibaufträge durch", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "timereal-ipc-"));
  const socket = join(dir, "test.sock");
  const empfangen = [];
  // Testdouble ausschließlich für den privilegierten Prozess; Authentifizierung und DB sind echt.
  const dienst = createServer(async (req, res) => {
    const teile = [];
    for await (const chunk of req) teile.push(chunk);
    const data = JSON.parse(Buffer.concat(teile).toString());
    empfangen.push(data);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        erreichbar: true,
        id: "12345678-1234-4123-8123-123456789012",
        zustand: "bereit",
      }),
    );
  });
  await new Promise((resolve) => dienst.listen(socket, resolve));
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const hash = await passwordHash("BetriebTest!123456");
  const {
    rows: [admin, berater],
  } = await db.query(
    "insert into konto(login_referenz,passwort_hash,ist_admin) values ($1,$3,true),($2,$3,false) returning id",
    ["betrieb-" + crypto.randomUUID(), "berater-" + crypto.randomUUID(), hash],
  );
  const a = await issueSession(db, admin.id, "web", hash);
  const b = await issueSession(db, berater.id, "web", hash);
  const ext = await issueSession(db, admin.id, "erweiterung", hash);
  const role = new URL(process.env.TEST_DATABASE_URL);
  role.username = "timereal_app";
  role.password = "nur-fuer-diese-wegwerfdatenbank";
  const updatePruefungen = [];
  const app = createApp(new pg.Pool({ connectionString: role.href }), {
    secure: true,
    origin: "https://zeit.test",
    betriebSocket: socket,
    updateCheck: async (frisch = false) => {
      updatePruefungen.push(frisch);
      return {
        status: "ok",
        currentVersion: "0.7.0",
        latestVersion: "0.7.1",
        updateAvailable: true,
        checkedAt: new Date().toISOString(),
        repositoryUrl: "https://github.com/larsborgwardt/timereal",
        releaseUrl:
          "https://github.com/larsborgwardt/timereal/releases/tag/v0.7.1",
      };
    },
  });
  t.after(async () => {
    await app.close();
    await db.end();
    await new Promise((resolve) => dienst.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const q = (session, method, path, payload, headers = {}) =>
    app.inject({
      method,
      url: "/api/v1/verwaltung/betrieb" + path,
      headers: {
        cookie: "timereal=" + session,
        origin: "https://zeit.test",
        "idempotency-key": crypto.randomUUID(),
        ...headers,
      },
      payload,
    });
  assert.equal((await q(b, "GET", "/status")).statusCode, 403);
  assert.equal((await q("", "GET", "/status")).statusCode, 401);
  assert.equal(
    (
      await q(a, "GET", "/status", undefined, {
        authorization: "Bearer " + ext,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await q(
        a,
        "POST",
        "/updates/vorbereiten",
        { tag: "v0.7.0" },
        { origin: "https://fremd.test" },
      )
    ).statusCode,
    403,
  );
  assert.equal(empfangen.length, 0);
  for (const [session, headers, code] of [
    ["", {}, 401],
    [b, {}, 403],
    [a, { authorization: "Bearer " + ext }, 403],
    [a, { origin: "https://fremd.test" }, 403],
  ])
    assert.equal(
      (await q(session, "POST", "/updates/pruefen", {}, headers)).statusCode,
      code,
    );
  assert.equal(
    (await q(a, "POST", "/updates/pruefen", { url: "https://fremd.test" }))
      .statusCode,
    400,
  );
  assert.deepEqual(updatePruefungen, []);
  const frisch = await q(a, "POST", "/updates/pruefen", {});
  assert.equal(frisch.statusCode, 200, frisch.body);
  assert.equal(frisch.json().latestVersion, "0.7.1");
  assert.deepEqual(updatePruefungen, [true]);
  const nochmal = await q(a, "POST", "/updates/pruefen", {});
  assert.equal(nochmal.statusCode, 429);
  assert.ok(Number(nochmal.headers["retry-after"]) > 0);
  assert.deepEqual(updatePruefungen, [true]);
  await app.inject("/api/v1/updates?force=true");
  assert.deepEqual(
    updatePruefungen,
    [true, false],
    "Öffentlicher Zugriff kann den Cache nicht umgehen",
  );
  assert.equal(
    empfangen.length,
    0,
    "Versionsabfrage benötigt keine root-Aktion",
  );
  const status = await q(a, "GET", "/status");
  const a2 = await issueSession(db, admin.id, "web", hash);
  assert.equal((await q(a2, "POST", "/updates/pruefen", {})).statusCode, 429);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 60001 });
  try {
    assert.equal((await q(a2, "POST", "/updates/pruefen", {})).statusCode, 200);
    assert.deepEqual(updatePruefungen, [true, false, true]);
  } finally {
    t.mock.timers.reset();
  }
  assert.equal(status.statusCode, 200, status.body);
  const start = await q(a, "POST", "/updates/vorbereiten", { tag: "v0.7.0" });
  assert.equal(start.statusCode, 202, start.body);
  assert.equal(empfangen.at(-1).anfrage.konto, admin.id);
  const id = start.json().id;
  const davor = empfangen.length;
  assert.equal(
    (await q(a, "POST", `/updates/${id}/installieren`, { passwort: "falsch" }))
      .statusCode,
    403,
  );
  assert.equal(empfangen.length, davor);
  const install = await q(a, "POST", `/updates/${id}/installieren`, {
    passwort: "BetriebTest!123456",
  });
  assert.equal(install.statusCode, 202, install.body);
  assert.equal(JSON.stringify(empfangen).includes("BetriebTest"), false);
  assert.equal(
    (
      await q(a, "POST", "/domain/pruefen", {
        domain: "zeit.example.org",
        ip: "1.2.3.4",
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await q(a, "POST", "/updates/vorbereiten", { tag: "main" })).statusCode,
    400,
  );
  await db.query("update sitzung set widerrufen_am=now() where konto_id=$1", [
    admin.id,
  ]);
  assert.equal((await q(a, "GET", "/status")).statusCode, 401);
  assert.equal((await q(a, "POST", "/updates/pruefen", {})).statusCode, 401);
});
