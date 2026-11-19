import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

test("Edge-Upload-ZIP entfernt Entwicklungsfelder und enthält das Manifest direkt an der Wurzel", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "timereal-store-paket-"));
  try {
    await mkdir(resolve(root, "scripts"));
    for (const path of ["web", "erweiterung", "scripts/erweiterung-bauen.mjs"])
      await cp(resolve(path), resolve(root, path), { recursive: true });
    const source = JSON.parse(
      await readFile(resolve(root, "erweiterung/manifest.json"), "utf8"),
    );
    // Microsoft verlangt die Entfernung von update_url beim Portieren. Der
    // key-Rotfall ist die von Lars gemeldete reale Partner-Center-Ablehnung.
    source.update_url = "https://entwicklung.example.test/update.xml";
    await writeFile(
      resolve(root, "erweiterung/manifest.json"),
      JSON.stringify(source),
    );
    const build = (...args) =>
      execFileSync(
        process.execPath,
        ["scripts/erweiterung-bauen.mjs", ...args],
        { cwd: root, encoding: "utf8", stdio: "pipe" },
      );
    build("--target", "edge-store", "--zip");
    const zip = resolve(
      root,
      "dist",
      `timereal-erweiterung-${source.version}-edge-store.zip`,
    );
    const manifest = JSON.parse(
      execFileSync("unzip", ["-p", zip, "manifest.json"], { encoding: "utf8" }),
    );
    assert.equal(Object.hasOwn(manifest, "key"), false);
    assert.equal(Object.hasOwn(manifest, "update_url"), false);
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, source.version);
    assert.deepEqual(manifest.permissions, ["storage", "identity"]);
    assert.deepEqual(
      manifest.optional_host_permissions,
      source.optional_host_permissions,
    );
    const files = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
      .trim()
      .split("\n");
    for (const path of [
      manifest.action.default_popup,
      manifest.options_page,
      manifest.background.service_worker,
      "app.js",
      "transport.js",
      "app.css",
    ])
      assert.ok(files.includes(path), path + " fehlt im Upload-Paket");
    assert.equal(
      files.some((f) => /(^|\/)(\.env|node_modules|dist|\.git)(\/|$)/.test(f)),
      false,
    );
    const hash = createHash("sha256")
      .update(await readFile(zip))
      .digest("hex");
    assert.equal(
      (await readFile(zip + ".sha256", "utf8")).trim(),
      hash + "  " + zip.split("/").at(-1),
    );
    execFileSync("unzip", ["-tq", zip]);
    await writeFile(
      resolve(root, "dist/erweiterung-edge-store/alt.txt"),
      "veraltet",
    );
    build("--target", "edge-store", "--zip");
    assert.equal(
      execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).includes(
        "alt.txt",
      ),
      false,
    );
    build();
    const dev = JSON.parse(
      await readFile(resolve(root, "dist/erweiterung/manifest.json"), "utf8"),
    );
    assert.equal(dev.key, source.key, "Entwicklungs-ID bleibt stabil");
    assert.deepEqual(
      JSON.parse(
        await readFile(resolve(root, "erweiterung/manifest.json"), "utf8"),
      ),
      source,
      "Quellmanifest bleibt unverändert",
    );
    assert.throws(() => build("--target", "edge-stroe"), /Unbekanntes/);
    assert.throws(() => build("--targte", "edge-store"), /Unbekanntes/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
