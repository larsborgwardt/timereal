import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { pruefeAnsicht } from "./hilfe/design.mjs";
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
await owner.query(
  "alter role timereal_app password 'nur-fuer-diese-wegwerfdatenbank'",
);
const suffix = randomBytes(6).toString("hex"),
  passwort = randomBytes(20).toString("hex");
const admin = `verwaltung-${suffix}`,
  berater = `beratung-${suffix}@example.test`;
await owner.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$3,true),($2,$3,false)",
  [admin, berater, await passwordHash(passwort)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: url.href }), {
  secure: false,
  updateCheck: async () => ({ status: "disabled", updateAvailable: false }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage({
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function anmelden(name) {
    await page.goto(addr);
    await page.getByLabel("Anmeldename").fill(name);
    await page.getByLabel("Passwort", { exact: true }).fill(passwort);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  }
  await anmelden(admin);
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await page
    .getByRole("heading", { name: "Zugänge und Rollen", exact: true })
    .waitFor();
  const row = page.locator("#kontoliste article").filter({ hasText: berater });
  const own = page.locator("#kontoliste article").filter({ hasText: admin });
  assert.equal(await own.locator("button,select").count(), 0);
  await row.getByLabel("Rolle").selectOption("betrieb");
  // Reguläre Hintergrundaktualisierung darf den Entwurf nicht überschreiben.
  const nextRefresh = page.waitForResponse(
    (r) => r.url().endsWith("/verwaltung/konten"),
    { timeout: 15000 },
  );
  await nextRefresh;
  assert.equal(await row.getByLabel("Rolle").inputValue(), "betrieb");
  assert.deepEqual(await pruefeAnsicht(page, "rollen-entwurf"), []);
  await row
    .getByRole("button", { name: "Rolle speichern", exact: true })
    .click();
  await row.getByText("Betrieb · Aktiv", { exact: true }).waitFor();
  assert.deepEqual(await pruefeAnsicht(page, "rollen-gespeichert"), []);
  // Der gerade gespeicherte Entwurf ist verbraucht; fremde Änderungen erscheinen.
  await owner.query(
    "update konto set ist_betrieb=false where login_referenz=$1",
    [berater],
  );
  await page.getByRole("button", { name: "Heute", exact: true }).click();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await row.getByText("Berater · Aktiv", { exact: true }).waitFor();
  assert.equal(await row.getByLabel("Rolle").inputValue(), "berater");
  // Rollenauswahl per Tastatur, Speichern und anschließende Anmeldung als Betrieb.
  await row.getByLabel("Rolle").focus();
  await page.keyboard.press("b");
  await row.getByLabel("Rolle").selectOption("betrieb");
  await row
    .getByRole("button", { name: "Rolle speichern", exact: true })
    .click();
  await row.getByText("Betrieb · Aktiv", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  await anmelden(berater);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await page.locator("#betrieb-updates").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Konten", exact: true }).count(),
    0,
  );
  assert.equal(await page.locator("#kontoliste").isVisible(), false);
  assert.equal(
    requested.some((p) =>
      [
        "/api/v1/verwaltung/konten",
        "/api/v1/verwaltung/mail",
        "/api/v1/verwaltung/einladungen",
      ].includes(p),
    ),
    false,
  );
  assert.deepEqual(await pruefeAnsicht(page, "rollen-betrieb"), []);
  assert.deepEqual(errors, []);
  console.log(
    "Rollenbrowser: Entwurf, Speichern, Rechtewechsel, eigener Kontoschutz und schmale Ansichten bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
  await owner.end();
}
