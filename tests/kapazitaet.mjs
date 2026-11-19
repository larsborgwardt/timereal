import { test } from "node:test";
import { strict as assert } from "node:assert";
import pg from "pg";
import { EventEmitter } from "node:events";
import { createApp } from "../dist/app.js";
import { issueSession } from "../dist/session.js";
import * as datenbank from "../dist/db.js";

test("Der Produktionspool begrenzt SQL, Sperren und Verbindungswartezeit", async () => {
  assert.equal(typeof datenbank.datenbankPool, "function");
  const pool = datenbank.datenbankPool({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  });
  try {
    const {
      rows: [row],
    } =
      await pool.query(`select current_setting('statement_timeout') as statement,
      current_setting('lock_timeout') as lock,current_setting('idle_in_transaction_session_timeout') as idle`);
    assert.deepEqual(row, { statement: "5s", lock: "1s", idle: "10s" });
    assert.equal(pool.options.max, 12);
    assert.equal(pool.options.connectionTimeoutMillis, 3000);
    const client = await pool.connect();
    try {
      await client.query("set statement_timeout=50");
      await assert.rejects(client.query("select pg_sleep(1)"), {
        code: "57014",
      });
    } finally {
      client.release(true);
    }
    const idle = await pool.connect(),
      pid = (await idle.query("select pg_backend_pid() as id")).rows[0].id;
    const admin = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await admin.connect();
    try {
      const reported = new Promise((resolve) => pool.once("error", resolve));
      idle.release();
      await admin.query("select pg_terminate_backend($1)", [pid]);
      await reported;
      assert.equal((await pool.query("select 42 as n")).rows[0].n, 42);
    } finally {
      await admin.end();
    }
  } finally {
    await pool.end();
  }
  for (const value of ["", "0", "-1", "1.5", "33", "100", "zwölf"])
    assert.throws(
      () => datenbank.datenbankPool({ TIMEREAL_DB_POOL_MAX: value }),
      /TIMEREAL_DB_POOL_MAX/,
    );
});

async function setup(options) {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  const a = (
    await owner.query(
      "insert into konto(login_referenz) values($1) returning id",
      ["kapazitaet-" + crypto.randomUUID()],
    )
  ).rows[0];
  const token = await issueSession(owner, a.id, "web");
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const pool = new pg.Pool({ connectionString: url.href, max: 1, ...options });
  const app = createApp(pool, {
    secure: true,
    origin: "https://timereal.test",
  });
  const request = () =>
    app.inject({
      url: "/api/v1/timer",
      headers: { cookie: "timereal=" + token },
    });
  return {
    owner,
    pool,
    app,
    a,
    request,
    close: async () => {
      await owner.query("rollback");
      await app.close();
      await owner.end();
    },
  };
}
test("Eine Kontosperre wartet begrenzt; danach bleibt der Pool benutzbar", async () => {
  const x = await setup({
    options: "-c lock_timeout=80ms -c statement_timeout=500ms",
  });
  try {
    await x.owner.query("begin");
    await x.owner.query("select id from konto where id=$1 for update", [
      x.a.id,
    ]);
    const response = await x.request();
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(response.headers["retry-after"], "1");
    assert.doesNotMatch(response.body, /statement|timeout|konto_id|postgres/i);
    await x.owner.query("rollback");
    assert.equal((await x.request()).statusCode, 200);
  } finally {
    await x.close();
  }
});
test("Ein belegter Verbindungspool antwortet vorübergehend nicht verfügbar und erholt sich", async () => {
  const x = await setup({ connectionTimeoutMillis: 80 });
  let held;
  try {
    held = await x.pool.connect();
    const response = await x.request();
    assert.equal(response.statusCode, 503, response.body);
    assert.equal(response.headers["retry-after"], "1");
    held.release();
    held = null;
    assert.equal((await x.request()).statusCode, 200);
  } finally {
    held?.release();
    await x.close();
  }
});
test("SQL-Abbruch rollt eine bereits vorgenommene Änderung zurück", async () => {
  const x = await setup({ options: "-c statement_timeout=80ms" });
  try {
    await assert.rejects(
      datenbank.transaktion(x.pool, async (client) => {
        await client.query("select set_config('app.konto_id',$1,true)", [
          x.a.id,
        ]);
        await client.query("update konto set timer_version=timer_version+1");
        await client.query("select pg_sleep(1)");
      }),
      { code: "57014" },
    );
    assert.equal((await x.request()).json().version, "0");
  } finally {
    await x.close();
  }
});
test("Ein fehlgeschlagener Rollback verwirft die Verbindung und erhält den ursprünglichen Fehler", async () => {
  // Testdouble nur für den Transportausfall während ROLLBACK; keine simulierte Fachantwort.
  let release;
  const original = new Error("Verbindung verloren");
  const client = Object.assign(new EventEmitter(), {
    query: async (sql) => {
      if (sql === "ROLLBACK") throw new Error("Rollback nicht mehr möglich");
    },
    release: (value) => {
      release = value;
    },
  });
  await assert.rejects(
    datenbank.transaktion({ connect: async () => client }, async () => {
      throw original;
    }),
    (error) => error === original,
  );
  assert.equal(release, true);
});

