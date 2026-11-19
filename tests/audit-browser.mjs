import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { pruefeAnsicht } from "./hilfe/design.mjs";
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
const suffix = randomBytes(6).toString("hex"),
  passwort = randomBytes(20).toString("hex");
const admin = "auditbild-" + suffix,
  ziel = "beratung-" + suffix;
await db.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$3,true),($2,$3,false)",
  [admin, ziel, await passwordHash(passwort)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: url.href }), {
  secure: false,
  updateCheck: async () => ({ status: "disabled", updateAvailable: false }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  });
try {
  const page = await browser.newPage({
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill(admin);
  await page.getByLabel("Passwort", { exact: true }).fill(passwort);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  const row = page.locator("#kontoliste article").filter({ hasText: ziel });
  await row.getByLabel("Rolle").selectOption("betrieb");
  await row
    .getByRole("button", { name: "Rolle speichern", exact: true })
    .click();
  await row.getByText("Betrieb · Aktiv", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Audit-Protokoll", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("#betrieb-audit");
  await panel
    .getByRole("heading", { name: "Audit-Protokoll", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => !document.querySelector("#audit-filtern").disabled,
  );
  await panel.getByLabel("Suchbegriff").fill(ziel);
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "audit-filtern",
  );
  await page.keyboard.press("Enter");
  await panel.locator("li").filter({ hasText: "Rolle geändert" }).waitFor();
  assert.match(
    await panel
      .locator("li")
      .filter({ hasText: "Rolle geändert" })
      .textContent(),
    /Berater zu Betrieb/,
  );
  assert.deepEqual(await pruefeAnsicht(page, "audit-ereignisse"), []);
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Auswahl herunterladen" }).click();
  const d = await download;
  assert.equal(d.suggestedFilename(), "timereal-audit.json");
  const exported = JSON.parse(await readFile(await d.path(), "utf8"));
  assert.ok(exported.eintraege.some((e) => e.art === "rolle_geaendert"));
  await panel.getByLabel("Suchbegriff").fill("gibt-es-nicht-" + suffix);
  await panel.getByRole("button", { name: "Filtern", exact: true }).click();
  await panel
    .getByText("Keine Ereignisse für diese Filter.", { exact: true })
    .waitFor();
  assert.deepEqual(await pruefeAnsicht(page, "audit-leer"), []);
  await db.query(
    "insert into audit_ereignis(art,ziel) select 'anmeldung',$1 from generate_series(1,105)",
    ["seiten-" + suffix],
  );
  await panel.getByLabel("Suchbegriff").fill("seiten-" + suffix);
  await panel.getByRole("button", { name: "Filtern", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll("#audit-liste li").length === 100,
  );
  await panel.getByRole("button", { name: "Weitere laden" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll("#audit-liste li").length === 105,
  );
  assert.equal(
    await panel.getByRole("button", { name: "Weitere laden" }).isDisabled(),
    true,
  );
  // Fehlgeschlagener Abruf: bisheriger Stand bleibt sichtbar, Fehler wird benannt.
  await page.route("**/api/v1/verwaltung/audit?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ fehler: "Prüfweise nicht erreichbar." }),
    }),
  );
  await panel
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .click();
  await panel
    .getByRole("alert")
    .getByText(/Prüfweise nicht erreichbar/)
    .waitFor();
  assert.equal(await panel.locator("li").count(), 105);
  assert.deepEqual(await pruefeAnsicht(page, "audit-fehler"), []);
  await page.unroute("**/api/v1/verwaltung/audit?**");
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  assert.equal(
    await panel.locator("li").count(),
    0,
    "Persönlicher Verwaltungsstand beim Abmelden geleert",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Auditbrowser: Rollenereignis, Filter, Export, Pagination, leerer Zustand, Fehler und Abmeldung bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
  await db.end();
}
