// Quelle des Bündels web/material.js (Entwurf 19, D-RELEASE-017).
// Nur hier eingetragene Komponenten von Material Web stehen der Oberfläche zur
// Verfügung. Nach jeder Änderung: node scripts/oberflaeche-buendeln.mjs
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/select/outlined-select.js";
import "@material/web/select/select-option.js";
import { styles as typescale } from "@material/web/typography/md-typescale-styles.js";

// Typografie-Klassen (md-typescale-…) für die ganze Seite. Constructable
// Stylesheets sind unter style-src 'self' zulässig.
document.adoptedStyleSheets = [
  ...document.adoptedStyleSheets,
  typescale.styleSheet,
];

// Implizites Absenden: Enter in einem einzeiligen Feld löst wie im Browser die
// Standardschaltfläche des Formulars aus. Der Browser erkennt
// Material-Schaltflächen nicht als Absendeschaltfläche und Material-Textfelder
// liegen außerhalb des Formulars ihres Hosts; ohne diese Regel sendet Enter nie.
const KEINE_TEXTEINGABE = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "image",
  "color",
  "range",
]);
const ABSENDER =
  "md-filled-button, md-outlined-button, md-text-button, button, input[type=submit], input[type=image]";
const TEXTFELD = "md-outlined-text-field, input";
document.addEventListener("keydown", (e) => {
  if (
    e.key !== "Enter" ||
    e.defaultPrevented ||
    e.isComposing ||
    e.shiftKey ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey
  )
    return;
  const feld = e.composedPath()[0];
  if (!(feld instanceof HTMLInputElement) || KEINE_TEXTEINGABE.has(feld.type))
    return;
  const host = feld.getRootNode().host;
  const form = host ? host.form : feld.form;
  if (!form) return;
  e.preventDefault();
  const standard = [...form.elements].find(
    (el) => el.matches(ABSENDER) && el.type === "submit",
  );
  if (standard) {
    if (!standard.disabled) standard.click();
    return;
  }
  // Ohne Absendeschaltfläche sendet der Browser nur bei genau einem Textfeld.
  const textfelder = [...form.elements].filter(
    (el) =>
      el.matches(TEXTFELD) &&
      el.type !== "textarea" &&
      !KEINE_TEXTEINGABE.has(el.type),
  );
  if (textfelder.length === 1) form.requestSubmit();
});

// Auswahllisten verhalten sich wie <select>: Ohne gewählte Option gilt die
// erste; Werte werden wie im Browser zu Text; value liest auch direkt nach
// einem Austausch der Optionen den aktuellen Stand (Material aktualisiert erst
// beim nächsten slotchange). Die Schnittstelle von @material/web 2.5.0 wird
// hier geprüft; tests/material-browser.mjs belegt das Verhalten.
const auswahl = customElements.get("md-outlined-select").prototype;
let traeger = auswahl;
while (traeger && !Object.getOwnPropertyDescriptor(traeger, "value"))
  traeger = Object.getPrototypeOf(traeger);
const wert = traeger && Object.getOwnPropertyDescriptor(traeger, "value");
const aktualisieren = auswahl.updateValueAndDisplayText;
if (!wert?.get || !wert.set || typeof aktualisieren !== "function")
  throw new Error("Material-Auswahl: unerwartete Schnittstelle");
Object.defineProperty(auswahl, "updateValueAndDisplayText", {
  configurable: true,
  writable: true,
  value() {
    const optionen = this.menu?.items ?? [];
    if (!optionen.some((o) => o.selected)) {
      const erste = optionen.find((o) => !o.disabled);
      if (erste) erste.selected = true;
    }
    const geaendert = aktualisieren.call(this);
    // Eine gerade eingefügte Option kennt ihren Anzeigetext erst nach dem
    // ersten Zeichnen; danach die Anzeige nachziehen.
    const gewaehlt = optionen.find((o) => o.selected);
    if (gewaehlt && !gewaehlt.hasUpdated)
      void gewaehlt.updateComplete.then(() => {
        if (gewaehlt.selected && gewaehlt.isConnected) aktualisieren.call(this);
      });
    return geaendert;
  },
});
// Materials Formularanbindung liest value bei jeder Aktualisierung; ohne
// Wiedereintrittssperre riefe der Getter sich darüber endlos selbst auf.
const beimLesen = new WeakSet();
Object.defineProperty(auswahl, "value", {
  configurable: true,
  get() {
    if (this.menu && !beimLesen.has(this)) {
      beimLesen.add(this);
      try {
        this.updateValueAndDisplayText();
      } finally {
        beimLesen.delete(this);
      }
    }
    return wert.get.call(this);
  },
  set(neu) {
    wert.set.call(this, String(neu));
  },
});

// Vorschlagslisten: Ein Textfeld mit data-vorschlaege="<id>" erhält die
// Einträge der <datalist> mit dieser id. Das innere Eingabefeld liegt im
// Schattenbaum und erreicht Listen des Dokuments nicht; deshalb wird die Liste
// dort gespiegelt und bei jeder Änderung nachgezogen.
async function vorschlaegeVerbinden(feld) {
  await feld.updateComplete;
  const quelle = document.getElementById(feld.dataset.vorschlaege);
  const innen = feld.shadowRoot?.querySelector("input");
  if (!(quelle instanceof HTMLDataListElement) || !innen)
    throw new Error(
      "Vorschlagsliste nicht verbindbar: " + feld.dataset.vorschlaege,
    );
  const kopie = document.createElement("datalist");
  kopie.id = "vorschlaege";
  feld.shadowRoot.append(kopie);
  innen.setAttribute("list", kopie.id);
  const spiegeln = () =>
    kopie.replaceChildren(...[...quelle.options].map((o) => o.cloneNode(true)));
  spiegeln();
  new MutationObserver(spiegeln).observe(quelle, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
}
for (const feld of document.querySelectorAll(
  "md-outlined-text-field[data-vorschlaege]",
))
  void vorschlaegeVerbinden(feld);

// Kein Zeichenzähler unter Feldern mit maxlength (Entwurf 19 zeigt keinen;
// Material hat dafür keinen Schalter). Die Begrenzung der Eingabe bleibt.
const rahmen = customElements.get("md-outlined-field").prototype;
let zaehlerTraeger = rahmen;
while (
  zaehlerTraeger &&
  !Object.getOwnPropertyDescriptor(zaehlerTraeger, "counterText")
)
  zaehlerTraeger = Object.getPrototypeOf(zaehlerTraeger);
if (!zaehlerTraeger)
  throw new Error("Material-Feldrahmen: unerwartete Schnittstelle");
Object.defineProperty(rahmen, "counterText", {
  configurable: true,
  get: () => "",
});
