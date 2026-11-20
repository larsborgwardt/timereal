import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, passwordHash } from "../dist/session.js";
import { postfach } from "./hilfe/smtp.mjs";

test("Verwaltung, echte SMTP-Einladung, Einmalannahme, Sitzungen, Passwort und Sperre", async () => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const mail = await postfach(),
    hash = await passwordHash("AltesPasswort!1234");
  const {
    rows: [admin, normal],
  } = await db.query(
    "insert into konto(login_referenz,passwort_hash,ist_admin) values ('admin-test',$1,true),('normal-test',$1,false) returning id",
    [hash],
  );
  const a = await issueSession(db, admin.id, "web", hash),
    b = await issueSession(db, normal.id, "web", hash);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
    origin: "https://zeit.test",
    smtp: mail.config,
  });
  const q = (session, method, path, payload) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      headers: {
        cookie: "timereal=" + session,
        origin: "https://zeit.test",
        host: "zeit.test",
      },
      payload,
    });
  const ok = async (p, code = 200) => {
    const r = await p;
    assert.equal(r.statusCode, code, r.body);
    return r.json();
  };
  const token = () => {
    const msg = mail.nachrichten
      .at(-1)
      .replace(/=\r\n/g, "")
      .replace(/=3D/g, "=");
    return /#(?:einladung|reset)=([a-f0-9]{64})/.exec(msg)?.[1];
  };
  try {
    assert.equal((await q(b, "GET", "/verwaltung/konten")).statusCode, 403);
    const profil = await ok(q(a, "GET", "/profil"));
    assert.equal(profil.admin, true);
    assert.equal(profil.login, "admin-test");
    assert.equal(profil.passwort_hash, undefined);
    const nameOnly = await ok(
      q(a, "PATCH", "/profil", { name: "Nur Anzeigename" }),
    );
    assert.equal(nameOnly.name, "Nur Anzeigename");
    assert.equal(nameOnly.email, null);
    assert.equal(nameOnly.emailAusstehend, null);
    const saved = await ok(
      q(a, "PATCH", "/profil", {
        name: "Alex Beratung",
        email: "Admin@Example.Test",
      }),
    );
    assert.equal(saved.name, "Alex Beratung");
    assert.equal(saved.email, null);
    assert.equal(saved.emailAusstehend, "admin@example.test");
    const emailMessage = mail.nachrichten
      .at(-1)
      .replace(/=\r\n/g, "")
      .replace(/=3D/g, "=");
    const emailToken = /#email=([a-f0-9]{64})/.exec(emailMessage)?.[1];
    assert.ok(emailToken);
    await ok(q(a, "PATCH", "/profil", { name: "Alex Beratung" }));
    await ok(
      q(b, "POST", "/profil/email-bestaetigen", { token: emailToken }),
      410,
    );
    await ok(q(a, "POST", "/profil/email-bestaetigen", { token: emailToken }));
    await ok(
      q(a, "POST", "/profil/email-bestaetigen", { token: emailToken }),
      410,
    );
    assert.equal(
      (await ok(q(a, "GET", "/profil"))).email,
      "admin@example.test",
    );
    assert.notEqual((await ok(q(b, "GET", "/profil"))).name, "Alex Beratung");
    await ok(
      q("", "POST", "/anmeldung", {
        login: "ADMIN@EXAMPLE.TEST",
        passwort: "AltesPasswort!1234",
      }),
    );
    await db.query(
      "insert into konto(login_referenz) values('belegt@example.test')",
    );
    await ok(q(a, "PATCH", "/profil", { email: "belegt@example.test" }), 409);
    const invite = await ok(
      q(a, "POST", "/verwaltung/einladungen", {
        email: "Berater@Example.Test",
      }),
    );
    assert.ok(invite.id);
    const first = token();
    assert.ok(first);
    await ok(q(a, "POST", "/verwaltung/einladungen/" + invite.id + "/erneut"));
    const fresh = token();
    assert.notEqual(fresh, first);
    await ok(
      q("", "POST", "/einladung/annehmen", {
        token: first,
        passwort: "NeuesPasswort!1234",
      }),
      410,
    );
    await ok(
      q("", "POST", "/einladung/annehmen", { token: fresh, passwort: "kurz" }),
      400,
    );
    const accepted = await Promise.all([
      q("", "POST", "/einladung/annehmen", {
        token: fresh,
        passwort: "NeuesPasswort!1234",
      }),
      q("", "POST", "/einladung/annehmen", {
        token: fresh,
        passwort: "NeuesPasswort!1234",
      }),
    ]);
    assert.deepEqual(accepted.map((r) => r.statusCode).sort(), [200, 410]);
    const accounts = await ok(q(a, "GET", "/verwaltung/konten"));
    const berater = accounts.find((k) => k.email === "berater@example.test");
    assert.ok(berater);
    assert.equal(berater.admin, false);
    assert.equal(berater.zeiten, undefined);
    const login = await q("", "POST", "/anmeldung", {
      login: "berater@example.test",
      passwort: "NeuesPasswort!1234",
    });
    assert.equal(login.statusCode, 200);
    const session = /timereal=([a-f0-9]+)/.exec(login.headers["set-cookie"])[1];
    const ss = await ok(q(session, "GET", "/sitzungen"));
    assert.equal(ss.length, 1);
    assert.equal(ss[0].aktuell, true);
    assert.equal(ss[0].schluessel, undefined);
    await ok(q(a, "DELETE", "/sitzungen/" + ss[0].id), 404);
    await ok(
      q(session, "POST", "/passwort/aendern", {
        alt: "falsch",
        neu: "AnderesPasswort!1234",
      }),
      400,
    );
    await ok(
      q(session, "POST", "/passwort/aendern", {
        alt: "NeuesPasswort!1234",
        neu: "AnderesPasswort!1234",
      }),
    );
    assert.equal((await q(session, "GET", "/timer")).statusCode, 401);
    const vorher = mail.nachrichten.length;
    await ok(
      q("", "POST", "/passwort/anfordern", { email: "berater@example.test" }),
      202,
    );
    // Der Versand läuft nach der Antwort; der Link kommt kurz danach an.
    await mail.warten(vorher + 1);
    const reset = token();
    assert.ok(reset);
    await ok(
      q("", "POST", "/passwort/zuruecksetzen", {
        token: reset,
        passwort: "DrittesPasswort!1234",
      }),
    );
    await ok(
      q("", "POST", "/passwort/zuruecksetzen", {
        token: reset,
        passwort: "DrittesPasswort!1234",
      }),
      410,
    );
    const unknown = await ok(
      q("", "POST", "/passwort/anfordern", { email: "unbekannt@example.test" }),
      202,
    );
    assert.equal(unknown.angenommen, true);
    await ok(
      q(a, "PATCH", "/verwaltung/konten/" + admin.id, { aktiv: false }),
      409,
    );
    const start = await app.inject({
      method: "POST",
      url: "/api/v1/timer/start",
      headers: {
        cookie: "timereal=" + b,
        origin: "https://zeit.test",
        "idempotency-key": crypto.randomUUID(),
      },
      payload: { version: "0", art: "intern" },
    });
    assert.equal(start.statusCode, 200, start.body);
    await ok(
      q(a, "PATCH", "/verwaltung/konten/" + normal.id, { aktiv: false }),
    );
    assert.equal((await q(b, "GET", "/timer")).statusCode, 401);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from zeitabschnitt where konto_id=$1 and ende is null",
          [normal.id],
        )
      ).rows[0].n,
      0,
    );
    const other = await ok(
      q(a, "POST", "/verwaltung/einladungen", { email: "weg@example.test" }),
    );
    const revoked = token();
    await ok(q(a, "DELETE", "/verwaltung/einladungen/" + other.id));
    await ok(
      q("", "POST", "/einladung/annehmen", {
        token: revoked,
        passwort: "DrittesPasswort!1234",
      }),
      410,
    );
    const expired = await ok(
      q(a, "POST", "/verwaltung/einladungen", { email: "alt@example.test" }),
    );
    const expiredToken = token();
    await db.query(
      "update kontolink set ablauf=now()-interval '1 hour' where id=$1",
      [expired.id],
    );
    await ok(
      q("", "POST", "/einladung/annehmen", {
        token: expiredToken,
        passwort: "DrittesPasswort!1234",
      }),
      410,
    );
    mail.ablehnen(true);
    await ok(
      q(a, "POST", "/verwaltung/einladungen", { email: "fehler@example.test" }),
      502,
    );
  } finally {
    await app.close();
    await db.end();
    await mail.close();
  }
});

