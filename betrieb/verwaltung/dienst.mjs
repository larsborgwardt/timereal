import { createServer } from "node:http";
import { chmod, lstat, unlink } from "node:fs/promises";
import {
  Auftragsbuch,
  Betriebsfehler,
  oeffentlicherAuftrag,
} from "./auftraege.mjs";
import { betriebssperre } from "./system.mjs";

const laufend = new Set([
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

export async function dienstStarten(options) {
  const protokoll =
    options.protokoll ??
    ((level, msg) =>
      console.log(JSON.stringify({ timereal_log: 1, level, msg })));
  function ergebnisProtokoll(job) {
    const ergebnisse = {
      bereit: ["success", "Update zur Installation bereit."],
      geprueft: ["success", "Domainprüfung abgeschlossen."],
      erfolgreich: [
        "complete",
        job.typ === "update" ? "Update abgeschlossen." : "Domain eingerichtet.",
      ],
      fehlgeschlagen: ["error", "Betriebsauftrag fehlgeschlagen."],
      vorherige_version_aktiv: ["warn", "Vorherige Version wieder aktiv."],
      wiederherstellung_noetig: [
        "fatal",
        "Betriebsauftrag benötigt Wiederherstellung.",
      ],
      bestaetigung_ausstehend: [
        "info",
        "Domain übernommen; Zugriffsbestätigung ausstehend.",
      ],
      zurueckgesetzt: [
        "warn",
        job.meldung?.startsWith("Domainwechsel zurückgenommen.")
          ? job.meldung
          : "Domainwechsel zurückgenommen." +
            (job.meldung ? " " + job.meldung : ""),
      ],
    };
    const eintrag = ergebnisse[job.zustand];
    if (eintrag) protokoll(...eintrag);
  }
  const buch = await Auftragsbuch.oeffnen(options.verzeichnis);
  const sperren = new Map(),
    arbeiten = new Set();
  let annahmen = Promise.resolve(),
    schliesst = false,
    intervall;
  async function freigeben(id) {
    const handle = sperren.get(id);
    sperren.delete(id);
    if (handle) await handle.close();
  }
  async function ausfuehren(aktion, job) {
    protokoll(
      "info",
      job.typ === "update"
        ? "Updateauftrag wird ausgeführt."
        : "Domainauftrag wird ausgeführt.",
    );
    try {
      await options.ausfuehren(aktion, job, buch, sperren.get(job.id));
    } catch (error) {
      const aktuell = buch.lesen(job.id);
      if (laufend.has(aktuell.zustand))
        await buch.fortschreiben(job.id, {
          zustand:
            !(error instanceof Betriebsfehler) &&
            [
              "uebernahme",
              "ruecknahme",
              "sicherung",
              "migration",
              "neustart",
              "wiederherstellung_noetig",
            ].includes(aktuell.zustand)
              ? "wiederherstellung_noetig"
              : "fehlgeschlagen",
          meldung:
            error instanceof Betriebsfehler
              ? error.message
              : "Betriebsaktion fehlgeschlagen. Dienstprotokoll im Container prüfen.",
        });
      console.error(
        "Betriebsauftrag fehlgeschlagen",
        job.id,
        error.code ?? error.name,
      );
    } finally {
      ergebnisProtokoll(buch.lesen(job.id));
      if (buch.lesen(job.id).zustand !== "bestaetigung_ausstehend")
        await freigeben(job.id);
    }
  }
  function starten(aktion, job) {
    const arbeit = ausfuehren(aktion, job);
    arbeiten.add(arbeit);
    arbeit
      .finally(() => arbeiten.delete(arbeit))
      .catch((e) =>
        console.error("Auftragsspeicher nicht beschreibbar", e.code ?? e.name),
      );
  }
  // Unterbrochene Aktionen werden vor der ersten neuen Annahme am realen System abgeglichen.
  for (const job of buch.liste().filter((j) => laufend.has(j.zustand))) {
    sperren.set(job.id, await betriebssperre(options.lockPath));
    try {
      await options.wiederherstellen(job, buch, sperren.get(job.id));
      ergebnisProtokoll(buch.lesen(job.id));
    } finally {
      if (buch.lesen(job.id).zustand !== "bestaetigung_ausstehend")
        await freigeben(job.id);
    }
  }
  async function annehmen(anfrage) {
    const bekannt = buch.wiederholung(anfrage);
    if (bekannt) return oeffentlicherAuftrag(bekannt);
    if (schliesst)
      throw new Betriebsfehler(
        "BELEGT",
        "Betriebsdienst startet neu. Bitte erneut versuchen.",
      );
    let handle = anfrage.jobId ? sperren.get(anfrage.jobId) : null;
    const neu = !handle;
    handle ??= await betriebssperre(options.lockPath);
    try {
      const { auftrag, neu: angenommen } = await buch.annehmen(anfrage);
      sperren.set(auftrag.id, handle);
      if (angenommen) setImmediate(() => starten(anfrage.aktion, auftrag));
      else if (neu) await freigeben(auftrag.id);
      return oeffentlicherAuftrag(auftrag);
    } catch (error) {
      if (neu) await handle.close();
      throw error;
    }
  }
  const server = createServer(
    { requestTimeout: 5000, headersTimeout: 5000, maxHeaderSize: 8192 },
    async (req, res) => {
      res.setHeader("content-type", "application/json");
      try {
        if (req.method !== "POST" || req.url !== "/")
          throw new Betriebsfehler("EINGABE", "Ungültiges Betriebsprotokoll.");
        const teile = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16384)
            throw new Betriebsfehler("EINGABE", "Auftrag ist zu groß.");
          teile.push(chunk);
        }
        let data;
        try {
          data = JSON.parse(Buffer.concat(teile).toString());
        } catch {
          throw new Betriebsfehler("EINGABE", "Ungültiger Auftrag.");
        }
        let antwort;
        if (data?.aktion === "status" && Object.keys(data).length === 1)
          antwort = {
            erreichbar: true,
            ...(await options.status()),
            auftraege: buch
              .liste()
              .slice(-20)
              .reverse()
              .map(oeffentlicherAuftrag),
          };
        else if (
          data?.aktion === "logs" &&
          Object.keys(data).every((k) => ["aktion", "filter"].includes(k))
        ) {
          if (!options.journal)
            throw new Betriebsfehler(
              "JOURNAL",
              "Systemkonsole benötigt einen aktuellen Betriebsdienst.",
            );
          antwort = await options.journal(data.filter);
        } else if (
          data?.aktion === "auftrag" &&
          Object.keys(data).every((k) => ["aktion", "id"].includes(k))
        )
          antwort = oeffentlicherAuftrag(buch.lesen(data.id));
        else if (
          data?.aktion === "annehmen" &&
          Object.keys(data).every((k) => ["aktion", "anfrage"].includes(k))
        ) {
          const auftrag = annahmen.then(() => annehmen(data.anfrage));
          annahmen = auftrag.catch(() => {});
          antwort = await auftrag;
        } else if (
          ["mail-lesen", "mail-speichern", "mail-test"].includes(data?.aktion)
        ) {
          if (!options.mail)
            throw new Betriebsfehler(
              "ZUSTAND",
              "Mailversand benötigt einen aktuellen Betriebsdienst.",
            );
          antwort = await options.mail(data);
        } else
          throw new Betriebsfehler("EINGABE", "Unbekannter Betriebsauftrag.");
        res.end(JSON.stringify(antwort));
      } catch (error) {
        const bekannt = error instanceof Betriebsfehler;
        res.writeHead(bekannt ? 400 : 503);
        res.end(
          JSON.stringify({
            code: bekannt ? error.code : "DIENST",
            fehler: bekannt
              ? error.message
              : "Betriebsdienst ist nicht bereit. Dienstprotokoll prüfen.",
          }),
        );
      }
    },
  );
  server.maxConnections = 32;
  try {
    const old = await lstat(options.socketPath);
    if (!old.isSocket() || old.uid !== process.getuid())
      throw new Error("Socketpfad ist durch eine fremde Datei belegt.");
    await unlink(options.socketPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.socketPath, resolve);
  });
  await chmod(options.socketPath, 0o660);
  intervall = setInterval(() => {
    const lauf = annahmen.then(async () => {
      if (schliesst) return;
      for (const job of buch.liste()) {
        if (job.zustand !== "bestaetigung_ausstehend" || job.frist > Date.now())
          continue;
        const geaendert = await buch.fortschreiben(
          job.id,
          { zustand: "ruecknahme", phase: "ruecknahme" },
          "bestaetigung_ausstehend",
        );
        if (geaendert) starten("domain-zuruecknehmen", geaendert);
      }
    });
    annahmen = lauf.catch((e) =>
      console.error("Fristprüfung fehlgeschlagen", e.code ?? e.name),
    );
  }, 1000);
  return {
    buch,
    async ausstehend() {
      await annahmen;
      await new Promise((r) => setImmediate(r));
      await Promise.all([...arbeiten]);
    },
    async schliessen() {
      if (schliesst) return;
      schliesst = true;
      clearInterval(intervall);
      await new Promise((resolve) => server.close(resolve));
      await annahmen;
      await new Promise((r) => setImmediate(r));
      await Promise.all([...arbeiten]);
      for (const id of sperren.keys()) await freigeben(id);
    },
  };
}
