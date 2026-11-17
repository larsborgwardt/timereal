import { strict as assert } from "node:assert";
import { test } from "node:test";
import pg from "pg";
import { createApp } from "../dist/app.js";

test("Laptop, Handy, Wiederholung und persönliche Kontogrenze", async () => {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  const {
    rows: [a, b],
  } = await owner.query(
    "insert into konto(login_referenz) values ('eins'),('zwei') returning id",
  );
  const {
    rows: [c, d],
  } = await owner.query(
    "insert into kunde(konto_id,name) values ($1,'Alpha'),($1,'Beta') returning id",
    [a.id],
  );
  const {
    rows: [x, y],
  } = await owner.query(
    "insert into buchungsziel(konto_id,kunde_id,art,bezeichnung) values ($1,$2,'Ticket','A'),($1,$3,'Termin','B') returning id",
    [a.id, c.id, d.id],
  );
  const role = new URL(process.env.TEST_DATABASE_URL);
  role.username = "timereal_app";
  role.password = "nur-fuer-diese-wegwerfdatenbank";
  await owner.query(
    "alter role timereal_app login password 'nur-fuer-diese-wegwerfdatenbank'",
  );
  const app = createApp(new pg.Pool({ connectionString: role.href }), {
    secure: true,
  });
  const { issueSession } = await import("../dist/session.js");
  const laptop = await issueSession(owner, a.id, "web");
  const handy = await issueSession(owner, a.id, "web");
  const fremd = await issueSession(owner, b.id, "web");
  const q = (session, method, url, payload, key) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: "timereal=" + session,
        origin: "https://timereal.test",
        host: "timereal.test",
        ...(key ? { "idempotency-key": key } : {}),
      },
      payload,
    });
  const cmd = (session, action, version, zielId, key = crypto.randomUUID()) =>
    q(
      session,
      "POST",
      "/api/v1/timer/" + action,
      { version, ...(zielId ? { art: "zugeordnet", zielId } : {}) },
      key,
    );
  try {
    assert.equal((await q(laptop, "GET", "/api/v1/timer")).json().version, "0");
    const first = await cmd(laptop, "start", "0", x.id);
    assert.equal(first.statusCode, 200, first.body);
    const key = crypto.randomUUID();
    const pair = await Promise.all([
      cmd(handy, "wechsel", "1", y.id, key),
      cmd(laptop, "wechsel", "1", y.id, key),
    ]);
    assert.deepEqual(
      pair.map((r) => r.statusCode),
      [200, 200],
    );
    assert.deepEqual(pair[0].json(), pair[1].json());
    assert.equal((await cmd(handy, "wechsel", "1", x.id, key)).statusCode, 409);
    const competing = await Promise.all([
      cmd(handy, "wechsel", "2", x.id),
      cmd(laptop, "wechsel", "2", x.id),
    ]);
    assert.deepEqual(competing.map((r) => r.statusCode).sort(), [200, 409]);
    const timer = (await q(laptop, "GET", "/api/v1/timer")).json();
    assert.equal(timer.version, "3");
    assert.equal(timer.aktiv.ziel_id, x.id);
    const { rows: intervals } = await owner.query(
      "select beginn,ende,ziel_id from zeitabschnitt where konto_id=$1 order by id",
      [a.id],
    );
    assert.deepEqual(
      intervals.map((r) => r.ziel_id),
      [x.id, y.id, x.id],
    );
    assert.deepEqual(intervals[0].ende, intervals[1].beginn);
    assert.deepEqual(intervals[1].ende, intervals[2].beginn);
    assert.equal(intervals[2].ende, null);
    assert.equal((await cmd(fremd, "start", "0", x.id)).statusCode, 404);
    assert.equal((await q(fremd, "GET", "/api/v1/timer")).json().aktiv, null);
    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/timer/stopp",
      headers: {
        cookie: "timereal=" + handy,
        origin: "https://fremd.test",
        host: "timereal.test",
        "idempotency-key": crypto.randomUUID(),
      },
      payload: { version: "3" },
    });
    assert.equal(rejected.statusCode, 403);
    assert.equal((await cmd(laptop, "stopp", "3")).statusCode, 200);
    await owner.query(
      "update sitzung set widerrufen_am=now() where konto_id=$1",
      [a.id],
    );
    assert.equal((await q(handy, "GET", "/api/v1/timer")).statusCode, 401);
  } finally {
    await app.close();
    await owner.end();
  }
});

test("Eine Pause bleibt auf dem anderen Gerät erhalten und endet durch Fortsetzen oder Stopp", async () => {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  const {
    rows: [k],
  } = await owner.query(
    "insert into konto(login_referenz) values ('pausentest') returning id",
  );
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
  });
  const { issueSession } = await import("../dist/session.js");
  const token = await issueSession(owner, k.id, "web");
  const headers = {
    cookie: "timereal=" + token,
    origin: "https://zeit.test",
    host: "zeit.test",
  };
  const act = (name, v, more = {}) =>
    app.inject({
      method: "POST",
      url: "/api/v1/timer/" + name,
      headers: { ...headers, "idempotency-key": crypto.randomUUID() },
      payload: { version: String(v), ...more },
    });
  try {
    assert.equal((await act("start", 0, { art: "intern" })).statusCode, 200);
    const pause = await act("pause", 1);
    assert.equal(pause.statusCode, 200, pause.body);
    assert.equal(pause.json().aktiv, null);
    assert.ok(pause.json().pause.id);
    const again = await act("fortsetzen", 2);
    assert.equal(again.json().aktiv.art, "intern");
    assert.notEqual(again.json().aktiv.id, pause.json().pause.id);
    assert.equal((await act("pause", 3)).statusCode, 200);
    assert.deepEqual((await act("stopp", 4)).json(), {
      version: "5",
      aktiv: null,
      pause: null,
    });
  } finally {
    await app.close();
    await owner.end();
  }
});

