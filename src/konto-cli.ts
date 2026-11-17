import pg from "pg";
import { passwordHash } from "./session.js";
import { readFileSync } from "node:fs";
const [aktion, login] = process.argv.slice(2);
if (
  !login?.trim() ||
  !["anlegen", "sperren", "entsperren", "passwort"].includes(aktion)
) {
  console.error(
    "Aufruf: konto-cli.js anlegen|sperren|entsperren|passwort ANMELDENAME",
  );
  process.exit(2);
}
const client = new pg.Client({
  host: process.env.PGHOST || "/var/run/postgresql",
  database: process.env.PGDATABASE || "timereal",
});
await client.connect();
try {
  await client.query("BEGIN");
  if (aktion === "sperren" || aktion === "entsperren") {
    const result = await client.query(
      "update konto set aktiv=$2 where login_referenz=$1",
      [login, aktion === "entsperren"],
    );
    if (result.rowCount !== 1) throw new Error("Konto fehlt.");
  } else {
    const pass = readFileSync(0, "utf8").replace(/\r?\n$/, "");
    if (pass.length < 12 || pass.length > 512)
      throw new Error("Passwort muss 12 bis 512 Zeichen lang sein.");
    const hash = await passwordHash(pass);
    if (aktion === "anlegen")
      await client.query(
        "insert into konto(login_referenz,passwort_hash,ist_admin) values($1,$2,not exists(select from konto))",
        [login, hash],
      );
    else {
      const { rows } = await client.query(
        "update konto set passwort_hash=$2 where login_referenz=$1 returning id",
        [login, hash],
      );
      if (!rows.length) throw new Error("Konto fehlt.");
      await client.query(
        "update sitzung set widerrufen_am=now() where konto_id=$1 and widerrufen_am is null",
        [rows[0].id],
      );
    }
  }
  await client.query("COMMIT");
  console.log("Konto aktualisiert.");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
