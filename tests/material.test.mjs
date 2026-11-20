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
  // Jede Seite, die Material-Elemente zeigt, lädt das Bündel vor ihrem Skript.
  for (const [seite, skript] of [
    ["web/index.html", "/app.js"],
    ["web/erweiterung-anmelden.html", "/erweiterung-anmelden.js"],
  ]) {
    const html = await readFile(seite, "utf8");
    const material = html.indexOf('<script type="module" src="/material.js">'),
      anwendung = html.indexOf(`<script type="module" src="${skript}">`);
    assert.ok(material > 0 && anwendung > material, seite);
  }
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

// Abschnitt 2: Aktionsschaltflächen sind Material-Schaltflächen. Navigation
// und Register bleiben bis Abschnitt 4 native Schaltflächen.
test("Außerhalb der Navigation gibt es keine nativen Schaltflächen mehr", async () => {
  const html = await readFile("web/index.html", "utf8");
  const navs = [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/g)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  const zeile = (i) => html.slice(0, i).split("\n").length;
  const html_befunde = [...html.matchAll(/<button\b/g)]
    .filter((m) => !navs.some(([a, b]) => m.index > a && m.index < b))
    .map((m) => "web/index.html:" + zeile(m.index));
  const { readdirSync } = await import("node:fs");
  const js_befunde = [];
  for (const d of readdirSync("web").filter(
    (d) => d.endsWith(".js") && d !== "material.js",
  )) {
    const text = await readFile("web/" + d, "utf8");
    for (const m of text.matchAll(
      /<button\b|createElement\(\s*["']button["']/g,
    ))
      js_befunde.push(
        "web/" + d + ":" + text.slice(0, m.index).split("\n").length,
      );
  }
  assert.deepEqual([...html_befunde, ...js_befunde], []);
});
