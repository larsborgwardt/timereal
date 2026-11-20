import { chromium } from "playwright-core";
import { strict as assert } from "node:assert";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { randomBytes } from "node:crypto";
import { pruefeSeitenicons } from "./hilfe/icons.mjs";

const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const password = randomBytes(20).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash) values('browserprobe',$1)",
  [await passwordHash(password)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: url.href }), {
  secure: false,
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  });
  async function anmelden(width, height) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(addr);
    await pruefeSeitenicons(page);
    await page.getByLabel("Anmeldename").fill("browserprobe");
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("heading", { name: "Heute" }).waitFor();
    return page;
  }
  async function neu(page, kunde, bezeichnung, schalter) {
    await page.getByRole("button", { name: "Neues Buchungsziel" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kunde", { exact: true }).fill(kunde);
    await dialog.getByLabel("Bezeichnung").fill(bezeichnung);
    await dialog.getByRole("button", { name: schalter }).click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .locator("#timer")
      .getByRole("heading", { name: new RegExp(bezeichnung) })
      .waitFor();
  }
  const laptop = await anmelden(1280, 840);
  await laptop
    .getByRole("contentinfo")
    .getByRole("link", { name: "GitHub", exact: true })
    .waitFor();
  await neu(laptop, "Kunde A", "4711", "Speichern und starten");
  await laptop.getByRole("button", { name: "Leistungstext" }).click();
  await laptop.locator("#notiz textarea").fill("Konfiguration geprüft");
  await laptop.getByRole("button", { name: "Speichern", exact: true }).click();
  await laptop.getByRole("dialog").waitFor({ state: "hidden" });
  const handy = await anmelden(390, 844);
  await neu(handy, "Kunde B", "Telefonat", "Speichern und wechseln");
  await laptop.reload();
  await laptop
    .locator("#timer")
    .getByRole("heading", { name: /Telefonat/ })
    .waitFor();
  await laptop
    .locator(".ziel")
    .filter({ hasText: "Kunde A" })
    .getByRole("button", { name: "Hierhin wechseln", exact: true })
    .click();
  await laptop
    .locator("#timer")
    .getByRole("heading", { name: /4711/ })
    .waitFor();
  assert.deepEqual(
    (
      await owner.query(
        "select count(*)::int as anzahl,count(*) filter(where ende is null)::int as aktiv from zeitabschnitt a join konto k on k.id=a.konto_id where k.login_referenz='browserprobe'",
      )
    ).rows[0],
    { anzahl: 3, aktiv: 1 },
  );
  await laptop.getByRole("button", { name: "Pausieren" }).click();
  await handy.reload();
  await handy.getByRole("button", { name: "Fortsetzen" }).click();
  await handy.getByRole("button", { name: "Pausieren" }).waitFor();
  await handy.getByRole("button", { name: "Stoppen" }).click();
  await handy.getByRole("heading", { name: "Kein Timer aktiv" }).waitFor();
  assert.ok(
    await handy.evaluate(() => document.body.scrollWidth <= innerWidth),
  );
  await handy.getByRole("button", { name: "Nachweise", exact: true }).click();
  await handy.getByRole("button", { name: "Historie", exact: true }).click();
  await handy
    .locator("#eintraege")
    .getByText("Konfiguration geprüft", { exact: true })
    .waitFor();
  assert.equal(await handy.locator("#eintraege article.eintrag").count(), 4);
  await handy.getByRole("button", { name: "Abmelden" }).click();
  await handy.getByRole("heading", { name: "Anmelden" }).waitFor();
  console.log(
    "Browserprobe bestanden: getrennte Sitzungen, Kundenwechsel, Pause, Stopp, Historie, Abmeldung.",
  );
} finally {
  await browser?.close();
  await app.close();
  await owner.end();
}
