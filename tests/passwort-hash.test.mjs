import { test } from "node:test";
import { strict as assert } from "node:assert";
import { argon2Sync, scryptSync, randomBytes } from "node:crypto";
import { passwordHash, verify } from "../dist/session.js";

// Erwartung unabhängig vom Modul: OWASP Password Storage Cheat Sheet,
// Argon2id m=19456 KiB (19 MiB), t=2, p=1.
const owasp = { memory: 19456, passes: 2, parallelism: 1 };
const kopf = "$argon2id$v=19$m=19456,t=2,p=1$";
const b64 = (b) => b.toString("base64").replace(/=+$/, "");

test("Neue Hashes sind Argon2id mit m=19 MiB, t=2, p=1 im PHC-Format", async () => {
  const hash = await passwordHash("Testpasswort!1234");
  assert.ok(hash.startsWith(kopf), hash);
  const [salt, key] = hash.slice(kopf.length).split("$");
  assert.equal(Buffer.from(salt, "base64").length, 16);
  assert.equal(
    key,
    b64(
      argon2Sync("argon2id", {
        message: "Testpasswort!1234",
        nonce: Buffer.from(salt, "base64"),
        tagLength: 32,
        ...owasp,
      }),
    ),
  );
  assert.equal(await verify("Testpasswort!1234", hash), true);
  assert.equal(await verify("Testpasswort!1235", hash), false);
  assert.notEqual(await passwordHash("Testpasswort!1234"), hash);
});

test("Bestehende scrypt-Hashes aus der Node-Vorgabe bleiben gültig", async () => {
  const salt = randomBytes(16).toString("hex");
  const alt =
    salt + ":" + scryptSync("Altpasswort!1234", salt, 64).toString("hex");
  assert.equal(await verify("Altpasswort!1234", alt), true);
  assert.equal(await verify("Altpasswort!1235", alt), false);
});

test("Unbekannte Parameter und beschädigte Hashes gelten nie als Treffer", async () => {
  const salt = randomBytes(16);
  const mit = (parameter) =>
    argon2Sync("argon2id", {
      message: "Passwort!1234",
      nonce: salt,
      tagLength: 32,
      ...parameter,
    });
  const schwach = mit({ memory: 8, passes: 1, parallelism: 1 }),
    richtig = mit(owasp);
  for (const hash of [
    // Ein Treffer mit schwächeren Parametern darf nicht genügen.
    `$argon2id$v=19$m=8,t=1,p=1$${b64(salt)}$${b64(schwach)}`,
    `$argon2i$v=19$m=19456,t=2,p=1$${b64(salt)}$${b64(richtig)}`,
    `${kopf}${b64(salt)}$${b64(richtig).slice(0, 20)}`,
    `${kopf}${b64(salt)}`,
    `${kopf}${b64(salt)}$${b64(richtig)}$x`,
    `${salt.toString("hex")}:${"ab".repeat(10)}`,
    "kaputt",
    "",
  ])
    assert.equal(await verify("Passwort!1234", hash), false, hash);
  assert.equal(await verify("Passwort!1234", null), false);
  assert.equal(
    await verify("Passwort!1234", `${kopf}${b64(salt)}$${b64(richtig)}`),
    true,
  );
});
