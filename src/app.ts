import { kontenRouten } from "./konten-routen.js";
import type { MailConfig } from "./mail.js";
import { id, version, wort, tag, objekt } from "./http.js";
import Fastify, { type FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { Fehler, transaktion } from "./db.js";
import { bindSession, digest, issueSession, verify } from "./session.js";
import { release } from "./version.js";
import { ausfuehren, timer, type Auftrag } from "./timer.js";
import { anlegen, type NeuesZiel } from "./ziele.js";
import {
  nachtragen,
  teilen,
  korrigieren,
  stornieren,
  type Eintrag,
} from "./korrektur.js";
import { historie, bestaetigen } from "./nachweise.js";

const zielSchema = objekt(
  {
    kunde: wort(150),
    art: { enum: ["Ticket", "Termin", "Projekt"] },
    bezeichnung: wort(240),
    projektId: id,
    abrechenbar: { type: "boolean" },
  },
  ["kunde", "art", "bezeichnung"],
);
const zieleigenschaften = {
  art: { enum: ["zugeordnet", "vorlaeufig", "intern"] },
  zielId: id,
  kundeId: id,
};
function webToken(req: FastifyRequest) {
  return (
    /(?:^|;\s*)timereal=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1] || ""
  );
}
export function createApp(
  pool: Pool,
  options: { secure: boolean; origin?: string; smtp?: MailConfig },
) {
  const app = Fastify({
    bodyLimit: 32768,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  const loginversuche = new Map<string, { ab: number; n: number }>();
  const cookie = (value: string, ttl: number) =>
    "timereal=" +
    value +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
    ttl +
    (options.secure ? "; Secure" : "");
  app.addHook("onClose", async () => {
    await pool.end();
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      !req.headers.authorization &&
      req.headers.origin !==
        (options.origin ??
          (options.secure ? "https://" : "http://") + req.headers.host)
    )
      throw new Fehler(403, "Die Herkunft der Anfrage ist ungültig.");
  });
  app.setErrorHandler(
    (err: Error & { statusCode?: number; code?: string }, req, reply) => {
      if (err instanceof Fehler)
        return reply.code(err.status).send({ fehler: err.message });
      if (err.code === "42501")
        return reply
          .code(403)
          .send({ fehler: "Keine Berechtigung für die Verwaltung." });
      if (err.code === "23P01" || err.code === "23505")
        return reply.code(409).send({
          fehler: "Die Buchung kollidiert mit einem vorhandenen Eintrag.",
        });
      if (
        err.code === "23503" ||
        err.code === "23514" ||
        err.statusCode === 400 ||
        err.code === "22008"
      )
        return reply.code(400).send({ fehler: "Bitte die Eingaben prüfen." });
      if (err.statusCode && err.statusCode < 500)
        return reply
          .code(err.statusCode)
          .send({ fehler: "Anfrage unzulässig." });
      console.error(
        "Anfrage fehlgeschlagen",
        req.routeOptions.url,
        err.code ?? err.name,
      );
      return reply
        .code(500)
        .send({ fehler: "Speichern oder Laden fehlgeschlagen." });
    },
  );
  const privat = <T>(
    req: FastifyRequest,
    run: (db: PoolClient) => Promise<T>,
  ) =>
    transaktion(pool, async (db) => {
      const auth = req.headers.authorization;
      if (auth && !/^Bearer [a-f0-9]{64}$/.test(auth))
        throw new Fehler(401, "Bitte erneut anmelden.");
      await bindSession(
        db,
        auth ? auth.replace(/^Bearer /, "") : webToken(req),
        auth ? "erweiterung" : "web",
      );
      return run(db);
    });
  for (const [url, file, mime] of [
    ["/", "index.html", "text/html"],
    ["/app.js", "app.js", "text/javascript"],
    ["/konten.js", "konten.js", "text/javascript"],
    ["/app.css", "app.css", "text/css"],
  ]) {
    app.get(url, async (_, reply) =>
      reply
        .type(mime + "; charset=utf-8")
        .send(await readFile(new URL("../web/" + file, import.meta.url))),
    );
  }
  app.get("/health", async () => {
    await pool.query("select 1");
    return { status: "ok" };
  });
  app.get("/api/v1/version", async () => release);
  app.post<{ Body: { login: string; passwort: string } }>(
    "/api/v1/anmeldung",
    {
      schema: {
        body: objekt(
          {
            login: wort(250),
            passwort: { type: "string", minLength: 1, maxLength: 512 },
          },
          ["login", "passwort"],
        ),
      },
    },
    async (req, reply) => {
      if (req.headers.authorization)
        throw new Fehler(403, "Webanmeldung erforderlich.");
      const now = Date.now();
      for (const [k, v] of loginversuche)
        if (v.ab <= now) loginversuche.delete(k);
      const key = req.ip + "|" + req.body.login;
      const versuch = loginversuche.get(key) ?? { ab: now + 600000, n: 0 };
      if (versuch.n >= 12 || loginversuche.size >= 2048)
        throw new Fehler(
          429,
          "Zu viele Versuche. Bitte später erneut versuchen.",
        );
      versuch.n++;
      loginversuche.set(key, versuch);
      const {
        rows: [konto],
      } = await pool.query("select * from login_suchen($1)", [req.body.login]);
      if (!(await verify(req.body.passwort, konto?.hash)))
        throw new Fehler(401, "Anmeldung fehlgeschlagen.");
      const token = await transaktion(pool, (db) =>
        issueSession(db, konto.id, "web", konto.hash),
      );
      loginversuche.delete(key);
      return reply
        .header("Set-Cookie", cookie(token, 14 * 86400))
        .send({ angemeldet: true });
    },
  );
  app.post("/api/v1/abmeldung", async (req, reply) => {
    const token =
      req.headers.authorization?.replace(/^Bearer /, "") ?? webToken(req);
    await privat(req, (db) =>
      db.query("select sitzung_beenden($1)", [digest(token)]),
    );
    return reply.header("Set-Cookie", cookie("", 0)).send({ abgemeldet: true });
  });
  app.get("/api/v1/timer", (req) => privat(req, timer));
  for (const action of ["start", "wechsel", "stopp", "pause", "fortsetzen"]) {
    app.post<{ Body: Auftrag }>(
      "/api/v1/timer/" + action,
      {
        schema: {
          body: objekt(
            { version, ...zieleigenschaften, neuesZiel: zielSchema },
            ["version"],
          ),
        },
      },
      (req) =>
        privat(req, async (db) => {
          const key = req.headers["idempotency-key"];
          if (
            typeof key !== "string" ||
            !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)
          )
            throw new Fehler(400, "Auftragsschlüssel fehlt.");
          return ausfuehren(db, action, req.body, key);
        }),
    );
  }
  app.get("/api/v1/ziele", (req) =>
    privat(
      req,
      async (db) =>
        (
          await db.query(`select z.id,z.kunde_id,z.art,z.bezeichnung,z.projekt_id,k.name as kunde
      from buchungsziel z join kunde k on (k.konto_id,k.id)=(z.konto_id,z.kunde_id) order by k.name,z.bezeichnung,z.id`)
        ).rows,
    ),
  );
  app.post<{ Body: NeuesZiel }>(
    "/api/v1/ziele",
    { schema: { body: zielSchema } },
    (req) => privat(req, (db) => anlegen(db, req.body)),
  );
  app.patch<{
    Params: { id: string };
    Body: { fassung: string; leistungstext: string };
  }>(
    "/api/v1/abschnitte/:id/notiz",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt(
          {
            fassung: version,
            leistungstext: { type: "string", maxLength: 4000 },
          },
          ["fassung", "leistungstext"],
        ),
      },
    },
    (req) =>
      privat(req, async (db) => {
        const { rows } = await db.query(
          "update zeitabschnitt set leistungstext=$2 where id=$1 and fassung=$3 and not storniert returning id,fassung",
          [req.params.id, req.body.leistungstext, req.body.fassung],
        );
        if (!rows.length)
          throw new Fehler(409, "Abschnitt wurde inzwischen geändert.");
        return rows[0];
      }),
  );
  app.get<{ Querystring: { von: string; bis: string } }>(
    "/api/v1/historie",
    { schema: { querystring: objekt({ von: tag, bis: tag }, ["von", "bis"]) } },
    (req) => privat(req, (db) => historie(db, req.query.von, req.query.bis)),
  );
  app.post<{
    Params: { id: string };
    Body: { fassung: string; stand: object };
  }>(
    "/api/v1/abschnitte/:id/uebernahme",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt({ fassung: version, stand: { type: "object" } }, [
          "fassung",
          "stand",
        ]),
      },
    },
    (req) =>
      privat(req, (db) =>
        bestaetigen(db, req.params.id, req.body.stand, req.body.fassung),
      ),
  );
  const zeitpunkt = { type: "string", format: "date-time" };
  const daten = {
    ...zieleigenschaften,
    beginn: zeitpunkt,
    ende: zeitpunkt,
    leistungstext: { type: "string", maxLength: 4000 },
    abrechenbar: { type: "boolean" },
  };
  const pflicht = ["art", "beginn", "ende", "leistungstext"];
  app.post<{ Body: Eintrag }>(
    "/api/v1/abschnitte",
    { schema: { body: objekt(daten, pflicht) } },
    (req) => privat(req, (db) => nachtragen(db, req.body)),
  );
  for (const [weg, anwenden] of [
    ["korrektur", korrigieren],
    ["unterbrechung", teilen],
  ] as const) {
    app.post<{ Params: { id: string }; Body: Eintrag & { fassung: string } }>(
      "/api/v1/abschnitte/:id/" + weg,
      {
        schema: {
          params: objekt({ id }, ["id"]),
          body: objekt({ ...daten, fassung: version }, [...pflicht, "fassung"]),
        },
      },
      (req) =>
        privat(req, async (db) => await anwenden(db, req.params.id, req.body)),
    );
  }
  app.post<{ Params: { id: string }; Body: { fassung: string } }>(
    "/api/v1/abschnitte/:id/storno",
    {
      schema: {
        params: objekt({ id }, ["id"]),
        body: objekt({ fassung: version }, ["fassung"]),
      },
    },
    (req) =>
      privat(req, (db) => stornieren(db, req.params.id, req.body.fassung)),
  );
  kontenRouten(app, pool, privat, options);
  return app;
}
