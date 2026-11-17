import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { ClientBase } from "pg";
import { Fehler } from "./db.js";
const derive = promisify(scrypt);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + ((await derive(password, salt, 64)) as Buffer).toString("hex")
  );
}
const dummy = "00000000000000000000000000000000:" + "00".repeat(64);
export async function verify(password: string, stored: string | null) {
  const [salt, key] = (stored || dummy).split(":");
  const value = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(value, Buffer.from(key, "hex")) && Boolean(stored);
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
