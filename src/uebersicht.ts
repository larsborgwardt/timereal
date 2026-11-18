import type { PoolClient } from "pg";
import { mitStatus } from "./nachweise.js";
export async function woche(db: PoolClient, datum: string) {
  const {
    rows: [bereich],
  } = await db.query(
    `select (t-extract(isodow from t)::int+1)::text as von,
 (t-extract(isodow from t)::int+7)::text as bis,zeitzone from (select $1::date t) x,konto`,
    [datum],
  );
  const { rows } = await db.query(
    `with tage as (select $1::date+i as tag from generate_series(0,6) i),
 grenzen as (select tag,tag::timestamp at time zone k.zeitzone as von,(tag+1)::timestamp at time zone k.zeitzone as bis from tage,konto k),
 teile as (select g.tag,k.name as kunde,coalesce(p.bezeichnung,case when z.art='Projekt' then z.bezeichnung end) as projekt,a.abrechenbar,
 greatest(0,extract(epoch from(least(coalesce(a.ende,date_trunc('minute',clock_timestamp())),g.bis)-greatest(a.beginn,g.von)))/60)::int as minuten
 from grenzen g join zeitabschnitt a on a.beginn<g.bis and coalesce(a.ende,date_trunc('minute',clock_timestamp()))>g.von and not a.storniert
 left join kunde k on (k.konto_id,k.id)=(a.konto_id,a.kunde_id)
 left join buchungsziel z on (z.konto_id,z.id)=(a.konto_id,a.ziel_id)
 left join buchungsziel p on (p.konto_id,p.id)=(z.konto_id,z.projekt_id))
 select tag::text,kunde,projekt,sum(minuten)::int as minuten,
 coalesce(sum(minuten) filter(where abrechenbar),0)::int as abrechenbar from teile
 group by tag,kunde,projekt order by tag,kunde nulls last,projekt nulls last`,
    [bereich.von],
  );
  const {
    rows: [offen],
  } = await db.query(
    `select count(*)::int as anzahl from (${mitStatus}) s
 where ende is not null and status in ('Storno offen','Erneut prüfen','Zuordnen','Zeit prüfen','Leistungstext fehlt','Bereit')
 and beginn<($2::date+1)::timestamp at time zone $3 and (ende>$1::date::timestamp at time zone $3 or (ende=beginn and tag::date>=$1::date))`,
    [bereich.von, bereich.bis, bereich.zeitzone],
  );
  return {
    ...bereich,
    erfasst: rows.reduce((sum, r) => sum + r.minuten, 0),
    abrechenbar: rows.reduce((sum, r) => sum + r.abrechenbar, 0),
    offen: offen.anzahl,
    zeilen: rows,
  };
}
