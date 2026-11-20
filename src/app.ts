import {
  extensionCors,
  istErweiterungsherkunft,
  erweiterungRouten,
} from "./erweiterung.js";
import { stammdatenRouten } from "./stammdaten-routen.js";
import { kontenRouten } from "./konten-routen.js";
import { betriebsRouten } from "./betrieb.js";
import { auditRouten } from "./audit.js";
import { mfaRouten, mfaCookie } from "./mfa.js";
import { randomBytes } from "node:crypto";
import { profil } from "./konten.js";
import type { MailConfig } from "./mail.js";
import { id, version, wort, tag, objekt } from "./http.js";
import Fastify, { type FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { Fehler, transaktion, voruebergehendNichtVerfuegbar } from "./db.js";
import { bindSession, digest, issueSession, verify } from "./session.js";
import { release } from "./version.js";
import { updateChecker, type UpdateStatus } from "./updates.js";
import { ausfuehren, timer, type Auftrag } from "./timer.js";
import { anlegen, kundenLesen, zieleLesen, type NeuesZiel } from "./ziele.js";
import {
  nachtragen,
  teilen,
  korrigieren,
  stornieren,
  type Eintrag,
} from "./korrektur.js";
import { historie, bestaetigen } from "./nachweise.js";
import { nachweisExportRouten } from "./nachweis-export.js";
import { anmeldeDrossel, type AnmeldeGrenzen } from "./anmeldedrossel.js";

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
  options: {
    secure: boolean;
    origin?: string;
    smtp?: MailConfig;
    updateCheck?: (force?: boolean) => Promise<UpdateStatus>;
    betriebSocket?: string;
    mfaKey?: Buffer;
    anmeldeGrenzen?: Partial<AnmeldeGrenzen>;
  },
) {
  const app = Fastify({
    bodyLimit: 32768,
    // Der mitgelieferte Caddy ist der einzige vertrauenswürdige Proxy.
    trustProxy: (address, hop) =>
      hop === 0 && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address),
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });
  const drossel = anmeldeDrossel(options.anmeldeGrenzen);
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
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    const cors = extensionCors(req, reply);
    if (cors) return cors;
    if (
      !istErweiterungsherkunft(req.headers.origin) &&
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
      if (voruebergehendNichtVerfuegbar(err))
        return reply.code(503).header("Retry-After", "1").send({
          fehler:
            "Der Dienst ist vorübergehend ausgelastet. Bitte den aktuellen Stand laden und erneut versuchen.",
        });
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
        JSON.stringify({
          timereal_log: 1,
          level: "error",
          msg: `Anfrage fehlgeschlagen: ${req.routeOptions.url} (${err.code ?? err.name})`,
        }),
      );
      return reply
        .code(500)
        .send({ fehler: "Speichern oder Laden fehlgeschlagen." });
    },
  );
  const privat = <T>(
    req: FastifyRequest,
    run: (db: PoolClient) => Promise<T>,
    kontenAendern = false,
  ) =>
    transaktion(pool, async (db) => {
      const auth = req.headers.authorization;
      if (auth && !/^Bearer [a-f0-9]{64}$/.test(auth))
        throw new Fehler(401, "Bitte erneut anmelden.");
      // Vor bindSession serialisieren: es sperrt bereits das Konto des
      // Handelnden. So können zwei Administratoren nicht aufeinander warten.
      if (kontenAendern)
        await db.query("select pg_advisory_xact_lock(734995512)");
      await bindSession(
        db,
        auth ? auth.replace(/^Bearer /, "") : webToken(req),
        auth ? "erweiterung" : "web",
      );
      return run(db);
    });
  const checkUpdates =
    options.updateCheck ??
    updateChecker({ version: release.version, enabled: false });
  betriebsRouten(
    app,
    privat,
    options.betriebSocket ?? "/run/timereal-betrieb/dienst.sock",
    checkUpdates,
  );
  auditRouten(app, privat);
  nachweisExportRouten(app, privat);
  mfaRouten(app, pool, privat, options, cookie);
  for (const [url, file, mime] of [
    ["/", "index.html", "text/html"],
    ["/app.js", "app.js", "text/javascript"],
    ["/version.js", "version.js", "text/javascript"],
    ["/konten.js", "konten.js", "text/javascript"],
    ["/mfa.js", "mfa.js", "text/javascript"],
    ["/mfa-anmeldung.js", "mfa-anmeldung.js", "text/javascript"],
    ["/betrieb.js", "betrieb.js", "text/javascript"],
    ["/betrieb-fortschritt.js", "betrieb-fortschritt.js", "text/javascript"],
    ["/systemkonsole.js", "systemkonsole.js", "text/javascript"],
    ["/audit.js", "audit.js", "text/javascript"],
    ["/zeit.js", "zeit.js", "text/javascript"],
    ["/arbeitsablauf.js", "arbeitsablauf.js", "text/javascript"],
    ["/nachweis-export.js", "nachweis-export.js", "text/javascript"],
    ["/app.css", "app.css", "text/css"],
    ["/transport.js", "transport.js", "text/javascript"],
    ["/erweiterung-vertrag.js", "erweiterung-vertrag.js", "text/javascript"],
    ["/erweiterung-anmelden.html", "erweiterung-anmelden.html", "text/html"],
    ["/erweiterung-anmelden.js", "erweiterung-anmelden.js", "text/javascript"],
  ]) {
    app.get(url, async (_, reply) =>
      reply
        .type(mime + "; charset=utf-8")
        .send(await readFile(new URL("../web/" + file, import.meta.url))),
    );
  }
  for (const [url, file, mime] of [
    ["/favicon.ico", "favicon.ico", "image/vnd.microsoft.icon"],
    ...[16, 32, 48, 128, 180].map((size) => [
      `/icons/timereal-${size}.png`,
      `icons/timereal-${size}.png`,
      "image/png",
    ]),
  ]) {
    app.get(url, async (_, reply) =>
      reply
        .type(mime)
        .send(await readFile(new URL("../web/" + file, import.meta.url))),
    );
  }
  app.get("/health", async () => {
    await pool.query("select 1");
    return { status: "ok" };
  });
  app.get("/api/v1/version", async () => release);
  app.get("/api/v1/updates", async () => checkUpdates());
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
      if (!drossel.versuch(req.ip, req.body.login))
        throw new Fehler(
          429,
          "Zu viele Versuche. Bitte später erneut versuchen.",
        );
      const {
        rows: [konto],
      } = await pool.query("select * from login_suchen($1)", [req.body.login]);
      if (!(await verify(req.body.passwort, konto?.hash))) {
        await pool.query("select audit_anmeldefehler($1)", [konto?.id ?? null]);
        throw new Fehler(401, "Anmeldung fehlgeschlagen.");
      }
      const challenge = randomBytes(32).toString("hex");
      const token = await transaktion(pool, async (db) => {
        const {
          rows: [r],
        } = await db.query("select mfa_anmeldung_start($1,$2,$3) as art", [
          konto.id,
          konto.hash,
          digest(challenge),
        ]);
        if (r.art === "gesperrt")
          throw new Fehler(
            429,
            "Zu viele Versuche. Bitte nach zehn Minuten erneut versuchen.",
          );
        if (r.art === "mfa") return null;
        if (r.art !== "passwort")
          throw new Fehler(401, "Anmeldung fehlgeschlagen.");
        return issueSession(db, konto.id, "web", konto.hash);
      });
      drossel.erfolg(req.ip, req.body.login);
      if (token === null)
        return reply
          .header("Set-Cookie", mfaCookie(challenge, options.secure))
          .send({ zweiterFaktor: true });
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
  app.get("/api/v1/arbeitsstand", (req) =>
    privat(req, async (db) => ({
      timer: await timer(db),
      ziele: await zieleLesen(db),
      profil: await profil(db),
      kunden: await kundenLesen(db),
    })),
  );
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
  app.get("/api/v1/ziele", (req) => privat(req, zieleLesen));
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
  stammdatenRouten(app, privat);
  erweiterungRouten(app, pool, privat, webToken);
  return app;
}
