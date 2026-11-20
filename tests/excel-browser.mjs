import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { createApp } from "../dist/app.js";
import { passwordHash } from "../dist/session.js";
import { leseXlsx } from "./hilfe/xlsx.mjs";

const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
const password = randomBytes(20).toString("hex");
const {
  rows: [konto],
} = await db.query(
  "insert into konto(login_referenz,passwort_hash) values('excel-browser',$1) returning id",
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
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      locale: "de-DE",
    });
    page.setDefaultTimeout(6000);
    await page.goto(addr);
    await page.getByLabel("Anmeldename").fill("excel-browser");
    await page.getByLabel("Passwort", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.getByRole("heading", { name: "Heute", exact: true }).waitFor();
    if (width === 1280) {
      const api = async (path, data) => {
        const res = await page.request.post(addr + "/api/v1" + path, {
          data,
          headers: { origin: addr },
        });
        assert.equal(res.status(), 200, await res.text());
        return res.json();
      };
      const ziel = await api("/ziele", {
        kunde: "Beispielkunde",
        art: "Ticket",
        bezeichnung: "00123",
      });
      await api("/abschnitte", {
        art: "zugeordnet",
        zielId: ziel.id,
        beginn: "2026-11-10T08:00:00Z",
        ende: "2026-11-10T09:40:00Z",
        leistungstext: "Konfiguration geprüft",
      });
      await api("/abschnitte", {
        art: "intern",
        beginn: "2026-11-11T08:00:00Z",
        ende: "2026-11-11T09:00:00Z",
        leistungstext: "Interne Arbeit",
        abrechenbar: false,
      });
    }
    await page.getByRole("button", { name: "Nachweise", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Als Excel exportieren",
        exact: true,
      })
      .waitFor();
    const button = page.locator("#nachweise-excel");
    await button.waitFor();
    await page.locator('#filter [name="von"]').fill("2026-11-10");
    await page.locator('#filter [name="bis"]').fill("2026-11-11");
    await page.getByRole("button", { name: "Filtern", exact: true }).click();
    await page.getByText("Konfiguration geprüft", { exact: true }).waitFor();
    const before = (
      await db.query(
        "select id,fassung,uebertragener_stand from zeitabschnitt where konto_id=$1 order by id",
        [konto.id],
      )
    ).rows;
    for (const [view, suche, rows] of [
      ["Übernahme", "", 2],
      ["Historie", "", 3],
      ["Historie", "00123", 2],
      ["Historie", "ohne Treffer", 1],
    ]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await page.locator('#filter [name="suche"]').fill(suche);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        button.click(),
      ]);
      assert.equal(
        download.suggestedFilename(),
        "timereal-nachweise-2026-11-10-bis-2026-11-11.xlsx",
      );
      assert.equal(await download.failure(), null);
      const { sheets } = leseXlsx(await readFile(await download.path()));
      assert.equal(sheets[0].rows.length, rows);
      assert.equal(sheets[1].rows[3].B4.value, view);
    }
    assert.deepEqual(
      (
        await db.query(
          "select id,fassung,uebertragener_stand from zeitabschnitt where konto_id=$1 order by id",
          [konto.id],
        )
      ).rows,
      before,
    );
    // Verzögerte echte Antwort: währenddessen kein zweiter Downloadauftrag.
    let anfragen = 0,
      freigeben;
    const tor = new Promise((resolve) => {
      freigeben = resolve;
    });
    await page.route("**/api/v1/nachweise/excel?*", async (route) => {
      anfragen++;
      await tor;
      await route.continue();
    });
    const download = page.waitForEvent("download");
    // Ein offener Wartepunkt darf einen früheren Fehlschlag nicht verdecken.
    download.catch(() => {});
    await button.click();
    // Material-Schaltflächen: gesperrt ist das Element selbst, nicht ein natives
    // Steuerelement, das Playwrights isDisabled() erkennt.
    assert.equal(await button.evaluate((el) => el.disabled), true);
    // Material Web reicht aria-busy nicht an die innere Schaltfläche weiter;
    // wirksam sind gesperrter Zustand und geänderte Beschriftung.
    assert.equal((await button.textContent()).trim(), "Excel wird erstellt …");
    await button.evaluate((el) => el.click());
    freigeben();
    await download;
    await page.waitForFunction(
      () => !document.querySelector("#nachweise-excel").disabled,
    );
    assert.equal(anfragen, 1);
    await page.unroute("**/api/v1/nachweise/excel?*");
    // Serverseitiger Fehler: lesbarer Hinweis, keine als XLSX getarnte JSON-Datei.
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.route("**/api/v1/nachweise/excel?*", (route) =>
      route.fulfill({
        status: 413,
        contentType: "application/json",
        body: JSON.stringify({ fehler: "Bitte den Zeitraum verkleinern." }),
      }),
    );
    await button.click();
    await page
      .getByText("Bitte den Zeitraum verkleinern.", { exact: true })
      .waitFor();
    assert.equal(downloads, 0);
    assert.equal(await button.evaluate((el) => el.disabled), false);
    await page.unroute("**/api/v1/nachweise/excel?*");
    await page.locator('#filter [name="suche"]').fill("00123");
    await page.getByRole("button", { name: "Filtern", exact: true }).click();
    await page.getByText("Konfiguration geprüft", { exact: true }).waitFor();
    const boxes = await page
      .locator(
        ".exportaktionen md-outlined-button, .exportaktionen md-filled-button",
      )
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        }),
      );
    for (const box of boxes) assert.ok(box.height >= 44 && box.width >= 44);
    for (let i = 1; i < boxes.length; i++)
      assert.ok(
        boxes[i].x - boxes[i - 1].right >= 15 ||
          boxes[i].y - boxes[i - 1].bottom >= 15,
      );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const bilder = process.env.SCREENSHOT_DIR ?? "nachweise/excel-bilder";
    await mkdir(bilder, { recursive: true });
    await page.screenshot({
      path: `${bilder}/excel-${width}.png`,
      fullPage: true,
    });
    // Reale Abmeldung macht die Sitzung ungültig, UI führt zurück zur Anmeldung.
    const logout = await page.request.post(addr + "/api/v1/abmeldung", {
      headers: { origin: addr },
    });
    assert.equal(logout.status(), 200);
    await button.click();
    await page
      .getByRole("heading", { name: "Anmelden", exact: true })
      .waitFor();
    assert.equal(downloads, 0);
    await page.close();
  }
  console.log(
    "Excel-Browserprobe bestanden: Download, Ansichten, Filter, Fehler, Sitzung, Abstände und Smartphone.",
  );
} finally {
  await browser?.close();
  await app.close();
  await db.end();
}
