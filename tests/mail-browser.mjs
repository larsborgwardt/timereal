import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { maildienst } from "../dist/mail.js";
import { smtpKonfiguration } from "../dist/config.js";
import { dienstStarten } from "../betrieb/verwaltung/dienst.mjs";
import { mailVerwaltung } from "../betrieb/verwaltung/mail.mjs";
import { pruefeAnsicht } from "./hilfe/design.mjs";
import { postfach } from "./hilfe/smtp.mjs";

// Echte Websitzung, Datenbank, Unix-Socket des Betriebsdienstes und ein
// echter SMTP-Empfänger auf Loopback (Entwurf 15, D-RELEASE-009).
const dir = await mkdtemp(join(tmpdir(), "timereal-mail-browser-"));
const post = await postfach();
const datei = join(dir, "mail.json"),
  socketPath = join(dir, "dienst.sock");
const dienst = await dienstStarten({
  verzeichnis: join(dir, "jobs"),
  socketPath,
  lockPath: join(dir, "lock"),
  status: async () => ({ version: "0.9.7", domainUnterstuetzt: false }),
  ausfuehren: async () => {},
  mail: mailVerwaltung({ datei, lockPath: join(dir, "lock"), maildienst }),
});
const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
const suffix = randomBytes(6).toString("hex"),
  passwort = randomBytes(20).toString("hex");
const admin = "mailbild-" + suffix,
  betrieb = "mailbetrieb-" + suffix;
await db.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin,ist_betrieb) values($1,$3,true,false),($2,$3,false,true)",
  [admin, betrieb, await passwordHash(passwort)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: url.href }), {
  secure: false,
  betriebSocket: socketPath,
  smtp: () => smtpKonfiguration(datei),
  updateCheck: async () => ({ status: "disabled", updateAvailable: false }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 }),
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  });
const anmelden = async (page, login) => {
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(passwort);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
};
try {
  const page = await browser.newPage({
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await anmelden(page, admin);
  await page.getByRole("button", { name: "Mailversand", exact: true }).click();
  const panel = page.locator("#betrieb-mail");
  await panel
    .getByRole("heading", { name: "Mailversand", exact: true })
    .waitFor();
  await panel.getByText("Noch nicht eingerichtet", { exact: true }).waitFor();
  assert.equal(
    await panel.getByRole("button", { name: "Testmail senden" }).isDisabled(),
    true,
  );
  assert.deepEqual(await pruefeAnsicht(page, "mail-leer"), []);
  const f = panel.locator("#mail-einstellungen");
  await f.getByLabel("SMTP-Server").fill(post.config.host);
  await f.getByLabel("Port").fill(String(post.config.port));
  await f.getByLabel("Verschlüsselung").selectOption("starttls");
  await f.getByLabel("Absenderadresse").fill(post.config.from);
  // Ohne Anmeldung am Mailserver bleiben Benutzername und Passwort leer.
  await f.getByLabel("Dein Timereal-Passwort").fill("falsch-" + suffix);
  await f.getByRole("button", { name: "Prüfen und speichern" }).click();
  await panel.getByText("Das Timereal-Passwort stimmt nicht.").waitFor();
  await f.getByLabel("Dein Timereal-Passwort").fill(passwort);
  await f.getByRole("button", { name: "Prüfen und speichern" }).click();
  await panel
    .getByText("Gespeichert. Die Verbindung wurde geprüft und gilt sofort.")
    .waitFor();
  await panel.getByText("Eingerichtet", { exact: true }).waitFor();
  assert.equal(await f.getByLabel("Dein Timereal-Passwort").inputValue(), "");
  assert.deepEqual(await pruefeAnsicht(page, "mail-eingerichtet"), []);
  const t = panel.locator("#mail-testmail");
  await t.getByLabel("Empfängeradresse").fill("admin@example.test");
  await t.getByRole("button", { name: "Testmail senden" }).click();
  // Das Ergebnis steht in der Karte der Testmail, nicht im Einstellungsformular.
  await panel
    .locator("#mail-testergebnis")
    .getByText(
      "Der Mailserver hat die Testmail angenommen. Prüfe auch deinen Spamordner.",
    )
    .waitFor();
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector("#mail-testergebnis")
        .closest("section")
        .contains(document.querySelector("#mail-testmail")),
    ),
    true,
  );
  await post.warten(1);
  assert.match(post.nachrichten[0], /Testmail/);
  const bilder = process.env.SCREENSHOT_DIR ?? join(dir, "bilder");
  await mkdir(bilder, { recursive: true });
  for (const [name, width, zoom] of [
    ["desktop", 1280, 1],
    ["mobil", 390, 1],
    ["schmal", 320, 1],
    ["text200", 390, 2],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (z) => (document.documentElement.style.fontSize = 16 * z + "px"),
      zoom,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    );
    await page.screenshot({
      path: join(bilder, "mailversand-" + name + ".png"),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  // Die Betriebsrolle sieht den Reiter nicht und erhält von der API 403.
  const zweite = await browser.newPage({ locale: "de-DE" });
  await anmelden(zweite, betrieb);
  await zweite
    .getByRole("button", { name: "Updates", exact: true })
    .first()
    .waitFor();
  assert.equal(await zweite.locator('[data-betrieb="mail"]').isHidden(), true);
  assert.equal(
    await zweite.evaluate(
      async () => (await fetch("/api/v1/verwaltung/mail/einstellungen")).status,
    ),
    403,
  );
  console.log(
    "Mailversand im Browser: Einrichten mit Prüfung, falsches Passwort, Testmail, responsive Ansichten und Rollensperre bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
  await dienst.schliessen();
  await post.close();
  await db.end();
  await rm(dir, { recursive: true, force: true });
}
