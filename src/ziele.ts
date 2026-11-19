import type { PoolClient } from "pg";
export async function kundenLesen(db: PoolClient) {
  return (await db.query("select id,name,fassung from kunde order by name,id"))
    .rows;
}
export async function zieleLesen(db: PoolClient) {
  return (
    await db.query(`select z.id,z.kunde_id,z.art,z.bezeichnung,z.projekt_id,z.abrechenbar,z.fassung,k.name as kunde
    from buchungsziel z join kunde k on (k.konto_id,k.id)=(z.konto_id,z.kunde_id) order by k.name,z.bezeichnung,z.id`)
  ).rows;
}
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
