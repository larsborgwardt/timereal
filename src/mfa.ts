import { randomBytes, randomUUID } from "node:crypto";
import QRCode from "qrcode";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { Fehler, transaktion } from "./db.js";
import { objekt, wort, uuid, type Privat } from "./http.js";
import { digest, verify } from "./session.js";
import {
  base32,
  verschluesseln,
  entschluesseln,
  passenderSchritt,
} from "./mfa-crypto.js";

type Geheimnis = {
  konto_id: string;
  geheimnis: string | null;
  jetzt: number;
  gesperrt: boolean;
};
type Faktor = { art: "totp" | "recovery"; code: string };
const faktorSchema = {
  art: { type: "string", enum: ["totp", "recovery"] },
  code: { type: "string", minLength: 6, maxLength: 39 },
};
const sitzung = () => randomBytes(32).toString("hex");
const neueCodes = () =>
  Array.from({ length: 8 }, () =>
    randomBytes(16).toString("hex").toUpperCase().match(/.{8}/g)!.join("-"),
  );
const codeHash = (code: string) => digest(code.replace(/-/g, "").toUpperCase());
export const mfaCookie = (value: string, secure: boolean, ttl = 300) =>
  `timereal_mfa=${value}; Path=/api/v1/anmeldung; HttpOnly; SameSite=Strict; Max-Age=${ttl}${secure ? "; Secure" : ""}`;
function pruefungToken(req: FastifyRequest) {
  return (
    /(?:^|;\s*)timereal_mfa=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie ?? "",
    )?.[1] ?? ""
  );
}
function nurWeb(req: FastifyRequest) {
  if (req.headers.authorization)
    throw new Fehler(403, "Eine Webanmeldung ist erforderlich.");
}
function ergebnis<T>(value: T | Fehler): T {
  // Fehlversuche müssen erst gespeichert sein; ein Wurf innerhalb der Transaktion würde sie zurückrollen.
  if (value instanceof Fehler) throw value;
  return value;
}
function schluessel(key?: Buffer) {
  if (!key || key.length !== 32)
    throw new Fehler(
      503,
      "Zwei-Faktor-Anmeldung ist im Dienst noch nicht eingerichtet.",
    );
  return key;
}
function faktor(
  r: Geheimnis,
  data: Faktor,
  key?: Buffer,
): [number | null, string | null] {
  if (data.art === "recovery") {
    if (
      !/^[A-Fa-f0-9-]+$/.test(data.code) ||
      data.code.replace(/-/g, "").length !== 32
    )
      return [null, null];
    return [null, codeHash(data.code)];
  }
  try {
    return [
      passenderSchritt(
        entschluesseln(schluessel(key), r.konto_id, r.geheimnis!),
        data.code,
        r.jetzt,
      ),
      null,
    ];
  } catch {
    throw new Fehler(
      503,
      "Zwei-Faktor-Schlüssel ist nicht verfügbar. Bitte den Betreiber kontaktieren.",
    );
  }
}
async function eigenes(
  db: PoolClient,
  id: string | null = null,
): Promise<Geheimnis | Fehler> {
  const {
    rows: [r],
  } = await db.query<Geheimnis>("select * from mfa_eigenes($1)", [id]);
  if (!r)
    return new Fehler(
      409,
      "Die Einrichtung ist abgelaufen oder wurde ersetzt. Bitte neu beginnen.",
    );
  if (r.gesperrt)
    return new Fehler(
      429,
      "Zu viele Versuche. Bitte nach zehn Minuten erneut versuchen.",
    );
  return r;
}
async function kennwort(
  db: PoolClient,
  password: string,
): Promise<string | Fehler> {
  const {
    rows: [p],
  } = await db.query("select eigenes_passwort() as hash");
  if (await verify(password, p.hash)) return p.hash as string;
  await db.query("select mfa_passwort_fehler()");
  return new Fehler(400, "Das Passwort stimmt nicht.");
}

