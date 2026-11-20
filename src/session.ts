import * as krypto from "node:crypto";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { ClientBase } from "pg";
import { Fehler } from "./db.js";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// OWASP Password Storage Cheat Sheet: Argon2id mit m=19 MiB, t=2, p=1.
// Neue Hashes im PHC-Format "$argon2id$v=19$m=19456,t=2,p=1$salt$schluessel"
// (Base64 ohne Auffüllung). Hashes bis 0.9.5 haben die Form "salt:schluessel"
// (scrypt mit der Node-Vorgabe N=2^14, r=8, p=1) und bleiben gültig, bis das
// Passwort geändert wird.
const aktuell = { memory: 19456, passes: 2, parallelism: 1 };
const kennung = `$argon2id$v=19$m=${aktuell.memory},t=${aktuell.passes},p=${aktuell.parallelism}$`;
// crypto.argon2 gibt es ab Node 24.7; die Typen in @types/node 22 kennen es
// noch nicht. Ohne die Funktion startet der Server nicht.
const { argon2 } = krypto as unknown as { argon2?: (...a: unknown[]) => void };
if (typeof argon2 !== "function")
  throw new Error("Node.js mit crypto.argon2 (ab 24.7) erforderlich.");
const argon2id = promisify(argon2) as (
  algorithm: "argon2id",
  parameters: {
    message: string;
    nonce: Buffer;
    tagLength: number;
  } & typeof aktuell,
) => Promise<Buffer>;
const scryptAlt = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;
const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");
const ableiten = (password: string, salt: Buffer) =>
  argon2id("argon2id", {
    message: password,
    nonce: salt,
    tagLength: 32,
    ...aktuell,
  });
export async function passwordHash(password: string) {
  const salt = randomBytes(16);
  return kennung + b64(salt) + "$" + b64(await ableiten(password, salt));
}
type Hash =
  | { art: "argon2id"; salt: Buffer; key: Buffer }
  | { art: "scrypt"; salt: string; key: Buffer };
function zerlegen(stored: string): Hash | null {
  // Nur die beiden bekannten Formen; andere Parameter gelten nie als Treffer.
  if (stored.startsWith(kennung)) {
    const m = /^([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(
      stored.slice(kennung.length),
    );
    return m
      ? {
          art: "argon2id",
          salt: Buffer.from(m[1], "base64"),
          key: Buffer.from(m[2], "base64"),
        }
      : null;
  }
  const m = /^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  return m
    ? { art: "scrypt", salt: m[1], key: Buffer.from(m[2], "hex") }
    : null;
}
const dummy = zerlegen(kennung + "A".repeat(22) + "$" + "A".repeat(43))!;
export async function verify(password: string, stored: string | null) {
  const hash = (stored && zerlegen(stored)) || null;
  // Auch ohne gültigen Hash wird mit den aktuellen Parametern gerechnet,
  // damit die Antwortzeit kein Konto verrät.
  const h = hash ?? dummy;
  const value =
    h.art === "argon2id"
      ? await ableiten(password, h.salt)
      : await scryptAlt(password, h.salt, 64);
  return timingSafeEqual(value, h.key) && hash !== null;
}
export async function issueSession(
  db: ClientBase,
  konto: string,
  kanal: string,
  expected: string | null = null,
) {
  const secret = randomBytes(32).toString("hex");
  const { rows } = await db.query("select sitzung_anlegen($1,$2,$3,$4) as ok", [
    konto,
    digest(secret),
    kanal,
    expected,
  ]);
  if (!rows[0].ok) throw new Fehler(401, "Anmeldung erforderlich.");
  return secret;
}
export async function bindSession(
  db: ClientBase,
  token: string,
  kanal: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Fehler(401, "Bitte anmelden.");
  const { rows } = await db.query("select sitzung_pruefen($1,$2) as id", [
    digest(token),
    kanal,
  ]);
  if (!rows[0].id) throw new Fehler(401, "Bitte erneut anmelden.");
  await db.query("select set_config('app.konto_id',$1,true)", [rows[0].id]);
  return rows[0].id as string;
}
