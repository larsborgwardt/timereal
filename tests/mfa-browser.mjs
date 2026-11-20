import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { totp } from "../dist/mfa-crypto.js";
import { postfach } from "./hilfe/smtp.mjs";
import { pruefeAnsicht } from "./hilfe/design.mjs";
import { waehle } from "./hilfe/material.mjs";

const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const login = "mfa-ui-" + randomBytes(6).toString("hex"),
  password = randomBytes(24).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash) values($1,$2)",
  [login, await passwordHash(password)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const mail = await postfach();
const options = { secure: false, mfaKey: randomBytes(32), smtp: mail.config };
const app = createApp(new pg.Pool({ connectionString: url.href }), options);
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
options.origin = addr;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const page = await browser.newPage({
  locale: "de-DE",
  viewport: { width: 1280, height: 1000 },
});
page.setDefaultTimeout(7000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const click = async (name) =>
  page.getByRole("button", { name, exact: true }).click();
const proof = async (name) => {
  assert.deepEqual(await pruefeAnsicht(page, name), []);
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + "/mfa-" + name + ".png",
      fullPage: true,
    });
  }
};
try {
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await click("Anmelden");
  await click("Einstellungen");
  await page.getByLabel("Anzeigename").fill("Alex Beratung");
  await page
    .locator("#profilform input[name=email]")
    .fill(login + "@example.test");
  await click("Profil speichern");
  await page
    .getByText("Bestätigungslink versendet.", { exact: false })
    .waitFor();
  const token = /#email=([a-f0-9]{64})/.exec(
    mail.nachrichten.at(-1).replace(/=\r\n/g, "").replace(/=3D/g, "="),
  )[1];
  await page.goto(addr + "/#email=" + token);
  await proof("email-bestaetigen");
  await page
    .locator("#emailfenster")
    .getByRole("button", { name: "Abbrechen" })
    .click();
  await page.locator("#emailfenster").waitFor({ state: "hidden" });
  const refreshed = page.waitForResponse((r) =>
    r.url().endsWith("/api/v1/arbeitsstand"),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  assert.equal(await page.locator("#emailfenster").isVisible(), false);
  await page.goto(addr + "/#email=" + token);
  await click("E-Mail-Adresse bestätigen");
  await click("Einstellungen");
  await proof("profil-1280");
  await click("Passwort ändern");
  await proof("passwort-dialog");
  await page
    .locator("#passwortfenster")
    .getByRole("button", { name: "Abbrechen" })
    .click();
  await page.locator("#passwortfenster").waitFor({ state: "hidden" });
  await click("Einrichten");
  await page.locator("#mfa-passwort input").fill(password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/mfa/einrichtung") && r.status() === 200,
  );
  await click("Weiter");
  const setup = await (await response).json();
  await page
    .getByRole("heading", { name: "Authenticator verbinden" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await proof("authenticator-390");
  assert(
    await page
      .locator("#mfa-qr")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  const bits = [...setup.secret]
    .map((c) =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        .indexOf(c)
        .toString(2)
        .padStart(5, "0"),
    )
    .join("");
  const seed = Buffer.from(bits.match(/.{8}/g).map((s) => parseInt(s, 2)));
  await page
    .locator("#mfa-code input")
    .fill(totp(seed, Math.floor(Date.now() / 30000)));
  const activation = page.waitForResponse(
    (r) => r.url().endsWith("/mfa/aktivieren") && r.status() === 200,
  );
  await click("Code prüfen und aktivieren");
  const codes = (await (await activation).json()).codes;
  await page
    .getByRole("heading", { name: "Wiederherstellungscodes sichern" })
    .waitFor();
  await proof("codes-390");
  assert.equal(await page.locator("#mfa-qr").getAttribute("src"), null);
  await page.getByLabel("Ich habe die Codes sicher aufbewahrt.").check();
  await click("Fertig");
  for (const c of codes)
    assert(!(await page.locator("body").textContent()).includes(c));
  await click("Abmelden");
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await click("Anmelden");
  await page.getByRole("heading", { name: "Anmeldung bestätigen" }).waitFor();
  await proof("anmeldung-390");
  await page.locator("#login-faktor-code input").fill("000000");
  await click("Anmelden");
  await page.locator("#login-faktor-fehler").waitFor();
  assert(await page.locator("#login-faktor").isVisible());
  await click("Wiederherstellungscode verwenden");
  await proof("wiederherstellung-390");
  await page.locator("#login-faktor-code input").fill(codes[0]);
  await click("Anmelden");
  await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  await click("Einstellungen");
  await click("Verwalten");
  await proof("verwaltung-390");
  await click("Zwei-Faktor-Anmeldung ausschalten");
  await page.locator("#mfa-passwort input").fill(password);
  await proof("ausschalten-390");
  await waehle(page.locator("#mfa-art"), "recovery");
  await page.locator("#mfa-bestaetigung input").fill(codes[1]);
  await click("Ausschalten");
  await page.getByText("Noch nicht eingeschaltet", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "2FA-Browser: Profil, Mailbestätigung, QR, Einrichtung, Recovery, Abmeldung, Fehler und Ausschalten bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
  await owner.end();
  await mail.close();
}
