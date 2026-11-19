import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { pruefeAnsicht } from "./hilfe/design.mjs";
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const pass = randomBytes(20).toString("hex");
const login = "extension-browser-" + randomBytes(8).toString("hex");
await owner.query(
  "insert into konto(login_referenz,passwort_hash) values($1,$2)",
  [login, await passwordHash(pass)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const options = { secure: false };
const app = createApp(new pg.Pool({ connectionString: url.href }), options);
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
options.origin = addr;
// Die native Chrome-Berechtigungsabfrage ist kein Web-DOM. Nur der lokale Testserver
// wird in einer Wegwerf-Kopie vorab erlaubt; Authentifizierung/API bleiben unverändert.
const dir = await mkdtemp(resolve(tmpdir(), "timereal-extension-"));
await cp(resolve("dist/erweiterung"), dir, { recursive: true });
const manifest = JSON.parse(
  await readFile(resolve(dir, "manifest.json"), "utf8"),
);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.permissions, ["storage", "identity"]);
manifest.host_permissions = ["http://127.0.0.1/*"];
await writeFile(resolve(dir, "manifest.json"), JSON.stringify(manifest));
const ctx = await chromium.launchPersistentContext("", {
  locale: "de-DE",
  channel: "chromium",
  headless: true,
  args: ["--disable-extensions-except=" + dir, "--load-extension=" + dir],
  viewport: { width: 1000, height: 900 },
});
ctx.setDefaultTimeout(10000);
const id = "foobkcceoconhlclbnechjlimhkfbcno";
const origin = "chrome-extension://" + id;
let settings;
const errors = [];
const designErrors = [];
ctx.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
try {
  settings = await ctx.newPage();
  await settings.addInitScript(() => {
    if (location.pathname !== "/einstellungen.html") return;
    const get = chrome.storage.local.get.bind(chrome.storage.local);
    chrome.storage.local.get = async (...args) => {
      chrome.storage.local.get = get;
      const result = await get(...args);
      await new Promise((resolve) => {
        window.releaseSettingsLoad = resolve;
      });
      return result;
    };
  });
  await settings.goto(origin + "/einstellungen.html");
  await settings.waitForFunction(
    () => typeof window.releaseSettingsLoad === "function",
  );
  assert.equal(
    await settings
      .getByRole("button", { name: "Verbinden", exact: true })
      .isDisabled(),
    true,
    "Vor Abschluss des Modulstarts darf Verbinden kein Formular absenden.",
  );
  assert.equal(
    await settings.getByLabel("Timereal-Adresse").isDisabled(),
    true,
    "Frühe Eingaben dürfen nicht vom geladenen Stand überschrieben werden.",
  );
  await settings.evaluate(() => window.releaseSettingsLoad());
  assert.deepEqual(await pruefeAnsicht(settings, "erweiterung-verbinden"), []);
  await settings.getByLabel("Timereal-Adresse").fill(addr);
  // Der Modulstart liest gespeicherte Einstellungen asynchron.
  await settings.waitForFunction(
    () => typeof document.querySelector("form").onsubmit === "function",
  );
  const authWait = ctx.waitForEvent("page", { timeout: 15000 });
  await settings
    .getByRole("button", { name: "Verbinden", exact: true })
    .click();
  const auth = await authWait;
  await auth.waitForLoadState("domcontentloaded");
  await auth.getByLabel("Anmeldename").waitFor();
  assert.deepEqual(await pruefeAnsicht(auth, "erweiterung-anmeldung"), []);
  await auth.getByLabel("Anmeldename").fill(login);
  await auth.getByLabel("Passwort", { exact: true }).fill(pass);
  await auth.route("**/api/v1/anmeldung", (route) =>
    route.abort("internetdisconnected"),
  );
  await auth.getByRole("button", { name: "Anmelden", exact: true }).click();
  await auth.getByRole("alert").waitFor();
  if (!(await auth.getByRole("alert").innerText()).includes("Verbindung"))
    designErrors.push(
      "Die Anmeldung der Erweiterung braucht eine verständliche Verbindungsmeldung",
    );
  await auth.unroute("**/api/v1/anmeldung");
  let releaseLogin, loginReached;
  const holdLogin = new Promise((resolve) => {
    releaseLogin = resolve;
  });
  const reachedLogin = new Promise((resolve) => {
    loginReached = resolve;
  });
  await auth.route("**/api/v1/anmeldung", async (route) => {
    loginReached();
    await holdLogin;
    await route.continue();
  });
  await auth.getByRole("button", { name: "Anmelden", exact: true }).click();
  await reachedLogin;
  if (!(await auth.getByRole("status").isVisible()))
    designErrors.push(
      "Die Anmeldung der Erweiterung braucht einen sichtbaren Ladezustand",
    );
  if (await auth.getByRole("alert").isVisible())
    designErrors.push(
      "Die überholte Fehlermeldung muss beim erneuten Anmelden verschwinden",
    );
  releaseLogin();
  await auth
    .getByRole("button", { name: "Erweiterung verbinden", exact: true })
    .waitFor();
  assert.deepEqual(await pruefeAnsicht(auth, "erweiterung-freigabe"), []);
  await auth
    .getByRole("button", { name: "Erweiterung verbinden", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Zeiterfassung öffnen", exact: true })
    .waitFor();
  // Eine abgebrochene Verbindung darf die bereits funktionierende Konfiguration
  // und deren Sitzung nicht durch die neue Adresse ersetzen.
  await settings.getByLabel("Timereal-Adresse").fill("http://127.0.0.1:1");
  await settings
    .getByRole("button", { name: "Verbinden", exact: true })
    .click();
  await settings.waitForFunction(
    () =>
      !document.querySelector("form button").disabled &&
      document.querySelector("#meldung").textContent.trim().length > 0,
  );
  assert.equal(
    await settings.evaluate(
      async () => (await chrome.storage.local.get("server")).server,
    ),
    addr,
  );
  assert.equal(
    await settings.evaluate(
      async () => (await chrome.storage.session.get("zugang")).zugang.server,
    ),
    addr,
  );
  // Echte Web-Sitzung auf einem zweiten Gerät, anschließend App-Tab schließen.
  const phone = await ctx.newPage();
  await phone.goto(addr);
  await phone.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  const post = async (path, data) => {
    const r = await phone.request.post(addr + "/api/v1" + path, {
      data,
      headers: { origin: addr },
    });
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  };
  await post("/ziele", {
    kunde: "Erweiterung A",
    art: "Ticket",
    bezeichnung: "4711",
  });
  await post("/ziele", {
    kunde: "Erweiterung B",
    art: "Ticket",
    bezeichnung: "Telefonat",
  });
  await phone.close();
  await settings.close();
  let popup = await ctx.newPage();
  await popup.setViewportSize({ width: 380, height: 650 });
  await popup.goto(origin + "/popup.html");
  await popup.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  assert.deepEqual(
    await pruefeAnsicht(popup, "erweiterung-popup", { widths: [380] }),
    [],
  );
  await popup
    .locator("#ziele .ziel")
    .filter({ hasText: "Erweiterung A" })
    .getByRole("button", { name: "Hier starten" })
    .click();
  await popup
    .locator("#timer")
    .getByRole("heading", { name: /Erweiterung A/ })
    .waitFor();
  await popup
    .getByRole("button", { name: "Leistungstext", exact: true })
    .click();
  await popup.locator("#notiz").fill("Direkt aus der Browserleiste");
  assert.deepEqual(
    await pruefeAnsicht(popup, "erweiterung-notiz", { widths: [380] }),
    [],
  );
  await popup
    .locator("#notizfenster")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await popup.locator("#notizfenster").waitFor({ state: "hidden" });
  await popup
    .locator("#ziele .ziel")
    .filter({ hasText: "Erweiterung B" })
    .getByRole("button", { name: "Hierhin wechseln" })
    .click();
  await popup
    .locator("#timer")
    .getByRole("heading", { name: /Erweiterung B/ })
    .waitFor();
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await popup.screenshot({
      path: process.env.SCREENSHOT_DIR + "/erweiterung-popup.png",
      fullPage: true,
    });
  }
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(addr);
  await mobile
    .locator("#timer")
    .getByRole("heading", { name: /Erweiterung B/ })
    .waitFor();
  const before = (
    await owner.query(
      "select timer_version from konto where login_referenz=$1",
      [login],
    )
  ).rows[0].timer_version;
  await ctx.setOffline(true);
  await popup
    .locator("#ziele .ziel")
    .filter({ hasText: "Erweiterung A" })
    .getByRole("button", { name: "Hierhin wechseln" })
    .click();
  await popup
    .getByRole("heading", { name: "Keine Verbindung", exact: true })
    .waitFor();
  assert.deepEqual(
    await pruefeAnsicht(popup, "erweiterung-offline", { widths: [380] }),
    [],
  );
  if (process.env.SCREENSHOT_DIR)
    await popup.screenshot({
      path: process.env.SCREENSHOT_DIR + "/erweiterung-offline.png",
      fullPage: true,
    });
  // Schließen und Öffnen des Popups darf die fehlende Bestätigung nicht vergessen.
  await popup.close();
  await ctx.setOffline(false);
  popup = await ctx.newPage();
  await popup.goto(origin + "/popup.html");
  await popup
    .getByRole("heading", { name: "Keine Verbindung", exact: true })
    .waitFor();
  await popup.getByRole("button", { name: "Aktuellen Stand laden" }).click();
  await popup.locator("#verbindung").waitFor({ state: "hidden" });
  assert.equal(
    (
      await owner.query(
        "select timer_version from konto where login_referenz=$1",
        [login],
      )
    ).rows[0].timer_version,
    before,
  );
  popup.once("dialog", (d) => d.accept());
  await popup
    .locator("#ziele .ziel")
    .filter({ hasText: "Erweiterung A" })
    .getByRole("button", { name: "Hierhin wechseln" })
    .click();
  await popup
    .locator("#timer")
    .getByRole("heading", { name: /Erweiterung A/ })
    .waitFor();
  // Die Aktion wird gespeichert, aber ihre HTTP-Antwort geht verloren.
  const vorVerlust = Number(
    (
      await owner.query(
        "select timer_version from konto where login_referenz=$1",
        [login],
      )
    ).rows[0].timer_version,
  );
  await popup.route(
    "**/api/v1/timer/wechsel",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await popup
    .locator("#ziele .ziel")
    .filter({ hasText: "Erweiterung B" })
    .getByRole("button", { name: "Hierhin wechseln" })
    .click();
  await popup
    .getByRole("heading", { name: "Keine Verbindung", exact: true })
    .waitFor();
  await popup.getByRole("button", { name: "Aktuellen Stand laden" }).click();
  await popup.locator("#verbindung").waitFor({ state: "hidden" });
  await popup
    .locator("#timer")
    .getByRole("heading", { name: /Erweiterung B/ })
    .waitFor();
  assert.equal(
    Number(
      (
        await owner.query(
          "select timer_version from konto where login_referenz=$1",
          [login],
        )
      ).rows[0].timer_version,
    ),
    vorVerlust + 1,
  );
  popup.once("dialog", (d) => d.accept());
  await popup.getByRole("button", { name: "Pausieren", exact: true }).click();
  await popup.getByRole("button", { name: "Fortsetzen", exact: true }).click();
  await popup.getByRole("button", { name: "Stoppen", exact: true }).click();
  await popup
    .locator("#timer")
    .getByRole("heading", { name: "Kein Timer aktiv" })
    .waitFor();
  const full = await ctx.newPage();
  await full.goto(origin + "/index.html");
  await full.getByRole("button", { name: "Woche", exact: true }).click();
  await full.getByRole("heading", { name: "Wochenübersicht" }).waitFor();
  assert.deepEqual(await pruefeAnsicht(full, "erweiterung-vollansicht"), []);
  if (process.env.SCREENSHOT_DIR)
    await full.screenshot({
      path: process.env.SCREENSHOT_DIR + "/erweiterung-vollansicht.png",
      fullPage: true,
    });
  await owner.query("update konto set ist_admin=true where login_referenz=$1", [
    login,
  ]);
  await full.reload();
  await full.getByRole("button", { name: "Verwaltung", exact: true }).click();
  await full.locator("#betrieb-berater").waitFor();
  assert.equal(
    await full.locator('[data-betrieb="updates"]').isVisible(),
    false,
    "Betriebsaktionen benötigen die Websitzung und werden in der Erweiterung nicht angeboten.",
  );
  assert.equal(
    await full.locator('[data-betrieb="domain"]').isVisible(),
    false,
  );
  await mobile
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  const extSession = mobile
    .locator("#sitzungsliste article")
    .filter({ hasText: "Browsererweiterung" });
  await extSession
    .getByRole("button", { name: "Abmelden", exact: true })
    .click();
  await popup.reload();
  await popup
    .getByRole("button", { name: "Erweiterung verbinden", exact: true })
    .waitFor();
  await popup.setViewportSize({ width: 380, height: 650 });
  assert.deepEqual(
    await pruefeAnsicht(popup, "erweiterung-abgemeldet", { widths: [380] }),
    [],
  );

  assert.deepEqual(errors, []);
  assert.deepEqual(designErrors, []);
  console.log(
    "Echte Chromium-Erweiterung geprüft: Anmeldung, geschlossener App-Tab, Wechsel und Notiz, Smartphone, Pause/Stopp, Offline-Bestätigung, Vollansicht und Sitzungswiderruf.",
  );
} catch (e) {
  console.error(
    "Verbindungsfenster:",
    await settings
      ?.locator("body")
      .innerText()
      .catch(() => "Fenster nicht mehr erreichbar"),
  );
  console.error(
    "Offene Fenster:",
    ctx.pages().map((p) => p.url()),
  );
  throw e;
} finally {
  await ctx.close();
  await rm(dir, { recursive: true, force: true });
  await app.close();
  await owner.end();
}
