import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

const run = (script, ...args) =>
  spawnSync(
    "bash",
    [new URL(`../betrieb/${script}.sh`, import.meta.url).pathname, ...args],
    { encoding: "utf8" },
  );
test("Proxy-Patch: Hilfe und ungültige Domain/IP vor Systemzugriffen", () => {
  const help = run("proxy-einrichten", "--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--check DOMAIN CONTAINER_IP/);
  for (const args of [
    [],
    ["--check", "https://example.org", "192.0.2.42"],
    ["--check", "*.example.org", "192.0.2.42"],
    ["--check", "example.org/path", "192.0.2.42"],
    ["--check", "foo;id.example.org", "192.0.2.42"],
    ["--check", "example.org", "192.0.2.42:443"],
    ["--check", "example.org", "192.0.2.999"],
    ["--check", "example.org", "192.0.2.42", "extra"],
  ]) {
    const result = run("proxy-einrichten", ...args);
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /Domain|IPv4|Aufruf/);
  }
  for (const domain of [
    "zeiterfassung.example.org",
    "xn--bcher-kva.example",
    "zeiten.xn--p1ai",
  ]) {
    const result = run("proxy-einrichten", "--check", domain, "ungueltige-ip");
    assert.equal(result.status, 2);
    assert.match(result.stderr, /IPv4/);
  }
});
test("Öffentliches HTTPS: Hilfe und strikte Domain-Eingabe vor Systemzugriffen", () => {
  const help = run("https-einrichten", "--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--check DOMAIN/);
  for (const domain of [
    "https://example.org",
    "localhost",
    "-x.example.org",
    "a..example.org",
    "foo;id.example.org",
    "example.org/path",
    "EXAMPLE.ORG",
    "*.example.org",
  ]) {
    const result = run("https-einrichten", "--check", domain);
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /Domain/);
  }
});
test("Externe Sicherung braucht einen ausdrücklich gewählten Vorgang", () => {
  assert.equal(run("extern-sichern", "--help").status, 0);
  for (const args of [
    [],
    ["loeschen"],
    ["sichern", "extra"],
    ["pruefen", "main"],
    ["pruefen", "latest", "../timereal"],
  ]) {
    const result = run("extern-sichern", ...args);
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /Aufruf|Snapshot/);
  }
});
test("Sicherungsziel erlaubt ausschließlich SFTP mit absolutem Pfad", () => {
  assert.equal(run("backup-einrichten", "--help").status, 0);
  for (const target of [
    "https://example.org",
    "/tmp/backup",
    "sftp:-oProxyCommand=id:/x",
    "sftp:user@host:relative",
    "sftp:host:/foo bar",
    "sftp:host:/x;id",
  ]) {
    const result = run("backup-einrichten", "--check", target);
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /SFTP/);
  }
});
