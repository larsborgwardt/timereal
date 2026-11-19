import { readFileSync } from "node:fs";
import { mfaSchluessel, mfaSchluesselAnlegen } from "../dist/mfa-schluessel.js";
import { entschluesseln } from "../dist/mfa-crypto.js";
const [path, mode, gid] = process.argv.slice(2);
try {
  const rows = JSON.parse(readFileSync(0, "utf8"));
  let key = mfaSchluessel(path);
  if (!key) {
    if (mode !== "anlegen" || rows.length)
      throw new Error(
        "Schlüssel fehlt. Vorhandene Zwei-Faktor-Daten benötigen den ursprünglichen Schlüssel aus einer Sicherung.",
      );
    mfaSchluesselAnlegen(path, Number(gid));
    key = mfaSchluessel(path);
  }
  for (const row of rows)
    for (const value of [row.geheimnis, row.vorbereitet])
      if (value) entschluesseln(key, row.konto_id, value);
} catch {
  console.error(
    "Zwei-Faktor-Schlüssel fehlt, ist ungeschützt oder passt nicht zur Datenbank. Ursprünglichen Schlüssel aus der Sicherung wiederherstellen; er wird nicht ersetzt.",
  );
  process.exitCode = 1;
}
