import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile("erweiterung/manifest.json", "utf8"),
);
const dir = await mkdtemp(resolve(tmpdir(), "timereal-store-browser-"));
let context;
try {
  // Genau das auszuliefernde ZIP, nicht nur das Build-Verzeichnis laden.
  execFileSync("unzip", [
    "-q",
    resolve(`dist/timereal-erweiterung-${manifest.version}-edge-store.zip`),
    "-d",
    dir,
  ]);
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: ["--disable-extensions-except=" + dir, "--load-extension=" + dir],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const packaged = await worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(Object.hasOwn(packaged, "key"), false);
  const workerUrl = new URL(worker.url());
  const origin = workerUrl.protocol + "//" + workerUrl.host;
  assert.notEqual(
    origin,
    "chrome-extension://foobkcceoconhlclbnechjlimhkfbcno",
  );
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/einstellungen.html");
  await page.waitForFunction(
    () => !document.querySelector("form button").disabled,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Timereal verbinden" }).isVisible(),
    true,
  );
  assert.equal(await page.getByLabel("Timereal-Adresse").isEnabled(), true);
  await page.goto(origin + "/popup.html");
  await page
    .getByRole("button", { name: "Erweiterung verbinden", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Edge-Upload-ZIP: Dienst, Optionen und Popup in Chromium geladen; Store-Anmeldung benötigt die freigegebene Microsoft-ID.",
  );
} finally {
  await context?.close();
  await rm(dir, { recursive: true, force: true });
}
