import type { PoolClient } from "pg";
import { Fehler } from "./db.js";

// Vorher bestätigte Bezeichnungen bleiben auch nach Umbenennen oder Umhängen des Projekts erhalten.
const verlauf = `select a.id,a.art,a.beginn,a.ende,a.ziel_id,a.kunde_id,a.fassung,a.abrechenbar,a.pruefen,
  a.storniert,a.storno_bestaetigt,a.leistungstext,a.uebertragene_fassung,a.uebertragener_stand,
  k.name as kunde,z.bezeichnung as ziel,z.art as zielart,coalesce(p.bezeichnung,case when z.art='Projekt' then z.bezeichnung end) as projekt,
  (a.beginn at time zone u.zeitzone)::date::text as tag,
  extract(epoch from (a.ende-a.beginn))::bigint/60 as minuten,
  jsonb_build_object('beginn',a.beginn,'ende',a.ende,'kunde',k.name,'ziel',z.bezeichnung,'zielart',z.art,
    'kunde_id',k.id::text,'ziel_id',z.id::text,'projekt_id',coalesce(p.id,case when z.art='Projekt' then z.id end)::text,
    'projekt',coalesce(p.bezeichnung,case when z.art='Projekt' then z.bezeichnung end),
    'leistungstext',a.leistungstext,'abrechenbar',a.abrechenbar,
    'stunden',round(extract(epoch from (a.ende-a.beginn))/3600,u.nachkommastellen)::text) as stand
  from zeitabschnitt a join konto u on u.id=a.konto_id
  left join kunde k on (k.konto_id,k.id)=(a.konto_id,a.kunde_id)
  left join buchungsziel z on (z.konto_id,z.id)=(a.konto_id,a.ziel_id)
  left join buchungsziel p on (p.konto_id,p.id)=(z.konto_id,z.projekt_id)`;

const mitStatus = `select h.*,case
  when storniert and uebertragene_fassung is not null and not storno_bestaetigt then 'Storno offen'
  when storniert then 'Storniert'
  when ende is null then 'Läuft'
  when uebertragene_fassung is not null and (stand is distinct from uebertragener_stand or pruefen) then 'Erneut prüfen'
  when art='vorlaeufig' then 'Zuordnen'
  when pruefen then 'Zeit prüfen'
  when not abrechenbar then 'Nicht abrechenbar'
  when btrim(leistungstext)='' then 'Leistungstext fehlt'
  when uebertragene_fassung is null then 'Bereit'
  else 'Übertragen' end as status from (${verlauf}) h`;

export async function historie(db: PoolClient, von: string, bis: string) {
  const { rows } = await db.query(
    mitStatus + " where tag >= $1 and tag <= $2 order by beginn desc,id desc",
    [von, bis],
  );
  return rows;
}
export async function bestaetigen(
  db: PoolClient,
  id: string,
  stand: unknown,
  fassung: string,
) {
  const {
    rows: [eintrag],
  } = await db.query(
    "select s.*,stand=$2::jsonb as passt from (" +
      mitStatus +
      ") s where id=$1",
    [id, JSON.stringify(stand)],
  );
  if (!eintrag) throw new Fehler(404, "Abschnitt nicht gefunden.");
  if (!eintrag.passt || eintrag.fassung !== fassung)
    throw new Fehler(409, "Abschnitt wurde geändert.");
  if (eintrag.status === "Storno offen") {
    await db.query(
      "update zeitabschnitt set storno_bestaetigt=true where id=$1",
      [id],
    );
  } else {
    if (
      !eintrag.ende ||
      eintrag.pruefen ||
      eintrag.art === "vorlaeufig" ||
      eintrag.storniert ||
      (eintrag.abrechenbar && !eintrag.leistungstext.trim()) ||
      (!eintrag.abrechenbar && !eintrag.uebertragene_fassung)
    )
      throw new Fehler(
        409,
        "Dieser Nachweis ist noch nicht zur Übernahme bereit.",
      );
    await db.query(
      "update zeitabschnitt set uebertragener_stand=$2,uebertragene_fassung=fassung where id=$1",
      [id, JSON.stringify(stand)],
    );
  }
  return { gespeichert: true };
}
