import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pruefeAnsicht } from "./hilfe/design.mjs";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";

// Echte Oberfläche und API, ausschließlich die Wegwerf-Datenbank des Testlaufs.
assert.ok(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL fehlt");
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const pass = randomBytes(20).toString("hex");
const login = "design-" + randomBytes(8).toString("hex");
const emailEntwurf = login + "@example.test";
await owner.query(
  "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,true)",
  [login, await passwordHash(pass)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const options = {
  secure: false,
  updateCheck: async () => ({ status: "disabled", updateAvailable: false }),
};
const app = createApp(new pg.Pool({ connectionString: url.href }), options);
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
options.origin = addr;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const page = await browser.newPage({
  locale: "de-DE",
  viewport: { width: 1280, height: 900 },
});
page.setDefaultTimeout(6000);
const findings = [],
  reached = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name, root = page) =>
  root.getByRole("button", { name, exact: true });
const check = (ok, label) => {
  if (!ok) findings.push(label);
};
const api = async (path, method = "GET", data) => {
  const r = await page.request.fetch(addr + "/api/v1" + path, {
    method,
    data,
    headers: { origin: addr },
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
};
const shot = async (name) => {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: process.env.SCREENSHOT_DIR + "/design-" + name + ".png",
    fullPage: true,
  });
};
async function audit(name) {
  reached.push(name);
  findings.push(...(await pruefeAnsicht(page, name)));
}
async function navigate(name) {
  await button(name).click();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
}
async function openAndClose(name, opener, id) {
  await opener();
  const dialog = page.locator("#" + id);
  await dialog.waitFor();
  await audit(name);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
}
try {
  await page.goto(addr);
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  await audit("anmeldung");
  await page.getByLabel("Anmeldename").fill(login);
  await page.getByLabel("Passwort", { exact: true }).fill("falsch");
  await button("Anmelden").click();
  await page.locator("#meldung").waitFor();
  await audit("anmeldung-fehler");
  await openAndClose(
    "passwort-anfordern",
    () => button("Passwort vergessen?").click(),
    "resetfenster",
  );
  await page.getByLabel("Passwort", { exact: true }).fill(pass);
  await button("Anmelden").click();
  await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  await audit("heute-leer");
  await openAndClose(
    "neues-ziel",
    () => page.locator("#neu").click(),
    "zielfenster",
  );
  await page.locator("#sofort").click();
  await audit("sofortstart");
  await button("Timer starten", page.locator("#sofortfenster")).click();
  await button("Pausieren").waitFor();
  await audit("timer-vorlaeufig");
  await button("Pausieren").click();
  await button("Fortsetzen").waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  check(
    await page.evaluate(() =>
      document.querySelector("#timer").contains(document.activeElement),
    ),
    "Nach Pausieren bleibt der Fokus im Timer",
  );
  await audit("timer-pause");
  await button("Stoppen").click();
  await page.getByRole("heading", { name: "Kein Timer aktiv" }).waitFor();
  await button("Interne Zeit").click();
  await page
    .locator("#timer")
    .getByRole("heading", { name: "Interne Zeit" })
    .waitFor();
  await audit("timer-intern");
  await button("Stoppen").click();
  await page.getByRole("heading", { name: "Kein Timer aktiv" }).waitFor();
  await api("/ziele", "POST", {
    kunde: "Beratungsgesellschaft".repeat(3),
    art: "Ticket",
    bezeichnung: "Systemkonfiguration".repeat(3),
  });
  await page.reload();
  await button("Hier starten").click();
  await button("Pausieren").waitFor();
  await audit("timer-zugeordnet");
  await openAndClose(
    "leistungstext",
    () => button("Leistungstext", page.locator("#timer")).click(),
    "notizfenster",
  );
  await openAndClose(
    "ziel-bearbeiten",
    () => button("Bearbeiten").click(),
    "zielpflegefenster",
  );
  await page.locator("#suche").fill("nicht vorhanden");
  await audit("ziele-suche-leer");
  await page.locator("#suche").fill("");
  await navigate("Woche");
  check(
    await page.evaluate(
      () => document.activeElement === document.querySelector("#woche h1"),
    ),
    "Navigation setzt Tastaturfokus auf die neue Überschrift",
  );
  check(
    (await page.locator('[data-page="woche"]').getAttribute("aria-current")) ===
      "page",
    "Aktuelle Navigation ist für Hilfstechnik benannt",
  );
  await audit("woche");
  await navigate("Nachweise");
  await audit("nachweise");
  await button("Historie").click();
  await audit("historie");
  await openAndClose(
    "nachtrag",
    () => page.locator('#nachweise [data-arbeit="nachtrag"]').click(),
    "zeitfenster",
  );
  await navigate("Verwaltung");
  await audit("verwaltung");
  check(
    await button("Berater einladen").isDisabled(),
    "Ohne Mailkonfiguration bleibt Einladen gesperrt",
  );
  await navigate("Einstellungen");
  await page.locator("#sitzungsliste article").waitFor();
  await audit("einstellungen");
  const email = page.locator("#profilform input");
  await email.fill(emailEntwurf);
  const refreshedSessions = page.waitForResponse((r) =>
    r.url().endsWith("/api/v1/sitzungen"),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshedSessions;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  check(
    (await email.inputValue()) === emailEntwurf,
    "Hintergrundaktualisierung bewahrt ungespeicherte Profileingaben",
  );
  let releaseRequest;
  const held = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/v1/einstellungen", async (route) => {
    await held;
    await route.continue();
  });
  await button("Einstellungen speichern").click();
  await page.getByText("Wird verarbeitet…", { exact: true }).waitFor();
  check(
    await button("Einstellungen speichern").isDisabled(),
    "Speichern zeigt laufende Verarbeitung und verhindert Doppelklick",
  );
  await page.getByLabel("Lange Buchungen ab (Minuten)").fill("27");
  releaseRequest();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  await page.unroute("**/api/v1/einstellungen");
  check(
    (await page.getByLabel("Lange Buchungen ab (Minuten)").inputValue()) ===
      "27",
    "Weiterschreiben während des Speicherns bewahrt den neueren Einstellungsentwurf",
  );
  check(
    (await page.locator("#meldung").innerText()).includes(
      "noch nicht gespeichert",
    ),
    "Speichermeldung kennzeichnet den neueren ungespeicherten Entwurf",
  );
  check(
    (await email.inputValue()) === emailEntwurf,
    "Speichern der Zeiteinstellungen bewahrt den getrennten Profilentwurf",
  );
  let releaseProfile;
  const heldProfile = new Promise((resolve) => {
    releaseProfile = resolve;
  });
  await page.route("**/api/v1/profil", async (route) => {
    if (route.request().method() === "PATCH") await heldProfile;
    await route.continue();
  });
  await button("Adresse speichern").click();
  await page.getByText("Wird verarbeitet…", { exact: true }).waitFor();
  const neuerEntwurf = "weiter-" + emailEntwurf;
  await email.fill(neuerEntwurf);
  releaseProfile();
  await page.waitForFunction(() => !document.querySelector("[data-wartet]"));
  await page.unroute("**/api/v1/profil");
  check(
    (await email.inputValue()) === neuerEntwurf,
    "Weiterschreiben während des Speicherns bewahrt den neueren Profilentwurf",
  );
  check(
    (await page.locator("#meldung").innerText()).includes(
      "noch nicht gespeichert",
    ),
    "Profilmeldung kennzeichnet den neueren ungespeicherten Entwurf",
  );
  check(
    (await api("/profil")).email === emailEntwurf,
    "Profilentwurf wird wirklich gespeichert",
  );
  await navigate("Heute");
  const pause = button("Pausieren");
  for (
    let n = 0;
    n < 8 && !(await pause.evaluate((el) => el === document.activeElement));
    n++
  )
    await page.keyboard.press("Tab");
  assert.ok(
    await pause.evaluate((el) => el === document.activeElement),
    "Pausieren per Tab erreicht",
  );
  const refreshedHistory = page.waitForResponse((r) =>
    r.url().includes("/api/v1/historie?"),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshedHistory;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  check(
    await pause.evaluate((el) => el === document.activeElement),
    "Timeraktualisierung erhält den Tastaturfokus",
  );
  check(
    await pause.evaluate((el) => getComputedStyle(el).outlineStyle !== "none"),
    "Tastaturfokus bleibt sichtbar",
  );
  await page.context().setOffline(true);
  await button("Stoppen").click();
  await page.getByRole("heading", { name: "Keine Verbindung" }).waitFor();
  await audit("web-offline");
  await page.context().setOffline(false);
  await button("Aktuellen Stand laden").click();
  await page.locator("#verbindung").waitFor({ state: "hidden" });
  await button("Abmelden").click();
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  check(
    (await email.inputValue()) === "",
    "Abmeldung entfernt den Profilentwurf",
  );
  await page.goto(addr + "/#reset=" + randomBytes(32).toString("hex"));
  const reset = page.locator("#linkfenster");
  await reset.waitFor();
  await audit("passwort-zuruecksetzen");
  await reset.getByLabel("Passwort · mindestens").fill(pass);
  await reset.getByLabel("Passwort wiederholen").fill(pass);
  await button("Passwort speichern", reset).click();
  await reset.getByRole("alert").waitFor();
  await audit("ruecksetzlink-ungueltig");
  check(errors.length === 0, "Browserfehler: " + errors.join(", "));
  if (process.env.SCREENSHOT_DIR)
    await writeFile(
      process.env.SCREENSHOT_DIR + "/design-ergebnis.json",
      JSON.stringify({ reached, findings }, null, 2),
    );
  assert.deepEqual([...new Set(findings)], [], "Design-/Bedienbefunde");
  console.log("Designprüfung bestanden:", reached.join(", "));
} finally {
  await browser.close();
  await app.close();
  await owner.end();
}
