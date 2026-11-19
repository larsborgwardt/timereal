import pg from "pg";
import { strict as assert } from "node:assert";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { passwordHash } from "../dist/session.js";

// Ausschließlich durch last.sh erzeugte Wegwerf-DB; vor jedem Schreibzugriff prüfen.
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
const out = process.env.LAST_AUSGABE;
assert(out && process.env.LAST_ORIGIN);
const users = 100,
  sections = 5000;
try {
  assert.equal(
    (await db.query("select id from timereal_lastprobe")).rows[0]?.id,
    1,
    "Kennzeichnung der Wegwerf-Datenbank fehlt",
  );
  if (process.argv[2] === "vorbereiten") {
    assert.equal(
      (await db.query("select count(*)::int as n from konto")).rows[0].n,
      0,
      "Leere Wegwerf-DB erforderlich",
    );
    const password = randomBytes(24).toString("hex");
    const hash = await passwordHash(password);
    await db.query(
      "alter role timereal_app password 'kapazitaet-wegwerfrolle'",
    );
    await db.query(
      "insert into konto(login_referenz,passwort_hash) select 'last-'||n,$1 from generate_series(1,$2) n",
      [hash, users],
    );
    await db.query(
      "insert into kunde(konto_id,name) select id,'Kunde '||id||'-'||n from konto cross join generate_series(1,5) n",
    );
    await db.query(
      "insert into buchungsziel(konto_id,kunde_id,art,bezeichnung) select konto_id,id,'Ticket','Ziel '||id||'-'||n from kunde cross join generate_series(1,4) n",
    );
    // Endet vor heute: Timerstart kollidiert niemals mit einem künstlichen zukünftigen Abschnitt.
    await db.query(
      `insert into zeitabschnitt(konto_id,art,kunde_id,ziel_id,beginn,ende,leistungstext)
      select k.id,'zugeordnet',z.kunde_id,z.id,
        date_trunc('day',now()) - interval '250 days' + (n/20)*interval '1 day' + (n%20)*interval '20 minutes',
        date_trunc('day',now()) - interval '250 days' + (n/20)*interval '1 day' + (n%20)*interval '20 minutes' + interval '20 minutes',
        'Leistung '||k.id||'-'||n from konto k
      cross join lateral(select * from buchungsziel where konto_id=k.id order by id limit 1) z
      cross join generate_series(0,$1-1) n`,
      [sections],
    );
    await db.query("analyze");
    const accounts = (
      await db.query(`select k.id,k.login_referenz as login,array_agg(z.id::text order by z.id) as ziele
      from konto k join buchungsziel z on z.konto_id=k.id group by k.id order by k.id`)
    ).rows;
    await writeFile(
      out + "/zugang.json",
      JSON.stringify({ password, accounts }),
      { mode: 0o600 },
    );
    console.log(
      `Wegwerfbestand: ${users} Nutzer, ${users * sections} Abschnitte.`,
    );
  } else {
    assert.equal(process.argv[2], "messen");
    const { password, accounts } = JSON.parse(
      await readFile(out + "/zugang.json"),
    );
    assert.equal(accounts.length, users);
    const duration = Number(process.env.LAST_SEKUNDEN || 120);
    assert(
      Number.isInteger(duration) && duration >= 120,
      "Mindestens 120 Sekunden",
    );
    const measures = { anmeldung: [], lesen: [], schreiben: [] },
      errors = [];
    let requests = 0,
      peakDb = 0;
    const endpoints = {};
    async function q(
      a,
      method,
      path,
      body,
      key,
      kind = "lesen",
      expected = 200,
    ) {
      const start = performance.now();
      const response = await fetch(process.env.LAST_ORIGIN + "/api/v1" + path, {
        method,
        headers: {
          origin: process.env.LAST_ORIGIN,
          ...(a.cookie ? { cookie: a.cookie } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
          ...(key ? { "idempotency-key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      const elapsed = performance.now() - start;
      measures[kind].push(elapsed);
      (endpoints[
        method + " " + path.split("?")[0].replace(/\/\d+\//g, "/:id/")
      ] ??= []).push(elapsed);
      requests++;
      if (response.status !== expected)
        errors.push({ path, status: response.status, expected });
      assert.equal(response.status, expected, JSON.stringify({ path, data }));
      if (path === "/anmeldung")
        a.cookie = response.headers.get("set-cookie").split(";")[0];
      return data;
    }
    const cmd = async (a, action, extra = {}, key = randomUUID()) => {
      const data = await q(
        a,
        "POST",
        "/timer/" + action,
        { version: a.version, ...extra },
        key,
        "schreiben",
      );
      a.version = data.version;
      a.active = data.aktiv;
      return data;
    };
    const begin = performance.now();
    await Promise.all(
      accounts.map(async (a) => {
        await q(
          a,
          "POST",
          "/anmeldung",
          { login: a.login, passwort: password },
          null,
          "anmeldung",
        );
        a.version = "0";
      }),
    );
    await Promise.all(
      accounts.map((a) =>
        cmd(a, "start", { art: "zugeordnet", zielId: a.ziele[0] }),
      ),
    );
    const lastDay = (await db.query("select (current_date-1)::text as tag"))
      .rows[0].tag;
    const runStart = performance.now();
    let cycles = 0;
    while (performance.now() - runStart < duration * 1000) {
      const cycleStart = performance.now();
      await Promise.all(
        accounts.map(async (a) => {
          const { timer, ziele, profil, kunden } = await q(
            a,
            "GET",
            "/arbeitsstand",
          );
          assert.equal(timer.version, a.version);
          assert.equal(timer.aktiv.konto_id, a.id);
          assert.deepEqual(ziele.map((z) => z.id).sort(), [...a.ziele].sort());
          assert.equal(kunden.length, 5);
          assert(kunden.every((k) => k.name.startsWith("Kunde " + a.id + "-")));
          assert.equal(profil.login, a.login);
          if (cycles % 2) await q(a, "GET", "/woche?von=" + lastDay);
          else {
            const rows = await q(
              a,
              "GET",
              `/historie?von=${lastDay}&bis=${lastDay}`,
            );
            assert.equal(rows.length, 20);
            assert(
              rows.every((r) =>
                r.leistungstext.startsWith("Leistung " + a.id + "-"),
              ),
            );
          }
          if (cycles % 2 === 0) {
            const key = randomUUID(),
              body = {
                version: a.version,
                art: "zugeordnet",
                zielId: a.ziele[cycles % a.ziele.length],
              };
            const first = await q(
              a,
              "POST",
              "/timer/wechsel",
              body,
              key,
              "schreiben",
            );
            const repeat = await q(
              a,
              "POST",
              "/timer/wechsel",
              body,
              key,
              "schreiben",
            );
            assert.deepEqual(repeat, first);
            a.version = first.version;
            a.active = first.aktiv;
          }
        }),
      );
      peakDb = Math.max(
        peakDb,
        (
          await db.query(
            "select count(*)::int as n from pg_stat_activity where usename='timereal_app'",
          )
        ).rows[0].n,
      );
      const stats = execFileSync(
        "docker",
        [
          "stats",
          "--no-stream",
          "--format",
          "{{json .}}",
          process.env.LAST_API_CONTAINER,
          process.env.LAST_DB_CONTAINER,
        ],
        { encoding: "utf8" },
      );
      await writeFile(out + "/ressourcen-" + cycles + ".jsonl", stats);
      cycles++;
      await pause(Math.max(0, 10000 - (performance.now() - cycleStart)));
    }
    await Promise.all(
      accounts.map(async (a, i) => {
        const foreign = accounts[(i + 1) % users];
        await q(
          a,
          "POST",
          "/timer/wechsel",
          { version: a.version, art: "zugeordnet", zielId: foreign.ziele[0] },
          randomUUID(),
          "schreiben",
          404,
        );
        await q(
          a,
          "PATCH",
          `/abschnitte/${foreign.active.id}/notiz`,
          { fassung: foreign.active.fassung, leistungstext: "Fremd" },
          null,
          "schreiben",
          409,
        );
        await cmd(a, "pause");
        await cmd(a, "fortsetzen");
        await cmd(a, "stopp");
      }),
    );
    const state = (
      await db.query(`select k.id,k.timer_version::text as version,count(a.id)::int as n,
      count(*) filter(where a.ende is null)::int as aktiv from konto k join zeitabschnitt a on a.konto_id=k.id group by k.id order by k.id`)
    ).rows;
    for (const a of accounts) {
      const s = state.find((s) => s.id === a.id);
      assert.equal(s.version, a.version);
      assert.equal(s.aktiv, 0);
      assert.equal(s.n, sections + 2 + Math.ceil(cycles / 2));
    }
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from zeitabschnitt where leistungstext='Fremd'",
        )
      ).rows[0].n,
      0,
    );
    const latency = Object.fromEntries(
      Object.entries(measures).map(([key, values]) => {
        values.sort((a, b) => a - b);
        const p = (n) => Math.round(values[Math.ceil(values.length * n) - 1]);
        return [
          key,
          {
            anzahl: values.length,
            p50: p(0.5),
            p95: p(0.95),
            p99: p(0.99),
            max: Math.round(values.at(-1)),
          },
        ];
      }),
    );
    const passed =
      errors.length === 0 &&
      latency.lesen.p95 < 1000 &&
      latency.lesen.p99 < 2000 &&
      latency.schreiben.p95 < 1000 &&
      latency.schreiben.p99 < 2000 &&
      latency.anmeldung.p95 < 8000;
    const report = {
      zeit: new Date().toISOString(),
      release: JSON.parse(await readFile("release.json")),
      nutzer: users,
      abschnitteVorher: users * sections,
      zyklen: cycles,
      messSekunden: duration,
      gesamtSekunden: Math.round((performance.now() - begin) / 1000),
      requests,
      latency,
      errors,
      peakDb,
      endpunkte: Object.fromEntries(
        Object.entries(endpoints).map(([path, values]) => {
          values.sort((a, b) => a - b);
          return [
            path,
            {
              anzahl: values.length,
              p95: Math.round(values[Math.ceil(values.length * 0.95) - 1]),
            },
          ];
        }),
      ),
      datenbankBytes: (
        await db.query(
          "select pg_database_size(current_database())::text as bytes",
        )
      ).rows[0].bytes,
      node: execFileSync(
        "docker",
        ["exec", process.env.LAST_API_CONTAINER, "node", "--version"],
        { encoding: "utf8" },
      ).trim(),
      ressourcen: {
        api: "1 CPU / 512 MiB, Node 24 Alpine",
        datenbank: "2 CPU / 1536 MiB, PostgreSQL",
        netz: "HTTP über Loopback, ohne Reverseproxy/TLS",
      },
      postgres: (await db.query("select version()")).rows[0].version,
      pass: passed,
    };
    await writeFile(
      out + "/ergebnis.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
    assert(passed, "Kapazitätsgrenzen nicht eingehalten");
  }
} finally {
  await db.end();
}
