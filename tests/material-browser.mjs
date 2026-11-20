import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "../dist/app.js";

// Material Web lädt unter der echten Inhaltsrichtlinie der Anwendung.
const url = new URL(process.env.TEST_DATABASE_URL);
url.username = "timereal_app";
url.password = "nur-fuer-diese-wegwerfdatenbank";
const app = createApp(new pg.Pool({ connectionString: url.href }), {
  secure: false,
  updateCheck: async () => ({ status: "disabled", updateAvailable: false }),
});
const addr = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage({ locale: "de-DE" });
  const meldungen = [];
  page.on("console", (m) => {
    // Die Anmeldeseite fragt den Arbeitsstand ohne Sitzung ab (401, erwartet).
    if (m.type() === "error" && !/status of 401/.test(m.text()))
      meldungen.push(m.text());
  });
  page.on("pageerror", (e) => meldungen.push(e.message));
  await page.goto(addr);
  await page.getByLabel("Anmeldename").waitFor();
  const stand = await page.evaluate(() => ({
    definiert: [
      "md-filled-button",
      "md-outlined-button",
      "md-text-button",
    ].filter((n) => customElements.get(n)),
    // Material legt die Typografie in einer @layer-Gruppe ab.
    typografie: [...document.adoptedStyleSheets].some((s) =>
      [...s.cssRules].some((r) =>
        r.cssText.includes(".md-typescale-body-large"),
      ),
    ),
    primaer: getComputedStyle(document.documentElement)
      .getPropertyValue("--md-sys-color-primary")
      .trim(),
  }));
  assert.deepEqual(stand, {
    definiert: ["md-filled-button", "md-outlined-button", "md-text-button"],
    typografie: true,
    primaer: "#006a60",
  });
  // Eine Komponente zeichnet sich unter der Richtlinie mit Material-Stilen.
  const farbe = await page.evaluate(async () => {
    const b = document.createElement("md-filled-button");
    b.textContent = "Probe";
    document.body.append(b);
    await b.updateComplete;
    const hintergrund = getComputedStyle(
      b.shadowRoot.querySelector(".background"),
    ).backgroundColor;
    b.remove();
    return hintergrund;
  });
  assert.equal(farbe, "rgb(0, 106, 96)");
  assert.deepEqual(meldungen, []);
  console.log(
    "Material Web: Komponenten, Typografie und Farbschema unter der Inhaltsrichtlinie geladen; keine Konsolenfehler.",
  );
} finally {
  await browser.close();
  await app.close();
}
