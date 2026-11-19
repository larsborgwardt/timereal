import { open, mkdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export class Betriebsfehler extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fehler = (code, message) => {
  throw new Betriebsfehler(code, message);
};
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const tag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const domainMuster =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9]([a-z0-9-]{0,57}[a-z0-9])?)$/;
const aktiv = new Set([
  "vorbereitung",
  "pruefung",
  "sicherung",
  "migration",
  "neustart",
  "uebernahme",
  "bestaetigung_ausstehend",
  "ruecknahme",
  "wiederherstellung_noetig",
]);
const zustaende = new Set([
  ...aktiv,
  "bereit",
  "geprueft",
  "erfolgreich",
  "fehlgeschlagen",
  "vorherige_version_aktiv",
  "zurueckgesetzt",
  "wiederherstellung_noetig",
]);
const aktionen = {
  "update-vorbereiten": ["update", null, "vorbereitung", "tag"],
  "update-installieren": ["update", "bereit", "sicherung", null],
  "domain-pruefen": ["domain", null, "pruefung", "domain"],
  "domain-uebernehmen": ["domain", "geprueft", "uebernahme", null],
  "domain-bestaetigen": [
    "domain",
    "bestaetigung_ausstehend",
    "erfolgreich",
    "origin",
  ],
  "domain-zuruecknehmen": [
    "domain",
    "bestaetigung_ausstehend",
    "ruecknahme",
    null,
  ],
};

function validieren(a) {
  if (
    !a ||
    typeof a !== "object" ||
    Array.isArray(a) ||
    Object.keys(a).some(
      (k) => !["aktion", "konto", "schluessel", "daten", "jobId"].includes(k),
    ) ||
    !Object.hasOwn(aktionen, a.aktion) ||
    !/^[1-9][0-9]{0,17}$/.test(a.konto) ||
    typeof a.konto !== "string" ||
    !uuid.test(a.schluessel) ||
    !a.daten ||
    typeof a.daten !== "object" ||
    Array.isArray(a.daten)
  )
    fehler("EINGABE", "Ungültiger Betriebsauftrag.");
  const [, vorher, , feld] = aktionen[a.aktion];
  if (
    (vorher && !uuid.test(a.jobId)) ||
    (!vorher && a.jobId !== undefined) ||
    Object.keys(a.daten).some((k) => k !== feld) ||
    (feld && typeof a.daten[feld] !== "string")
  )
    fehler("EINGABE", "Ungültige Auftragsdaten.");
  if (feld === "tag" && (a.daten.tag.length > 60 || !tag.test(a.daten.tag)))
    fehler("EINGABE", "Eine stabile Version ist erforderlich.");
  if (
    feld === "domain" &&
    (a.daten.domain.length > 253 || !domainMuster.test(a.daten.domain))
  )
    fehler("EINGABE", "Domain ohne Protokoll, Port oder Pfad angeben.");
  if (feld === "origin" && a.daten.origin.length > 270)
    fehler("EINGABE", "Ungültiger Ursprung.");
}

