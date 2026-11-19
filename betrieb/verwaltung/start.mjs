import { mkdir } from "node:fs/promises";
import { dienstStarten } from "./dienst.mjs";
import {
  betriebsAktion,
  betriebsStatus,
  betriebWiederherstellen,
} from "./aktionen.mjs";
import { betriebssperre } from "./system.mjs";

if (process.getuid() !== 0)
  throw new Error("Betriebsdienst benötigt sein systemd-Dienstkonto.");
process.umask(0o077);
const verzeichnis = "/var/lib/timereal-betrieb";
await mkdir(verzeichnis, { recursive: true, mode: 0o700 });
const singleton = await betriebssperre(verzeichnis + "/dienst.lock");
const dienst = await dienstStarten({
  verzeichnis,
  socketPath: "/run/timereal-betrieb/dienst.sock",
  lockPath: "/run/lock/timereal-install.lock",
  status: betriebsStatus,
  ausfuehren: betriebsAktion,
  wiederherstellen: betriebWiederherstellen,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await dienst.schliessen();
    await singleton.close();
    process.exit(0);
  });
