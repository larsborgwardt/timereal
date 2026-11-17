import type { PoolClient } from "pg";
export interface NeuesZiel {
  kunde: string;
  art: string;
  bezeichnung: string;
  projektId?: string;
  abrechenbar?: boolean;
}
export async function anlegen(db: PoolClient, z: NeuesZiel) {
  let [kunde] = (
    await db.query("select id from kunde where name=$1 order by id limit 1", [
      z.kunde.trim(),
    ])
  ).rows;
  if (!kunde)
    [kunde] = (
      await db.query(
        "insert into kunde(konto_id,name) values(aktuelles_konto(),$1) returning id",
        [z.kunde.trim()],
      )
    ).rows;
  return (
    await db.query(
      `insert into buchungsziel(konto_id,kunde_id,art,bezeichnung,projekt_id,abrechenbar)
    values(aktuelles_konto(),$1,$2,$3,$4,$5) returning id`,
      [
        kunde.id,
        z.art,
        z.bezeichnung.trim(),
        z.projektId ?? null,
        z.abrechenbar ?? true,
      ],
    )
  ).rows[0];
}