export function mfaRouten(
  app: FastifyInstance,
  pool: Pool,
  privat: Privat,
  options: { secure: boolean; mfaKey?: Buffer },
  cookie: (value: string, ttl: number) => string,
) {
  const web = async <T>(
    req: FastifyRequest,
    run: (db: PoolClient) => Promise<T | Fehler>,
  ) => {
    nurWeb(req);
    return ergebnis(await privat(req, run));
  };
  app.get("/api/v1/mfa", (req) =>
    web(req, async (db) => {
      const {
        rows: [r],
      } = await db.query("select mfa_status() as status");
      return { ...r.status, verfuegbar: Boolean(options.mfaKey) };
    }),
  );
  app.delete("/api/v1/mfa/einrichtung", (req) =>
    web(req, async (db) => {
      await db.query("select mfa_einrichtung_abbrechen()");
      return { abgebrochen: true };
    }),
  );
  app.delete("/api/v1/anmeldung/faktor", async (req, reply) => {
    nurWeb(req);
    const token = pruefungToken(req);
    if (token)
      await transaktion(pool, (db) =>
        db.query("select mfa_anmeldung_abbrechen($1)", [digest(token)]),
      );
    return reply
      .header("Set-Cookie", mfaCookie("", options.secure, 0))
      .send({ abgebrochen: true });
  });
  app.post<{ Body: { passwort: string } }>(
    "/api/v1/mfa/einrichtung",
    {
      schema: { body: objekt({ passwort: wort(512) }, ["passwort"]) },
    },
    (req) =>
      web(req, async (db) => {
        const key = schluessel(options.mfaKey);
        const own = await eigenes(db);
        if (own instanceof Fehler) return own;
        if (own.geheimnis)
          return new Fehler(
            409,
            "Zwei-Faktor-Anmeldung ist bereits eingeschaltet.",
          );
        const hash = await kennwort(db, req.body.passwort);
        if (hash instanceof Fehler) return hash;
        const secret = randomBytes(20),
          id = randomUUID();
        const {
          rows: [r],
        } = await db.query("select mfa_vorbereiten($1,$2,$3) as ok", [
          id,
          verschluesseln(key, own.konto_id, secret),
          hash,
        ]);
        if (!r.ok)
          return new Fehler(409, "Einrichtung konnte nicht begonnen werden.");
        const {
          rows: [k],
        } = await db.query(
          "select login_referenz from konto where id=aktuelles_konto()",
        );
        const text = base32(secret);
        const uri = `otpauth://totp/${encodeURIComponent("Timereal:" + k.login_referenz)}?secret=${text}&issuer=Timereal&algorithm=SHA1&digits=6&period=30`;
        return {
          id,
          secret: text,
          qr: await QRCode.toDataURL(uri, {
            errorCorrectionLevel: "M",
            width: 256,
            margin: 4,
          }),
        };
      }),
  );
  app.post<{ Body: { id: string; code: string } }>(
    "/api/v1/mfa/aktivieren",
    {
      schema: {
        body: objekt(
          { id: uuid, code: { type: "string", pattern: "^[0-9]{6}$" } },
          ["id", "code"],
        ),
      },
    },
    async (req, reply) => {
      const result = await web(req, async (db) => {
        const own = await eigenes(db, req.body.id);
        if (own instanceof Fehler) return own;
        const [step] = faktor(
          own,
          { art: "totp", code: req.body.code },
          options.mfaKey,
        );
        const codes = neueCodes(),
          token = sitzung();
        const {
          rows: [r],
        } = await db.query("select mfa_aktivieren($1,$2,$3,$4) as ok", [
          req.body.id,
          step,
          codes.map(codeHash),
          digest(token),
        ]);
        if (!r.ok)
          return new Fehler(
            401,
            "Code ungültig oder bereits verwendet. Bitte den nächsten Code versuchen.",
          );
        return { codes, token };
      });
      return reply
        .header("Set-Cookie", cookie(result.token, 14 * 86400))
        .send({ aktiv: true, codes: result.codes });
    },
  );
  for (const action of ["deaktivieren", "codes"] as const) {
    app.post<{ Body: Faktor & { passwort: string } }>(
      "/api/v1/mfa/" + action,
      {
        schema: {
          body: objekt({ ...faktorSchema, passwort: wort(512) }, [
            "art",
            "code",
            "passwort",
          ]),
        },
      },
      async (req, reply) => {
        const result = await web(req, async (db) => {
          const own = await eigenes(db);
          if (own instanceof Fehler) return own;
          if (!own.geheimnis)
            return new Fehler(
              409,
              "Zwei-Faktor-Anmeldung ist nicht eingeschaltet.",
            );
          const hash = await kennwort(db, req.body.passwort);
          if (hash instanceof Fehler) return hash;
          const [step, recovery] = faktor(own, req.body, options.mfaKey);
          const codes = neueCodes(),
            token = sitzung();
          const {
            rows: [r],
          } = await db.query("select mfa_verwalten($1,$2,$3,$4,$5,$6) as ok", [
            action,
            hash,
            step,
            recovery,
            codes.map(codeHash),
            digest(token),
          ]);
          if (!r.ok)
            return new Fehler(401, "Code ungültig oder bereits verwendet.");
          return { token, codes };
        });
        return reply
          .header("Set-Cookie", cookie(result.token, 14 * 86400))
          .send(
            action === "codes" ? { codes: result.codes } : { aktiv: false },
          );
      },
    );
  }
  app.post<{ Body: Faktor }>(
    "/api/v1/anmeldung/faktor",
    {
      schema: { body: objekt(faktorSchema, ["art", "code"]) },
    },
    async (req, reply) => {
      nurWeb(req);
      const challenge = pruefungToken(req);
      if (!challenge)
        throw new Fehler(401, "Bitte erneut mit dem Passwort anmelden.");
      const token = ergebnis(
        await transaktion(pool, async (db) => {
          const {
            rows: [r],
          } = await db.query<Geheimnis>(
            "select * from mfa_anmeldung_lesen($1)",
            [digest(challenge)],
          );
          if (!r)
            return new Fehler(
              401,
              "Die Anmeldung ist abgelaufen. Bitte erneut beginnen.",
            );
          if (r.gesperrt)
            return new Fehler(
              429,
              "Zu viele Versuche. Bitte nach zehn Minuten erneut versuchen.",
            );
          const [step, recovery] = faktor(r, req.body, options.mfaKey),
            token = sitzung();
          const {
            rows: [done],
          } = await db.query(
            "select mfa_anmeldung_abschliessen($1,$2,$3,$4) as ok",
            [digest(challenge), step, recovery, digest(token)],
          );
          if (!done.ok)
            return new Fehler(401, "Code ungültig oder bereits verwendet.");
          return token;
        }),
      );
      return reply
        .header("Set-Cookie", [
          cookie(token, 14 * 86400),
          mfaCookie("", options.secure, 0),
        ])
        .send({ angemeldet: true });
    },
  );
}
