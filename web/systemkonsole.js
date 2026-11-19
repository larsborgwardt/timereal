const quellen = {
  anwendung: "Anwendung",
  betrieb: "Betriebsdienst",
  https: "HTTPS",
};
const levels = new Set([
  "info",
  "warn",
  "error",
  "debug",
  "success",
  "fatal",
  "complete",
]);

export function systemkonsole({ $, request, sichtbar }) {
  const form = $("#konsole-filter"),
    region = $("#konsole-ausgabe"),
    zeilen = $("#konsole-zeilen");
  let filter = {},
    stand = null,
    generation = 0,
    laedt = false,
    nochmal = false,
    signatur = "",
    fehler = false;
  const text = (id, wert) => {
    const el = $("#konsole-" + id);
    if (el.textContent !== wert) el.textContent = wert;
  };
  const formatZeit = (iso) => new Date(iso).toLocaleString("de-DE");
  function status() {
    const live = $("#konsole-live").checked;
    text(
      "status",
      fehler
        ? "Verbindung unterbrochen"
        : !stand
          ? laedt
            ? "Systemlogs werden geladen …"
            : "Noch nicht geladen"
          : live
            ? "Live verbunden"
            : "Live pausiert",
    );
    text(
      "abruf",
      stand
        ? `Letzter Abruf ${formatZeit(stand.geprueftAm)} · Nur lesbar`
        : "Nur lesbar",
    );
    $("#konsole-laden").disabled = laedt;
    $("#konsole-laden").setAttribute("aria-busy", String(laedt));
    $("#konsole-download").disabled = !stand;
  }
  function leeren() {
    stand = null;
    signatur = "";
    zeilen.replaceChildren();
    text("anzahl", "0 Zeilen");
  }
  async function laden() {
    if (!sichtbar()) return;
    if (laedt) {
      nochmal = true;
      return;
    }
    const vorher = generation;
    laedt = true;
    status();
    try {
      const params = new URLSearchParams(filter);
      const neu = await request("/verwaltung/betrieb/logs?" + params);
      if (vorher !== generation || !sichtbar()) return;
      stand = neu;
      fehler = false;
      $("#konsole-fehler").hidden = true;
      const inhalt = JSON.stringify(neu.zeilen);
      if (inhalt !== signatur) {
        const scrollTop = region.scrollTop,
          scrollLeft = region.scrollLeft;
        const fragment = document.createDocumentFragment();
        for (const z of neu.zeilen) {
          const row = document.createElement("span");
          row.className = "logzeile";
          const zeit = document.createElement("span");
          zeit.className = "logzeit";
          zeit.textContent = formatZeit(z.zeit) + " ";
          const quelle = document.createTextNode(
            `[${(quellen[z.quelle] ?? "Dienst").padEnd(14)}] `,
          );
          const level = document.createElement("span");
          level.className = "log-" + (levels.has(z.level) ? z.level : "info");
          level.textContent = z.level.toUpperCase().padEnd(9);
          row.append(
            zeit,
            quelle,
            level,
            document.createTextNode(z.text + "\n"),
          );
          fragment.append(row);
        }
        if (!neu.zeilen.length)
          fragment.append(
            document.createTextNode("Keine Einträge für diese Filter."),
          );
        zeilen.replaceChildren(fragment);
        region.scrollTop = $("#konsole-scrollen").checked
          ? region.scrollHeight
          : scrollTop;
        region.scrollLeft = scrollLeft;
        signatur = inhalt;
      }
      text(
        "anzahl",
        neu.zeilen.length === 1 ? "1 Zeile" : `${neu.zeilen.length} Zeilen`,
      );
      text(
        "grenze",
        `Durchsucht die letzten ${neu.maxZeilen} Einträge der vergangenen ${neu.fensterStunden} Stunden. Erkannte Zugangsdaten werden ausgeblendet.${neu.ausgelassen ? ` ${neu.ausgelassen} Einträge wegen Format oder Größe ausgelassen.` : ""}`,
      );
    } catch (e) {
      if (vorher !== generation || !sichtbar()) return;
      fehler = true;
      text(
        "fehler",
        e.message +
          (stand ? " Angezeigt bleibt der letzte erfolgreiche Abruf." : ""),
      );
      $("#konsole-fehler").hidden = false;
    } finally {
      laedt = false;
      if (vorher === generation) status();
      if (nochmal) {
        nochmal = false;
        void laden();
      }
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    filter = {
      quelle: form.elements.quelle.value,
      level: form.elements.level.value,
      suche: form.elements.suche.value.trim(),
    };
    generation++;
    leeren();
    void laden();
  };
  $("#konsole-laden").onclick = () => void laden();
  $("#konsole-live").onchange = () => {
    status();
    if ($("#konsole-live").checked) void laden();
  };
  $("#konsole-scrollen").onchange = () => {
    if ($("#konsole-scrollen").checked) region.scrollTop = region.scrollHeight;
  };
  $("#konsole-download").onclick = () => {
    if (!stand) return;
    const inhalt = stand.zeilen
      .map(
        (z) =>
          `${formatZeit(z.zeit)} [${quellen[z.quelle]}] ${z.level.toUpperCase()} ${z.text}`,
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([inhalt + "\n"], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "timereal-systemlogs.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return {
    laden,
    liveLaden() {
      if ($("#konsole-live").checked && !document.hidden) return laden();
    },
    zuruecksetzen() {
      generation++;
      nochmal = false;
      filter = {};
      fehler = false;
      form.reset();
      $("#konsole-live").checked = true;
      $("#konsole-scrollen").checked = true;
      leeren();
      text("fehler", "");
      $("#konsole-fehler").hidden = true;
      status();
    },
  };
}
