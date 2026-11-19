import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../dist/app.js";
import { updateChecker } from "../dist/updates.js";
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
let ausfuehrungen = 0,
  updateFortsetzen;
const updateWartet = new Promise((resolve) => (updateFortsetzen = resolve));
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
    if (aktion === "update-starten") {
      await buch.fortschreiben(j.id, {
        phase: "vorbereitung",
        vorherigeVersion: "0.6.2",
      });
      await updateWartet;
      await buch.fortschreiben(j.id, {
        zustand: "erfolgreich",
        phase: "erfolgreich",
      });
    }
    if (aktion === "domain-speichern")
      await buch.fortschreiben(j.id, {
        zustand: "bestaetigung_ausstehend",
        phase: "bestaetigung_ausstehend",
        frist: Date.now() + 180000,
        vorherigeOrigin: "https://192.0.2.42",
      });
  },
  wiederherstellen: async () => {
    throw new Error("Kein unterbrochener Auftrag erwartet");
  },
});
const dburl = new URL(process.env.TEST_DATABASE_URL);
dburl.username = "timereal_app";
dburl.password = "nur-fuer-diese-wegwerfdatenbank";
let releaseTag = "v0.6.2",
  releaseAbrufe = 0;
let pruefungFreigeben;
const pruefungWartet = new Promise((resolve) => (pruefungFreigeben = resolve));
const updateCheck = updateChecker({
  version: "0.6.2",
  enabled: true,
  fetch: async () => {
    releaseAbrufe++;
    if (releaseAbrufe > 1) await pruefungWartet;
    return Response.json({
      tag_name: releaseTag,
      draft: false,
      prerelease: false,
    });
  },
});
const app = createApp(new pg.Pool({ connectionString: dburl.href }), {
  secure: false,
  betriebSocket: socketPath,
  updateCheck,
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
    .getByRole("button", { name: "Update starten", exact: true })
    .waitFor();
  await page
    .getByText("Kein neueres stabiles Release gemeldet.", { exact: true })
    .waitFor();
  assert.equal(releaseAbrufe, 1);
  releaseTag = "v99.0.0";
  // Ein bereits laufender Statusabruf darf den manuellen Klick weder verschlucken
  // noch dessen frisches Ergebnis später mit einem alten Cachewert überschreiben.
  let freigeben, empfangen;
  const wartet = new Promise((resolve) => (freigeben = resolve));
  const angefragt = new Promise((resolve) => (empfangen = resolve));
  await page.route(
    "**/verwaltung/betrieb/status",
    async (route) => {
      const response = await route.fetch();
      empfangen();
      await wartet;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await angefragt;
  await page
    .getByRole("button", { name: "Status aktualisieren", exact: true })
    .click();
  await page
    .getByText("Neue Version wird geprüft …", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#betrieb-aktualisieren").isDisabled(), true);
  assert.equal(
    await page.locator("#betrieb-aktualisieren").getAttribute("aria-busy"),
    "true",
  );
  pruefungFreigeben();
  await page
    .locator("#betrieb-neu")
    .getByText("v99.0.0", { exact: true })
    .waitFor();
  freigeben();
  await page
    .locator("#update-link")
    .getByText("Update verfügbar: v99.0.0 ↗", { exact: true })
    .waitFor();
  assert.equal(releaseAbrufe, 2);
  assert.equal(
    await page.locator("#betrieb-aktualisieren").getAttribute("aria-busy"),
    "false",
  );
  await page
    .getByRole("button", { name: "Status aktualisieren", exact: true })
    .click();
  await page
    .getByText(/Bitte warte .* Sekunden bis zur nächsten Versionsprüfung/)
    .waitFor();
  assert.equal(releaseAbrufe, 2);
  let verloren = false;
  await page.route("**/verwaltung/betrieb/updates/starten", async (route) => {
    const response = await route.fetch();
    if (!verloren) {
      verloren = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Update starten", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Update wird vorbereitet", exact: true })
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
  assert.deepEqual(await pruefeAnsicht(page, "betrieb-update-laeuft"), []);
  await page.reload();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await nav.getByRole("button", { name: "Updates", exact: true }).click();
  await page
    .getByRole("heading", { name: "Update wird vorbereitet", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('#verwaltung input[type="password"]').count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Updatefortschritt" })
      .getAttribute("value"),
    "1",
  );
  const updateAuftrag = dienst.buch.liste().find((j) => j.typ === "update");
  await dienst.buch.fortschreiben(updateAuftrag.id, { phase: "pruefung" });
  await page
    .locator("#betrieb-updatephase")
    .getByText(/Release wird geprüft/)
    .waitFor();
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Updatefortschritt" })
      .getAttribute("value"),
    "0",
  );
  updateFortsetzen();
  await page
    .getByRole("heading", { name: "Update abgeschlossen", exact: true })
    .waitFor();
  assert.equal(ausfuehrungen, 1);
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Updatefortschritt" })
      .getAttribute("value"),
    "6",
  );
  assert.deepEqual(await pruefeAnsicht(page, "betrieb-update-erfolgreich"), []);
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
    .getByRole("button", { name: "Domain speichern", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Neue Adresse wird geprüft", exact: true })
    .waitFor();
  assert.deepEqual(await pruefeAnsicht(page, "betrieb-domain-zugriff"), []);
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
    "Betriebsoberfläche: verlorene Antwort ohne Doppelauftrag, Neuladen, Ein-Klick-Update mit Fortschrittsbalken, Domainentwurf und responsive Ansichten bestanden.",
  );
} finally {
  updateFortsetzen();
  await browser.close();
  await app.close();
  await dienst.schliessen();
  await owner.end();
  await rm(dir, { recursive: true, force: true });
}
