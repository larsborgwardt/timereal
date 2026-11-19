import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
import { createApp } from "../dist/app.js";
import { issueSession, digest } from "../dist/session.js";
// Öffentliche CRX-ID aus Lars' Partner-Center-Export Extension_identity.txt.
const clients = [
  "foobkcceoconhlclbnechjlimhkfbcno",
  "lidpjdoofliniabfnkljpfadffmjockd",
];
for (const id of clients) {
  const ext = "chrome-extension://" + id,
    redirect = "https://" + id + ".chromiumapp.org/timereal";
  test(`Erweiterung ${id}: PKCE, Einmalcode, Rücksprungziel, CORS und eigener Sitzungswiderruf`, async () => {
    const owner = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await owner.connect();
    const {
      rows: [k, f],
    } = await owner.query(
      "insert into konto(login_referenz) values($1),($2) returning id",
      ["extension-probe-" + id, "extension-fremd-" + id],
    );
    const web = await issueSession(owner, k.id, "web"),
      other = await issueSession(owner, f.id, "web");
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.username = "timereal_app";
    url.password = "nur-fuer-diese-wegwerfdatenbank";
    const app = createApp(new pg.Pool({ connectionString: url.href }), {
      secure: true,
      origin: "https://zeit.test",
    });
    const q = (
      path,
      body,
      headers = { origin: "https://zeit.test", cookie: "timereal=" + web },
      method = "POST",
    ) => app.inject({ method, url: "/api/v1" + path, payload: body, headers });
    const ok = async (p, status = 200) => {
      const r = await p;
      assert.equal(r.statusCode, status, r.body);
      return r.json();
    };
    const verifier = randomBytes(32).toString("base64url"),
      challenge = createHash("sha256").update(verifier).digest("base64url"),
      state = randomBytes(24).toString("hex");
    const grant = async () => {
      const result = new URL(
        (await ok(q("/erweiterung/freigabe", { challenge, state, redirect })))
          .weiter,
      );
      assert.equal(result.origin + result.pathname, redirect);
      assert.equal(result.searchParams.get("state"), state);
      return result.searchParams.get("code");
    };
    try {
      await ok(
        q("/erweiterung/freigabe", {
          challenge,
          state,
          redirect: redirect + ".evil.test",
        }),
        400,
      );
      await ok(
        q(
          "/erweiterung/freigabe",
          { challenge, state, redirect },
          { origin: "https://evil.test", cookie: "timereal=" + web },
        ),
        403,
      );
      const code = await grant();
      assert.match(code, /^[a-f0-9]{64}$/);
      const stored = await owner.query(
        "select code_hash from erweiterungscode where konto_id=$1",
        [k.id],
      );
      assert.equal(stored.rows[0].code_hash, digest(code));
      const payload = { code, verifier, redirect };
      const otherId = clients.find((x) => x !== id);
      // Ein anderer zugelassener Client darf den Code weder umleiten noch einlösen.
      await ok(
        q("/erweiterung/token", payload, {
          origin: "chrome-extension://" + otherId,
        }),
        403,
      );
      await ok(
        q(
          "/erweiterung/token",
          {
            ...payload,
            redirect: "https://" + otherId + ".chromiumapp.org/timereal",
          },
          { origin: "chrome-extension://" + otherId },
        ),
        401,
      );
      for (const bad of [
        ext + ".evil.test",
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "null",
      ]) {
        await ok(q("/erweiterung/token", payload, { origin: bad }), 403);
      }
      for (const bad of [
        redirect + "/",
        redirect + "?next=evil",
        redirect.replace("https:", "http:"),
        "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/timereal",
      ]) {
        await ok(
          q("/erweiterung/freigabe", { challenge, state, redirect: bad }),
          400,
        );
      }
      await ok(
        q(
          "/erweiterung/token",
          { ...payload, verifier: randomBytes(32).toString("base64url") },
          { origin: ext },
        ),
        401,
      );
      const results = await Promise.all([
        q("/erweiterung/token", payload, { origin: ext }),
        q("/erweiterung/token", payload, { origin: ext }),
      ]);
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 401]);
      const token = results.find((r) => r.statusCode === 200).json().token;
      const headers = { origin: ext, authorization: "Bearer " + token };
      assert.equal(
        results.find((r) => r.statusCode === 200).headers[
          "access-control-allow-origin"
        ],
        ext,
      );
      const pre = await q(
        "/timer",
        undefined,
        {
          origin: ext,
          "access-control-request-method": "POST",
          "access-control-request-headers":
            "authorization,content-type,idempotency-key",
        },
        "OPTIONS",
      );
      assert.equal(pre.statusCode, 204);
      const evil = await q(
        "/timer",
        undefined,
        {
          origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "access-control-request-method": "GET",
        },
        "OPTIONS",
      );
      assert.equal(evil.statusCode, 403);
      assert.equal(evil.headers["access-control-allow-origin"], undefined);
      await ok(
        q("/timer", undefined, { cookie: "timereal=" + token }, "GET"),
        401,
      );
      const timer = await ok(q("/timer", undefined, headers, "GET"));
      await ok(
        q(
          "/timer/start",
          { version: timer.version, art: "intern" },
          { ...headers, "idempotency-key": crypto.randomUUID() },
        ),
      );
      assert.equal(
        (await ok(q("/timer", undefined, undefined, "GET"))).aktiv.art,
        "intern",
      );
      assert.equal(
        (
          await ok(
            q("/timer", undefined, { cookie: "timereal=" + other }, "GET"),
          )
        ).aktiv,
        null,
      );
      await ok(
        q("/erweiterung/freigabe", { challenge, state, redirect }, headers),
        403,
      );
      const sessions = await ok(q("/sitzungen", undefined, undefined, "GET"));
      const extension = sessions.find((s) => s.client === "erweiterung");
      assert.ok(extension);
      await ok(q("/sitzungen/" + extension.id, undefined, undefined, "DELETE"));
      await ok(q("/timer", undefined, headers, "GET"), 401);
      const revoked = await grant();
      await owner.query(
        "update sitzung set widerrufen_am=clock_timestamp() where schluessel=$1",
        [digest(web)],
      );
      await ok(
        q(
          "/erweiterung/token",
          { code: revoked, verifier, redirect },
          { origin: ext },
        ),
        401,
      );
      const web2 = await issueSession(owner, k.id, "web");
      const g = await ok(
        q(
          "/erweiterung/freigabe",
          { challenge, state, redirect },
          { origin: "https://zeit.test", cookie: "timereal=" + web2 },
        ),
      );
      const expired = new URL(g.weiter).searchParams.get("code");
      await owner.query(
        "update erweiterungscode set ablauf=clock_timestamp()-interval '1 second' where code_hash=$1",
        [digest(expired)],
      );
      await ok(
        q(
          "/erweiterung/token",
          { code: expired, verifier, redirect },
          { origin: ext },
        ),
        401,
      );
    } finally {
      await app.close();
      await owner.end();
    }
  });
}
