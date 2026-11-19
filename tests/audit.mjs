import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, passwordHash } from "../dist/session.js";
import { postfach } from "./hilfe/smtp.mjs";

test("Audit erhält lange Loginreferenzen bestehender Konten unverändert", async () => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  try {
    const login = "altkonto-" + randomBytes(160).toString("hex");
    const {
      rows: [konto],
    } = await db.query(
      "insert into konto(login_referenz) values($1) returning id",
      [login],
    );
    const {
      rows: [ereignis],
    } = await db.query(
      "select ziel from audit_ereignis where art='konto_angelegt' and ziel=$1",
      [login],
    );
    assert.equal(ereignis.ziel, login);
    await db.query("begin");
    await db.query("select set_config('app.konto_id',$1,true)", [konto.id]);
    await db.query("update konto set email=$1 where id=$2", [
      "alt-" + konto.id + "@example.test",
      konto.id,
    ]);
    await db.query("commit");
    const {
      rows: [aenderung],
    } = await db.query(
      "select akteur,ziel from audit_ereignis where art='email_geaendert' and ziel=$1",
      [login],
    );
    assert.equal(aenderung.akteur, login);
    assert.equal(aenderung.ziel, login);
  } finally {
    await db.end();
  }
});

test("Audit: Rollen, echte Ereignisse, Geheimnisgrenze, Zeitraum und Export", async (t) => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const suffix = randomBytes(6).toString("hex"),
    passwort = randomBytes(20).toString("hex");
  const hash = await passwordHash(passwort),
    mail = await postfach();
  const {
    rows: [admin, berater, betrieb],
  } = await db.query(
    "insert into konto(login_referenz,passwort_hash,ist_admin,ist_betrieb) values($1,$4,true,false),($2,$4,false,false),($3,$4,false,true) returning id",
    [
      "audit-admin-" + suffix,
      "audit-berater-" + suffix,
      "audit-betrieb-" + suffix,
      hash,
    ],
  );
  const a = await issueSession(db, admin.id, "web", hash),
    b = await issueSession(db, berater.id, "web", hash);
  const o = await issueSession(db, betrieb.id, "web", hash),
    ext = await issueSession(db, admin.id, "erweiterung", hash);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
    origin: "https://zeit.test",
    smtp: mail.config,
  });
  t.after(async () => {
    await app.close();
    await mail.close();
    await db.end();
  });
  const q = (s, method, path, payload, headers = {}) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      payload,
      headers: {
        origin: "https://zeit.test",
        cookie: "timereal=" + s,
        ...headers,
      },
    });
  const ok = async (p, code = 200) => {
    const r = await p;
    assert.equal(r.statusCode, code, r.body);
    return r.json();
  };
  for (const pfad of ["/verwaltung/audit", "/verwaltung/audit/export"]) {
    await ok(q("", "GET", pfad), 401);
    for (const s of [b, o]) await ok(q(s, "GET", pfad), 403);
    await ok(
      q("", "GET", pfad, undefined, { authorization: "Bearer " + ext }),
      403,
    );
  }
  await ok(
    q(a, "PATCH", "/verwaltung/konten/" + berater.id + "/rolle", {
      rolle: "betrieb",
    }),
  );
  const query =
    "/verwaltung/audit?suche=" + encodeURIComponent("audit-berater-" + suffix);
  const stand = await ok(q(a, "GET", query));
  assert.equal(stand.zeitzone, "Europe/Berlin");
  const rolle = stand.eintraege.find((e) => e.art === "rolle_geaendert");
  assert.ok(rolle);
  assert.equal(rolle.akteur, "audit-admin-" + suffix);
  assert.equal(rolle.ziel, "audit-berater-" + suffix);
  assert.equal(rolle.vorher, "berater");
  assert.equal(rolle.nachher, "betrieb");
  const menge = stand.eintraege.length;
  await ok(
    q(a, "PATCH", "/verwaltung/konten/" + berater.id + "/rolle", {
      rolle: "betrieb",
    }),
  );
  assert.equal((await ok(q(a, "GET", query))).eintraege.length, menge);
  await db.query("begin");
  await db.query("update konto set ist_betrieb=false where id=$1", [
    berater.id,
  ]);
  await db.query("rollback");
  assert.equal((await ok(q(a, "GET", query))).eintraege.length, menge);
  // Erfolge und Fehlschläge enthalten keine eingereichten Passwörter oder fremden Texte.
  await ok(
    q("", "POST", "/anmeldung", {
      login: "audit-admin-" + suffix,
      passwort: "falsch-" + passwort,
    }),
    401,
  );
  await ok(
    q("", "POST", "/anmeldung", { login: "unbekannt-" + suffix, passwort }),
    401,
  );
  await ok(
    q("", "POST", "/anmeldung", { login: "audit-admin-" + suffix, passwort }),
  );
  await ok(
    q(a, "PATCH", "/profil", { email: "audit-" + suffix + "@example.test" }),
  );
  const emailToken = /#email=([a-f0-9]{64})/.exec(
    mail.nachrichten.at(-1).replace(/=\r\n/g, "").replace(/=3D/g, "="),
  )[1];
  await ok(q(a, "POST", "/profil/email-bestaetigen", { token: emailToken }));
  const invite = await ok(
    q(a, "POST", "/verwaltung/einladungen", {
      email: "audit-neu-" + suffix + "@example.test",
    }),
  );
  await ok(q(a, "POST", "/verwaltung/einladungen/" + invite.id + "/erneut"));
  await ok(q(a, "DELETE", "/verwaltung/einladungen/" + invite.id));
  const token = () => {
    const text = mail.nachrichten
      .at(-1)
      .replace(/=\r\n/g, "")
      .replace(/=3D/g, "=");
    const wert = /#(?:einladung|reset)=([a-f0-9]{64})/.exec(text)?.[1];
    assert.ok(wert);
    return wert;
  };
  const email = "audit-annahme-" + suffix + "@example.test";
  await ok(q(a, "POST", "/verwaltung/einladungen", { email }));
  const einladungscode = token();
  await ok(
    q("", "POST", "/einladung/annehmen", { token: einladungscode, passwort }),
  );
  const anmeldung = await q("", "POST", "/anmeldung", {
    login: email,
    passwort,
  });
  assert.equal(anmeldung.statusCode, 200, anmeldung.body);
  const sitzung = /timereal=([a-f0-9]+)/.exec(
    anmeldung.headers["set-cookie"],
  )[1];
  const neu = randomBytes(20).toString("hex");
  await ok(q(sitzung, "POST", "/passwort/aendern", { alt: passwort, neu }));
  await ok(q("", "POST", "/passwort/anfordern", { email }), 202);
  const alterReset = token();
  await ok(q("", "POST", "/passwort/anfordern", { email }), 202);
  const resetcode = token();
  await ok(
    q("", "POST", "/passwort/zuruecksetzen", { token: resetcode, passwort }),
  );
  await ok(q(a, "PATCH", "/verwaltung/konten/" + berater.id, { aktiv: false }));
  await ok(q(a, "PATCH", "/verwaltung/konten/" + berater.id, { aktiv: true }));
  const raw = JSON.stringify(
    (await db.query("select * from audit_ereignis")).rows,
  );
  const linkhashes = (
    await db.query("select hash from kontolink where email=$1", [email])
  ).rows.map((e) => e.hash);
  for (const geheim of [
    passwort,
    neu,
    hash,
    a,
    b,
    o,
    ext,
    sitzung,
    einladungscode,
    resetcode,
    alterReset,
    ...linkhashes,
    "unbekannt-" + suffix,
  ])
    assert.equal(raw.includes(geheim), false, geheim);
  const ereignisse = (await ok(q(a, "GET", "/verwaltung/audit"))).eintraege;
  for (const art of [
    "anmeldung",
    "anmeldung_fehlgeschlagen",
    "email_geaendert",
    "einladung_erstellt",
    "einladung_erneuert",
    "einladung_widerrufen",
    "sitzung_widerrufen",
    "einladung_angenommen",
    "passwort_geaendert",
    "reset_angefordert",
    "reset_verbraucht",
    "reset_widerrufen",
    "konto_gesperrt",
    "konto_entsperrt",
  ])
    assert.ok(
      ereignisse.some((e) => e.art === art),
      art,
    );
  // SQL-Anwendungsrolle darf weder direkt lesen noch Einträge fälschen/löschen.
  const direkt = new pg.Client({ connectionString: url.href });
  await direkt.connect();
  try {
    for (const sql of [
      "select * from audit_ereignis",
      "update audit_ereignis set ziel='anders'",
      "delete from audit_ereignis",
      "insert into audit_ereignis(art) values('anmeldung')",
    ])
      await assert.rejects(direkt.query(sql), { code: "42501" });
    await direkt.query("begin");
    await direkt.query("select set_config('app.konto_id',$1,true)", [
      betrieb.id,
    ]);
    await assert.rejects(
      direkt.query("select * from audit_lesen(null,null,'',null,101)"),
      { code: "42501" },
    );
    await direkt.query("rollback");
  } finally {
    await direkt.end();
  }
  await assert.rejects(db.query("update audit_ereignis set ziel='anders'"), {
    code: "42501",
  });
  await assert.rejects(db.query("delete from audit_ereignis"), {
    code: "42501",
  });
  await db.query(
    "insert into audit_ereignis(zeit,art,ziel) values(clock_timestamp()-interval '181 days','anmeldung',$1),(clock_timestamp()+interval '1 day','anmeldung',$1)",
    ["zeitgrenze-" + suffix],
  );
  assert.deepEqual(
    (await ok(q(a, "GET", "/verwaltung/audit?suche=zeitgrenze-" + suffix)))
      .eintraege,
    [],
  );
  for (const params of [
    "von=2026-02-30",
    "von=2026-11-20&bis=2026-11-19",
    "vor=-1",
    "suche=" + "a".repeat(201),
  ])
    await ok(q(a, "GET", "/verwaltung/audit?" + params), 400);
  assert.deepEqual(
    (await ok(q(a, "GET", "/verwaltung/audit?suche=%25"))).eintraege,
    [],
  );
  // Der Kalendertag wird in der Zeitzone des Lesers begrenzt, nicht in UTC.
  await db.query("update konto set zeitzone='America/New_York' where id=$1", [
    admin.id,
  ]);
  const {
    rows: [datum],
  } = await db.query("select to_char(current_date-10,'YYYY-MM-DD') as tag");
  await db.query(
    "with grenzen as (select $1::date::timestamp at time zone 'America/New_York' as anfang,($1::date+1)::timestamp at time zone 'America/New_York' as ende) insert into audit_ereignis(zeit,art,ziel) select zeit,'anmeldung',$2 from grenzen cross join lateral unnest(array[anfang-interval '1 microsecond',anfang,ende-interval '1 microsecond',ende]) as t(zeit)",
    [datum.tag, "tagesgrenze-" + suffix],
  );
  const tagestreffer = await ok(
    q(
      a,
      "GET",
      "/verwaltung/audit?suche=tagesgrenze-" +
        suffix +
        "&von=" +
        datum.tag +
        "&bis=" +
        datum.tag,
    ),
  );
  assert.equal(tagestreffer.zeitzone, "America/New_York");
  assert.equal(tagestreffer.eintraege.length, 2);
  await db.query(
    "insert into audit_ereignis(art,ziel) select 'anmeldung',$1 from generate_series(1,105)",
    ["seite-" + suffix],
  );
  const first = await ok(
    q(a, "GET", "/verwaltung/audit?suche=seite-" + suffix),
  );
  assert.equal(first.eintraege.length, 100);
  assert.ok(first.naechsteSeite);
  const second = await ok(
    q(
      a,
      "GET",
      "/verwaltung/audit?suche=seite-" + suffix + "&vor=" + first.naechsteSeite,
    ),
  );
  assert.equal(second.eintraege.length, 5);
  assert.equal(second.naechsteSeite, null);
  assert.equal(
    new Set([...first.eintraege, ...second.eintraege].map((e) => e.id)).size,
    105,
  );
  const exportR = await q(
    a,
    "GET",
    "/verwaltung/audit/export?suche=seite-" + suffix,
  );
  assert.equal(exportR.statusCode, 200);
  assert.match(exportR.headers["content-disposition"], /attachment/);
  assert.equal(exportR.json().eintraege.length, 105);
  await db.query(
    "insert into audit_ereignis(art,ziel) select 'anmeldung',$1 from generate_series(1,5001)",
    ["exportgrenze-" + suffix],
  );
  await ok(
    q(a, "GET", "/verwaltung/audit/export?suche=exportgrenze-" + suffix),
    413,
  );
});
