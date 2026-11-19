import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mfaSchluessel, mfaSchluesselAnlegen } from "../dist/mfa-schluessel.js";

test("2FA-Schlüssel: atomare Anlage, unveränderter Bestand, sichere Dateirechte", () => {
  const dir = mkdtempSync(join(tmpdir(), "timereal-key-"));
  const file = join(dir, "mfa.key");
  try {
    assert.equal(mfaSchluessel(file), undefined);
    mfaSchluesselAnlegen(file);
    const key = mfaSchluessel(file);
    assert.equal(key.length, 32);
    mfaSchluesselAnlegen(file);
    assert.deepEqual(mfaSchluessel(file), key);
    chmodSync(file, 0o644);
    assert.throws(() => mfaSchluessel(file), /Schlüsseldatei/);
    assert.throws(() => mfaSchluesselAnlegen(file), /Schlüsseldatei/);
    assert.deepEqual(readFileSync(file), key);
    chmodSync(file, 0o600);
    writeFileSync(file, "defekt");
    assert.throws(() => mfaSchluessel(file), /Schlüsseldatei/);
    assert.throws(() => mfaSchluesselAnlegen(file), /Schlüsseldatei/);
    assert.equal(readFileSync(file, "utf8"), "defekt");
    symlinkSync(file, join(dir, "link"));
    assert.throws(() => mfaSchluessel(join(dir, "link")), /Schlüsseldatei/);
    assert.throws(() => mfaSchluessel(dir), /Schlüsseldatei/);
    const mask = process.umask(0o077);
    try {
      mfaSchluesselAnlegen(join(dir, "gruppe"), process.getgid());
    } finally {
      process.umask(mask);
    }
    assert.equal(statSync(join(dir, "gruppe")).mode & 0o777, 0o640);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
