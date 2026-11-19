// Separater API-Prozess im isolierten Lastnetz. Nur der Test bindet an dessen Netzinterface.
import { datenbankPool } from "../dist/db.js";
import { createApp } from "../dist/app.js";
const app = createApp(datenbankPool(), {
  secure: false,
  origin: process.env.PUBLIC_ORIGIN,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void app.close());
await app.listen({ host: "0.0.0.0", port: 3040 });
