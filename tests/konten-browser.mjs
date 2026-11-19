import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { postfach } from "./hilfe/smtp.mjs";
import { pruefeAnsicht } from "./hilfe/design.mjs";
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const pass = randomBytes(20).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values('verwaltung-browser',$1,true)",
  [await passwordHash(pass)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const mail = await postfach(),
  options = { secure: false, smtp: mail.config };
const app = createApp(new pg.Pool({ connectionString: url.href }), options);
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
options.origin = addr;
let browser;
const output = process.env.SCREENSHOT_DIR;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  });
  const page = await browser.newPage({
      locale: "de-DE",
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill("verwaltung-browser");
  await page.getByLabel("Passwort", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await page
    .getByRole("heading", { name: "Verwaltung", exact: true })
    .waitFor();
  await page.locator("#einladen input").fill("kollegin@example.test");
  await page
    .getByRole("button", { name: "Berater einladen", exact: true })
    .click();
  await page
    .locator("#einladungsliste")
    .getByText("kollegin@example.test", { exact: true })
    .waitFor();
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: output + "/verwaltung.png", fullPage: true });
  }
  const message = mail.nachrichten
    .at(-1)
    .replace(/=\r\n/g, "")
    .replace(/=3D/g, "=");
  const token = /#einladung=([a-f0-9]{64})/.exec(message)[1];
  const phone = await browser.newPage({
    locale: "de-DE",
    viewport: { width: 390, height: 844 },
  });
  await phone.goto(addr + "/#einladung=" + token);
  const dialog = phone.locator("#linkfenster");
  await dialog.waitFor();
  assert.deepEqual(await pruefeAnsicht(phone, "einladung-annehmen"), []);
  await dialog.getByLabel("Passwort · mindestens").fill(pass);
  await dialog.getByLabel("Passwort wiederholen").fill(pass + "falsch");
  await dialog.getByRole("button", { name: "Passwort speichern" }).click();
  await dialog.getByRole("alert").waitFor({ timeout: 3000 });
  assert.deepEqual(await pruefeAnsicht(phone, "einladung-passwortfehler"), []);
  await dialog.getByLabel("Passwort wiederholen").fill(pass);
  await dialog.getByRole("button", { name: "Passwort speichern" }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await phone.evaluate(() => location.hash), "");
  await phone.getByLabel("Anmeldename").fill("kollegin@example.test");
  await phone.getByLabel("Passwort", { exact: true }).fill(pass);
  await phone.getByRole("button", { name: "Anmelden", exact: true }).click();
  await phone.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  assert.equal(
    await phone
      .getByRole("button", { name: "Verwaltung", exact: true })
      .count(),
    0,
  );
  await phone
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await phone
    .getByRole("heading", { name: "Angemeldete Geräte", exact: true })
    .waitFor();
  await phone
    .locator("#sitzungsliste")
    .getByText(/Diese Sitzung/)
    .waitFor();
  assert.ok(
    await phone.evaluate(() => document.body.scrollWidth <= innerWidth),
  );
  if (output)
    await phone.screenshot({
      path: output + "/einstellungen-mobil.png",
      fullPage: true,
    });
  await phone
    .locator("#sitzungsliste")
    .getByRole("button", { name: "Abmelden", exact: true })
    .click();
  await phone.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  const row = page
    .locator("#kontoliste article")
    .filter({ hasText: "kollegin@example.test" });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Sperren", exact: true }).click();
  await row.getByText("Berater · Gesperrt", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Verwaltungsprobe bestanden: SMTP, Annahme, eigene Sitzungen, Sperre und mobile Darstellung.",
  );
} finally {
  await browser?.close();
  await app.close();
  await owner.end();
  await mail.close();
}
