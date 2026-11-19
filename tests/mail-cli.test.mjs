import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postfach } from "./hilfe/smtp.mjs";
function run(file, input) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["dist/mail-cli.js", file], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    p.stdout.on("data", (d) => (output += d));
    p.stderr.on("data", (d) => (output += d));
    p.on("exit", (code) => resolve({ code, output }));
    p.stdin.end(input);
  });
}
test("Mailkonfiguration prüft echtes SMTP vor dem Schreiben und gibt keine Zugangsdaten aus", async () => {
  const mail = await postfach(),
    dir = await mkdtemp(join(tmpdir(), "timereal-mail-"));
  try {
    const file = join(dir, "mail.json"),
      input = [
        "127.0.0.1",
        mail.config.port,
        "nein",
        "zeit@example.test",
        "",
        "",
      ].join("\n");
    const r = await run(file, input);
    assert.equal(r.code, 0, r.output);
    const value = JSON.parse(await readFile(file));
    assert.equal(value.host, "127.0.0.1");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(mail.nachrichten.length, 0);
    const wrong = await run(
      join(dir, "falsch.json"),
      [
        "127.0.0.1",
        "0",
        "nein",
        "zeit@example.test",
        "kunde",
        "geheim-nur-pruefwert",
      ].join("\n"),
    );
    assert.notEqual(wrong.code, 0);
    assert.ok(!wrong.output.includes("geheim-nur-pruefwert"));
    await assert.rejects(readFile(join(dir, "falsch.json")));
  } finally {
    await mail.close();
    await rm(dir, { recursive: true, force: true });
  }
});
