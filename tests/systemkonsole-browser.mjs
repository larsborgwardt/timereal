import { chromium, firefox } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { dienstStarten } from "../betrieb/verwaltung/dienst.mjs";
import { journalLeser } from "../betrieb/verwaltung/journal.mjs";
import { pruefeAnsicht } from "./hilfe/design.mjs";

// Echte App, Datenbank und Unix-Socket. Journal-JSON als Testdouble für die
// Browser-Zustandsfälle; echtes journald wird in systemkonsole-native.mjs geprüft.
const dir = await mkdtemp(join(tmpdir(), "timereal-konsole-browser-"));
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const login = "konsole-" + randomUUID(),
  passwort = randomBytes(24).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true)",
  [login, await passwordHash(passwort)],
);
let kaputt = false,
  abrufe = 0;
const daten = [
  ...Array.from({ length: 80 }, (_, i) => ({
    __REALTIME_TIMESTAMP: String(Date.now() * 1000 + i * 1000),
    _SYSTEMD_UNIT: "timereal.service",
    PRIORITY: "6",
    MESSAGE: "Anwendungsprüfung " + i,
  })),
  {
    __REALTIME_TIMESTAMP: String(Date.now() * 1000),
    _SYSTEMD_UNIT: "timereal-https.service",
    PRIORITY: "4",
    MESSAGE: "HTTPS Warnung <img src=x onerror=alert(1)>",
  },
  {
    __REALTIME_TIMESTAMP: String(Date.now() * 1000),
    _SYSTEMD_UNIT: "timereal-betrieb.service",
    PRIORITY: "6",
    MESSAGE: JSON.stringify({
      timereal_log: 1,
      level: "complete",
      msg: "Update abgeschlossen",
    }),
  },
];
const journal = journalLeser({
  ausfuehren: async () => {
    if (kaputt) throw new Error("interne Diagnose");
    return { stdout: daten.map(JSON.stringify).join("\n") };
  },
});
const dienst = await dienstStarten({
  verzeichnis: join(dir, "zustand"),
  socketPath: join(dir, "dienst.sock"),
  lockPath: join(dir, "lock"),
  journal: async (filter) => {
    abrufe++;
    return journal(filter);
  },
});
const dburl = new URL(process.env.TEST_DATABASE_URL);
dburl.username = "timereal_app";
dburl.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: dburl.href }), {
  secure: false,
  betriebSocket: join(dir, "dienst.sock"),
  updateCheck: async () => ({
    status: "disabled",
    currentVersion: "0.8.0",
    updateAvailable: false,
  }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
const engine = process.env.KONSOLE_BROWSER ?? "chromium";
assert.ok(
  ["chromium", "firefox"].includes(engine),
  "Unbekannte Konsolen-Testengine",
);
const browser = await (engine === "firefox" ? firefox : chromium).launch(
  engine === "chromium" ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill(passwort);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Verwaltungsbereiche" })
    .getByRole("button", { name: "Systemlogs", exact: true })
    .click();
  const panel = page.locator("#betrieb-logs"),
    ausgabe = panel.getByRole("region", { name: "Konsolenausgabe" });
  await panel.getByText("Live verbunden", { exact: true }).waitFor();
  await ausgabe.getByText("Update abgeschlossen", { exact: false }).waitFor();
  assert.equal(await ausgabe.locator("img").count(), 0, "Logtext bleibt Text");
  await panel.getByLabel("Live", { exact: true }).uncheck();
  const vorher = abrufe;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(2300);
  assert.equal(abrufe, vorher, "Pausiert bedeutet keine Folgeabrufe");
  await panel.getByLabel("Automatisch scrollen").uncheck();
  await panel
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "konsole-download",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "konsole-ausgabe",
  );
  await ausgabe.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    () => document.querySelector("#konsole-ausgabe").scrollTop > 0,
  );
  // Firefox animiert Tastaturscrollen. Erst nach dessen Ende beginnt die
  // getrennte Probe, ob ein neuer Logabruf die manuelle Leseposition erhält.
  await ausgabe.evaluate(
    (el) =>
      new Promise((resolve) => {
        let letztePosition = el.scrollTop,
          stabilSeit = performance.now();
        function pruefen() {
          if (el.scrollTop !== letztePosition) {
            letztePosition = el.scrollTop;
            stabilSeit = performance.now();
          }
          if (performance.now() - stabilSeit >= 150) resolve();
          else requestAnimationFrame(pruefen);
        }
        requestAnimationFrame(pruefen);
      }),
  );
  await ausgabe.evaluate((el) => {
    el.scrollTop = 20;
  });
  daten.push({
    __REALTIME_TIMESTAMP: String(Date.now() * 1000),
    _SYSTEMD_UNIT: "timereal.service",
    PRIORITY: "6",
    MESSAGE: "Neue Meldung bei pausiertem Scrollen",
  });
  const aktualisiert = page.waitForResponse(
    (response) =>
      response.url().includes("/verwaltung/betrieb/logs?") && response.ok(),
  );
  await panel
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .click();
  await aktualisiert;
  await ausgabe
    .getByText("Neue Meldung bei pausiertem Scrollen", { exact: false })
    .waitFor();
  await panel.getByText("Live pausiert", { exact: true }).waitFor();
  assert.ok(
    await ausgabe.evaluate((el) => el.scrollTop < 30),
    "Manuelle Leseposition bleibt erhalten",
  );
  assert.deepEqual(await pruefeAnsicht(page, "systemkonsole"), []);
  await panel.getByLabel(/^Quelle/).selectOption("https");
  await panel.getByLabel(/^Level/).selectOption("warn");
  await panel.getByLabel("Freitextsuche").fill("WARNUNG");
  await panel.getByRole("button", { name: "Filtern", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#konsole-anzahl").textContent === "1 Zeile",
  );
  assert.ok(!(await ausgabe.innerText()).includes("Anwendungsprüfung"));
  const downloaded = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Herunterladen", exact: true })
    .click();
  const download = await downloaded;
  const text = await readFile(await download.path(), "utf8");
  assert.match(text, /HTTPS.*WARN.*HTTPS Warnung/);
  assert.doesNotMatch(text, /Anwendungsprüfung/);
  await panel.getByLabel("Freitextsuche").fill("gibt-es-nicht");
  await panel.getByRole("button", { name: "Filtern", exact: true }).click();
  await panel
    .getByText("Keine Einträge für diese Filter.", { exact: true })
    .waitFor();
  assert.deepEqual(await pruefeAnsicht(page, "systemkonsole-leer"), []);
  kaputt = true;
  await page.waitForTimeout(2100);
  await panel
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .click();
  await panel.getByRole("alert").waitFor();
  assert.match(
    await panel.getByRole("alert").innerText(),
    /Systemprotokoll derzeit nicht lesbar/,
  );
  assert.deepEqual(await pruefeAnsicht(page, "systemkonsole-fehler"), []);
  kaputt = false;
  await page.waitForTimeout(2100);
  await panel.getByLabel("Freitextsuche").fill("");
  await panel.getByRole("button", { name: "Filtern", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#konsole-anzahl").textContent === "1 Zeile",
  );
  assert.equal(await panel.getByRole("alert").isVisible(), false);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.getByRole("button", { name: "Anmelden", exact: true }).waitFor();
  assert.equal(
    await page.locator("#konsole-zeilen").innerText(),
    "",
    "Abmelden löscht den Loginhalt",
  );
  assert.deepEqual(errors, []);
  console.log(
    `Systemkonsole (${engine} ${browser.version()}): Filter, Pause, Leseposition, Download, Fehler, Kontowechsel und Desktop/Mobil/Zoom bestanden.`,
  );
} finally {
  await browser.close();
  await app.close();
  await dienst.schliessen();
  await owner.end();
  await rm(dir, { recursive: true, force: true });
}