/** Synchronisation vor der Antwort, auch für das Verzeichnis der atomaren Umbenennung. */
export async function dauerhaftSchreiben(pfad, wert) {
  const tmp = pfad + "." + randomUUID();
  const handle = await open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(wert) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, pfad);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
  const dir = await open(join(pfad, ".."), "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

export class Auftragsbuch {
  #bestand;
  #pfad;
  #kette = Promise.resolve();
  #defekt = false;
  static async oeffnen(verzeichnis) {
    await mkdir(verzeichnis, { recursive: true, mode: 0o700 });
    const buch = new Auftragsbuch();
    buch.#pfad = join(verzeichnis, "auftraege.json");
    try {
      buch.#bestand = JSON.parse(await readFile(buch.#pfad, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      buch.#bestand = { format: 1, auftraege: [], anfragen: [] };
      await dauerhaftSchreiben(buch.#pfad, buch.#bestand);
    }
    const b = buch.#bestand;
    if (
      b.format !== 1 ||
      !Array.isArray(b.auftraege) ||
      !Array.isArray(b.anfragen) ||
      b.auftraege.some((j) => !uuid.test(j.id) || !zustaende.has(j.zustand))
    )
      throw new Error(
        "Auftragsbestand ist ungültig. Keine automatische Ersetzung.",
      );
    return buch;
  }
  #seriell(fn) {
    const lauf = this.#kette.then(async () => {
      if (this.#defekt)
        throw new Error("Auftragsspeicher muss geprüft werden.");
      return fn();
    });
    this.#kette = lauf.catch(() => {});
    return lauf;
  }
  async #speichern(b) {
    try {
      await dauerhaftSchreiben(this.#pfad, b);
      this.#bestand = b;
    } catch (error) {
      this.#defekt = true;
      throw error;
    }
  }
  lesen(id) {
    const gefunden = this.#bestand.auftraege.find((j) => j.id === id);
    if (!gefunden) fehler("FEHLT", "Auftrag nicht gefunden.");
    return structuredClone(gefunden);
  }
  liste() {
    return structuredClone(this.#bestand.auftraege);
  }
  wiederholung(a) {
    validieren(a);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          a.aktion,
          a.jobId ?? null,
          Object.entries(a.daten).sort(),
        ]),
      )
      .digest("hex");
    const bekannt = this.#bestand.anfragen.find(
      (r) => r.konto === a.konto && r.schluessel === a.schluessel,
    );
    if (!bekannt) return null;
    if (bekannt.fingerprint !== fingerprint)
      fehler(
        "KONFLIKT",
        "Auftragsschlüssel wurde bereits mit anderen Daten verwendet.",
      );
    return this.lesen(bekannt.id);
  }
  annehmen(a) {
    return this.#seriell(async () => {
      validieren(a);
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            a.aktion,
            a.jobId ?? null,
            Object.entries(a.daten).sort(),
          ]),
        )
        .digest("hex");
      const bekannt = this.#bestand.anfragen.find(
        (r) => r.konto === a.konto && r.schluessel === a.schluessel,
      );
      if (bekannt) {
        if (bekannt.fingerprint !== fingerprint)
          fehler(
            "KONFLIKT",
            "Auftragsschlüssel wurde bereits mit anderen Daten verwendet.",
          );
        return { neu: false, auftrag: this.lesen(bekannt.id) };
      }
      const [typ, vorher, zustand] = aktionen[a.aktion];
      const b = structuredClone(this.#bestand);
      let job = a.jobId ? b.auftraege.find((j) => j.id === a.jobId) : null;
      if (vorher && (!job || job.typ !== typ || job.zustand !== vorher))
        fehler(
          "ZUSTAND",
          "Dieser Schritt passt nicht zum aktuellen Auftragsstand.",
        );
      if (a.aktion === "domain-bestaetigen") {
        if (a.daten.origin !== "https://" + job.domain)
          fehler("HERKUNFT", "Zugriff über die neue Domain bestätigen.");
        if (!Number.isFinite(job.frist) || job.frist <= Date.now())
          fehler("ZUSTAND", "Bestätigungsfrist ist abgelaufen.");
      }
      if (b.auftraege.some((j) => aktiv.has(j.zustand) && j.id !== job?.id))
        fehler("BELEGT", "Eine andere Betriebsaktion läuft bereits.");
      // Grenzen verweigern neue Aufträge laut; kein stilles Vergessen von Idempotenzschlüsseln.
      if (b.anfragen.length >= 10000 || (!job && b.auftraege.length >= 2000))
        fehler(
          "VOLL",
          "Auftragsspeicher ist voll. Aufbewahrung im Betrieb prüfen.",
        );
      const jetzt = new Date().toISOString();
      if (!job) {
        job = {
          id: randomUUID(),
          typ,
          konto: a.konto,
          erstelltAm: jetzt,
          ...a.daten,
        };
        b.auftraege.push(job);
      }
      Object.assign(job, {
        zustand,
        phase: zustand,
        aktualisiertAm: jetzt,
        veranlasstVon: a.konto,
      });
      b.anfragen.push({
        konto: a.konto,
        schluessel: a.schluessel,
        fingerprint,
        id: job.id,
      });
      await this.#speichern(b);
      return { neu: true, auftrag: structuredClone(job) };
    });
  }
  fortschreiben(id, werte, erwartet) {
    return this.#seriell(async () => {
      const b = structuredClone(this.#bestand);
      const job = b.auftraege.find((j) => j.id === id);
      if (!job) fehler("FEHLT", "Auftrag nicht gefunden.");
      if (erwartet && job.zustand !== erwartet) return null;
      if (werte.zustand && !zustaende.has(werte.zustand))
        throw new Error("Unbekannter Auftragszustand.");
      Object.assign(job, werte, { aktualisiertAm: new Date().toISOString() });
      await this.#speichern(b);
      return structuredClone(job);
    });
  }
}

export function oeffentlicherAuftrag(job) {
  const ausgabe = {};
  for (const key of [
    "id",
    "typ",
    "konto",
    "veranlasstVon",
    "erstelltAm",
    "aktualisiertAm",
    "zustand",
    "phase",
    "tag",
    "domain",
    "vorherigeVersion",
    "vorherigeOrigin",
    "proxyZiel",
    "frist",
    "meldung",
  ])
    if (job[key] !== undefined) ausgabe[key] = job[key];
  return ausgabe;
}
