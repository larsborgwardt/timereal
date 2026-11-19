import pg, { type Pool, type PoolClient } from "pg";

export function datenbankPool(env: NodeJS.ProcessEnv = process.env): Pool {
  const value = env.TIMEREAL_DB_POOL_MAX ?? "12";
  if (!/^(?:[2-9]|[12][0-9]|3[0-2])$/.test(value))
    throw new Error(
      "TIMEREAL_DB_POOL_MAX muss eine ganze Zahl von 2 bis 32 sein.",
    );
  const pool = new pg.Pool({
    max: Number(value),
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    options:
      "-c timezone=UTC -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000",
    application_name: "timereal",
  });
  // pg entfernt die betroffene Leerlaufverbindung selbst. Ohne Listener würde
  // ein Datenbank-Neustart auch den Node-Prozess durch ein unbehandeltes Event beenden.
  pool.on("error", (error: Error & { code?: string }) =>
    console.error("Datenbankverbindung beendet", error.code ?? error.name),
  );
  return pool;
}

export function voruebergehendNichtVerfuegbar(
  error: Error & { code?: string },
) {
  return (
    [
      "55P03",
      "25P03",
      "57014",
      "57P01",
      "57P02",
      "57P03",
      "53300",
      "53400",
      "08000",
      "08003",
      "08006",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
    ].includes(error.code ?? "") ||
    [
      "timeout exceeded when trying to connect",
      "Connection terminated due to connection timeout",
      "Connection terminated unexpectedly",
      "Connection terminated",
    ].includes(error.message)
  );
}

export class Fehler extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function transaktion<T>(
  pool: Pool,
  run: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  let verwerfen = false;
  let verbindungsfehler: Error | undefined;
  // Ausgeliehene Clients gehören nicht zum Errorhandler des Pools.
  // Ein Abbruch während eines await muss die Anfrage, nicht den Prozess beenden.
  const abgebrochen = (error: Error) => {
    verbindungsfehler ??= error;
    verwerfen = true;
  };
  db.on("error", abgebrochen);
  try {
    await db.query("BEGIN");
    const wert = await run(db);
    if (verbindungsfehler) throw verbindungsfehler;
    await db.query("COMMIT");
    return wert;
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch {
      // Eine Verbindung mit unklarem Transaktionszustand darf nicht an das
      // nächste Konto ausgeliehen werden. Der ursprüngliche Fehler bleibt erhalten.
      verwerfen = true;
    }
    throw verbindungsfehler ?? err;
  } finally {
    db.release(verwerfen);
    db.removeListener("error", abgebrochen);
  }
}
