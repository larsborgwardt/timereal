import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { Fehler, transaktion } from "./db.js";
import {
  id,
  uuid,
  objekt,
  email,
  passwort,
  token,
  wort,
  type Privat,
} from "./http.js";
import { maildienst, type MailConfig } from "./mail.js";
import {
  profil,
  profilMail,
  einladen,
  linkAnnehmen,
  resetAnfordern,
  passwortAendern,
} from "./konten.js";
import { digest } from "./session.js";

export function kontenRouten(
  app: FastifyInstance,
  pool: Pool,
  privat: Privat,
  options: { origin?: string; smtp?: MailConfig },
) {
  const mail = maildienst(options.smtp),
    versuche = new Map<string, { n: number; bis: number }>();
  function limit(req: FastifyRequest) {
    const jetzt = Date.now();
    for (const [k, v] of versuche) if (v.bis < jetzt) versuche.delete(k);
    const v = versuche.get(req.ip) ?? { n: 0, bis: jetzt + 600000 };
    if (++v.n > 12 || versuche.size >= 2048)
      throw new Fehler(
        429,
        "Zu viele Versuche. Bitte später erneut versuchen.",
      );
    versuche.set(req.ip, v);
  }
  function origin() {
    if (!options.origin)
      throw new Fehler(503, "Die öffentliche App-Adresse fehlt.");
    return options.origin;
  }
  app.get("/api/v1/profil", (req) => privat(req, profil));
  app.patch<{ Body: { email: string } }>(
    "/api/v1/profil",
    { schema: { body: objekt({ email }, ["email"]) } },
    (req) => privat(req, (db) => profilMail(db, req.body.email)),
  );
  app.get("/api/v1/verwaltung/konten", (req) =>
    privat(
      req,
      async (db) => (await db.query("select * from konten_lesen()")).rows,
    ),
  );
  app.get("/api/v1/verwaltung/mail", (req) =>
    privat(req, async (db) => {
      await db.query("select admin_pruefen()");
      return { konfiguriert: mail.konfiguriert };
    }),
  );
  app.patch<{ Params: { id: string }; Body: { aktiv: boolean } }>(
    "/api/v1/verwaltung/konten/:id",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt({ aktiv: { type: "boolean" } }, ["aktiv"]),
      },
    },
    (req) =>
      privat(req, async (db) => {
        const {
          rows: [r],
        } = await db.query("select konto_sperre($1,$2) as ok", [
          req.params.id,
          req.body.aktiv,
        ]);
        if (!r.ok)
          throw new Fehler(
            409,
            "Administratorkonten sind hier geschützt oder das Konto fehlt.",
          );
        return { gespeichert: true };
      }),
  );
  app.get("/api/v1/verwaltung/einladungen", (req) =>
    privat(
      req,
      async (db) => (await db.query("select * from einladungen_lesen()")).rows,
    ),
  );
  app.post<{ Body: { email: string } }>(
    "/api/v1/verwaltung/einladungen",
    { schema: { body: objekt({ email }, ["email"]) } },
    (req) => privat(req, (db) => einladen(db, mail, origin(), req.body.email)),
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/verwaltung/einladungen/:id/erneut",
    { schema: { params: objekt({ id: uuid }, ["id"]) } },
    (req) =>
      privat(req, (db) => einladen(db, mail, origin(), "", req.params.id)),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/verwaltung/einladungen/:id",
    { schema: { params: objekt({ id: uuid }, ["id"]) } },
    (req) =>
      privat(req, async (db) => {
        const {
          rows: [r],
        } = await db.query("select einladung_widerrufen($1) as ok", [
          req.params.id,
        ]);
        if (!r.ok)
          throw new Fehler(409, "Einladung ist bereits abgeschlossen.");
        return { widerrufen: true };
      }),
  );
  for (const [path, typ] of [
    ["/einladung/annehmen", "einladung"],
    ["/passwort/zuruecksetzen", "reset"],
  ] as const)
    app.post<{ Body: { token: string; passwort: string } }>(
      "/api/v1" + path,
      { schema: { body: objekt({ token, passwort }, ["token", "passwort"]) } },
      (req) => {
        limit(req);
        return transaktion(pool, (db) =>
          linkAnnehmen(db, req.body.token, typ, req.body.passwort),
        );
      },
    );
  app.post<{ Body: { email: string } }>(
    "/api/v1/passwort/anfordern",
    { schema: { body: objekt({ email }, ["email"]) } },
    async (req, reply) => {
      limit(req);
      if (!mail.konfiguriert)
        throw new Fehler(503, "Mailversand ist noch nicht eingerichtet.");
      try {
        await transaktion(pool, (db) =>
          resetAnfordern(db, mail, origin(), req.body.email),
        );
      } catch {
        console.error("Passwortmail konnte nicht versendet werden.");
      }
      return reply.code(202).send({ angenommen: true });
    },
  );
  app.post<{ Body: { alt: string; neu: string } }>(
    "/api/v1/passwort/aendern",
    {
      schema: {
        body: objekt({ alt: wort(512), neu: passwort }, ["alt", "neu"]),
      },
    },
    (req) =>
      privat(req, (db) => passwortAendern(db, req.body.alt, req.body.neu)),
  );
  app.get("/api/v1/sitzungen", (req) =>
    privat(req, async (db) => {
      const secret =
        req.headers.authorization?.replace(/^Bearer /, "") ??
        /(?:^|;\s*)timereal=([a-f0-9]{64})(?:;|$)/.exec(
          req.headers.cookie ?? "",
        )?.[1] ??
        "";
      return (
        await db.query(
          "select id,client,erstellt_am,ablauf,schluessel=$1 as aktuell from sitzung where widerrufen_am is null and ablauf>clock_timestamp() order by erstellt_am desc",
          [digest(secret)],
        )
      ).rows;
    }),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/sitzungen/:id",
    { schema: { params: objekt({ id: uuid }, ["id"]) } },
    (req) =>
      privat(req, async (db) => {
        const r = await db.query(
          "update sitzung set widerrufen_am=clock_timestamp() where id=$1 and widerrufen_am is null returning id",
          [req.params.id],
        );
        if (!r.rowCount) throw new Fehler(404, "Sitzung nicht gefunden.");
        return { widerrufen: true };
      }),
  );
}
