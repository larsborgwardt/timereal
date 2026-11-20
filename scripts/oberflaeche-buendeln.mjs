// Bündelt web/material/komponenten.js mit den festgelegten Versionen aus
// package-lock.json zu web/material.js. Das Bündel liegt im Repository, damit
// Installationen ohne Bündler aktualisieren können; --check prüft, dass es
// genau aus den Quellen entsteht.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ziel = root + "web/material.js";
const lock = JSON.parse(await readFile(root + "package-lock.json", "utf8"));
const version = (name) => lock.packages["node_modules/" + name]?.version;
const banner = `/*! Erzeugt von scripts/oberflaeche-buendeln.mjs aus web/material/komponenten.js.
 * Nicht von Hand ändern. @material/web ${version("@material/web")}, lit ${version("lit")}.
 * Material Web und Lit: Copyright Google LLC, Lizenz Apache-2.0 bzw. BSD-3-Clause. */`;
const ergebnis = await build({
  entryPoints: [root + "web/material/komponenten.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  legalComments: "none",
  banner: { js: banner },
  write: false,
  logLevel: "silent",
});
const inhalt = ergebnis.outputFiles[0].text;
if (process.argv.includes("--check")) {
  const vorhanden = await readFile(ziel, "utf8").catch(() => "");
  if (vorhanden !== inhalt) {
    console.error(
      "web/material.js passt nicht zu den Quellen. node scripts/oberflaeche-buendeln.mjs ausführen.",
    );
    process.exit(1);
  }
  console.log("web/material.js entspricht den Quellen.");
} else {
  await writeFile(ziel, inhalt);
  console.log(`web/material.js geschrieben (${inhalt.length} Zeichen).`);
}
