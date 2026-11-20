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
      "md-outlined-text-field",
      "md-outlined-select",
      "md-select-option",
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
    definiert: [
      "md-filled-button",
      "md-outlined-button",
      "md-text-button",
      "md-outlined-text-field",
      "md-outlined-select",
      "md-select-option",
    ],
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
  // Auswahlmenü: lits styleMap setzt beim ersten Zeichnen ein style-Attribut,
  // das die Richtlinie verbietet; das Bündel ersetzt es durch CSSOM-Zugriffe.
  const menue = await page.evaluate(async () => {
    const s = document.createElement("md-outlined-select");
    s.label = "Probe";
    s.innerHTML =
      '<md-select-option value="a"><div slot="headline">Alpha</div></md-select-option>';
    document.body.append(s);
    await s.updateComplete;
    const menu = s.shadowRoot.querySelector("md-menu");
    const breite = menu.style.getPropertyValue("--__menu-min-width");
    s.remove();
    return { breite, attribut: menu.getAttribute("style") !== null };
  });
  assert.match(menue.breite, /^\d+(\.\d+)?px$/);
  // Auswahllisten wie <select>: erste Option als Vorgabe, sofort aktueller
  // Wert nach Optionswechsel, Zahlen als Text, Zurücksetzen auf die Vorgabe.
  const auswahlVerhalten = await page.evaluate(async () => {
    const f = document.createElement("form");
    f.innerHTML =
      '<md-outlined-select name="s" label="Probe"></md-outlined-select>';
    document.body.append(f);
    const s = f.elements.s;
    await s.updateComplete;
    const option = (v, t, gewaehlt = false) =>
      `<md-select-option value="${v}"${gewaehlt ? " selected" : ""}><div slot="headline">${t}</div></md-select-option>`;
    const ergebnis = {};
    s.innerHTML = option("a", "Alpha") + option("7", "Sieben");
    ergebnis.vorgabe = s.value;
    s.value = 7;
    ergebnis.zahl = s.value;
    s.innerHTML = option("x", "Neu") + option("y", "Neu 2");
    ergebnis.ausgetauscht = s.value;
    s.value = "y";
    f.reset();
    ergebnis.zurueckgesetzt = s.value;
    s.innerHTML = option("p", "P") + option("q", "Q", true);
    ergebnis.ausgewaehlt = s.value;
    await new Promise((r) => setTimeout(r, 50));
    ergebnis.anzeige = s.displayText;
    ergebnis.daten = new FormData(f).get("s");
    // Wie im Nachtragsdialog: Optionen tauschen und sofort den leeren Wert
    // setzen; die Anzeige muss den Text der gewählten Option zeigen.
    s.innerHTML = option("", "Kunde später zuordnen") + option("k1", "Kunde 1");
    s.value = "";
    await new Promise((r) => setTimeout(r, 100));
    ergebnis.leerAnzeige = s.displayText;
    f.remove();
    return ergebnis;
  });
  assert.deepEqual(auswahlVerhalten, {
    vorgabe: "a",
    zahl: "7",
    ausgetauscht: "x",
    zurueckgesetzt: "x",
    ausgewaehlt: "q",
    anzeige: "Q",
    daten: "q",
    leerAnzeige: "Kunde später zuordnen",
  });
  // Kein Zeichenzähler (Entwurf 19); maxlength begrenzt die Eingabe weiter.
  const zaehler = await page.evaluate(async () => {
    const t = document.createElement("md-outlined-text-field");
    t.label = "Probe";
    t.maxLength = 20;
    t.value = "abc";
    document.body.append(t);
    await t.updateComplete;
    const rahmen = t.shadowRoot.querySelector("md-outlined-field");
    await rahmen.updateComplete;
    const ergebnis = {
      zaehler: rahmen.shadowRoot.querySelectorAll(".counter").length,
      grenze: t.shadowRoot.querySelector("input").maxLength,
    };
    t.remove();
    return ergebnis;
  });
  assert.deepEqual(zaehler, { zaehler: 0, grenze: 20 });
  // Kundenvorschläge erreichen das innere Eingabefeld des Material-Textfelds.
  const vorschlaege = await page.evaluate(async () => {
    const feld = document.querySelector('#zielform [name="kunde"]');
    await feld.updateComplete;
    document.querySelector("#kunden").innerHTML =
      '<option value="Stadtwerke Süd"></option><option value="Praxis am Markt"></option>';
    await new Promise((r) => setTimeout(r));
    const innen = feld.shadowRoot.querySelector("input");
    return [...(innen.list?.options ?? [])].map((o) => o.value);
  });
  assert.deepEqual(vorschlaege, ["Stadtwerke Süd", "Praxis am Markt"]);
  // Enter im Passwortfeld sendet die Anmeldung genau einmal ab, auch wenn die
  // Absendeschaltfläche eine Material-Schaltfläche ist.
  const anmeldungen = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/v1/anmeldung"))
      anmeldungen.push(r.url());
  });
  await page.getByLabel("Anmeldename").fill("niemand");
  await page.getByLabel("Passwort", { exact: true }).fill("falsch-falsch");
  const antwort = page.waitForResponse((r) =>
    r.url().endsWith("/api/v1/anmeldung"),
  );
  await page.getByLabel("Passwort", { exact: true }).press("Enter");
  await antwort;
  await page.waitForTimeout(300);
  assert.equal(anmeldungen.length, 1);
  // Gesperrte Standardschaltfläche: Enter sendet nicht; freigegeben genau einmal.
  await page.evaluate(async () => {
    const f = document.createElement("form");
    f.id = "enterprobe";
    f.dataset.n = "0";
    f.innerHTML =
      '<input name="a"><input name="b"><md-filled-button disabled>Senden</md-filled-button>';
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      f.dataset.n = String(Number(f.dataset.n) + 1);
    });
    document.body.append(f);
    await f.querySelector("md-filled-button").updateComplete;
  });
  const probe = page.locator("#enterprobe");
  await probe.locator('input[name="a"]').press("Enter");
  assert.equal(await probe.getAttribute("data-n"), "0");
  await probe.evaluate(
    (f) => (f.querySelector("md-filled-button").disabled = false),
  );
  await probe.locator('input[name="a"]').press("Enter");
  await page.waitForTimeout(100);
  assert.equal(await probe.getAttribute("data-n"), "1");
  await probe.evaluate((f) => f.remove());
  assert.deepEqual(meldungen, []);
  console.log(
    "Material Web: Komponenten, Typografie und Farbschema unter der Inhaltsrichtlinie geladen; keine Konsolenfehler.",
  );
} finally {
  await browser.close();
  await app.close();
}
