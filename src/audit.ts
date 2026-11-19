import type { FastifyInstance } from "fastify";
import { Fehler } from "./db.js";
import { id, objekt, tag, type Privat } from "./http.js";

type Filter = { von?: string; bis?: string; suche?: string; vor?: string };
export function auditRouten(app: FastifyInstance, privat: Privat) {
  const filter = {
    von: tag,
    bis: tag,
    suche: { type: "string", maxLength: 200 },
  };
  for (const exportieren of [false, true]) {
    app.get<{ Querystring: Filter }>(
      "/api/v1/verwaltung/audit" + (exportieren ? "/export" : ""),
      {
        schema: {
          querystring: objekt(exportieren ? filter : { ...filter, vor: id }),
        },
      },
      async (req, reply) => {
        if (req.headers.authorization)
          throw new Fehler(
            403,
            "Eine Administrator-Websitzung ist erforderlich.",
          );
        const f = req.query,
          limit = exportieren ? 5000 : 100;
        const stand = await privat(req, async (db) => {
          const { rows } = await db.query(
            "select * from audit_lesen($1,$2,$3,$4,$5)",
            [
              f.von ?? null,
              f.bis ?? null,
              f.suche ?? "",
              f.vor ?? null,
              limit + 1,
            ],
          );
          if (exportieren && rows.length > limit)
            throw new Fehler(
              413,
              "Die Auswahl enthält mehr als 5.000 Ereignisse. Bitte den Zeitraum oder die Suche eingrenzen.",
            );
          const {
            rows: [konto],
          } = await db.query(
            "select zeitzone from konto where id=aktuelles_konto()",
          );
          const eintraege = rows.slice(0, limit);
          return {
            eintraege,
            naechsteSeite: rows.length > limit ? eintraege.at(-1)!.id : null,
            zeitzone: konto.zeitzone,
          };
        });
        if (exportieren)
          reply.header(
            "Content-Disposition",
            'attachment; filename="timereal-audit.json"',
          );
        return stand;
      },
    );
  }
}
