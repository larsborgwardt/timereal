import type { FastifyInstance } from "fastify";
import { id, version, tag, wort, objekt, type Privat } from "./http.js";
import { Fehler } from "./db.js";
import { woche } from "./uebersicht.js";
export function stammdatenRouten(app: FastifyInstance, privat: Privat) {
  app.get("/api/v1/kunden", (req) =>
    privat(
      req,
      async (db) =>
        (await db.query("select id,name,fassung from kunde order by name,id"))
          .rows,
    ),
  );
  app.patch<{
    Params: { id: string };
    Body: { name: string; fassung: string };
  }>(
    "/api/v1/kunden/:id",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt({ name: wort(150), fassung: version }, [
          "name",
          "fassung",
        ]),
      },
    },
    (req) =>
      privat(req, async (db) => {
        const {
          rows: [r],
        } = await db.query(
          "update kunde set name=$2 where id=$1 and fassung=$3 returning id,fassung",
          [req.params.id, req.body.name.trim(), req.body.fassung],
        );
        if (!r)
          throw new Fehler(
            409,
            "Der Kunde wurde inzwischen geändert oder fehlt.",
          );
        return r;
      }),
  );
  app.patch<{
    Params: { id: string };
    Body: {
      bezeichnung: string;
      fassung: string;
      projektId: string | null;
      abrechenbar: boolean;
      kundeName?: string;
      kundeFassung?: string;
    };
  }>(
    "/api/v1/ziele/:id",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt(
          {
            bezeichnung: wort(240),
            fassung: version,
            projektId: { anyOf: [id, { type: "null" }] },
            abrechenbar: { type: "boolean" },
            kundeName: wort(150),
            kundeFassung: version,
          },
          ["bezeichnung", "fassung", "projektId", "abrechenbar"],
        ),
      },
    },
    (req) =>
      privat(req, async (db) => {
        const {
          rows: [r],
        } = await db.query(
          "update buchungsziel set bezeichnung=$2,projekt_id=$3,abrechenbar=$4 where id=$1 and fassung=$5 returning id,fassung",
          [
            req.params.id,
            req.body.bezeichnung.trim(),
            req.body.projektId,
            req.body.abrechenbar,
            req.body.fassung,
          ],
        );
        if (!r)
          throw new Fehler(
            409,
            "Das Buchungsziel wurde inzwischen geändert oder fehlt.",
          );
        if (
          (req.body.kundeName === undefined) !==
          (req.body.kundeFassung === undefined)
        )
          throw new Fehler(
            400,
            "Kundenname und Fassung müssen gemeinsam übergeben werden.",
          );
        if (req.body.kundeName !== undefined) {
          const k = await db.query(
            "update kunde set name=$2 where id=(select kunde_id from buchungsziel where id=$1) and fassung=$3 returning id",
            [req.params.id, req.body.kundeName.trim(), req.body.kundeFassung],
          );
          if (!k.rowCount)
            throw new Fehler(
              409,
              "Der Kunde wurde inzwischen geändert. Bitte neu laden.",
            );
        }
        return r;
      }),
  );
  app.patch<{ Body: { nachkommastellen: number; pruefminuten: number } }>(
    "/api/v1/einstellungen",
    {
      schema: {
        body: objekt(
          {
            nachkommastellen: { type: "integer", enum: [2, 3] },
            pruefminuten: { type: "integer", minimum: 1, maximum: 1440 },
          },
          ["nachkommastellen", "pruefminuten"],
        ),
      },
    },
    (req) =>
      privat(req, async (db) => {
        await db.query(
          "update konto set nachkommastellen=$1,pruefminuten=$2 where id=aktuelles_konto()",
          [req.body.nachkommastellen, req.body.pruefminuten],
        );
        return { gespeichert: true };
      }),
  );
  app.get<{ Querystring: { von: string } }>(
    "/api/v1/woche",
    { schema: { querystring: objekt({ von: tag }, ["von"]) } },
    (req) => privat(req, (db) => woche(db, req.query.von)),
  );
}
