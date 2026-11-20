import { mkdir } from "node:fs/promises";
import { dienstStarten } from "./dienst.mjs";
import { journalLeser } from "./journal.mjs";
import {
  betriebsAktion,
  betriebsStatus,
  betriebWiederherstellen,
} from "./aktionen.mjs";
import { betriebssperre } from "./system.mjs";
import { mailVerwaltung } from "./mail.mjs";
import { readFile } from "node:fs/promises";

if (process.getuid() !== 0)
  throw new Error("Betriebsdienst benötigt sein systemd-Dienstkonto.");
process.umask(0o077);
const verzeichnis = "/var/lib/timereal-betrieb";
await mkdir(verzeichnis, { recursive: true, mode: 0o700 });
const singleton = await betriebssperre(verzeichnis + "/dienst.lock");
// Versand und Prüfung mit dem Mailmodul der installierten Anwendung; die Datei
// gehört root und ist für die Gruppe der Anwendung lesbar.
const { maildienst } = await import("/opt/timereal-current/dist/mail.js");
const gruppe = Number(
  (await readFile("/etc/group", "utf8"))
    .split("\n")
    .map((z) => z.split(":"))
    .find((z) => z[0] === "timereal_app")?.[2],
);
if (!Number.isInteger(gruppe))
  throw new Error("Gruppe timereal_app fehlt; Mailversand nicht einrichtbar.");
const dienst = await dienstStarten({
  verzeichnis,
  socketPath: "/run/timereal-betrieb/dienst.sock",
  lockPath: "/run/lock/timereal-install.lock",
  status: betriebsStatus,
  journal: journalLeser(),
  ausfuehren: betriebsAktion,
  wiederherstellen: betriebWiederherstellen,
  mail: mailVerwaltung({
    datei: process.env.TIMEREAL_SMTP_FILE || "/etc/timereal/mail.json",
    lockPath: "/run/lock/timereal-install.lock",
    maildienst,
    gruppe,
  }),
});
console.log(
  JSON.stringify({
    timereal_log: 1,
    level: "info",
    msg: "Betriebsdienst gestartet.",
  }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await dienst.schliessen();
    await singleton.close();
    process.exit(0);
  });
