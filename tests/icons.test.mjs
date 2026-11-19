import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createApp } from "../dist/app.js";

test("Icons sind ohne Anmeldung unter beliebigen Serverdomains als unveränderte Bilddateien erreichbar", async () => {
  const app = createApp(new pg.Pool(), { secure: true });
  try {
    for (const host of ["zeit.example.test", "192.0.2.52:443"]) {
      for (const size of [16, 32, 48, 128, 180]) {
        const response = await app.inject({
          url: `/icons/timereal-${size}.png?v=1`,
          headers: { host },
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers["content-type"], "image/png");
        assert.equal(response.headers["x-content-type-options"], "nosniff");
        assert.deepEqual(
          [...response.rawPayload.subarray(0, 8)],
          [137, 80, 78, 71, 13, 10, 26, 10],
        );
        assert.equal(response.rawPayload.readUInt32BE(16), size);
        assert.equal(response.rawPayload.readUInt32BE(20), size);
        assert.deepEqual(
          response.rawPayload,
          await readFile(`web/icons/timereal-${size}.png`),
        );
      }
    }
    const ico = await app.inject("/favicon.ico");
    assert.equal(ico.statusCode, 200);
    assert.equal(ico.headers["content-type"], "image/vnd.microsoft.icon");
    assert.equal(ico.rawPayload.readUInt16LE(2), 1);
    assert.equal(ico.rawPayload.readUInt16LE(4), 3);
    assert.deepEqual(
      [6, 22, 38].map((offset) => ico.rawPayload[offset]),
      [16, 32, 48],
    );
    assert.deepEqual(ico.rawPayload, await readFile("web/favicon.ico"));
    const missing = await app.inject("/icons/unbekannt.png");
    assert.equal(missing.statusCode, 404);
    for (const url of ["/", "/erweiterung-anmelden.html"]) {
      const page = await app.inject(url);
      assert.equal(page.statusCode, 200);
      assert.match(page.body, /rel="icon"[^>]+href="\/favicon\.ico\?v=1"/);
      assert.match(
        page.body,
        /rel="icon"[^>]+sizes="32x32"[^>]+href="\/icons\/timereal-32\.png\?v=1"/,
      );
    }
  } finally {
    await app.close();
  }
});
