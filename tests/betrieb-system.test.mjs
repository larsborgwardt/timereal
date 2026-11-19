import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { betriebssperre, prozess } from "../betrieb/verwaltung/system.mjs";

test("Realer flock bleibt nach dem Lockprozess bestehen und ist an Kindprozesse vererbbar", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "timereal-lock-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pfad = join(dir, "betrieb.lock");
  const sperre = await betriebssperre(pfad);
  try {
    assert.equal(spawnSync("flock", ["-n", pfad, "true"]).status, 1);
    await assert.rejects(betriebssperre(pfad), { code: "BELEGT" });
    await prozess("flock", ["-n", "9"], { lockFd: sperre.fd });
    assert.equal(spawnSync("flock", ["-n", pfad, "true"]).status, 1);
  } finally {
    await sperre.close();
  }
  assert.equal(spawnSync("flock", ["-n", pfad, "true"]).status, 0);
});

test("Prozessfehler, Ausgabebegrenzung und Zeitüberschreitung führen zu Fehlern", async () => {
  await assert.rejects(prozess(process.execPath, ["-e", "process.exit(7)"]), {
    exitCode: 7,
  });
  await assert.rejects(
    prozess(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(100000))"],
      { maxBytes: 1000 },
    ),
  );
  await assert.rejects(
    prozess(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
      timeout: 50,
    }),
  );
  assert.equal(
    (
      await prozess(process.execPath, [
        "-e",
        "process.stdout.write(process.argv[1])",
        "$(id);`whoami`",
      ])
    ).stdout,
    "$(id);`whoami`",
  );
});
