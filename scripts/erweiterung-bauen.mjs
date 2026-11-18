import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  ziel = resolve(root, "dist/erweiterung");
await rm(ziel, { recursive: true, force: true });
await mkdir(ziel, { recursive: true });
await cp(resolve(root, "web"), ziel, { recursive: true });
await cp(resolve(root, "erweiterung"), ziel, { recursive: true });
const html = (await readFile(resolve(root, "web/index.html"), "utf8"))
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
