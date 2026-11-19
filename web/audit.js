const rollen = {
  berater: "Berater",
  betrieb: "Betrieb",
  administrator: "Administrator",
};

export function auditOberflaeche({ $, request, sichtbar }) {
  const form = $("#audit-filter"),
    liste = $("#audit-liste");
  let filter = {},
    eintraege = [],
    naechste = null,
    zeitzone = "Europe/Berlin";
  let geladen = false,
    laedt = false,
    exportiert = false,
    generation = 0,
    nochmal = false;
  const text = (id, wert) => {
    const el = $("#audit-" + id);
    if (el.textContent !== wert) el.textContent = wert;
  };
  function sperren(id, wert) {
    const el = $("#audit-" + id);
    el.disabled = wert;
    if (wert) delete el.dataset.wartet;
  }
  function status() {
    sperren("filtern", laedt);
    sperren("laden", laedt);
    sperren("mehr", laedt || !naechste);
    sperren("download", laedt || exportiert || !geladen);
    liste.setAttribute("aria-busy", String(laedt));
  }
  function fehler(e) {
    text(
      "fehler",
      e
        ? e.message +
            (eintraege.length ? " Die bisherige Auswahl bleibt sichtbar." : "")
        : "",
    );
    $("#audit-fehler").hidden = !e;
  }
  function anzeigen() {
    const fragment = document.createDocumentFragment();
    for (const e of eintraege) {
      const li = document.createElement("li"),
        zeit = document.createElement("time"),
        titel = document.createElement("strong"),
        beschreibung = document.createElement("p");
      zeit.dateTime = e.zeit;
      zeit.textContent = new Date(e.zeit).toLocaleString("de-DE", {
        timeZone: zeitzone,
      });
      titel.textContent = e.ereignis;
      beschreibung.textContent =
        e.akteur +
        " → " +
        e.ziel +
        (e.vorher
          ? " · " + rollen[e.vorher] + " zu " + rollen[e.nachher]
          : "") +
        (e.kanal
          ? " · " + (e.kanal === "web" ? "Browser" : "Browsererweiterung")
          : "");
      li.append(zeit, titel, beschreibung);
      fragment.append(li);
    }
    liste.replaceChildren(fragment);
    $("#audit-leer").hidden = eintraege.length > 0;
    text("status", `${eintraege.length} Ereignisse · Zeitzone ${zeitzone}`);
  }
  async function laden({ mehr = false, erneut = false } = {}) {
    if (!sichtbar() || (!mehr && !erneut && geladen)) return;
    if (laedt) {
      nochmal = true;
      return;
    }
    const vorher = generation;
    laedt = true;
    status();
    fehler(null);
    const hinweis = setTimeout(() => {
      if (vorher === generation && sichtbar())
        text("status", "Ereignisse werden geladen …");
    }, 300);
    try {
      const params = new URLSearchParams(filter);
      if (mehr && naechste) params.set("vor", naechste);
      const neu = await request("/verwaltung/audit?" + params);
      if (vorher !== generation || !sichtbar()) return;
      eintraege = mehr ? [...eintraege, ...neu.eintraege] : neu.eintraege;
      naechste = neu.naechsteSeite;
      zeitzone = neu.zeitzone;
      geladen = true;
      anzeigen();
    } catch (e) {
      if (vorher === generation && sichtbar()) {
        fehler(e);
        text("status", "Abruf fehlgeschlagen.");
      }
    } finally {
      clearTimeout(hinweis);
      laedt = false;
      status();
      if (nochmal) {
        nochmal = false;
        void laden({ erneut: true });
      }
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    filter = {};
    for (const name of ["von", "bis", "suche"]) {
      const wert = form.elements[name].value.trim();
      if (wert) filter[name] = wert;
    }
    generation++;
    geladen = false;
    naechste = null;
    void laden({ erneut: true });
  };
  $("#audit-laden").onclick = () => void laden({ erneut: true });
  $("#audit-mehr").onclick = () => void laden({ mehr: true });
  $("#audit-download").onclick = async () => {
    if (!geladen || exportiert || laedt) return;
    const vorher = generation;
    exportiert = true;
    status();
    fehler(null);
    try {
      const daten = await request(
        "/verwaltung/audit/export?" + new URLSearchParams(filter),
      );
      if (vorher !== generation || !sichtbar()) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(daten, null, 2) + "\n"], {
          type: "application/json;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "timereal-audit.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (vorher === generation && sichtbar()) fehler(e);
    } finally {
      exportiert = false;
      status();
    }
  };
  return {
    laden,
    zuruecksetzen() {
      generation++;
      nochmal = false;
      geladen = false;
      filter = {};
      eintraege = [];
      naechste = null;
      form.reset();
      liste.replaceChildren();
      $("#audit-leer").hidden = true;
      fehler(null);
      text("status", "");
      status();
    },
  };
}
