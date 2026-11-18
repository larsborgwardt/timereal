import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { objekt, token, type Privat } from "./http.js";
import { Fehler, transaktion } from "./db.js";
import { digest } from "./session.js";
const manifest = JSON.parse(
  readFileSync(
    new URL("../erweiterung/manifest.json", import.meta.url),
    "utf8",
  ),
);
export const extensionId = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
export const extensionOrigin = "chrome-extension://" + extensionId;
export const extensionRedirect =
  "https://" + extensionId + ".chromiumapp.org/timereal";
export function extensionCors(req: FastifyRequest, reply: FastifyReply) {
  if (req.headers.origin === extensionOrigin) {
    reply
      .header("Access-Control-Allow-Origin", extensionOrigin)
      .header("Vary", "Origin");
    if (req.method === "OPTIONS") {
      if (
        !["GET", "POST", "PATCH", "DELETE"].includes(
          req.headers["access-control-request-method"] ?? "",
        )
      )
        throw new Fehler(403, "Methode nicht zugelassen.");
      const headers = (req.headers["access-control-request-headers"] ?? "")
        .toLowerCase()
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (
        headers.some(
          (x) =>
            !["authorization", "content-type", "idempotency-key"].includes(x),
        )
      )
        throw new Fehler(403, "Anfrageheader nicht zugelassen.");
      return reply
        .header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE")
        .header(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, Idempotency-Key",
        )
        .code(204)
        .send();
    }
  } else if (req.method === "OPTIONS")
    throw new Fehler(403, "Herkunft nicht zugelassen.");
}
export function erweiterungRouten(
  app: FastifyInstance,
  pool: Pool,
  privat: Privat,
  webToken: (req: FastifyRequest) => string,
) {
  const redirect = { type: "string", const: extensionRedirect };
  app.post<{ Body: { challenge: string; state: string; redirect: string } }>(
    "/api/v1/erweiterung/freigabe",
    {
      schema: {
        body: objekt(
          {
            challenge: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
            state: { type: "string", pattern: "^[A-Za-z0-9_-]{32,128}$" },
            redirect,
          },
          ["challenge", "state", "redirect"],
        ),
      },
    },
    (req) => {
      if (req.headers.authorization)
        throw new Fehler(
          403,
          "Bitte die Erweiterung über eine Web-Anmeldung verbinden.",
        );
      return privat(req, async (db) => {
        const code = randomBytes(32).toString("hex");
        await db.query(
          "delete from erweiterungscode where ablauf<clock_timestamp() or verbraucht_am is not null",
        );
        await db.query(
          "insert into erweiterungscode(code_hash,konto_id,quelle,challenge,redirect) values($1,aktuelles_konto(),$2,$3,$4)",
          [
            digest(code),
            digest(webToken(req)),
            req.body.challenge,
            req.body.redirect,
          ],
        );
        return {
          weiter:
            extensionRedirect +
            "?" +
            new URLSearchParams({ code, state: req.body.state }).toString(),
        };
      });
    },
  );
  app.post<{ Body: { code: string; verifier: string; redirect: string } }>(
    "/api/v1/erweiterung/token",
    {
      schema: {
        body: objekt(
          {
            code: token,
            verifier: { type: "string", pattern: "^[A-Za-z0-9._~-]{43,128}$" },
            redirect,
          },
          ["code", "verifier", "redirect"],
        ),
      },
    },
    (req) =>
      transaktion(pool, async (db) => {
        const token = randomBytes(32).toString("hex"),
          challenge = createHash("sha256")
            .update(req.body.verifier)
            .digest("base64url");
        const {
          rows: [r],
        } = await db.query("select erweiterung_anmelden($1,$2,$3,$4) as ok", [
          digest(req.body.code),
          challenge,
          req.body.redirect,
          digest(token),
        ]);
        if (!r.ok)
          throw new Fehler(
            401,
            "Anmeldung abgelaufen oder ungültig. Bitte erneut verbinden.",
          );
        return { token };
      }),
  );
}
