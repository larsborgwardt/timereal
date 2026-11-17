import type { Pool, PoolClient } from "pg";

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
  try {
    await db.query("BEGIN");
    const wert = await run(db);
    await db.query("COMMIT");
    return wert;
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}
