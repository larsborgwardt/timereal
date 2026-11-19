import type { PoolClient } from "pg";

// PostgreSQL bestimmt die UTC-Grenzen aus der persönlichen Zeitzone, einschließlich
// Zeitumstellung. Als gebundene Parameter bleiben sie danach unter RLS indexierbar.
export async function zeitgrenzen(db: PoolClient, von: string, bis: string) {
  const {
    rows: [grenzen],
  } = await db.query(
    `select $1::date::timestamp at time zone zeitzone as von,
      ($2::date+1)::timestamp at time zone zeitzone as bis from konto`,
    [von, bis],
  );
  return grenzen as { von: Date; bis: Date };
}
