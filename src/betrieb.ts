import { request } from "node:http";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Fehler } from "./db.js";
import { objekt, uuid, wort, type Privat } from "./http.js";
import { verify } from "./session.js";
import type { UpdateStatus } from "./updates.js";

/** Privilegierte Operationen bleiben hinter dem lokalen, root-eigenen Socket. */
export function betriebsAufruf(
  socketPath: string,
  daten: object,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: "/",
        method: "POST",
        headers: { "content-type": "application/json" },
      },
      (res) => {
        const teile: Buffer[] = [];
        let laenge = 0;
        res.on("data", (chunk: Buffer) => {
          laenge += chunk.length;
          if (laenge > 65536) req.destroy(new Error("Antwort zu groß"));
          else teile.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const data = JSON.parse(Buffer.concat(teile).toString("utf8"));
            if (!data || typeof data !== "object" || Array.isArray(data))
              throw new Error();
            if (res.statusCode !== 200) {
              const codes: Record<string, number> = {
                EINGABE: 400,
                FEHLT: 404,
                HERKUNFT: 403,
                KONFLIKT: 409,
                ZUSTAND: 409,
                BELEGT: 409,
                VOLL: 503,
              };
              throw new Fehler(
                codes[data.code] ?? 503,
                typeof data.fehler === "string"
                  ? data.fehler.slice(0, 300)
                  : "Betriebsaktion derzeit nicht möglich.",
              );
            }
            resolve(data);
          } catch (e) {
            reject(
              e instanceof Fehler
                ? e
                : new Fehler(
                    503,
                    "Betriebsdienst liefert keinen gültigen Status.",
                  ),
            );
          }
        });
        res.on("error", () => req.destroy(new Error("Antwort unterbrochen")));
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Zeitüberschreitung")),
      5000,
    );
    req.on("error", () => {
      clearTimeout(timer);
      reject(
        new Fehler(
          503,
          "Betriebsdienst nicht erreichbar. Einrichtung oder Dienststatus im Container prüfen.",
        ),
      );
    });
    req.end(JSON.stringify(daten));
  });
}

export function betriebsRouten(
  app: FastifyInstance,
  privat: Privat,
  socketPath: string,
  checkUpdates: (force?: boolean) => Promise<UpdateStatus>,
) {
  const prefix = "/api/v1/verwaltung/betrieb";
  let naechsteVersionspruefung = 0;
  const versuche = new Map<string, { bis: number; anzahl: number }>();
  function passwortLimit(konto: string) {
    const jetzt = Date.now();
    for (const [key, v] of versuche) if (v.bis <= jetzt) versuche.delete(key);
    const stand = versuche.get(konto) ?? { bis: jetzt + 600000, anzahl: 0 };
    if (stand.anzahl >= 8 || (!versuche.has(konto) && versuche.size >= 2048))
      throw new Fehler(
        429,
        "Zu viele Passwortprüfungen. Bitte später erneut versuchen.",
      );
    stand.anzahl++;
    versuche.set(konto, stand);
  }
  async function admin(req: FastifyRequest, passwort?: string) {
    if (req.headers.authorization)
      throw new Fehler(403, "Eine Administrator-Websitzung ist erforderlich.");
    return privat(req, async (db) => {
      await db.query("select admin_pruefen()");
      const {
        rows: [r],
      } = await db.query("select aktuelles_konto()::text as id");
      if (passwort !== undefined) {
        passwortLimit(r.id);
        const {
          rows: [p],
        } = await db.query("select eigenes_passwort() as hash");
        if (!(await verify(passwort, p.hash)))
          throw new Fehler(403, "Das Administratorpasswort stimmt nicht.");
      }
      return r.id as string;
    });
  }
  app.get(prefix + "/status", async (req) => {
    await admin(req);
    return betriebsAufruf(socketPath, { aktion: "status" });
  });
  app.post(
    prefix + "/updates/pruefen",
    { schema: { body: objekt({}, []) } },
    async (req, reply) => {
      await admin(req);
      const jetzt = Date.now();
      if (jetzt < naechsteVersionspruefung) {
        const rest = Math.ceil((naechsteVersionspruefung - jetzt) / 1000);
        reply.header("Retry-After", String(rest));
        throw new Fehler(
          429,
          `Bitte warte ${rest} Sekunden bis zur nächsten Versionsprüfung.`,
        );
      }
      // Prozessweit reservieren, bevor GitHub kontaktiert wird: auch parallele
      // Administratorsitzungen können keine unbeschränkten Abrufe auslösen.
      naechsteVersionspruefung = jetzt + 60000;
      return checkUpdates(true);
    },
  );
  app.get<{ Params: { id: string } }>(
    prefix + "/auftraege/:id",
    { schema: { params: objekt({ id: uuid }, ["id"]) } },
    async (req) => {
      await admin(req);
      return betriebsAufruf(socketPath, {
        aktion: "auftrag",
        id: req.params.id,
      });
    },
  );
  const routen = [
    ["/updates/vorbereiten", "update-vorbereiten", "tag"],
    ["/updates/:id/installieren", "update-installieren", "passwort"],
    ["/domain/pruefen", "domain-pruefen", "domain"],
    ["/domain/:id/uebernehmen", "domain-uebernehmen", "passwort"],
    ["/domain/:id/bestaetigen", "domain-bestaetigen", null],
    ["/domain/:id/zuruecknehmen", "domain-zuruecknehmen", null],
  ] as const;
  const felder = {
    tag: {
      type: "string",
      maxLength: 60,
      pattern: "^v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$",
    },
    domain: { type: "string", minLength: 3, maxLength: 253 },
    passwort: wort(512),
  };
  for (const [pfad, aktion, feld] of routen) {
    app.post<{ Params: { id?: string }; Body: Record<string, string> }>(
      prefix + pfad,
      {
        schema: {
          ...(pfad.includes(":id")
            ? { params: objekt({ id: uuid }, ["id"]) }
            : {}),
          body: objekt(
            feld ? { [feld]: felder[feld] } : {},
            feld ? [feld] : [],
          ),
          headers: {
            type: "object",
            properties: { "idempotency-key": uuid },
            required: ["idempotency-key"],
          },
        },
      },
      async (req, reply) => {
        const konto = await admin(
          req,
          feld === "passwort" ? req.body.passwort : undefined,
        );
        const daten =
          feld === "tag" || feld === "domain"
            ? { [feld]: req.body[feld] }
            : aktion === "domain-bestaetigen"
              ? { origin: req.headers.origin }
              : {};
        const result = await betriebsAufruf(socketPath, {
          aktion: "annehmen",
          anfrage: {
            aktion,
            konto,
            schluessel: req.headers["idempotency-key"],
            daten,
            ...(req.params.id ? { jobId: req.params.id } : {}),
          },
        });
        return reply.code(202).send(result);
      },
    );
  }
}
