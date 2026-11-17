import type { PoolClient } from "pg";
import { anlegen, type NeuesZiel } from "./ziele.js";
import { Fehler } from "./db.js";
export interface Auswahl {
  art: "zugeordnet" | "vorlaeufig" | "intern";
  zielId?: string;
  kundeId?: string;
}
export interface Auftrag extends Partial<Auswahl> {
  version: string;
  neuesZiel?: NeuesZiel;
}
export async function timer(db: PoolClient) {
  const {
    rows: [row],
  } = await db.query(`select timer_version as version,
    (select to_jsonb(a) || jsonb_build_object('id',id::text,'ziel_id',ziel_id::text,'kunde_id',kunde_id::text,'konto_id',konto_id::text,'fassung',fassung::text) from zeitabschnitt a where ende is null) as aktiv,
    (select jsonb_build_object('id',id::text,'art',art,'zielId',ziel_id::text,'kundeId',kunde_id::text,'seit',ende)
     from zeitabschnitt where id=konto.pause_abschnitt_id) as pause from konto`);
  return row;
}
export async function zuordnung(db: PoolClient, ziel: Partial<Auswahl>) {
  if (ziel.art === "zugeordnet" && ziel.zielId && !ziel.kundeId) {
    const { rows } = await db.query(
      "select kunde_id,abrechenbar from buchungsziel where id=$1",
      [ziel.zielId],
    );
    if (!rows.length) throw new Fehler(404, "Buchungsziel nicht gefunden.");
    return [ziel.art, rows[0].kunde_id, ziel.zielId, rows[0].abrechenbar];
  }
  if (ziel.art === "intern" && !ziel.zielId && !ziel.kundeId)
    return [ziel.art, null, null, false];
  if (ziel.art === "vorlaeufig" && !ziel.zielId) {
    if (
      ziel.kundeId &&
      !(await db.query("select 1 from kunde where id=$1", [ziel.kundeId]))
        .rowCount
    )
      throw new Fehler(404, "Kunde nicht gefunden.");
    return [ziel.art, ziel.kundeId ?? null, null, false];
  }
  throw new Fehler(400, "Ungültige Zuordnung.");
}
export async function ausfuehren(
  db: PoolClient,
  action: string,
  input: Auftrag,
  key: string,
) {
  const request = JSON.stringify({ action, ...input });
  const {
    rows: [old],
  } = await db.query(
    "select antwort,anfrage=$2::jsonb as gleich from timer_auftrag where schluessel=$1",
    [key, request],
  );
  if (old) {
    if (!old.gleich)
      throw new Fehler(
        409,
        "Dieser Schlüssel gehört zu einem anderen Auftrag.",
      );
    return old.antwort;
  }
  const state = await timer(db);
  const erlaubt =
    action === "start"
      ? !state.aktiv
      : action === "fortsetzen"
        ? Boolean(state.pause)
        : action === "stopp"
          ? Boolean(state.aktiv || state.pause)
          : Boolean(state.aktiv);
  if (state.version !== input.version || !erlaubt)
    throw new Fehler(
      409,
      "Der Timer wurde inzwischen geändert. Bitte aktualisieren.",
    );
  let ziel = null;
  if (input.neuesZiel) {
    if (
      !["start", "wechsel"].includes(action) ||
      input.art ||
      input.kundeId ||
      input.zielId
    )
      throw new Fehler(400, "Ungültige Zielanlage.");
    const neu = await anlegen(db, input.neuesZiel);
    ziel = await zuordnung(db, { art: "zugeordnet", zielId: neu.id });
  } else if (action === "start" || action === "wechsel")
    ziel = await zuordnung(db, input);
  else if (input.art || input.kundeId || input.zielId)
    throw new Fehler(400, "Diese Aktion erwartet kein Ziel.");
  if (action === "fortsetzen") {
    const p = state.pause;
    ziel = await zuordnung(db, {
      art: p.art,
      zielId: p.zielId,
      kundeId: p.art === "vorlaeufig" ? p.kundeId : undefined,
    });
  }
  const {
    rows: [{ grenze }],
  } = await db.query("select date_trunc('minute',clock_timestamp()) as grenze");
  if (state.aktiv)
    await db.query(
      `update zeitabschnitt set ende=$1,
    pruefen=pruefen or $1::timestamptz-beginn >= make_interval(mins=>(select pruefminuten from konto))
    where id=$2`,
      [grenze, state.aktiv.id],
    );
  if (ziel)
    await db.query(
      `insert into zeitabschnitt(konto_id,art,kunde_id,ziel_id,abrechenbar,beginn)
    values(aktuelles_konto(),$1,$2,$3,$4,$5)`,
      [...ziel, grenze],
    );
  await db.query(
    "update konto set timer_version=timer_version+1,pause_abschnitt_id=$1 where id=aktuelles_konto()",
    [action === "pause" ? state.aktiv.id : null],
  );
  const result = await timer(db);
  await db.query(
    "insert into timer_auftrag values(aktuelles_konto(),$1,$2,$3)",
    [key, request, JSON.stringify(result)],
  );
  return result;
}
