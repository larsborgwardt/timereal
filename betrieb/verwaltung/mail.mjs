import { lstat, readFile, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Betriebsfehler } from "./auftraege.mjs";
import { betriebssperre } from "./system.mjs";

const email = /^[^\s@<>,;\r\n]+@[^\s@<>,;\r\n]+\.[^\s@<>,;\r\n]+$/;
const ungueltig = () =>
  new Betriebsfehler(
    "EINGABE",
    "Ungültige Mailkonfiguration. Eingaben prüfen.",
  );
function objekt(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw ungueltig();
}
function konfiguration(value) {
  objekt(value, ["host", "port", "secure", "from", "user", "password"]);
  if (
    typeof value.host !== "string" ||
    !/^[a-zA-Z0-9.:-]{1,253}$/.test(value.host) ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535 ||
    typeof value.secure !== "boolean" ||
    typeof value.from !== "string" ||
    value.from.length > 254 ||
    !email.test(value.from) ||
    (value.user !== undefined &&
      (typeof value.user !== "string" ||
        value.user.length > 320 ||
        /[\r\n\0]/.test(value.user))) ||
    (value.password !== undefined &&
      (typeof value.password !== "string" ||
        value.password.length > 2048 ||
        /[\r\n\0]/.test(value.password)))
  )
    throw ungueltig();
  return value;
}

/** Fester Dateipfad vom Dienststart; kein Pfad und kein TLS-Override aus HTTP. */
export function mailVerwaltung({
  datei,
  lockPath,
  maildienst,
  gruppe = process.getgid(),
}) {
  async function lesen() {
    let info;
    try {
      info = await lstat(datei, { bigint: true });
    } catch (e) {
      if (e.code === "ENOENT") return { version: "leer", config: null };
      throw e;
    }
    if (!info.isFile() || info.size > 16384n)
      throw new Betriebsfehler(
        "ZUSTAND",
        "Mailkonfiguration ist nicht lesbar. Betreiber muss die Datei prüfen.",
      );
    const config = konfiguration(JSON.parse(await readFile(datei, "utf8")));
    return { version: `${info.ino}-${info.mtimeNs}-${info.ctimeNs}`, config };
  }
  function oeffentlich({ version, config }) {
    return {
      version,
      konfiguriert: !!config,
      host: config?.host ?? "",
      port: config?.port ?? 587,
      secure: config?.secure ?? false,
      from: config?.from ?? "",
      user: config?.user ?? "",
      passwortGesetzt: !!config?.password,
    };
  }
  return async function mailAktion(data) {
    objekt(
      data,
      data?.aktion === "mail-lesen" ? ["aktion"] : ["aktion", "daten"],
    );
    if (!["mail-lesen", "mail-speichern", "mail-test"].includes(data.aktion))
      throw ungueltig();
    if (data.aktion === "mail-lesen") return oeffentlich(await lesen());
    objekt(
      data.daten,
      data.aktion === "mail-test"
        ? ["email", "version"]
        : ["host", "port", "secure", "from", "user", "password", "version"],
    );
    if (
      typeof data.daten.version !== "string" ||
      data.daten.version.length > 150
    )
      throw ungueltig();
    const lock = await betriebssperre(lockPath);
    try {
      const vorher = await lesen();
      if (vorher.version !== data.daten.version)
        throw new Betriebsfehler(
          "KONFLIKT",
          "Die Mailkonfiguration wurde inzwischen geändert. Aktuellen Stand laden.",
        );
      if (data.aktion === "mail-test") {
        if (
          typeof data.daten.email !== "string" ||
          data.daten.email.length > 254 ||
          !email.test(data.daten.email)
        )
          throw ungueltig();
        if (!vorher.config)
          throw new Betriebsfehler("ZUSTAND", "Mailversand zuerst einrichten.");
        try {
          await maildienst(vorher.config).senden(data.daten.email, "test", "");
        } catch {
          throw new Betriebsfehler(
            "SMTP",
            "Testmail konnte nicht versendet werden. Empfänger und Mailkonfiguration prüfen.",
          );
        }
        return { angenommen: true };
      }
      const { version, ...eingabe } = data.daten;
      const neu = konfiguration(eingabe);
      if (neu.user && !neu.password) {
        if (
          !vorher.config?.password ||
          ["host", "port", "secure", "user"].some(
            (k) => vorher.config[k] !== neu[k],
          )
        )
          throw new Betriebsfehler(
            "EINGABE",
            "SMTP-Passwort für diese Verbindung erneut eingeben.",
          );
        neu.password = vorher.config.password;
      }
      if (!neu.user) {
        delete neu.user;
        delete neu.password;
      }
      try {
        await maildienst(neu).pruefen();
      } catch {
        throw new Betriebsfehler(
          "SMTP",
          "SMTP-Prüfung fehlgeschlagen. Server, Port, TLS und Zugangsdaten prüfen. Bisherige Einstellungen bleiben erhalten.",
        );
      }
      const temp = datei + "." + randomUUID() + ".next";
      try {
        const file = await open(temp, "wx", 0o600);
        try {
          await file.writeFile(JSON.stringify(neu, null, 2) + "\n");
          await file.chown(process.getuid(), gruppe);
          await file.chmod(0o640);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temp, datei);
        const dir = await open(dirname(datei), "r");
        try {
          await dir.sync();
        } finally {
          await dir.close();
        }
      } finally {
        await unlink(temp).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
      return oeffentlich(await lesen());
    } finally {
      await lock.close();
    }
  };
}
