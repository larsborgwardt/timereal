import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { issueSession, passwordHash, digest } from "../dist/session.js";

// Unabhängiger Authenticator für den HTTP-Test; RFC-Vektoren prüfen den Produktkern separat.
function code(secret, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret)
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const seed = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const mac = createHmac("sha1", seed).update(counter).digest();
  return String(
    (mac.readUInt32BE(mac.at(-1) & 15) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
}
test("2FA: Kontogrenze, Einrichtung, Teilanmeldung, Replay, Recovery und Widerruf", async () => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const password = randomBytes(24).toString("hex"),
    hash = await passwordHash(password);
  const {
    rows: [a, b],
  } = await db.query(
    "insert into konto(login_referenz,passwort_hash) values($1,$3),($2,$3) returning id,login_referenz",
    [
      "mfa-a-" + randomBytes(5).toString("hex"),
      "mfa-b-" + randomBytes(5).toString("hex"),
      hash,
    ],
  );
  const role = new URL(process.env.TEST_DATABASE_URL);
  role.username = "timereal_app";
  role.password = "nur-fuer-diese-wegwerfdatenbank";
  await db.query(
    "alter role timereal_app login password 'nur-fuer-diese-wegwerfdatenbank'",
  );
  const key = randomBytes(32);
  const app = createApp(new pg.Pool({ connectionString: role.href }), {
    secure: true,
    origin: "https://zeit.test",
    mfaKey: key,
  });
  const cookie = (r, name = "timereal") => {
    const values = [r.headers["set-cookie"]].flat().filter(Boolean);
    return values.find((v) => v.startsWith(name + "="))?.split(";")[0] ?? "";
  };
  const q = (c, method, path, payload, headers = {}) =>
    app.inject({
      method,
      url: "/api/v1" + path,
      payload,
      headers: { cookie: c, origin: "https://zeit.test", ...headers },
    });
  const ok = async (request, status = 200) => {
    const r = await request;
    assert.equal(r.statusCode, status, r.body);
    return r;
  };
  let first = "timereal=" + (await issueSession(db, a.id, "web", hash));
  const old = first,
    other = "timereal=" + (await issueSession(db, b.id, "web", hash));
  const ext = await issueSession(db, a.id, "erweiterung", hash);
  try {
    await ok(q("", "GET", "/mfa"), 401);
    await ok(
      q("", "GET", "/mfa", undefined, { authorization: "Bearer " + ext }),
      403,
    );
    assert.equal((await ok(q(first, "GET", "/mfa"))).json().aktiv, false);
    await ok(q(first, "POST", "/mfa/einrichtung", { passwort: "falsch" }), 400);
    const cancelled = (
      await ok(q(first, "POST", "/mfa/einrichtung", { passwort: password }))
    ).json();
    await ok(q(first, "DELETE", "/mfa/einrichtung"));
    await ok(
      q(first, "POST", "/mfa/aktivieren", {
        id: cancelled.id,
        code: code(cancelled.secret),
      }),
      409,
    );
    const expired = (
      await ok(q(first, "POST", "/mfa/einrichtung", { passwort: password }))
    ).json();
    await db.query(
      "update mfa_konto set vorbereitet_bis=clock_timestamp()-interval '1 second' where konto_id=$1",
      [a.id],
    );
    await ok(
      q(first, "POST", "/mfa/aktivieren", {
        id: expired.id,
        code: code(expired.secret),
      }),
      409,
    );
    const replacedSetup = (
      await ok(q(first, "POST", "/mfa/einrichtung", { passwort: password }))
    ).json();
    const setup = (
      await ok(q(first, "POST", "/mfa/einrichtung", { passwort: password }))
    ).json();
    await ok(
      q(first, "POST", "/mfa/aktivieren", {
        id: replacedSetup.id,
        code: code(replacedSetup.secret),
      }),
      409,
    );
    assert.match(setup.secret, /^[A-Z2-7]{32}$/);
    assert.match(setup.qr, /^data:image\/png;base64,/);
    assert.equal((await ok(q(other, "GET", "/mfa"))).json().aktiv, false);
    await ok(
      q(other, "POST", "/mfa/aktivieren", {
        id: setup.id,
        code: code(setup.secret),
      }),
      409,
    );
    await ok(
      q(first, "POST", "/mfa/aktivieren", { id: setup.id, code: "abcdef" }),
      400,
    );
    const activationCode = code(setup.secret);
    const enabled = await ok(
      q(first, "POST", "/mfa/aktivieren", {
        id: setup.id,
        code: activationCode,
      }),
    );
    const codes = enabled.json().codes;
    assert.equal(codes.length, 8);
    assert.equal(new Set(codes).size, 8);
    const storage = JSON.stringify(
      (
        await db.query(
          "select row_to_json(m) from mfa_konto m where konto_id=$1",
          [a.id],
        )
      ).rows,
    );
    assert(!storage.includes(setup.secret));
    assert.match(storage, /v1\./);
    const restricted = new pg.Client({ connectionString: role.href });
    await restricted.connect();
    try {
      for (const table of ["mfa_konto", "mfa_code", "mfa_pruefung"])
        await assert.rejects(restricted.query("select * from " + table), {
          code: "42501",
        });
    } finally {
      await restricted.end();
    }
    first = cookie(enabled);
    assert(first && first !== old);
    await ok(q(old, "GET", "/profil"), 401);
    await ok(
      q("", "GET", "/profil", undefined, { authorization: "Bearer " + ext }),
      401,
    );
    const status = (await ok(q(first, "GET", "/mfa"))).json();
    assert.equal(status.aktiv, true);
    assert.equal(status.codes, 8);
    assert.equal(status.secret, undefined);
    assert.equal(
      (
        await db.query("select sitzung_anlegen($1,$2,'web',$3) ok", [
          a.id,
          digest(randomBytes(32).toString("hex")),
          hash,
        ])
      ).rows[0].ok,
      false,
      "Alte Anwendung darf Faktor nicht umgehen",
    );
    const login = async () =>
      ok(
        q("", "POST", "/anmeldung", {
          login: a.login_referenz,
          passwort: password,
        }),
      );
    const pending = await login();
    assert.equal(pending.json().zweiterFaktor, true);
    assert.equal(cookie(pending), "");
    const abandoned = await login();
    await ok(
      q(cookie(abandoned, "timereal_mfa"), "DELETE", "/anmeldung/faktor"),
    );
    await ok(
      q(cookie(abandoned, "timereal_mfa"), "POST", "/anmeldung/faktor", {
        art: "recovery",
        code: codes[0],
      }),
      401,
    );
    let challenge = cookie(pending, "timereal_mfa");
    assert(challenge);
    await ok(q(challenge, "GET", "/profil"), 401);
    await ok(
      q(challenge, "POST", "/anmeldung/faktor", {
        art: "totp",
        code: activationCode,
      }),
      401,
    );
    const recovered = await ok(
      q(challenge, "POST", "/anmeldung/faktor", {
        art: "recovery",
        code: codes[0],
      }),
    );
    const recoveredSession = cookie(recovered);
    await ok(q(recoveredSession, "GET", "/profil"));
    await ok(
      q(challenge, "POST", "/anmeldung/faktor", {
        art: "recovery",
        code: codes[1],
      }),
      401,
    );
    const pair = await Promise.all([login(), login()]);
    const both = await Promise.all(
      pair.map((r) =>
        q(cookie(r, "timereal_mfa"), "POST", "/anmeldung/faktor", {
          art: "recovery",
          code: codes[1],
        }),
      ),
    );
    assert.deepEqual(both.map((r) => r.statusCode).sort(), [200, 401]);
    assert.equal((await ok(q(first, "GET", "/mfa"))).json().codes, 6);
    // Reale Datenbankzeit; nur der bereits verbrauchte Schritt wird für diese unabhängige Rennprobe zurückgesetzt.
    await db.query("update mfa_konto set letzterschritt=-1 where konto_id=$1", [
      a.id,
    ]);
    const otpPair = await Promise.all([login(), login()]);
    const otp = code(setup.secret);
    const otpBoth = await Promise.all(
      otpPair.map((r) =>
        q(cookie(r, "timereal_mfa"), "POST", "/anmeldung/faktor", {
          art: "totp",
          code: otp,
        }),
      ),
    );
    assert.deepEqual(otpBoth.map((r) => r.statusCode).sort(), [200, 401]);
    // Erneute Passwortprüfung setzt das kontogebundene Limit nicht zurück.
    await db.query(
      "update mfa_konto set fehler=0,fenster=clock_timestamp() where konto_id=$1",
      [a.id],
    );
    for (let i = 0; i < 10; i++) {
      const attempt = await login();
      await ok(
        q(cookie(attempt, "timereal_mfa"), "POST", "/anmeldung/faktor", {
          art: "recovery",
          code: "0".repeat(32),
        }),
        401,
      );
    }
    await ok(
      q("", "POST", "/anmeldung", {
        login: a.login_referenz,
        passwort: password,
      }),
      429,
    );
    await db.query(
      "update mfa_konto set fenster=clock_timestamp()-interval '11 minutes' where konto_id=$1",
      [a.id],
    );
    // Fehlender oder falscher Dienstschlüssel erlaubt keinen Passwort-Fallback.
    for (const mfaKey of [undefined, randomBytes(32)]) {
      const broken = createApp(new pg.Pool({ connectionString: role.href }), {
        secure: true,
        origin: "https://zeit.test",
        mfaKey,
      });
      try {
        const pending = await login();
        const r = await broken.inject({
          method: "POST",
          url: "/api/v1/anmeldung/faktor",
          headers: {
            origin: "https://zeit.test",
            cookie: cookie(pending, "timereal_mfa"),
          },
          payload: { art: "totp", code: code(setup.secret) },
        });
        assert.equal(r.statusCode, 503);
        assert.equal(cookie(r), "");
      } finally {
        await broken.close();
      }
    }
    // Neue Codes ersetzen alte, widerrufen Sitzungen und offene Anmeldeprüfungen.
    const stale = await login();
    const replaced = await ok(
      q(first, "POST", "/mfa/codes", {
        passwort: password,
        art: "recovery",
        code: codes[2],
      }),
    );
    first = cookie(replaced);
    await ok(
      q(cookie(stale, "timereal_mfa"), "POST", "/anmeldung/faktor", {
        art: "recovery",
        code: codes[3],
      }),
      401,
    );
    const newChallenge = await login();
    await ok(
      q(cookie(newChallenge, "timereal_mfa"), "POST", "/anmeldung/faktor", {
        art: "recovery",
        code: codes[3],
      }),
      401,
    );
    codes.splice(0, codes.length, ...replaced.json().codes);
    assert.equal((await ok(q(first, "GET", "/mfa"))).json().codes, 8);
    const again = await login();
    challenge = cookie(again, "timereal_mfa");
    await db.query(
      "update mfa_pruefung set ablauf=clock_timestamp()-interval '1 second' where konto_id=$1",
      [a.id],
    );
    await ok(
      q(challenge, "POST", "/anmeldung/faktor", {
        art: "recovery",
        code: codes[2],
      }),
      401,
    );
    // Die Kontotrigger erhalten den aktiven Faktor, entwerten aber die Teilanmeldung.
    for (const change of [
      () =>
        db.query("update konto set passwort_hash=$2 where id=$1", [
          a.id,
          hash + " ",
        ]),
      () => db.query("update konto set ist_betrieb=true where id=$1", [a.id]),
      () => db.query("update konto set aktiv=false where id=$1", [a.id]),
    ]) {
      const pending = await login();
      await change();
      await ok(
        q(cookie(pending, "timereal_mfa"), "POST", "/anmeldung/faktor", {
          art: "recovery",
          code: codes[4],
        }),
        401,
      );
      assert.equal(
        (
          await db.query(
            "select geheimnis is not null as aktiv from mfa_konto where konto_id=$1",
            [a.id],
          )
        ).rows[0].aktiv,
        true,
      );
      await db.query(
        "update konto set passwort_hash=$2,ist_betrieb=false,aktiv=true where id=$1",
        [a.id, hash],
      );
    }
    const safety = JSON.stringify(
      (await db.query("select row_to_json(e) from audit_ereignis e")).rows,
    );
    for (const secret of [setup.secret, password, ...codes])
      assert(
        !safety.includes(secret),
        "Audit darf keine geheimen Werte enthalten",
      );
    const renewed = await login();
    first = cookie(
      await ok(
        q(cookie(renewed, "timereal_mfa"), "POST", "/anmeldung/faktor", {
          art: "recovery",
          code: codes[4],
        }),
      ),
    );
    await ok(
      q(first, "POST", "/mfa/deaktivieren", {
        passwort: "falsch",
        art: "recovery",
        code: codes[2],
      }),
      400,
    );
    const off = await ok(
      q(first, "POST", "/mfa/deaktivieren", {
        passwort: password,
        art: "recovery",
        code: codes[2],
      }),
    );
    first = cookie(off);
    assert.equal((await ok(q(first, "GET", "/mfa"))).json().aktiv, false);
    await ok(q(recoveredSession, "GET", "/profil"), 401);
    assert.equal((await login()).json().angemeldet, true);
    const persisted = JSON.stringify(
      (
        await db.query(
          "select row_to_json(m) from mfa_konto m where konto_id=$1",
          [a.id],
        )
      ).rows,
    );
    assert(!persisted.includes(setup.secret));
    for (const c of codes) assert(!persisted.includes(c));
  } finally {
    await app.close();
    await db.end();
  }
});
