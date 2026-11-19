import { readFileSync, writeFileSync } from "node:fs";
import { maildienst, type MailConfig } from "./mail.js";
try {
  const [host, port, secure, from, user, password, ...extra] = readFileSync(
    0,
    "utf8",
  ).split("\n");
  if (extra.length || !["ja", "nein"].includes(secure) || !process.argv[2])
    throw new Error();
  const config: MailConfig = {
    host,
    port: Number(port),
    secure: secure === "ja",
    from,
    ...(user ? { user, password } : {}),
  };
  await maildienst(config).pruefen();
  writeFileSync(process.argv[2], JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.log("SMTP-Verbindung geprüft. Konfiguration vorbereitet.");
} catch {
  console.error(
    "SMTP-Prüfung fehlgeschlagen. Adresse, Port, TLS und Zugangsdaten prüfen. Bestehende Konfiguration bleibt erhalten.",
  );
  process.exitCode = 1;
}
