import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import {
  totp,
  passenderSchritt,
  base32,
  verschluesseln,
  entschluesseln,
} from "../dist/mfa-crypto.js";

// Öffentliche Interoperabilitätswerte: RFC 6238, Anhang B, SHA1.
// https://www.rfc-editor.org/rfc/rfc6238#appendix-B
test("TOTP stimmt mit den unabhängigen RFC-Zeitwerten überein", () => {
  const secret = Buffer.from("12345678901234567890");
  for (const [time, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])
    assert.equal(totp(secret, Math.floor(time / 30), 8), expected);
  assert.equal(totp(secret, 1), "287082");
});

test("Prüffenster akzeptiert aktuellen und vorherigen Schritt, keine Zukunft", () => {
  const secret = Buffer.from("12345678901234567890");
  assert.equal(passenderSchritt(secret, "287082", 59_000), 1);
  assert.equal(passenderSchritt(secret, "287082", 60_000), 1);
  assert.equal(passenderSchritt(secret, "287082", 90_000), null);
  assert.equal(passenderSchritt(secret, "287082", 29_000), null);
  for (const bad of ["", "28708", "2870820", " 287082", "287082\n", "abcdef"])
    assert.equal(passenderSchritt(secret, bad, 59_000), null);
});

test("Einrichtungsschlüssel verwendet kanonisches Base32", () => {
  assert.equal(base32(Buffer.from("foo")), "MZXW6");
  assert.equal(base32(Buffer.from("foobar")), "MZXW6YTBOI");
  assert.equal(
    base32(Buffer.from("12345678901234567890")),
    "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  );
});

test("Verschlüsselung ist zufällig, kontogebunden und erkennt Manipulation", () => {
  const key = randomBytes(32),
    seed = randomBytes(20);
  const first = verschluesseln(key, "17", seed);
  assert.notEqual(first, verschluesseln(key, "17", seed));
  assert.deepEqual(entschluesseln(key, "17", first), seed);
  assert.throws(() => entschluesseln(key, "18", first));
  assert.throws(() => entschluesseln(randomBytes(32), "17", first));
  for (const field of [1, 2, 3]) {
    const parts = first.split(".");
    const bytes = Buffer.from(parts[field], "base64url");
    bytes[0] ^= 1;
    parts[field] = bytes.toString("base64url");
    assert.throws(() => entschluesseln(key, "17", parts.join(".")));
  }
  for (const invalid of [
    "",
    "v2.a.b.c",
    first + ".extra",
    "v1...",
    first.replace("v1", "v0"),
  ])
    assert.throws(() => entschluesseln(key, "17", invalid));
  assert.throws(() => verschluesseln(randomBytes(31), "17", seed));
});
