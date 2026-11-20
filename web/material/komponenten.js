// Quelle des Bündels web/material.js (Entwurf 19, D-RELEASE-017).
// Nur hier eingetragene Komponenten von Material Web stehen der Oberfläche zur
// Verfügung. Nach jeder Änderung: node scripts/oberflaeche-buendeln.mjs
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import { styles as typescale } from "@material/web/typography/md-typescale-styles.js";

// Typografie-Klassen (md-typescale-…) für die ganze Seite. Constructable
// Stylesheets sind unter style-src 'self' zulässig.
document.adoptedStyleSheets = [
  ...document.adoptedStyleSheets,
  typescale.styleSheet,
];
