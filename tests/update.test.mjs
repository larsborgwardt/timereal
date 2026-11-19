import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
const script = new URL("../betrieb/update.sh", import.meta.url).pathname;
const run = (...args) =>
  spawnSync("bash", [script, ...args], { encoding: "utf8" });

test("Updatehilfe ist ohne Administratorrechte verfügbar", () => {
  const r = run("--help");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--check/);
  assert.match(r.stdout, /vMAJOR\.MINOR\.PATCH/);
  assert.match(r.stdout, /HTTPS-Port 443/);
});
test("Installationshilfe erklärt den Browserport vor Systemzugriffen", () => {
  const installer = new URL("../betrieb/install.sh", import.meta.url).pathname;
  const r = spawnSync("bash", [installer, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /HTTPS auf Port 443/);
  assert.match(r.stdout, /Port 3040 ist nur intern/);
  const invalid = spawnSync("bash", [installer, "--unbekannt"], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Aufruf/);
});
test("Ein Update braucht eine feste Version und lehnt Optionen als Versionsnamen ab", () => {
  for (const args of [
    [],
    ["main"],
    ["-f"],
    ["v0.2"],
    ["v0.2.0", "extra"],
    ["--check", "HEAD"],
  ]) {
    const r = run(...args);
    assert.equal(r.status, 2, JSON.stringify({ args, ...r }));
    assert.match(r.stderr, /Version|Aufruf/);
  }
});
