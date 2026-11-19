import { systemkonsole } from "./systemkonsole.js";
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
  bestaetigung_ausstehend: "Neue Adresse bestätigen",
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
    letzteNonce = null;
  const konsole = systemkonsole({
    $,
    request,
    sichtbar: () => bereich === "logs" && !$("#verwaltung").hidden,
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
    $("#betrieb-bereich").hidden = ["berater", "logs"].includes(bereich);
    $("#betrieb-logs").hidden = bereich !== "logs";
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
            ? "Bereite das Update vor. Timereal bleibt dabei erreichbar."
            : "Kein neueres stabiles Release gemeldet.",
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
        "Ohne Bestätigung über die neue Adresse kehrt Timereal automatisch zum bisherigen Zugang zurück.",
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
          (titel[j.phase] ?? "Verarbeitung läuft"),
      );
      text(typ + "meldung", j.meldung);
      text(
        typ + "meta",
        `Veranlasst von ${kontoname(j.veranlasstVon ?? j.konto)} · ${new Date(j.aktualisiertAm).toLocaleString("de-DE")}`,
      );
    }
    $("#betrieb-installieren").hidden = job("update")?.zustand !== "bereit";
    $("#betrieb-uebernehmen").hidden = job("domain")?.zustand !== "geprueft";
    $("#betrieb-bestaetigung").hidden =
      job("domain")?.zustand !== "bestaetigung_ausstehend";
    const d = job("domain");
    if (d?.zustand === "bestaetigung_ausstehend") {
      const rest = Math.max(0, Math.ceil((d.frist - Date.now()) / 1000));
      text(
        "frist",
        `Bestätigung ausstehend · noch ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}. Bisherige Adresse: ${d.vorherigeOrigin ?? "–"}`,
      );
      $("#betrieb-neueadresse").href =
        "https://" + d.domain + "/#betrieb-domain";
      sperren(
        "bestaetigen",
        beschaeftigt || location.origin !== "https://" + d.domain || rest === 0,
      );
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
    if (bereich === "logs") return konsole.liveLaden();
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
    // Niemals Passwörter ablegen; der Server prüft sie bei jedem Versuch frisch.
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
      else void laden();
    }),
  );
  $("#betrieb-aktualisieren").onclick = () => void aktualisieren();
  $("#betrieb-vorbereiten").onclick = () =>
    void senden("/updates/vorbereiten", { tag: "v" + update.latestVersion });
  $("#betrieb-domainpruefen").onsubmit = (ev) => {
    ev.preventDefault();
    void senden("/domain/pruefen", {
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
      if (j)
        void senden(`/${pfad}/${j.id}/${form}`, {
          passwort: ev.target.elements.passwort.value,
        });
    };
  }
  $("#betrieb-bestaetigen").onclick = () =>
    void senden(`/domain/${job("domain").id}/bestaetigen`);
  $("#betrieb-zurueck").onclick = () =>
    void senden(`/domain/${job("domain").id}/zuruecknehmen`);
  setInterval(() => {
    if (bereich === "logs") return konsole.liveLaden();
    if (!$("#verwaltung").hidden && bereich !== "berater") {
      anzeigen();
      void laden();
    }
  }, 2000);
  return {
    laden,
    domainOeffnen() {
      bereich = "domain";
      anzeigen();
    },
    zuruecksetzen() {
      konsole.zuruecksetzen();
      generation++;
      prueft = false;
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
