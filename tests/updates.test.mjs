import { test } from "node:test";
import { strict as assert } from "node:assert";
import { updateChecker, updateCheckingEnabled } from "../dist/updates.js";
import { createApp } from "../dist/app.js";
import pg from "pg";
const payload = (tag = "v0.6.2", extra = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  ...extra,
});
const response = (data) => new Response(JSON.stringify(data));
const checker = (fetch, options = {}) =>
  updateChecker({ version: "0.6.1", enabled: true, fetch, ...options });
test("Vergleicht stabile Versionen numerisch und erzeugt nur eigene Release-Links", async () => {
  for (const [tag, available] of [
    ["v0.6.2", true],
    ["0.6.10", true],
    ["v0.6.1", false],
    ["v0.5.9", false],
    ["v1.0.0", true],
  ]) {
    const result = await checker(async (url, init) => {
      assert.equal(
        url,
        "https://api.github.com/repos/larsborgwardt/timereal/releases/latest",
      );
      assert.equal(init.redirect, "error");
      assert.equal(Object.hasOwn(init.headers, "Authorization"), false);
      return response(payload(tag, { html_url: "https://evil.example/" }));
    })();
    assert.equal(result.status, "ok");
    assert.equal(result.updateAvailable, available);
    assert.equal(
      result.releaseUrl,
      `https://github.com/larsborgwardt/timereal/releases/tag/${tag}`,
    );
  }
});
test("100 gleichzeitige Abfragen teilen einen Abruf und dessen Cache", async () => {
  let calls = 0,
    now = 0;
  const read = checker(
    async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return response(payload());
    },
    { now: () => now },
  );
  const results = await Promise.all(Array.from({ length: 100 }, () => read()));
  assert.equal(calls, 1);
  assert.equal(results[99].latestVersion, "0.6.2");
  now = 6 * 60 * 60 * 1000 - 1;
  await read();
  assert.equal(calls, 1);
  now++;
  await read();
  assert.equal(calls, 2);
});
test("Netzfehler behalten den letzten Erfolg, behaupten aber keinen frischen Stand", async () => {
  let now = 0,
    calls = 0;
  const read = checker(
    async () => {
      if (++calls > 1) throw new Error("secret upstream error");
      return response(payload());
    },
    { now: () => now },
  );
  const first = await read();
  now = 6 * 60 * 60 * 1000;
  const failed = await read();
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.updateAvailable, true);
  assert.equal(failed.checkedAt, first.checkedAt);
  assert.ok(!JSON.stringify(failed).includes("secret"));
  now += 14 * 60 * 1000;
  await read();
  assert.equal(calls, 2);
  now += 60 * 1000;
  await read();
  assert.equal(calls, 3);
});
test("Manuelle Prüfung erneuert den gemeinsamen Cache vor Ablauf der sechs Stunden", async () => {
  let tag = "v0.7.0",
    calls = 0,
    now = 0;
  const read = checker(
    async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return response(payload(tag));
    },
    { version: "0.7.0", now: () => now },
  );
  const old = await read();
  tag = "v0.7.1";
  now = 60000;
  assert.deepEqual(await read(), old);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => read(true)),
  );
  assert.equal(calls, 2, "Gleichzeitige manuelle Prüfungen teilen einen Abruf");
  for (const r of results) {
    assert.equal(r.latestVersion, "0.7.1");
    assert.equal(r.updateAvailable, true);
    assert.equal(r.checkedAt, new Date(now).toISOString());
  }
  assert.deepEqual(
    await read(),
    results[0],
    "Öffentliche Abfrage übernimmt den neuen Stand",
  );
  assert.equal(calls, 2);
});
test("Manuell lässt sich auch ein Fehlercache erneut prüfen; deaktiviert bleibt deaktiviert", async () => {
  let offline = true,
    calls = 0;
  const read = checker(async () => {
    calls++;
    if (offline) throw new Error("offline");
    return response(payload());
  });
  assert.equal((await read()).status, "unavailable");
  offline = false;
  assert.equal((await read()).status, "unavailable");
  assert.equal((await read(true)).status, "ok");
  assert.equal(calls, 2);
  const disabled = checker(async () => assert.fail("Kein Abruf erlaubt"), {
    enabled: false,
  });
  assert.equal((await disabled(true)).status, "disabled");
});
test("Fehlgeschlagene manuelle Prüfung erneuert weder Versionsstand noch Erfolgszeitpunkt", async () => {
  let offline = false,
    now = 0;
  const read = checker(
    async () => {
      if (offline) throw new Error("offline");
      return response(payload());
    },
    { now: () => now },
  );
  const first = await read();
  offline = true;
  now = 60000;
  assert.deepEqual(await read(true), { ...first, status: "unavailable" });
  assert.deepEqual(await read(), { ...first, status: "unavailable" });
});
test("Fehler, unzulässige Release-Daten und übergroße Antworten sind kein aktueller Stand", async () => {
  for (const get of [
    async () => new Response("", { status: 429 }),
    async () => new Response("kaputt"),
    async () => response(payload("v0.6.2-beta")),
    async () => response(payload("v00.6.2")),
    async () => response(payload("v0.6.2", { draft: true })),
    async () => response(payload("v0.6.2", { prerelease: true })),
    async () => response({}),
    async () => new Response(" ".repeat(70000)),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const r = await checker(get)();
    assert.equal(r.status, "unavailable");
    assert.equal(r.latestVersion, null);
    assert.equal(r.updateAvailable, false);
    assert.equal(r.checkedAt, null);
    assert.equal(r.releaseUrl, null);
  }
});
test("Deaktiviert führt die Prüfung keinen Abruf aus; Konfiguration ist eindeutig", async () => {
  const result = await checker(async () => assert.fail("Kein Abruf erlaubt"), {
    enabled: false,
  })();
  assert.equal(result.status, "disabled");
  assert.equal(updateCheckingEnabled(undefined), true);
  assert.equal(updateCheckingEnabled("false"), false);
  assert.equal(updateCheckingEnabled("true"), true);
  assert.throws(() => updateCheckingEnabled("flase"), /true.*false/);
});
test("Die öffentliche Updateauskunft benötigt keine Datenbankverbindung", async () => {
  const app = createApp(new pg.Pool(), {
    secure: true,
    updateCheck: checker(async () => response(payload())),
  });
  try {
    const r = await app.inject("/api/v1/updates");
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal(r.json().latestVersion, "0.6.2");
    assert.equal(
      r.json().repositoryUrl,
      "https://github.com/larsborgwardt/timereal",
    );
  } finally {
    await app.close();
  }
});

test("Ein echter HTTP-Server bestätigt Timeout auch während des Antwortkörpers", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write("{");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const read = checker(
      (url, init) => fetch(`http://127.0.0.1:${server.address().port}`, init),
      { timeoutMs: 80 },
    );
    const started = Date.now();
    const result = await read();
    assert.equal(result.status, "unavailable");
    assert.ok(Date.now() - started < 2000);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
