import type { PoolClient } from "pg";
import { Fehler } from "./db.js";
import { zuordnung, type Auswahl } from "./timer.js";
export interface Eintrag extends Auswahl {
  beginn: string;
  ende: string;
  leistungstext: string;
  abrechenbar?: boolean;
}
function grenzen(input: Eintrag) {
  const von = Date.parse(input.beginn),
    bis = Date.parse(input.ende);
  if (
    !Number.isFinite(von) ||
    !Number.isFinite(bis) ||
    bis < von ||
    bis > Date.now() ||
    von % 60000 ||
    bis % 60000
  )
    throw new Fehler(
      400,
      "Beginn und Ende müssen auf vergangenen vollen Minuten liegen.",
    );
  return { von, bis };
}
async function abschnitt(db: PoolClient, id: string, fassung: string) {
  const {
    rows: [a],
  } = await db.query("select * from zeitabschnitt where id=$1", [id]);
  if (!a) throw new Fehler(404, "Abschnitt nicht gefunden.");
  if (a.fassung !== fassung || !a.ende || a.storniert)
    throw new Fehler(
      409,
      "Abschnitt ist inzwischen geändert, läuft oder ist storniert.",
    );
  return a;
}
export async function nachtragen(db: PoolClient, e: Eintrag) {
  grenzen(e);
  const [art, kunde, ziel, standard] = await zuordnung(db, e);
  const {
    rows: [row],
  } = await db.query(
    `insert into zeitabschnitt(konto_id,art,kunde_id,ziel_id,abrechenbar,beginn,ende,leistungstext)
    values(aktuelles_konto(),$1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      art,
      kunde,
      ziel,
      e.abrechenbar ?? standard,
      e.beginn,
      e.ende,
      e.leistungstext,
    ],
  );
  return row;
}
export async function teilen(
  db: PoolClient,
  id: string,
  e: Eintrag & { fassung: string },
) {
  const a = await abschnitt(db, id, e.fassung),
    { von, bis } = grenzen(e);
  if (von <= a.beginn.getTime() || bis >= a.ende.getTime() || bis <= von)
    throw new Fehler(
      400,
      "Die Unterbrechung muss innerhalb des Abschnitts liegen.",
    );
  await db.query("update zeitabschnitt set ende=$1 where id=$2", [
    e.beginn,
    id,
  ]);
  const mitte = await nachtragen(db, e);
  const {
    rows: [rest],
  } = await db.query(
    `insert into zeitabschnitt(konto_id,art,kunde_id,ziel_id,abrechenbar,beginn,ende,leistungstext,pruefen)
    values(aktuelles_konto(),$1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [
      a.art,
      a.kunde_id,
      a.ziel_id,
      a.abrechenbar,
      e.ende,
      a.ende,
      a.leistungstext,
      a.pruefen,
    ],
  );
  return { anfang: id, unterbrechung: mitte.id, rest: rest.id };
}
export async function korrigieren(
  db: PoolClient,
  id: string,
  e: Eintrag & { fassung: string },
) {
  const a = await abschnitt(db, id, e.fassung);
  const { von, bis } = grenzen(e);
  const [art, kunde, ziel, standard] = await zuordnung(db, e);
  await db.query("set constraints zeiten_ohne_ueberlappung deferred");
  if (von !== a.beginn.getTime())
    await db.query(
      `update zeitabschnitt set ende=$1 where ende=$2 and beginn<ende and id<>$3 and not storniert`,
      [e.beginn, a.beginn, id],
    );
  if (bis !== a.ende.getTime()) {
    const { rows } = await db.query(
      `update zeitabschnitt set beginn=$1 where beginn=$2 and (ende is null or ende>beginn)
      and id<>$3 and not storniert returning ende`,
      [e.ende, a.ende, id],
    );
    if (rows.some((row) => !row.ende))
      await db.query(
        "update konto set timer_version=timer_version+1 where id=aktuelles_konto()",
      );
  }
  await db.query(
    `update zeitabschnitt set art=$1,kunde_id=$2,ziel_id=$3,abrechenbar=$4,beginn=$5,ende=$6,leistungstext=$7,pruefen=false
    where id=$8`,
    [
      art,
      kunde,
      ziel,
      e.abrechenbar ??
        (a.ziel_id === ziel && a.art === art ? a.abrechenbar : standard),
      e.beginn,
      e.ende,
      e.leistungstext,
      id,
    ],
  );
  return { id };
}
export async function stornieren(db: PoolClient, id: string, fassung: string) {
  await abschnitt(db, id, fassung);
  await db.query("update zeitabschnitt set storniert=true where id=$1", [id]);
  await db.query(
    "update konto set pause_abschnitt_id=null,timer_version=timer_version+1 where pause_abschnitt_id=$1",
    [id],
  );
  return { id };
}
