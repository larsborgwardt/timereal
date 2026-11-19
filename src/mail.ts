import nodemailer from "nodemailer";
import { Fehler } from "./db.js";
export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user?: string;
  password?: string;
}
export function maildienst(config?: MailConfig) {
  if (
    config &&
    (!config.host ||
      !Number.isInteger(config.port) ||
      config.port < 1 ||
      config.port > 65535 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.from))
  )
    throw new Error("Ungültige SMTP-Konfiguration");
  const local =
    config && ["127.0.0.1", "::1", "localhost"].includes(config.host);
  const transport =
    config &&
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !local && !config.secure,
      ignoreTLS: !!local && !config.secure,
      auth: config.user
        ? { user: config.user, pass: config.password }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  return {
    konfiguriert: !!transport,
    async pruefen() {
      if (!transport) throw new Error("SMTP fehlt");
      await transport.verify();
    },
    async senden(email: string, typ: "einladung" | "reset", url: string) {
      if (!transport || !config)
        throw new Fehler(503, "Mailversand ist noch nicht eingerichtet.");
      try {
        const result = await transport.sendMail({
          from: config.from,
          to: email,
          subject:
            typ === "einladung"
              ? "Deine Einladung zu Timereal"
              : "Timereal: Passwort zurücksetzen",
          text:
            (typ === "einladung"
              ? "Du wurdest zu Timereal eingeladen. Lege dein eigenes Passwort fest. Der Link gilt 48 Stunden."
              : "Setze dein Timereal-Passwort zurück. Der Link gilt 30 Minuten.") +
            "\n\n" +
            url +
            "\n\nWenn du diese Nachricht nicht erwartet hast, kannst du sie ignorieren.",
        });
        if (!result.accepted?.length || result.rejected?.length)
          throw new Error("Empfänger abgelehnt");
      } catch {
        throw new Fehler(
          502,
          "Die Nachricht konnte nicht versendet werden. Bitte die Mailkonfiguration prüfen und erneut senden.",
        );
      }
    },
  };
}
