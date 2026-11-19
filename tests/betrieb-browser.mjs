import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { dienstStarten } from "../betrieb/verwaltung/dienst.mjs";
import { pruefeAnsicht } from "./hilfe/design.mjs";

// Echte Datenbank, App und Unix-Auftragsdienst. Nur die privilegierten
// Betriebsschritte sind Test-Doubles; reale Systemproben laufen im Debian-Gast.
const dir = await mkdtemp(join(tmpdir(), "timereal-betrieb-browser-"));
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const login = "betrieb-browser-" + randomUUID(),
  passwort = randomBytes(24).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true)",
  [login, await passwordHash(passwort)],
);
const socketPath = join(dir, "dienst.sock");
let ausfuehrungen = 0;
const dienst = await dienstStarten({
  verzeichnis: join(dir, "zustand"),
  socketPath,
  lockPath: join(dir, "lock"),
  status: async () => ({
    version: "0.6.2",
    origin: "https://zeit.test",
    proxyZiel: "https://192.0.2.42:443",
    domainUnterstuetzt: true,
  }),
  ausfuehren: async (aktion, j, buch) => {
    ausfuehrungen++;
    if (aktion === "update-vorbereiten")
      await buch.fortschreiben(j.id, {
        zustand: "bereit",
        phase: "bereit",
        vorherigeVersion: "0.6.2",
      });
    if (aktion === "update-installieren")
      await buch.fortschreiben(j.id, {
        zustand: "erfolgreich",
        phase: "erfolgreich",
      });
    if (aktion === "domain-pruefen")
      await buch.fortschreiben(j.id, {
        zustand: "geprueft",
        phase: "geprueft",
      });
  },
  wiederherstellen: async () => {
    throw new Error("Kein unterbrochener Auftrag erwartet");
  },
});
const dburl = new URL(process.env.TEST_DATABASE_URL);
dburl.username = "timereal_app";
dburl.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: dburl.href }), {
  secure: false,
  betriebSocket: socketPath,
  updateCheck: async () => ({
    status: "ok",
    currentVersion: "0.6.2",
    latestVersion: "99.0.0",
    updateAvailable: true,
    checkedAt: new Date().toISOString(),
    repositoryUrl: "https://github.com/larsborgwardt/timereal",
    releaseUrl:
      "https://github.com/larsborgwardt/timereal/releases/tag/v99.0.0",
  }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(6000);
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(passwort);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Verwaltungsbereiche" });
  await nav.getByRole("button", { name: "Updates", exact: true }).click();
  await page
    .getByRole("button", { name: "Update vorbereiten", exact: true })
    .waitFor();
  let verloren = false;
  await page.route(
    "**/verwaltung/betrieb/updates/vorbereiten",
    async (route) => {
      const response = await route.fetch();
      if (!verloren) {
        verloren = true;
        await route.abort();
      } else await route.fulfill({ response });
    },
  );
  await page
    .getByRole("button", { name: "Update vorbereiten", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Bereit zur Installation", exact: true })
    .waitFor();
  assert.equal(ausfuehrungen, 1);
  await page.locator("#betrieb-fehler").waitFor({ state: "hidden" });
  assert.match(
    await page.locator("#betrieb-updatephase").textContent(),
    /v0\.6\.2 → v99\.0\.0/,
  );
  assert.match(
    await page.locator("#betrieb-updatemeta").textContent(),
    new RegExp(login),
  );
  assert.deepEqual(await pruefeAnsicht(page, "betrieb-update-bereit"), []);
  await page.reload();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await nav.getByRole("button", { name: "Updates", exact: true }).click();
  await page
    .getByRole("heading", { name: "Bereit zur Installation", exact: true })
    .waitFor();
  await page
    .getByLabel("Administratorpasswort für das Update")
    .fill("falsches-passwort");
  await page
    .getByRole("button", { name: "Sichern und installieren", exact: true })
    .click();
  await page
    .getByText("Das Administratorpasswort stimmt nicht.", { exact: true })
    .waitFor();
  assert.equal(ausfuehrungen, 1);
  await page.getByLabel("Administratorpasswort für das Update").fill(passwort);
  await page
    .getByRole("button", { name: "Sichern und installieren", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Update abgeschlossen", exact: true })
    .waitFor();
  assert.equal(ausfuehrungen, 2);
  assert.deepEqual(await pruefeAnsicht(page, "betrieb-update-erfolgreich"), []);
  assert.equal(
    await page.getByLabel("Administratorpasswort für das Update").inputValue(),
    "",
  );
  await nav.getByRole("button", { name: "Domainzugriff", exact: true }).click();
  await page
    .getByLabel("Öffentliche Domain", { exact: true })
    .fill("zeit.beispiel.de");
  await page
    .getByRole("button", { name: "Status aktualisieren", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Öffentliche Domain", { exact: true }).inputValue(),
    "zeit.beispiel.de",
  );
  await page
    .getByRole("button", { name: "Domain prüfen", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Domain übernehmen", exact: true })
    .waitFor();
  assert.deepEqual(await pruefeAnsicht(page, "betrieb-domain-geprueft"), []);
  const bilder = process.env.SCREENSHOT_DIR ?? "/tmp/timereal-betrieb-bilder";
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
      path: join(bilder, "betrieb-domain-" + name + ".png"),
      fullPage: true,
    });
    await nav.getByRole("button", { name: "Updates", exact: true }).click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      name,
    );
    await page.screenshot({
      path: join(bilder, "betrieb-updates-" + name + ".png"),
      fullPage: true,
    });
    await nav
      .getByRole("button", { name: "Domainzugriff", exact: true })
      .click();
  }
  assert.ok(
    !JSON.stringify(
      await page.evaluate(() => ({ ...sessionStorage })),
    ).includes(passwort),
  );
  console.log(
    "Betriebsoberfläche: verlorene Antwort ohne Doppelauftrag, Neuladen, Passwortprüfung, Domainentwurf und responsive Ansichten bestanden.",
  );
} finally {
  await browser.close();
  await app.close();
  await dienst.schliessen();
  await owner.end();
  await rm(dir, { recursive: true, force: true });
}
