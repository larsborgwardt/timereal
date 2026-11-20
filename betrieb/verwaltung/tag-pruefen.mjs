// Konsolenweg: Release-Tag vor einem manuellen Update prüfen.
// Aufruf mit dem Prüfer der installierten Version:
//   /opt/timereal-node/bin/node /opt/timereal-betrieb-current/verwaltung/tag-pruefen.mjs v0.9.7
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tagPruefen } from "./tag-signatur.mjs";

const tag = process.argv[2] ?? "";
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
  console.error("Aufruf: tag-pruefen.mjs vX.Y.Z");
  process.exit(2);
}
const git = promisify(execFile);
try {
  const commit = await tagPruefen(
    (args) => git("/usr/bin/git", args),
    process.env.TIMEREAL_REPO ?? "/opt/timereal",
    tag,
    fileURLToPath(new URL("../release-signierer", import.meta.url)),
  );
  console.log(`Signatur von ${tag} gültig. Commit: ${commit}`);
} catch (error) {
  console.error(`Signatur von ${tag} NICHT bestätigt: ${error.message}`);
  process.exit(1);
}
