import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, passwordHash } from "../dist/session.js";
import { maildienst } from "../dist/mail.js";
import { smtpKonfiguration } from "../dist/config.js";
import { dienstStarten } from "../betrieb/verwaltung/dienst.mjs";
import { mailVerwaltung } from "../betrieb/verwaltung/mail.mjs";
import { postfach } from "./hilfe/smtp.mjs";

test("SMTP-Verwaltung: echte API, eingeschränkte DB-Rolle, Unix-Socket und Mailserver", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "timereal-mail-api-")),
    post = await postfach();
  const socket = join(dir, "dienst.sock"),
    file = join(dir, "mail.json");
  const dienst = await dienstStarten({
    verzeichnis: join(dir, "jobs"),
    socketPath: socket,
    lockPath: join(dir, "lock"),
    mail: mailVerwaltung({
      datei: file,
      lockPath: join(dir, "lock"),
      maildienst,
    }),
  });
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  // Aufräumen vor der ersten Anweisung, die scheitern kann; sonst bleibt der Prozess hängen.
  let app;
  t.after(async () => {
    await app?.close();
    await db.end();
    await dienst.schliessen();
    await post.close();
    await rm(dir, { recursive: true, force: true });
  });
  const pass = "MailAdmin!12345678",
    hash = await passwordHash(pass);
  const prefix = "mail-" + crypto.randomUUID();
  const {
    rows: [admin, normal, betrieb],
  } = await db.query(
    "insert into konto(login_referenz,passwort_hash,ist_admin,ist_betrieb) values ($1,$4,true,false),($2,$4,false,false),($3,$4,false,true) returning id",
    [prefix + "a", prefix + "b", prefix + "c", hash],
  );
  const a = await issueSession(db, admin.id, "web", hash),
    b = await issueSession(db, normal.id, "web", hash),
    c = await issueSession(db, betrieb.id, "web", hash),
    ext = await issueSession(db, admin.id, "erweiterung", hash);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  app = createApp(new pg.Pool({ connectionString: url.href }), {
    secure: true,
    origin: "https://zeit.test",
    betriebSocket: socket,
    smtp: () => smtpKonfiguration(file),
  });
  const q = (session, method, path, payload, extra = {}) =>
    app.inject({
      method,
      url: "/api/v1/verwaltung/mail" + path,
      headers: {
        cookie: "timereal=" + session,
        origin: "https://zeit.test",
        ...extra,
      },
      payload,
    });
  for (const session of [b, c])
    for (const [method, path, payload] of [
      ["GET", "/einstellungen"],
      [
        "PUT",
        "/einstellungen",
        {
          ...post.config,
          user: "",
          password: "",
          version: "leer",
          passwort: pass,
        },
      ],
      ["POST", "/test", { email: "admin@example.test", version: "leer" }],
    ]) {
      assert.equal((await q(session, method, path, payload)).statusCode, 403);
    }
  assert.equal((await q("", "GET", "/einstellungen")).statusCode, 401);
  assert.equal(
    (
      await q("", "GET", "/einstellungen", undefined, {
        authorization: "Bearer " + ext,
      })
    ).statusCode,
    403,
  );
  const empty = await q(a, "GET", "/einstellungen");
  assert.equal(empty.statusCode, 200, empty.body);
  assert.equal(empty.json().konfiguriert, false);
  const payload = {
    ...post.config,
    user: "",
    password: "",
    version: empty.json().version,
    passwort: pass,
  };
  assert.equal(
    (
      await q(a, "PUT", "/einstellungen", payload, {
        origin: "https://fremd.test",
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await q(a, "PUT", "/einstellungen", { ...payload, passwort: "falsch" }))
      .statusCode,
    403,
  );
  const saved = await q(a, "PUT", "/einstellungen", payload);
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.headers["cache-control"], "no-store");
  assert.equal("password" in saved.json(), false);
  assert.equal((await q(a, "GET", "")).json().konfiguriert, true);
  const sent = await q(a, "POST", "/test", {
    email: "admin@example.test",
    version: saved.json().version,
  });
  assert.equal(sent.statusCode, 200, sent.body);
  assert.match(post.nachrichten.at(-1), /Testmail/);
  const invite = await app.inject({
    method: "POST",
    url: "/api/v1/verwaltung/einladungen",
    headers: { cookie: "timereal=" + a, origin: "https://zeit.test" },
    payload: { email: "neu-" + prefix + "@example.test" },
  });
  assert.equal(invite.statusCode, 200, invite.body);
  assert.match(post.nachrichten.at(-1), /Einladung/);
  assert.equal((await q(a, "PUT", "/einstellungen", payload)).statusCode, 409);
  const before = await readFile(file, "utf8");
  const bad = await q(a, "PUT", "/einstellungen", {
    ...payload,
    version: saved.json().version,
    port: 1,
  });
  assert.equal(bad.statusCode, 503, bad.body);
  assert.equal(await readFile(file, "utf8"), before);
  // Die Passwortbestätigung ist wie eine Anmeldung begrenzt.
  for (let i = 0; i < 12; i++)
    assert.equal(
      (await q(a, "PUT", "/einstellungen", { ...payload, passwort: "falsch" }))
        .statusCode,
      403,
    );
  assert.equal(
    (await q(a, "PUT", "/einstellungen", { ...payload, passwort: "falsch" }))
      .statusCode,
    429,
  );
  await db.query("update konto set aktiv=false where id=$1", [admin.id]);
  assert.equal((await q(a, "GET", "/einstellungen")).statusCode, 401);
});
