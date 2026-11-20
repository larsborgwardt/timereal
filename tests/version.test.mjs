import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { createApp } from "../dist/app.js";
import pg from "pg";

test("Die installierte Version ist ohne Anmeldung lesbar und enthält keine Betriebsgeheimnisse", async () => {
  const app = createApp(new pg.Pool(), { secure: true });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/version",
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), {
      version: "0.9.5",
      apiVersion: 1,
      schemaVersion: 10,
    });
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url)),
    );
    assert.equal(response.json().version, pkg.version);
    assert.equal(response.headers["cache-control"], "no-store");
  } finally {
    await app.close();
  }
});