test("Passwortanforderung antwortet vor dem Mailversand: die Antwortzeit verrät kein Konto", async () => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const mail = await postfach();
  const adresse = "reset-zeit-" + crypto.randomUUID() + "@example.test";
  await db.query(
    "insert into konto(login_referenz,email,passwort_hash) values ($1,$1,$2)",
    [adresse, await passwordHash("ResetZeitPasswort!1234")],
  );
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
    origin: "https://zeit.test",
    smtp: mail.config,
  });
  const anfordern = async (email) => {
    const start = Date.now();
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/passwort/anfordern",
      remoteAddress: "198.51.100." + Math.floor(Math.random() * 250 + 1),
      headers: { origin: "https://zeit.test", host: "zeit.test" },
      payload: { email },
    });
    return { status: r.statusCode, body: r.json(), ms: Date.now() - start };
  };
  try {
    mail.verzoegern(2500);
    const bekannt = await anfordern(adresse),
      unbekannt = await anfordern(
        "niemand-" + crypto.randomUUID() + "@example.test",
      );
    assert.deepEqual(
      [bekannt.status, bekannt.body, unbekannt.status, unbekannt.body],
      [202, { angenommen: true }, 202, { angenommen: true }],
    );
    // Vorher wartete nur die Anfrage für ein vorhandenes Konto auf SMTP.
    assert.ok(bekannt.ms < 1500, `Antwort nach ${bekannt.ms} ms`);
    await mail.warten(1);
    assert.match(
      mail.nachrichten[0].replace(/=\r\n/g, "").replace(/=3D/g, "="),
      /https:\/\/zeit\.test\/#reset=[a-f0-9]{64}/,
    );
    assert.equal(mail.nachrichten.length, 1);
  } finally {
    await app.close();
    await mail.close();
    await db.end();
  }
});
