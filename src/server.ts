import pg from "pg";
import { createApp } from "./app.js";
const origin = new URL(process.env.PUBLIC_ORIGIN || "https://localhost").origin;
const app = createApp(
  new pg.Pool({
    max: 12,
    connectionString: process.env.DATABASE_URL,
    options: "-c timezone=UTC",
  }),
  { secure: origin.startsWith("https:"), origin },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void app.close());
await app.listen({ host: "127.0.0.1", port: Number(process.env.PORT || 3040) });
