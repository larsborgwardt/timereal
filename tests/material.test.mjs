import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createApp } from "../dist/app.js";

// Entwurf 19 (D-RELEASE-017): Material Web wird gebündelt mitgeliefert.
test("Das Bündel entsteht genau aus den Quellen und nennt Herkunft und Lizenz", async () => {
  const ausgabe = execFileSync(
    process.execPath,
    ["scripts/oberflaeche-buendeln.mjs", "--check"],
    { encoding: "utf8" },
  );
  assert.match(ausgabe, /entspricht den Quellen/);
  const kopf = (await readFile("web/material.js", "utf8")).slice(0, 400);
  assert.match(kopf, /@material\/web 2\.5\.0, lit 3\.3\.3/);
  assert.match(kopf, /Apache-2\.0/);
});

test("Die Seite lädt das Bündel vor der Anwendung; der Server liefert es als Modul aus", async () => {
  const html = await readFile("web/index.html", "utf8");
  const material = html.indexOf('<script type="module" src="/material.js">'),
    anwendung = html.indexOf('<script type="module" src="/app.js">');
  assert.ok(material > 0 && anwendung > material, "Reihenfolge im Kopf");
  // Statische Auslieferung ohne Datenbankzugriff; der Pool wird nicht benutzt.
  const app = createApp({ end: async () => {} }, { secure: true });
  try {
    const r = await app.inject({ method: "GET", url: "/material.js" });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers["content-type"], /^text\/javascript/);
    assert.match(r.headers["content-security-policy"], /script-src 'self'; .*/);
    assert.equal(r.body, await readFile("web/material.js", "utf8"));
  } finally {
    await app.close();
  }
});
