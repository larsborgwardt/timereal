import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
const owner = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await owner.connect();
const pass = randomBytes(20).toString("hex");
const {
  rows: [konto],
} = await owner.query(
  "insert into konto(login_referenz,passwort_hash) values('arbeitsablauf-browser',$1) returning id",
  [await passwordHash(pass)],
);
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const options = { secure: false };
const app = createApp(new pg.Pool({ connectionString: url.href }), options);
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
options.origin = addr;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(6000);
const errors = [],
  befunde = [];
page.on("pageerror", (e) => errors.push(e.message));
const btn = (name) => page.getByRole("button", { name, exact: true });
const shot = async (name) => {
  if (process.env.SCREENSHOT_DIR) {
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: process.env.SCREENSHOT_DIR + "/" + name + ".png",
      fullPage: true,
    });
  }
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
const history = async () => {
  await btn("Nachweise").click();
  const f = page.locator("#filter");
  await f.locator("[name=von]").fill("2026-11-16");
  await f.locator("[name=bis]").fill("2026-11-16");
  await f.getByRole("button").click();
  await btn("Historie").click();
};
try {
  await page.goto(addr);
  await page.getByLabel("Anmeldename").fill("arbeitsablauf-browser");
  await page.getByLabel("Passwort", { exact: true }).fill(pass);
  await btn("Anmelden").click();
  await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
  const a = await api("/ziele", "POST", {
    kunde: "Kunde Alpha",
    art: "Ticket",
    bezeichnung: "Konfiguration",
  });
  const b = await api("/ziele", "POST", {
    kunde: "Kunde Beta",
    art: "Ticket",
    bezeichnung: "Telefonat",
  });
  await page.reload();
  await btn("Zeit nachtragen").first().click();
  const dlg = page.locator("#zeitfenster");
  await dlg.locator("[name=beginn]").fill("2026-11-16T09:00");
  await dlg.locator("[name=ende]").fill("2026-11-16T10:00");
  await dlg.locator("[name=auswahl]").selectOption("ziel:" + a.id);
  await dlg.getByLabel("Leistungstext").fill("Customizing geprüft");
  await dlg.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await dlg.waitFor({ state: "hidden" });
  await history();
  let first = page.locator("#eintraege article").first();
  await first
    .getByRole("button", { name: "Übernahme bestätigen", exact: true })
    .click();
  await first.getByText("Übertragen", { exact: true }).waitFor();
  await first.getByRole("button", { name: "Unterbrechung einfügen" }).click();
  await dlg.locator("[name=beginn]").fill("2026-11-16T09:20");
  await dlg.locator("[name=ende]").fill("2026-11-16T09:32");
  await dlg.locator("[name=auswahl]").selectOption("ziel:" + b.id);
  await dlg.getByLabel("Leistungstext").fill("Telefonische Abstimmung");
  assert.deepEqual(
    await dlg.locator("#zeitvorschau .ziel span:last-child").allTextContents(),
    ["20 min", "12 min", "28 min"],
  );
  await shot("unterbrechung");
  await dlg.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await dlg.waitFor({ state: "hidden" });
  await page.locator("#eintraege article").nth(2).waitFor();
  assert.deepEqual(
    (
      await owner.query(
        "select extract(epoch from(ende-beginn))::int/60 m from zeitabschnitt where konto_id=$1 order by beginn",
        [konto.id],
      )
    ).rows.map((x) => x.m),
    [20, 12, 28],
  );
  await first.getByRole("button", { name: "Buchung vergleichen" }).click();
  const compare = page.locator("#vergleichfenster");
  await compare.getByText("Zuletzt übertragen", { exact: true }).waitFor();
  assert.match(await compare.innerText(), /1.00/);
  assert.match(await compare.innerText(), /0.33/);
  await shot("vergleich");
  await compare.getByRole("button", { name: "Schließen" }).click();
  await first.getByRole("button", { name: "Korrigieren", exact: true }).click();
  await dlg.locator("[name=ende]").fill("2026-11-16T09:22");
  await dlg.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await dlg.waitFor({ state: "hidden" });
  assert.deepEqual(
    (
      await owner.query(
        "select extract(epoch from(ende-beginn))::int/60 m from zeitabschnitt where konto_id=$1 order by beginn",
        [konto.id],
      )
    ).rows.map((x) => x.m),
    [22, 10, 28],
  );
  await btn("Woche").click();
  await page
    .locator("#wochentitel")
    .getByText("2026-11-16 – 2026-11-22", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#wochensumme").innerText(), "01:00");
  await shot("woche");
  await btn("Einstellungen").click();
  const settings = page.locator("#grundeinstellungen");
  await settings.locator("[name=nachkommastellen]").selectOption("3");
  await settings.locator("[name=pruefminuten]").fill("360");
  await settings.getByRole("button").click();
  assert.equal((await api("/profil")).nachkommastellen, 3);
  await btn("Heute").click();
  const target = page
    .locator("#ziele .ziel")
    .filter({ hasText: "Kunde Alpha" });
  await target.getByRole("button", { name: "Bearbeiten" }).click();
  const edit = page.locator("#zielpflegefenster");
  await edit.getByLabel("Kundenname").fill("Alpha GmbH");
  await edit.getByLabel("Bezeichnung").fill("Ticket 4711");
  await edit.getByRole("button", { name: "Änderungen speichern" }).click();
  await edit.waitFor({ state: "hidden" });
  await page
    .locator("#ziele")
    .getByText("Alpha GmbH", { exact: true })
    .waitFor();
  await btn("Sofort starten").click();
  await page
    .locator("#sofortfenster")
    .getByRole("button", { name: "Timer starten" })
    .click();
  await page
    .locator("#timer")
    .getByRole("heading", { name: "Vorläufige Zeit" })
    .waitFor();
  await btn("Stoppen").click();
  await page
    .locator("#timer")
    .getByRole("heading", { name: "Kein Timer aktiv" })
    .waitFor();
  await btn("Interne Zeit").click();
  await page
    .locator("#timer")
    .getByRole("heading", { name: "Interne Zeit" })
    .waitFor();
  await btn("Stoppen").click();
  // Filter dürfen weder heutige Zeiten verbergen noch nach Abmelden sensible Einträge zurücklassen.
  await history();
  await page.locator("#filter [name=suche]").fill("kein-treffer");
  await page.locator("#filter button").click();
  await btn("Heute").click();
  await page.waitForFunction(() => !document.querySelector("#sofort").disabled);
  if (!(await page.locator("#tageseintraege article").count()))
    befunde.push("Historienfilter verbirgt Tagesverlauf");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  await shot("heute-mobil");
  // In der doppelten Herbststunde muss ein neuer Zeitpunkt bewusst ausgewählt werden.
  await btn("Zeit nachtragen").first().click();
  await dlg.locator("[name=beginn]").fill("2026-10-25T02:15");
  if ((await dlg.locator("[name=beginnOffset]").inputValue()) !== "")
    befunde.push("Doppelte Stunde ohne bewusste Auswahl");
  await dlg
    .locator("[name=beginnOffset]")
    .selectOption({ label: "2. Vorkommen · 02:15 GMT+1" });
  assert.match(
    await dlg.locator("[name=beginnOffset]").inputValue(),
    /01:15:00/,
  );
  await dlg.getByRole("button", { name: "Abbrechen" }).click();
  await btn("Abmelden").click();
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  if (await page.locator("#tageseintraege").innerText())
    befunde.push("Tagesverlauf bleibt nach Abmeldung im DOM");
  assert.deepEqual(errors, []);
  assert.deepEqual(befunde, []);
  console.log(
    "Arbeitsablauf im Browser bestanden: Nachtrag, Übertragung, 20/12/28-Teilung, Vergleich, gemeinsame Grenzen, Woche, Pflege, Sofortstart, interne Zeit, mobile Ansicht und Zeitumstellung.",
  );
} finally {
  await browser.close();
  await app.close();
  await owner.end();
}
