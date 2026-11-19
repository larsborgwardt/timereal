import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
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
  function limit(req: FastifyRequest, ziel: string) {
    const jetzt = Date.now();
    for (const [k, v] of versuche) if (v.bis < jetzt) versuche.delete(k);
    // Eigenes Ziel-Limit plus Obergrenze je IP: ein Büro kann verschiedene
    // Einladungen annehmen, wiederholte Versuche bleiben trotzdem begrenzt.
    for (const [key, max] of [
      ["ip:" + req.ip, 200],
      ["ziel:" + req.ip + ":" + digest(ziel), 12],
    ] as const) {
      const bekannt = versuche.get(key);
      const v = bekannt ?? { n: 0, bis: jetzt + 600000 };
      if (v.n >= max || (!bekannt && versuche.size >= 4096))
        throw new Fehler(
          429,
          "Zu viele Versuche. Bitte später erneut versuchen.",
        );
      v.n++;
      versuche.set(key, v);
    }
  }
  function verwaltung<T>(
    req: FastifyRequest,
    run: (db: PoolClient) => Promise<T>,
    kontenAendern = false,
  ) {
    if (req.headers.authorization)
      throw new Fehler(403, "Eine Administrator-Websitzung ist erforderlich.");
    return privat(req, run, kontenAendern);
  }
  async function versenden(req: FastifyRequest, email: string, id?: string) {
    if (!mail.konfiguriert)
      throw new Fehler(503, "Mailversand ist noch nicht eingerichtet.");
    // Erst COMMIT, dann externer Versand. Fehler bleiben sichtbar; die
    // gespeicherte Einladung kann über die Verwaltung erneut gesendet werden.
    const link = await verwaltung(req, (db) =>
      einladen(db, origin(), email, id),
    );
    await mail.senden(link.email, "einladung", link.url);
    return { id: link.id, versendet: true };
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
    verwaltung(
      req,
      async (db) => (await db.query("select * from konten_mit_rollen()")).rows,
    ),
  );
  app.get("/api/v1/verwaltung/mail", (req) =>
    verwaltung(req, async (db) => {
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
      verwaltung(
        req,
        async (db) => {
          const {
            rows: [r],
          } = await db.query("select konto_sperre($1,$2) as ok", [
            req.params.id,
            req.body.aktiv,
          ]);
          if (!r.ok)
            throw new Fehler(
              409,
              "Das eigene oder letzte Administratorkonto ist geschützt oder das Konto fehlt.",
            );
          return { gespeichert: true };
        },
        true,
      ),
  );
  app.patch<{ Params: { id: string }; Body: { rolle: string } }>(
    "/api/v1/verwaltung/konten/:id/rolle",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt(
          {
            rolle: {
              type: "string",
              enum: ["berater", "betrieb", "administrator"],
            },
          },
          ["rolle"],
        ),
      },
    },
    (req) =>
      verwaltung(
        req,
        async (db) => {
          const {
            rows: [r],
          } = await db.query("select konto_rolle_aendern($1,$2) as ok", [
            req.params.id,
            req.body.rolle,
          ]);
          if (!r.ok)
            throw new Fehler(
              409,
              "Das eigene oder letzte Administratorkonto ist geschützt oder das Konto fehlt.",
            );
          return { gespeichert: true };
        },
        true,
      ),
  );
  app.get("/api/v1/verwaltung/einladungen", (req) =>
    verwaltung(
      req,
      async (db) => (await db.query("select * from einladungen_lesen()")).rows,
    ),
  );
  app.post<{ Body: { email: string } }>(
    "/api/v1/verwaltung/einladungen",
    { schema: { body: objekt({ email }, ["email"]) } },
    (req) => versenden(req, req.body.email),
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/verwaltung/einladungen/:id/erneut",
    { schema: { params: objekt({ id: uuid }, ["id"]) } },
    (req) => versenden(req, "", req.params.id),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/verwaltung/einladungen/:id",
    { schema: { params: objekt({ id: uuid }, ["id"]) } },
    (req) =>
      verwaltung(req, async (db) => {
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
        limit(req, req.body.token);
        return transaktion(pool, (db) =>
          linkAnnehmen(db, req.body.token, typ, req.body.passwort),
        );
      },
    );
  app.post<{ Body: { email: string } }>(
    "/api/v1/passwort/anfordern",
    { schema: { body: objekt({ email }, ["email"]) } },
    async (req, reply) => {
      limit(req, req.body.email.toLowerCase());
      if (!mail.konfiguriert)
        throw new Fehler(503, "Mailversand ist noch nicht eingerichtet.");
      try {
        const link = await transaktion(pool, (db) =>
          resetAnfordern(db, origin(), req.body.email),
        );
        if (link) await mail.senden(link.email, "reset", link.url);
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
