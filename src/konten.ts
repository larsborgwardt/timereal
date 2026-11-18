import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { Fehler } from "./db.js";
import { digest, passwordHash, verify } from "./session.js";
import type { maildienst } from "./mail.js";
type Mail = ReturnType<typeof maildienst>;
export async function profil(db: PoolClient) {
  const {
    rows: [k],
  } = await db.query(
    "select id,login_referenz as login,email,ist_admin as admin,zeitzone,nachkommastellen,pruefminuten from konto where id=aktuelles_konto()",
  );
  return k;
}
export async function profilMail(db: PoolClient, email: string) {
  const {
    rows: [r],
  } = await db.query("select konto_email($1) as ok", [email.toLowerCase()]);
  if (!r.ok) throw new Fehler(409, "Diese Adresse ist bereits belegt.");
  return profil(db);
}
export async function einladen(
  db: PoolClient,
  mail: Mail,
  origin: string,
  email: string,
  id: string | null = null,
) {
  const token = randomBytes(32).toString("hex");
  const {
    rows: [row],
  } = await db.query("select einladung_erstellen($1,$2,$3) as id", [
    email.toLowerCase(),
    digest(token),
    id,
  ]);
  if (!row.id)
    throw new Fehler(
      409,
      "Diese Einladung kann nicht erneut versendet werden.",
    );
  const {
    rows: [invite],
  } = await db.query("select * from einladungen_lesen() where id=$1", [row.id]);
  await mail.senden(invite.email, "einladung", origin + "/#einladung=" + token);
  return { id: row.id, versendet: true };
}
export async function linkAnnehmen(
  db: PoolClient,
  token: string,
  typ: "einladung" | "reset",
  passwort: string,
) {
  const hash = await passwordHash(passwort);
  const {
    rows: [r],
  } = await db.query("select kontolink_verbrauchen($1,$2,$3) as ok", [
    digest(token),
    typ,
    hash,
  ]);
  if (!r.ok)
    throw new Fehler(
      410,
      "Der Link ist abgelaufen, widerrufen oder bereits verwendet.",
    );
  return { gespeichert: true };
}
export async function resetAnfordern(
  db: PoolClient,
  mail: Mail,
  origin: string,
  email: string,
) {
  const token = randomBytes(32).toString("hex");
  const {
    rows: [r],
  } = await db.query("select reset_erstellen($1,$2) as id", [
    email.toLowerCase(),
    digest(token),
  ]);
  if (r.id)
    await mail.senden(
      email.toLowerCase(),
      "reset",
      origin + "/#reset=" + token,
    );
}
export async function passwortAendern(
  db: PoolClient,
  alt: string,
  neu: string,
) {
  const {
    rows: [r],
  } = await db.query("select eigenes_passwort() as hash");
  if (!(await verify(alt, r.hash)))
    throw new Fehler(400, "Das bisherige Passwort stimmt nicht.");
  const {
    rows: [ok],
  } = await db.query("select passwort_aendern($1,$2) as ok", [
    await passwordHash(neu),
    r.hash,
  ]);
  if (!ok.ok) throw new Fehler(409, "Das Passwort wurde inzwischen geändert.");
  return { gespeichert: true };
}