test("Die optimierten Zeitraumzugriffe erhalten Null-Minuten- und Mitternachtsgrenzen", async () => {
  const x = await setup({});
  try {
    await x.owner.query(
      `insert into zeitabschnitt(konto_id,art,abrechenbar,beginn,ende)
      values ($1,'vorlaeufig',false,'2026-03-29T00:00:00+01','2026-03-29T00:00:00+01'),
      ($1,'vorlaeufig',false,'2026-03-30T00:00:00+02','2026-03-30T00:00:00+02'),
      ($1,'vorlaeufig',false,'2026-03-28T23:30:00+01','2026-03-29T00:00:00+01'),
      ($1,'vorlaeufig',false,'2026-03-29T23:30:00+02','2026-03-30T00:30:00+02')`,
      [x.a.id],
    );
    const token = await issueSession(x.owner, x.a.id, "web");
    const get = async (url) => {
      const r = await x.app.inject({
        url,
        headers: { cookie: "timereal=" + token },
      });
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const rows = await get("/api/v1/historie?von=2026-03-29&bis=2026-03-29");
    assert.deepEqual(
      rows.map((r) => r.minuten),
      ["60", "0"],
    );
    const week = await get("/api/v1/woche?von=2026-03-29");
    assert.equal(week.erfasst, 60);
    assert.equal(week.offen, 3);
  } finally {
    await x.close();
  }
});

test("Ein gemeinsamer Arbeitsstand liefert Timer und Stammdaten ausschließlich aus dem eigenen Konto", async () => {
  const x = await setup({});
  try {
    const token = await issueSession(x.owner, x.a.id, "web");
    await x.owner.query(
      "insert into kunde(konto_id,name) values($1,'Eigener Kunde')",
      [x.a.id],
    );
    const anonym = await x.app.inject({ url: "/api/v1/arbeitsstand" });
    assert.equal(anonym.statusCode, 401, anonym.body);
    const get = async (path) => {
      const r = await x.app.inject({
        url: "/api/v1" + path,
        headers: { cookie: "timereal=" + token },
      });
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const snapshot = await get("/arbeitsstand");
    assert.deepEqual(Object.keys(snapshot).sort(), [
      "kunden",
      "profil",
      "timer",
      "ziele",
    ]);
    for (const key of ["timer", "profil", "kunden", "ziele"])
      assert.deepEqual(snapshot[key], await get("/" + key));
    assert.equal(snapshot.profil.id, x.a.id);
    assert.equal(snapshot.kunden.length, 1);
    assert.equal(snapshot.kunden[0].name, "Eigener Kunde");
    assert(!JSON.stringify(snapshot).includes("passwort_hash"));
  } finally {
    await x.close();
  }
});

test("Das Anmeldelimit zählt Großschreibungsvarianten desselben Kontos gemeinsam", async () => {
  const x = await setup({});
  const adresse = "caseprobe-" + crypto.randomUUID() + "@example.test";
  try {
    await x.owner.query("update konto set email=$1 where id=$2", [
      adresse,
      x.a.id,
    ]);
    for (let i = 0; i < 13; i++) {
      const login =
        adresse
          .slice(0, 9)
          .split("")
          .map((c, n) => (i & (1 << n) ? c.toUpperCase() : c))
          .join("") + adresse.slice(9);
      assert.equal(
        (await x.owner.query("select id from login_suchen($1)", [login]))
          .rows[0].id,
        x.a.id,
      );
      const r = await x.app.inject({
        method: "POST",
        url: "/api/v1/anmeldung",
        headers: { origin: "https://timereal.test" },
        payload: { login, passwort: "FalschesTestpasswort" },
      });
      assert.equal(r.statusCode, i < 12 ? 401 : 429);
    }
    const andere = await x.app.inject({
      method: "POST",
      url: "/api/v1/anmeldung",
      headers: { origin: "https://timereal.test" },
      payload: { login: "anderes-konto", passwort: "FalschesTestpasswort" },
    });
    assert.equal(andere.statusCode, 401);
  } finally {
    await x.close();
  }
});
