import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";

assert.ok(process.env.TEST_DATABASE_URL);
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const login = "navigation-" + randomBytes(8).toString("hex");
const passwort = randomBytes(20).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash) values($1,$2)",
  [login, await passwordHash(passwort)],
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
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(passwort);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector("[data-wartet]") &&
      !document.querySelector("#heute").hidden,
  );
  await page.evaluate(() => {
    window.ladeTexte = [];
    const status = document.querySelector("#arbeitsstatus");
    new MutationObserver(() => {
      if (!status.hidden && status.textContent)
        window.ladeTexte.push(status.textContent);
    }).observe(status, { attributes: true, childList: true, subtree: true });
  });
  async function anhalten() {
    let freigeben, erreicht;
    const gehalten = new Promise((resolve) => {
      freigeben = resolve;
    });
    const angekommen = new Promise((resolve) => {
      erreicht = resolve;
    });
    await page.route("**/api/v1/arbeitsstand", async (route) => {
      erreicht();
      await gehalten;
      await route.continue();
    });
    return { angekommen, freigeben };
  }
  const schnell = await anhalten();
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  await schnell.angekommen;
  assert.equal(
    await page.locator("#arbeitsstatus").isVisible(),
    false,
    "Schneller Seitenwechsel blendet keinen Verarbeitungstext ein",
  );
  schnell.freigeben();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  await page.unroute("**/api/v1/arbeitsstand");
  assert.deepEqual(
    await page.evaluate(() => window.ladeTexte),
    [],
    "Auch zwischen den Messpunkten blitzt kein Statustext auf",
  );
  await page.waitForTimeout(450);
  assert.equal(
    await page.locator("#arbeitsstatus").isVisible(),
    false,
    "Kein verspäteter Hinweis nach abgeschlossenem Laden",
  );
  const langsam = await anhalten();
  await page.getByRole("button", { name: "Nachweise", exact: true }).click();
  await langsam.angekommen;
  await page.getByText("Seite wird geladen…", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Nachweise", exact: true })
      .isDisabled(),
    true,
  );
  langsam.freigeben();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  await page.unroute("**/api/v1/arbeitsstand");
  assert.equal(await page.locator("#arbeitsstatus").isVisible(), false);
  await page.route("**/api/v1/arbeitsstand", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ fehler: "Testweise nicht erreichbar" }),
    }),
  );
  await page.getByRole("button", { name: "Heute", exact: true }).click();
  await page.getByText("Testweise nicht erreichbar", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  await page.waitForTimeout(450);
  assert.equal(await page.locator("#arbeitsstatus").isVisible(), false);
  console.log(
    "Navigation: schneller Wechsel ohne Flackern, langsamer Abruf mit Hinweis, Fehler und Abbruch des verzögerten Hinweises bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
  await owner.end();
}
