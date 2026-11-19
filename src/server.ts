import { smtpKonfiguration } from "./config.js";
import { datenbankPool } from "./db.js";
import { createApp } from "./app.js";
import { release } from "./version.js";
import { updateChecker, updateCheckingEnabled } from "./updates.js";
import { mfaSchluessel } from "./mfa-schluessel.js";
const origin = new URL(process.env.PUBLIC_ORIGIN || "https://localhost").origin;
const app = createApp(datenbankPool(), {
  secure: origin.startsWith("https:"),
  origin,
  mfaKey: mfaSchluessel(
    process.env.TIMEREAL_MFA_KEY_FILE || "/etc/timereal/mfa.key",
  ),
  updateCheck: updateChecker({
    version: release.version,
    enabled: updateCheckingEnabled(process.env.TIMEREAL_UPDATE_CHECK),
  }),
  smtp: smtpKonfiguration(
    process.env.TIMEREAL_SMTP_FILE || "/etc/timereal/mail.json",
  ),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void app.close());
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT || 3040) });
console.log(
  JSON.stringify({
    timereal_log: 1,
    level: "info",
    msg: "Anwendung gestartet.",
  }),
);
