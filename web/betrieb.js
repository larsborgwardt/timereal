import { systemkonsole } from "./systemkonsole.js";
import { auditOberflaeche } from "./audit.js";
import { mailOberflaeche } from "./mailversand.js";
import { updateFortschritt } from "./betrieb-fortschritt.js";
const prefix = "/verwaltung/betrieb";
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
const titel = {
  vorbereitung: "Update wird vorbereitet",
  bereit: "Bereit zur Installation",
  sicherung: "Datensicherung läuft",
  migration: "Datenbank wird aktualisiert",
  neustart: "Timereal startet neu",
  erfolgreich: "Update abgeschlossen",
  fehlgeschlagen: "Auftrag fehlgeschlagen",
  vorherige_version_aktiv: "Vorherige Version wieder aktiv",
  wiederherstellung_noetig: "Wiederherstellung prüfen",
  pruefung: "Domain wird geprüft",
  geprueft: "Domain übernehmen",
  uebernahme: "Domain wird übernommen",
  bestaetigung_ausstehend: "Neue Adresse wird geprüft",
  abschlusspruefung: "Installation wird geprüft",
  ruecknahme: "Vorheriger Zugang wird wiederhergestellt",
  zurueckgesetzt: "Domainwechsel zurückgenommen",
};

export function betriebsOberflaeche({
  $,
  request,
  verbindungGeprueft,
  kontoname,
}) {
  let bereich = "berater",
    stand = null,
    update = null,
    beschaeftigt = false,
    prueft = false,
    laedt = false,
    generation = 0,
    transportFehler = false,
    letzteNonce = null,
    domainPruefung = false,
    startPruefung = false;
  const konsole = systemkonsole({
    $,
    request,
    sichtbar: () => bereich === "logs" && !$("#verwaltung").hidden,
  });
  const mail = mailOberflaeche({
    $,
    request,
    sichtbar: () => bereich === "mail" && !$("#verwaltung").hidden,
  });
  const audit = auditOberflaeche({
    $,
    request,
    sichtbar: () => bereich === "audit" && !$("#verwaltung").hidden,
  });
  const text = (id, wert) => {
    const el = $("#betrieb-" + id),
      neu = wert ?? "";
    if (el.textContent !== neu) el.textContent = neu;
  };
  function nonceVergessen() {
    letzteNonce = null;
    try {
      sessionStorage.removeItem("timereal-betriebsanfrage");
    } catch {
      /* Sitzungsspeicher kann gesperrt sein. */
    }
  }
  function sperren(id, wert) {
    const el = $("#betrieb-" + id);
    el.disabled = wert;
    if (wert) delete el.dataset.wartet;
  }
  const job = (typ) => stand?.auftraege.find((j) => j.typ === typ);
  function anzeigen() {
    $("#betrieb-berater").hidden = bereich !== "berater";
    $("#betrieb-bereich").hidden = [
      "berater",
      "mail",
      "logs",
      "audit",
    ].includes(bereich);
    $("#betrieb-mail").hidden = bereich !== "mail";
    $("#betrieb-logs").hidden = bereich !== "logs";
    $("#betrieb-audit").hidden = bereich !== "audit";
    for (const name of ["updates", "domain"])
      $("#betrieb-" + name).hidden = bereich !== name;
    document.querySelectorAll("[data-betrieb]").forEach((b) => {
      if (b.dataset.betrieb === bereich) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    const aktiv = stand?.auftraege.some((j) => laufend.has(j.zustand));
    sperren("aktualisieren", prueft);
    $("#betrieb-aktualisieren").setAttribute("aria-busy", String(prueft));
    text("version", stand?.version ? "v" + stand.version : "–");
    text("neu", update?.latestVersion ? "v" + update.latestVersion : "–");
    text(
      "geprueft",
      update?.checkedAt
        ? new Date(update.checkedAt).toLocaleString("de-DE")
        : "Noch nicht geprüft",
    );
    text(
      "updatehinweis",
      update?.status === "disabled"
        ? "Automatische Versionsprüfung ist abgeschaltet."
        : update?.status === "unavailable"
          ? "Versionsprüfung derzeit nicht erreichbar. Bitte später erneut versuchen."
          : update?.updateAvailable
            ? "Ein Klick startet Vorbereitung, Datensicherung und Installation. Beim Neustart ist Timereal kurz nicht erreichbar. Deine Timer bleiben erhalten."
            : "Kein neueres stabiles Release gemeldet.",
    );
    const blockiert = stand?.auftraege.find((j) => laufend.has(j.zustand));
    if (blockiert?.typ === "domain")
      text(
        "updatehinweis",
        blockiert.zustand === "bestaetigung_ausstehend"
          ? "Der neue Domainzugang wird geprüft. Öffne unter Domainzugriff die neue Adresse; dein angemeldeter Zugriff wird automatisch erkannt."
          : blockiert.zustand === "wiederherstellung_noetig"
            ? "Der Domainwechsel benötigt eine Wiederherstellung. Den Hinweis findest du unter Domainzugriff."
            : "Der Domainwechsel läuft. Nach seinem Abschluss sind Updates wieder verfügbar.",
      );
    const link = $("#betrieb-release");
    link.hidden = !update?.releaseUrl;
    if (
      update?.releaseUrl?.startsWith(
        "https://github.com/larsborgwardt/timereal/releases/tag/",
      )
    )
      link.href = update.releaseUrl;
    sperren(
      "vorbereiten",
      beschaeftigt ||
        prueft ||
        !stand ||
        aktiv ||
        !update?.updateAvailable ||
        update?.status !== "ok" ||
        job("update")?.zustand === "bereit",
    );
    text("origin", stand?.origin ?? "–");
    text("proxy", stand?.proxyZiel ?? "–");
    text(
      "domainhinweis",
      stand?.hinweis ??
        "Nach dem Speichern ist Timereal zusätzlich über die Domain erreichbar. Die Anmeldung über die bisherige Adresse im lokalen Netz bleibt möglich.",
    );
    $("#betrieb-domainpruefen button").disabled =
      beschaeftigt || !stand?.domainUnterstuetzt || aktiv;
    if ($("#betrieb-domainpruefen button").disabled)
      delete $("#betrieb-domainpruefen button").dataset.wartet;
    for (const typ of ["update", "domain"]) {
      const j = job(typ);
      $("#betrieb-" + typ + "auftrag").hidden = !j;
      if (!j) continue;
      text(
        typ + "titel",
        typ === "domain" && j.zustand === "erfolgreich"
          ? "Domain eingerichtet"
          : (titel[j.zustand] ?? "Auftragsstand prüfen"),
      );
      text(
        typ + "phase",
        (j.tag
          ? (j.vorherigeVersion ? `v${j.vorherigeVersion} → ` : "") + j.tag
          : "https://" + j.domain) +
          " · " +
          (typ === "update" && j.phase === "pruefung"
            ? "Release wird geprüft"
            : typ === "domain" && j.phase === "erfolgreich"
              ? "Einrichtung abgeschlossen"
              : (titel[j.phase] ?? "Verarbeitung läuft")),
      );
      text(typ + "meldung", j.meldung);
      text(
        typ + "meta",
        `Veranlasst von ${kontoname(j.veranlasstVon ?? j.konto)} · ${new Date(j.aktualisiertAm).toLocaleString("de-DE")}`,
      );
    }
    $("#betrieb-installieren").hidden = job("update")?.zustand !== "bereit";
    const fortschritt = updateFortschritt(job("update"));
    $("#betrieb-fortschritt").hidden =
      !fortschritt || job("update")?.zustand === "bereit";
    if (fortschritt) {
      const balken = $("#betrieb-balken");
      balken.value = fortschritt.abgeschlossen;
      balken.max = fortschritt.gesamt;
      balken.setAttribute(
        "aria-valuetext",
        `${fortschritt.abgeschlossen} von ${fortschritt.gesamt} Schritten abgeschlossen`,
      );
      $("#betrieb-fortschritt").classList.toggle("laeuft", fortschritt.laeuft);
      text(
        "fortschritttext",
        fortschritt.laeuft || job("update")?.zustand === "erfolgreich"
          ? `${fortschritt.text} · Schritt ${fortschritt.schritt} von ${fortschritt.gesamt}`
          : (titel[job("update")?.zustand] ?? "Auftragsstand prüfen"),
      );
    }
    $("#betrieb-uebernehmen").hidden = job("domain")?.zustand !== "geprueft";
    $("#betrieb-bestaetigung").hidden =
      job("domain")?.zustand !== "bestaetigung_ausstehend";
    const d = job("domain");
    if (d?.zustand === "bestaetigung_ausstehend") {
      text(
        "frist",
        `Öffne die neue Adresse innerhalb von drei Minuten. Dein angemeldeter Zugriff wird automatisch erkannt. Bisherige Adresse: ${d.vorherigeOrigin ?? "–"}`,
      );
      $("#betrieb-neueadresse").href =
        "https://" + d.domain + "/#betrieb-domain";
    }
    for (const f of ["installieren", "uebernehmen"])
      $("#betrieb-" + f + " button").disabled = beschaeftigt || aktiv;
    sperren("zurueck", beschaeftigt);
  }
  function fehler(e) {
    text("fehler", e?.message);
    $("#betrieb-fehler").hidden = !e;
  }
  async function laden() {
    if (bereich === "audit") return audit.laden();
    if (bereich === "logs") return konsole.liveLaden();
    if (bereich === "mail") return mail.laden();
    if (bereich === "berater" || $("#verwaltung").hidden || laedt || prueft)
      return;
    const vorher = generation;
    laedt = true;
    try {
      const [s, u] = await Promise.all([
        request(prefix + "/status"),
        request("/updates"),
      ]);
      if (vorher !== generation) return;
      stand = s;
      update = u;
      await verbindungGeprueft();
      if (vorher !== generation) return;
      if (transportFehler) {
        fehler(null);
        transportFehler = false;
      }
      text("status", "Auftragsstand aktualisiert.");
      anzeigen();
      await domainZugriffErkennen(s);
    } catch (e) {
      if (vorher !== generation) return;
      text(
        "status",
        stand
          ? "Verbindung unterbrochen. Letzter bestätigter Stand; erneuter Verbindungsversuch läuft."
          : e.message,
      );
    } finally {
      laedt = false;
    }
  }
  async function domainZugriffErkennen(s) {
    const d = s?.auftraege.find(
      (j) => j.typ === "domain" && j.zustand === "bestaetigung_ausstehend",
    );
    if (
      !d ||
      beschaeftigt ||
      domainPruefung ||
      location.origin !== "https://" + d.domain
    )
      return;
    domainPruefung = true;
    try {
      // Der Server entscheidet über Frist und Berechtigung. Eine abweichende
      // Geräteuhr darf den erreichbaren Zugang nicht blockieren.
      await senden(`/domain/${d.id}/bestaetigen`);
    } finally {
      domainPruefung = false;
    }
  }
  async function aktualisieren() {
    if (bereich !== "updates") return laden();
    if (prueft) return;
    const vorher = ++generation;
    prueft = true;
    fehler(null);
    transportFehler = false;
    text("status", "Neue Version wird geprüft …");
    anzeigen();
    try {
      const u = await request(prefix + "/updates/pruefen", "POST", {});
      if (vorher !== generation) return;
      update = u;
      text(
        "status",
        u.status === "ok"
          ? "Versionsprüfung abgeschlossen."
          : u.status === "disabled"
            ? "Versionsprüfung ist abgeschaltet."
            : "Versionsprüfung fehlgeschlagen. Bitte später erneut versuchen.",
      );
      document.dispatchEvent(new Event("timereal-update-geprueft"));
    } catch (e) {
      if (vorher !== generation) return;
      text("status", "Versionsprüfung nicht durchgeführt.");
      fehler(e);
    } finally {
      if (vorher === generation) {
        prueft = false;
        anzeigen();
      }
    }
  }
  async function senden(pfad, daten = {}) {
    if (beschaeftigt) return;
    beschaeftigt = true;
    fehler(null);
    transportFehler = false;
    anzeigen();
    const signatur = JSON.stringify([
      pfad,
      Object.entries(daten).filter(([k]) => k !== "passwort"),
    ]);
    let nonce = letzteNonce;
    try {
      nonce =
        JSON.parse(sessionStorage.getItem("timereal-betriebsanfrage")) ?? nonce;
    } catch {
      /* beschädigter lokaler Entwurf */
    }
    if (nonce?.signatur !== signatur)
      nonce = { signatur, key: crypto.randomUUID() };
    letzteNonce = nonce;
    // Nur den Auftragsschlüssel ablegen; die Websitzung wird serverseitig geprüft.
    try {
      sessionStorage.setItem("timereal-betriebsanfrage", JSON.stringify(nonce));
    } catch {
      /* In-memory-Schlüssel genügt für diesen Versuch. */
    }
    try {
      const j = await request(prefix + pfad, "POST", daten, nonce.key);
      nonceVergessen();
      if (stand)
        stand.auftraege = [j, ...stand.auftraege.filter((x) => x.id !== j.id)];
      for (const id of ["betrieb-installieren", "betrieb-uebernehmen"])
        $("#" + id).reset();
    } catch (e) {
      if (e.status && e.status < 500) nonceVergessen();
      transportFehler = !e.status || e.status >= 500;
      fehler(e);
    } finally {
      beschaeftigt = false;
      anzeigen();
      await laden();
    }
  }
  document.querySelectorAll("[data-betrieb]").forEach((b) =>
    b.addEventListener("click", () => {
      bereich = b.dataset.betrieb;
      anzeigen();
      if (bereich === "logs") void konsole.laden();
      else if (bereich === "mail") void mail.laden();
      else void laden();
    }),
  );
  $("#betrieb-aktualisieren").onclick = () => void aktualisieren();
  $("#betrieb-vorbereiten").onclick = () =>
    void senden("/updates/starten", { tag: "v" + update.latestVersion });
  $("#betrieb-domainpruefen").onsubmit = (ev) => {
    ev.preventDefault();
    void senden("/domain/speichern", {
      domain: ev.target.elements.domain.value.trim().toLowerCase(),
    });
  };
  for (const [form, typ, pfad] of [
    ["installieren", "update", "updates"],
    ["uebernehmen", "domain", "domain"],
  ]) {
    $("#betrieb-" + form).onsubmit = (ev) => {
      ev.preventDefault();
      const j = job(typ);
      if (j) void senden(`/${pfad}/${j.id}/${form}`);
    };
  }
  $("#betrieb-zurueck").onclick = () =>
    void senden(`/domain/${job("domain").id}/zuruecknehmen`);
  setInterval(() => {
    if (bereich === "audit" || bereich === "mail") return;
    if (bereich === "logs") return konsole.liveLaden();
    if (!$("#verwaltung").hidden && bereich !== "berater") {
      anzeigen();
      void laden();
    }
  }, 2000);
  return {
    laden,
    rolleSetzen(profil) {
      if (!startPruefung && (profil.admin || profil.rolle === "betrieb")) {
        startPruefung = true;
        const vorher = generation;
        void request(prefix + "/status")
          .then((s) => {
            if (vorher === generation) return domainZugriffErkennen(s);
          })
          .catch(() => {
            // Der optionale Betriebsdienst darf die Zeiterfassung nicht blockieren.
            // Seine Fehlermeldung erscheint beim Öffnen der Betriebsverwaltung.
          });
      }
      document.querySelector('[data-betrieb="berater"]').hidden = !profil.admin;
      document.querySelector('[data-betrieb="audit"]').hidden = !profil.admin;
      document.querySelector('[data-betrieb="mail"]').hidden = !profil.admin;
      if (!profil.admin && ["berater", "mail", "audit"].includes(bereich))
        bereich = "updates";
      anzeigen();
    },
    domainOeffnen() {
      bereich = "domain";
      anzeigen();
    },
    zuruecksetzen() {
      konsole.zuruecksetzen();
      audit.zuruecksetzen();
      mail.zuruecksetzen();
      generation++;
      prueft = false;
      startPruefung = false;
      stand = update = null;
      bereich = "berater";
      for (const id of ["domainpruefen", "installieren", "uebernehmen"])
        $("#betrieb-" + id).reset();
      nonceVergessen();
      transportFehler = false;
      fehler(null);
      anzeigen();
    },
  };
}
