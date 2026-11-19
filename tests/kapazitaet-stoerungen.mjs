import pg from "pg";
import { fork } from "node:child_process";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createApp } from "../dist/app.js";
import { datenbankPool, transaktion } from "../dist/db.js";
import { issueSession, digest } from "../dist/session.js";
import { postfach } from "./hilfe/smtp.mjs";
const origin = "https://audit.test";
if (process.argv[2] === "verlust") {
  const pool = datenbankPool({ DATABASE_URL: process.env.TEST_DATABASE_URL });
  try {
    await assert.rejects(
      transaktion(pool, async (db) => {
        await db.query("set local idle_in_transaction_session_timeout=100");
        await new Promise((r) => setTimeout(r, 300));
        return "darf nicht als Erfolg zurückkommen";
      }),
      { code: "25P03" },
    );
    assert.equal((await pool.query("select 42 n")).rows[0].n, 42);
  } finally {
    await pool.end();
  }
} else if (process.argv[2] === "serve") {
  const app = createApp(datenbankPool(), {
    secure: true,
    origin,
    smtp: {
      host: "127.0.0.1",
      port: Number(process.env.SMTP_PORT),
      secure: false,
      from: "audit@example.test",
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  process.send(app.server.address().port);
  process.on("message", async () => {
    await app.close();
    process.exit(0);
  });
} else {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  const u = new URL(process.env.TEST_DATABASE_URL);
  u.username = "timereal_app";
  u.password = "nur-fuer-diese-wegwerfdatenbank";
  await owner.query(
    "alter role timereal_app password 'nur-fuer-diese-wegwerfdatenbank'",
  );
  const {
    rows: [admin],
  } = await owner.query(
    "insert into konto(login_referenz,ist_admin) values('Stoerungsprobe',true) returning id",
  );
  const cookie = "timereal=" + (await issueSession(owner, admin.id, "web"));
  const inbox = await postfach();
  const sockets = new Set();
  let delayed = 0;
  const relay = net.createServer((s) => {
    const target = net.connect(inbox.config.port, "127.0.0.1");
    sockets.add(s);
    sockets.add(target);
    s.pipe(target);
    target.on("data", (b) => {
      if (b.toString().includes("250 gespeichert")) {
        delayed++;
        setTimeout(() => {
          if (!s.destroyed) s.write(b);
        }, 11000);
      } else s.write(b);
    });
    s.on("close", () => target.destroy());
    target.on("error", () => s.destroy());
    s.on("error", () => target.destroy());
  });
  await new Promise((r) => relay.listen(0, "127.0.0.1", r));
  async function check(port, email, pfad = "/verwaltung/einladungen") {
    const child = fork(new URL(import.meta.url), ["serve"], {
      env: { ...process.env, DATABASE_URL: u.href, SMTP_PORT: String(port) },
      silent: true,
    });
    let err = "";
    child.stderr.on("data", (x) => (err += x));
    child.stdout.resume();
    const stopped = once(child, "exit");
    const [httpport] = await once(child, "message");
    let status = "abgebrochen";
    try {
      status = (
        await fetch("http://127.0.0.1:" + httpport + "/api/v1" + pfad, {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body: JSON.stringify({ email }),
          signal: AbortSignal.timeout(20000),
        })
      ).status;
    } catch {}
    if (child.connected) child.send("stop", () => {});
    const [exit] = await stopped;
    return {
      status,
      exit,
      idleAbbruch: err.includes("idle-in-transaction timeout"),
      unbehandeltesErrorEvent: err.includes("Unhandled 'error' event"),
    };
  }
  try {
    const verlust = fork(new URL(import.meta.url), ["verlust"], {
      env: process.env,
      silent: true,
    });
    verlust.stdout.resume();
    verlust.stderr.resume();
    const [verlustExit] = await once(verlust, "exit");
    const schnell = await check(inbox.config.port, "schnell@example.test");
    assert.equal(schnell.status, 200);
    const langsam = await check(relay.address().port, "langsam@example.test");
    const vorhanden = (
      await owner.query(
        "select count(*)::int n from kontolink where email='langsam@example.test'",
      )
    ).rows[0].n;
    console.log(
      JSON.stringify({
        smtp: {
          schnell,
          langsam,
          nachrichten: inbox.nachrichten.length,
          verzoegerteBestaetigungen: delayed,
          langsamerLinkInDb: vorhanden,
        },
      }),
    );
    const app = createApp(datenbankPool({ DATABASE_URL: u.href }), {
      secure: true,
      origin,
    });
    const codes = [];
    for (let i = 0; i < 100; i++) {
      const token = randomBytes(32).toString("hex");
      await owner.query(
        "insert into kontolink(art,email,hash,ablauf) values('einladung',$1,$2,now()+interval '1 hour')",
        ["berater" + i + "@example.test", digest(token)],
      );
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/einladung/annehmen",
        remoteAddress: "127.0.0.1",
        headers: { origin, "x-forwarded-for": "192.0.2.100" },
        payload: { token, passwort: randomBytes(24).toString("hex") },
      });
      codes.push(r.statusCode);
    }
    console.log(JSON.stringify({ annahmeHinterProxy: codes }));
    const reset = await check(
      relay.address().port,
      "berater0@example.test",
      "/passwort/anfordern",
    );
    assert.equal(reset.status, 202);
    assert.equal(reset.exit, 0);
    assert.equal(
      (
        await owner.query(
          "select count(*)::int n from kontolink where art='reset' and email='berater0@example.test' and verbraucht_am is null",
        )
      ).rows[0].n,
      1,
    );
    // Nicht vertrauenswürdige direkte Aufrufer dürfen ihr Limit nicht über XFF wechseln.
    const untrusted = randomBytes(32).toString("hex");
    for (let i = 0; i < 13; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/einladung/annehmen",
        remoteAddress: "198.51.100.20",
        headers: { origin, "x-forwarded-for": "192.0.2." + (i + 1) },
        payload: {
          token: untrusted,
          passwort: randomBytes(24).toString("hex"),
        },
      });
      assert.equal(r.statusCode, i < 12 ? 410 : 429);
    }

    const same = randomBytes(32).toString("hex");
    for (let i = 0; i < 13; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/einladung/annehmen",
        remoteAddress: "127.0.0.1",
        headers: { origin, "x-forwarded-for": "192.0.2.101" },
        payload: { token: same, passwort: randomBytes(24).toString("hex") },
      });
      assert.equal(
        r.statusCode,
        i < 12 ? 410 : 429,
        "Wiederholungen desselben Links bleiben begrenzt",
      );
    }
    await app.close();
    assert.deepEqual(
      codes,
      Array(100).fill(200),
      "100 verschiedene Einladungen hinter derselben NAT-Adresse",
    );
    assert.equal(langsam.status, 200, "SMTP-Bestätigung nach 11 Sekunden");
    assert.equal(langsam.exit, 0, "Serverprozess bleibt gesund");
    assert.equal(vorhanden, 1, "Der versendete Link bleibt gültig gespeichert");
    assert.equal(
      verlustExit,
      0,
      "Verbindungsverlust am ausgeliehenen Client bleibt behandelbar",
    );
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((r) => relay.close(r));
    await inbox.close();
    await owner.end();
  }
}
