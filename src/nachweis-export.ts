import type { FastifyInstance } from "fastify";
import writeXlsxFile, { type Cell, type Row } from "write-excel-file/node";
import { Fehler } from "./db.js";
import { objekt, tag, type Privat } from "./http.js";
import { mitStatus } from "./nachweise.js";
import { zeitgrenzen } from "./zeitraum.js";

type Filter = {
  von: string;
  bis: string;
  ansicht: "historie" | "uebernahme";
  suche?: string;
};
type Nachweis = {
  id: string;
  beginn: Date;
  ende: Date;
  tag: string;
  kunde: string | null;
  projekt: string | null;
  ziel: string | null;
  art: "zugeordnet" | "intern" | "vorlaeufig";
  zielart: string | null;
  leistungstext: string;
  abrechenbar: boolean;
  status: string;
  stand: { stunden: string };
};
const LIMIT = 5000;

// OOXML-Texte bleiben explizit Strings, auch bei führendem =, +, - oder @.
// XML 1.0 erlaubt diese Steuerzeichen nicht; normale Zeilenumbrüche bleiben erhalten.
const text = (value: string | null): Cell => ({
  type: String,
  value: (value ?? "").replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
    "�",
  ),
  format: "@",
  wrap: true,
  alignVertical: "top",
});

async function excel(
  rows: Nachweis[],
  filter: Filter,
  konto: { zeitzone: string; nachkommastellen: number; name: string },
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: konto.zeitzone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  // Excel speichert Ortszeiten ohne Zeitzone. Die Dauer stammt dagegen aus den
  // tatsächlichen Zeitpunkten und bleibt auch beim Wechsel zur Winterzeit korrekt.
  const lokal = (instant: Date) => {
    const p = Object.fromEntries(
      formatter.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    return new Date(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
  };
  const kopf = [
    "Datum",
    "Kunde",
    "Projekt",
    "Buchungsziel",
    "Art",
    "Leistungstext",
    "Beginn",
    "Ende",
    "Dauer",
    "Stunden",
    "Abrechenbar",
    "Status",
    "Buchungs-ID",
  ];
  const daten: Row[] = [
    kopf.map((value) => ({
      value,
      fontWeight: "bold",
      textColor: "#FFFFFF",
      backgroundColor: "#00766A",
      height: 28,
    })),
  ];
  for (const e of rows)
    daten.push([
      { value: new Date(e.tag + "T00:00:00Z"), format: "dd.mm.yyyy" },
      text(e.kunde),
      text(e.projekt),
      text(e.ziel),
      text(
        e.art === "intern"
          ? "Intern"
          : e.art === "vorlaeufig"
            ? "Vorläufig"
            : e.zielart,
      ),
      text(e.leistungstext),
      { value: lokal(e.beginn), format: "dd.mm.yyyy hh:mm" },
      { value: lokal(e.ende), format: "dd.mm.yyyy hh:mm" },
      {
        value: (e.ende.getTime() - e.beginn.getTime()) / 86400000,
        format: "[h]:mm",
      },
      {
        value: Number(e.stand.stunden),
        format: "0." + "0".repeat(konto.nachkommastellen),
      },
      text(e.abrechenbar ? "Ja" : "Nein"),
      text(e.status),
      text(e.id),
    ]);
  const info: Row[] = [
    ["Timereal · Stundennachweise", "Exportangaben"],
    ["Konto", konto.name],
    ["Zeitraum", filter.von + " bis " + filter.bis],
    ["Ansicht", filter.ansicht === "historie" ? "Historie" : "Übernahme"],
    ["Kunde oder Buchungsziel", filter.suche?.trim() || "Keine Einschränkung"],
    ["Zeitzone", konto.zeitzone],
    [
      "Inhalt",
      "Abgeschlossene Abschnitte der gewählten Ansicht. Laufende Timer sind nicht enthalten. Zeiträume wählen überlappende Abschnitte vollständig aus, wie in der App.",
    ],
    [
      "Stunden",
      "Dezimalstunden aus dem aktuellen Buchungsstand mit " +
        konto.nachkommastellen +
        " Nachkommastellen je Abschnitt. Dauer zeigt die tatsächlich verstrichene Zeit, auch bei Zeitumstellung.",
    ],
    [
      "Status",
      "Der Export bestätigt keine Übernahme. In der Historie sind auch interne, vorläufige, übertragene und stornierte Einträge enthalten; Status vor der Abrechnung beachten.",
    ],
  ];
  return writeXlsxFile(
    [
      {
        sheet: "Nachweise",
        data: daten,
        stickyRowsCount: 1,
        columns: [14, 25, 25, 28, 16, 60, 22, 22, 14, 14, 16, 22, 20].map(
          (width) => ({ width }),
        ),
      },
      {
        sheet: "Exportinfo",
        data: info.map((row) => row.map((value) => text(String(value)))),
        columns: [{ width: 28 }, { width: 100 }],
      },
    ],
    { fontFamily: "Arial", fontSize: 11 },
  ).toBuffer();
}

export function nachweisExportRouten(app: FastifyInstance, privat: Privat) {
  app.get<{ Querystring: Filter }>(
    "/api/v1/nachweise/excel",
    {
      schema: {
        querystring: objekt(
          {
            von: tag,
            bis: tag,
            ansicht: { enum: ["historie", "uebernahme"] },
            suche: { type: "string", maxLength: 240 },
          },
          ["von", "bis", "ansicht"],
        ),
      },
    },
    async (req, reply) => {
      const f = req.query;
      const stand = await privat(req, async (db) => {
        if (f.von > f.bis)
          throw new Fehler(
            400,
            "Das Bis-Datum muss am oder nach dem Von-Datum liegen.",
          );
        const grenzen = await zeitgrenzen(db, f.von, f.bis);
        const { rows } = await db.query<Nachweis>(
          `select * from (${mitStatus}) s
        where ende is not null and beginn < $2::timestamptz
        and (ende > $1::timestamptz or (ende=beginn and beginn >= $1::timestamptz))
        and ($3='historie' or status not in ('Storniert','Nicht abrechenbar','Übertragen'))
        and strpos(lower(coalesce(kunde,'') || ' ' || coalesce(ziel,'') || ' ' || coalesce(projekt,'')),lower($4))>0
        order by tag desc,beginn,id limit $5`,
          [
            grenzen.von,
            grenzen.bis,
            f.ansicht,
            f.suche?.trim() ?? "",
            LIMIT + 1,
          ],
        );
        if (rows.length > LIMIT)
          throw new Fehler(
            413,
            "Die Auswahl enthält mehr als 5.000 Einträge. Bitte den Zeitraum oder die Suche eingrenzen.",
          );
        const {
          rows: [konto],
        } = await db.query(
          "select zeitzone,nachkommastellen,coalesce(nullif(anzeigename,''),login_referenz) as name from konto where id=aktuelles_konto()",
        );
        return { rows, konto };
      });
      // Die Datenbankverbindung vor der ZIP-Erzeugung freigeben.
      const buffer = await excel(stand.rows, f, stand.konto);
      return reply
        .type(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
          "Content-Disposition",
          `attachment; filename="timereal-nachweise-${f.von}-bis-${f.bis}.xlsx"`,
        )
        .send(buffer);
    },
  );
}
