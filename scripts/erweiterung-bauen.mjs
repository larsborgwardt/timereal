import { readFile, writeFile, mkdir, cp, rm, rename } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
let target, zip;
try {
  ({
    values: { target, zip },
  } = parseArgs({
    options: {
      target: { type: "string", default: "development" },
      zip: { type: "boolean", default: false },
    },
  }));
} catch {
  throw new Error(
    "Unbekanntes Argument. Erlaubt: --target development|edge-store und --zip.",
  );
}
if (!["development", "edge-store"].includes(target))
  throw new Error(
    "Unbekanntes Build-Ziel. Erlaubt: development oder edge-store.",
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  ziel = resolve(
    root,
    target === "edge-store"
      ? "dist/erweiterung-edge-store"
      : "dist/erweiterung",
  );
const manifest = JSON.parse(
  await readFile(resolve(root, "erweiterung/manifest.json"), "utf8"),
);
if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version))
  throw new Error("Ungültige Erweiterungsversion.");
if (target === "edge-store") {
  // Partner Center vergibt eine eigene ID. Der Schlüssel ist ausschließlich
  // für die stabile Kennung des entpackten Entwicklungspakets bestimmt.
  delete manifest.key;
  delete manifest.update_url;
}
await rm(ziel, { recursive: true, force: true });
await mkdir(ziel, { recursive: true });
await cp(resolve(root, "web"), ziel, { recursive: true });
await cp(resolve(root, "erweiterung"), ziel, { recursive: true });
await writeFile(
  resolve(ziel, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const html = (await readFile(resolve(root, "web/index.html"), "utf8"))
  // Der Server-Footer gehört zur Web-App. Die Erweiterung behält ihre eigene Paketversion.
  .replace(/\s*<script type="module" src="\/version\.js"><\/script>/, "")
  .replace(/\s*<footer class="versionsfooter"[\s\S]*?<\/footer>/, "")
  .replaceAll('href="/', 'href="')
  .replaceAll('src="/', 'src="');
await writeFile(resolve(ziel, "index.html"), html);
await writeFile(
  resolve(ziel, "popup.html"),
  html
    .replace("</head>", '<link rel="stylesheet" href="popup.css"></head>')
    .replace("<body>", '<body data-popup="true">'),
);
console.log("Erweiterung gebaut: " + ziel);
if (zip) {
  const paket = resolve(
    root,
    "dist",
    `timereal-erweiterung-${manifest.version}-${target === "edge-store" ? "edge-store" : "entwicklung"}.zip`,
  );
  const temp = paket + ".next.zip";
  try {
    await rm(temp, { force: true });
    execFileSync("zip", ["-X", "-q", "-r", temp, "."], {
      cwd: ziel,
      stdio: "pipe",
    });
    const data = await readFile(temp);
    await rename(temp, paket);
    await writeFile(
      paket + ".sha256",
      createHash("sha256").update(data).digest("hex") +
        "  " +
        basename(paket) +
        "\n",
    );
    console.log("Upload-Paket: " + paket);
  } finally {
    await rm(temp, { force: true });
  }
}
