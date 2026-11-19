import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

// Eingangsmenge unabhängig von der ausgeführten Prüfliste aus HTML und Manifest lesen.
assert.ok(process.env.DESIGN_PROBE_LOG, "DESIGN_PROBE_LOG fehlt");
const records = (await readFile(process.env.DESIGN_PROBE_LOG, "utf8"))
  .trim()
  .split("\n")
  .map(JSON.parse);
const html = await readFile("web/index.html", "utf8");
const manifest = JSON.parse(
  await readFile("erweiterung/manifest.json", "utf8"),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage();
  const ids = await page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    return [...document.querySelectorAll("main > section[id], dialog[id]")].map(
      (el) => el.id,
    );
  }, html);
  const reached = new Set(
    records.filter((r) => !r.findings.length).flatMap((r) => r.ids),
  );
  assert.deepEqual(
    ids.filter((id) => !reached.has(id)),
    [],
    "Ansicht ohne bestandene Messung",
  );
  const paths = new Set(
    records.filter((r) => !r.findings.length).map((r) => r.path),
  );
  const expectedPaths = [
    "/",
    "/erweiterung-anmelden.html",
    "/index.html",
    "/" + manifest.action.default_popup,
    "/" + manifest.options_page,
  ];
  assert.deepEqual(
    expectedPaths.filter((path) => !paths.has(path)),
    [],
    "Einstieg ohne bestandene Messung",
  );
  const report = {
    source: ["web/index.html", "erweiterung/manifest.json"],
    ids,
    paths: expectedPaths,
    records,
  };
  if (process.env.SCREENSHOT_DIR)
    await writeFile(
      process.env.SCREENSHOT_DIR + "/design-abdeckung.json",
      JSON.stringify(report, null, 2),
    );
  console.log(
    "Designabdeckung: Eingänge aus HTML/Manifest abzüglich erreichter Prüfansichten leer.",
  );
} finally {
  await browser.close();
}