test("Bereits übertragene Stunde in 20 / 12 / 28 Minuten teilen und externes Storno bestätigen", async () => {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  const {
    rows: [k],
  } = await owner.query(
    "insert into konto(login_referenz) values('aufteilen') returning id",
  );
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
  });
  const { issueSession } = await import("../dist/session.js");
  const headers = {
    cookie: "timereal=" + (await issueSession(owner, k.id, "web")),
    origin: "https://zeit.test",
    host: "zeit.test",
  };
  const req = (method, url, payload) =>
    app.inject({ method, url: "/api/v1" + url, headers, payload });
  try {
    const ziel = (
      await req("POST", "/ziele", {
        kunde: "Alpha",
        art: "Ticket",
        bezeichnung: "Ticket A",
      })
    ).json();
    const b = (
      await req("POST", "/ziele", {
        kunde: "Beta",
        art: "Termin",
        bezeichnung: "Gespräch",
      })
    ).json();
    const start = "2026-11-10T09:00:00Z",
      ende = "2026-11-10T10:00:00Z";
    const angelegt = await req("POST", "/abschnitte", {
      art: "zugeordnet",
      zielId: ziel.id,
      beginn: start,
      ende,
      leistungstext: "Bearbeitung",
    });
    assert.equal(angelegt.statusCode, 200, angelegt.body);
    const pfad = "/abschnitte/" + angelegt.json().id;
    const historie = async () =>
      (await req("GET", "/historie?von=2026-11-10&bis=2026-11-10")).json();
    const [vorher] = await historie();
    assert.equal(
      (
        await req("POST", pfad + "/uebernahme", {
          fassung: vorher.fassung,
          stand: vorher.stand,
        })
      ).statusCode,
      200,
    );
    const teil = {
      fassung: vorher.fassung,
      art: "zugeordnet",
      zielId: b.id,
      beginn: "2026-11-10T09:20:00Z",
      ende: "2026-11-10T09:32:00Z",
      leistungstext: "Gespräch",
    };
    assert.equal(
      (await req("POST", pfad + "/unterbrechung", teil)).statusCode,
      200,
    );
    assert.equal(
      (await req("POST", pfad + "/unterbrechung", teil)).statusCode,
      409,
    );
    const teile = (await historie()).reverse();
    assert.deepEqual(
      teile.map((t) => Number(t.minuten)),
      [20, 12, 28],
    );
    assert.equal(teile[0].uebertragener_stand.stunden, "1.00");
    assert.equal(teile[0].status, "Erneut prüfen");
    assert.equal(teile[0].id, vorher.id);
    assert.deepEqual(
      teile.slice(1).map((t) => t.status),
      ["Bereit", "Bereit"],
    );
    assert.equal(
      (await req("POST", pfad + "/storno", { fassung: teile[0].fassung }))
        .statusCode,
      200,
    );
    const storno = (await historie()).find((t) => t.id === vorher.id);
    assert.equal(storno.status, "Storno offen");
    assert.equal(
      (
        await req("POST", pfad + "/uebernahme", {
          fassung: storno.fassung,
          stand: storno.stand,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await historie()).find((t) => t.id === vorher.id).status,
      "Storniert",
    );
  } finally {
    await app.close();
    await owner.end();
  }
});

test("Datenbankrolle und wiederverwendete Verbindung trennen Konten auch nach Rollback", async () => {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  const {
    rows: [a, b],
  } = await owner.query(
    "insert into konto(login_referenz) values('rollenprobe1'),('rollenprobe2') returning id",
  );
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    const {
      rows: [role],
    } = await client.query(
      "select rolsuper,rolbypassrls from pg_roles where rolname=current_user",
    );
    assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });
    for (const [konto, ende] of [
      [a, "COMMIT"],
      [b, "ROLLBACK"],
    ]) {
      assert.equal((await client.query("select id from konto")).rowCount, 0);
      await client.query("BEGIN");
      await client.query("select set_config('app.konto_id',$1,true)", [
        konto.id,
      ]);
      assert.deepEqual((await client.query("select id from konto")).rows, [
        konto,
      ]);
      await client.query(ende);
    }
    await assert.rejects(
      client.query("insert into kunde(konto_id,name) values ($1,'X')", [a.id]),
      { code: "42501" },
    );
    await assert.rejects(client.query("select * from sitzung"), {
      code: "42501",
    });
    await assert.rejects(client.query("select passwort_hash from konto"), {
      code: "42501",
    });
  } finally {
    await client.end();
    await owner.end();
  }
});
