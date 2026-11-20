import { test } from "node:test";
import { strict as assert } from "node:assert";
import pg from "pg";
import { createApp } from "../dist/app.js";

async function aufbau(origin, secure = true) {
  const owner = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  await owner.connect();
  await owner.query(
    "alter role timereal_app password 'nur-fuer-diese-wegwerfdatenbank'",
  );
  await owner.end();
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = "timereal_app";
  url.password = "nur-fuer-diese-wegwerfdatenbank";
  const app = createApp(new pg.Pool({ connectionString: url.href, max: 2 }), {
    secure,
    origin,
  });
  // 401 heißt: Herkunft zugelassen, Anmeldung mit unbekanntem Namen abgelehnt.
  const status = async (origin, host) =>
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/anmeldung",
        headers: { ...(origin ? { origin } : {}), host },
        payload: { login: "herkunft-" + crypto.randomUUID(), passwort: "x" },
      })
    ).statusCode;
  return { app, status };
}

test("Mit eingerichteter Domain bleibt die Anmeldung über die eigene IPv4-Adresse zulässig", async () => {
  const x = await aufbau("https://zeit.example.org");
  try {
    assert.equal(
      await x.status("https://zeit.example.org", "zeit.example.org"),
      401,
    );
    assert.equal(await x.status("https://192.0.2.42", "192.0.2.42"), 401);
    assert.equal(
      await x.status("https://192.0.2.42:8443", "192.0.2.42:8443"),
      401,
    );
  } finally {
    await x.app.close();
  }
});

test("Fremde Herkünfte bleiben gesperrt: anderer Host, anderer Name, anderes Schema, fehlende Angabe", async () => {
  const x = await aufbau("https://zeit.example.org");
  try {
    for (const [origin, host] of [
      // IP-Herkunft gegen einen anderen angefragten Host
      ["https://192.0.2.42", "zeit.example.org"],
      ["https://192.0.2.99", "192.0.2.42"],
      ["https://192.0.2.42", "192.0.2.42:8443"],
      // Gleicher Name auf beiden Seiten genügt nur für IPv4-Literale
      ["https://fremd.example.org", "fremd.example.org"],
      ["https://localhost", "localhost"],
      ["https://[2001:db8::42]", "[2001:db8::42]"],
      ["https://192.0.2.042", "192.0.2.042"],
      ["https://999.0.2.42", "999.0.2.42"],
      // Schema, Anhänge und fehlende Angaben
      ["http://192.0.2.42", "192.0.2.42"],
      ["https://192.0.2.42/", "192.0.2.42"],
      ["https://192.0.2.42.example.org", "192.0.2.42.example.org"],
      ["null", "192.0.2.42"],
      [undefined, "192.0.2.42"],
      ["https://zeit.example.org.fremd.test", "zeit.example.org"],
    ])
      assert.equal(await x.status(origin, host), 403, `${origin} an ${host}`);
  } finally {
    await x.app.close();
  }
});

test("Ohne HTTPS gilt die IPv4-Regel mit http, nie gemischt", async () => {
  const x = await aufbau("http://zeit.example.org", false);
  try {
    assert.equal(await x.status("http://192.0.2.42", "192.0.2.42"), 401);
    assert.equal(await x.status("https://192.0.2.42", "192.0.2.42"), 403);
  } finally {
    await x.app.close();
  }
});
