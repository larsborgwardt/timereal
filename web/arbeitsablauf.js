import { lokalText, zeitpunkte, minutenText } from "./zeit.js";
export function arbeitsablaufOberflaeche({
  $,
  esc,
  request,
  bediene,
  melden,
  getZiele,
  getKunden,
  getEintraege,
  getZone,
  kommando,
  heute,
  zuNachweisen,
}) {
  let bearbeitung = null,
    modus = "korrektur",
    zielEdit = null,
    wochentag = heute();
  const form = $("#zeitform");
  const auswahl = () =>
    getZiele()
      .map(
        (z) =>
          '<option value="ziel:' +
          esc(z.id) +
          '">' +
          esc(z.kunde + " · " + z.art + " " + z.bezeichnung) +
          "</option>",
      )
      .join("") +
    '<option value="vorlaeufig">Später zuordnen</option><option value="intern">Interne Zeit</option>';
  const kundenOptionen = () =>
    '<option value="">Kunde später zuordnen</option>' +
    getKunden()
      .map(
        (k) => '<option value="' + esc(k.id) + '">' + esc(k.name) + "</option>",
      )
      .join("");
  function zuordnung() {
    const f = form.elements,
      wert = f.auswahl.value;
    f.kundeId.closest("label").hidden = wert !== "vorlaeufig";
    f.abrechenbar.disabled = wert === "intern";
    if (wert === "intern") f.abrechenbar.checked = false;
  }
  function zeitwahl(name, original) {
    const f = form.elements,
      select = f[name + "Offset"],
      liste = zeitpunkte(f[name].value, getZone()),
      alt = original ?? select.value;
    select.required = liste.length > 1;
    select.innerHTML =
      (liste.length > 1
        ? '<option value="">Vorkommen auswählen</option>'
        : "") +
      liste
        .map(
          (v, i) =>
            '<option value="' +
            esc(v) +
            '">' +
            (i + 1) +
            ". Vorkommen · " +
            esc(
              new Intl.DateTimeFormat("de-DE", {
                timeZone: getZone(),
                timeZoneName: "shortOffset",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(v)),
            ) +
            "</option>",
        )
        .join("");
    if (liste.includes(alt)) select.value = alt;
    select.closest("label").hidden = liste.length < 2;
    f[name].setCustomValidity(
      liste.length
        ? ""
        : "Diese Uhrzeit existiert in der eingestellten Zeitzone nicht.",
    );
    return select.value;
  }
  function vorschau() {
    const f = form.elements,
      von = zeitwahl("beginn"),
      bis = zeitwahl("ende");
    $("#zeitvorschau").replaceChildren();
    if (!bearbeitung || modus !== "unterbrechung" || !von || !bis) return;
    const grenzen = [bearbeitung.beginn, von, bis, bearbeitung.ende].map(
      Date.parse,
    );
    if (!(
      grenzen[0] < grenzen[1] &&
      grenzen[1] < grenzen[2] &&
      grenzen[2] < grenzen[3]
    )) {
      $("#zeitvorschau").textContent =
        "Die Unterbrechung muss vollständig innerhalb des Abschnitts liegen.";
      return;
    }
    $("#zeitvorschau").innerHTML =
      "<h3>Vorschau</h3>" +
      [0, 1, 2]
        .map(
          (i) =>
            '<div class="ziel zeile"><span>' +
            esc(
              lokalText(grenzen[i], getZone()).slice(11) +
                "–" +
                lokalText(grenzen[i + 1], getZone()).slice(11),
            ) +
            "</span><strong>" +
            esc(
              i === 1
                ? f.auswahl.selectedOptions[0].textContent
                : (bearbeitung.ziel ?? "Bisherige Tätigkeit"),
            ) +
            "</strong><span>" +
            (grenzen[i + 1] - grenzen[i]) / 60000 +
            " min</span></div>",
        )
        .join("");
  }
  function oeffnen(e = null, art = "korrektur") {
    bearbeitung = e;
    modus = art;
    form.reset();
    const f = form.elements;
    $("#zeittitel").textContent = !e
      ? "Zeit nachtragen"
      : art === "unterbrechung"
        ? "Unterbrechung einfügen"
        : "Zeit korrigieren";
    $("#grenzenhinweis").hidden = !e || art !== "korrektur";
    f.auswahl.innerHTML = auswahl();
    f.kundeId.innerHTML = kundenOptionen();
    f.auswahl.value = e?.ziel_id
      ? "ziel:" + e.ziel_id
      : (e?.art ?? "vorlaeufig");
    f.kundeId.value = e?.kunde_id ?? "";
    const ende =
      e?.ende ?? new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
    const beginn =
      e?.beginn ?? new Date(Date.parse(ende) - 3600000).toISOString();
    f.beginn.value = lokalText(beginn, getZone());
    f.ende.value = lokalText(ende, getZone());
    f.leistungstext.value = e?.leistungstext ?? "";
    f.abrechenbar.checked = e?.abrechenbar ?? false;
    zeitwahl("beginn", new Date(beginn).toISOString());
    zeitwahl("ende", new Date(ende).toISOString());
    zuordnung();
    vorschau();
    $("#zeitfenster").showModal();
  }
  function vergleich(e) {
    const felder = [
      ["beginn", "Beginn"],
      ["ende", "Ende"],
      ["kunde", "Kunde"],
      ["projekt", "Projekt"],
      ["zielart", "Art"],
      ["ziel", "Buchungsziel"],
      ["leistungstext", "Leistungstext"],
      ["abrechenbar", "Abrechenbar"],
      ["stunden", "Stunden"],
    ];
    const wert = (s, key) => {
      const v = s?.[key];
      return v === null || v === undefined
        ? "—"
        : ["beginn", "ende"].includes(key)
          ? new Intl.DateTimeFormat("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: getZone(),
            }).format(new Date(v))
          : key === "stunden"
            ? String(v).replace(".", ",") + " h"
            : typeof v === "boolean"
              ? v
                ? "Ja"
                : "Nein"
              : v;
    };
    $("#vergleichinhalt").innerHTML =
      '<div class="vergleich">' +
      [
        ["Zuletzt übertragen", e.uebertragener_stand],
        ["Aktuell", e.stand],
      ]
        .map(
          ([titel, s]) =>
            '<section class="karte"><h3>' +
            titel +
            "</h3><dl>" +
            felder
              .map(
                ([key, label]) =>
                  "<dt>" +
                  label +
                  (wert(e.uebertragener_stand, key) !== wert(e.stand, key)
                    ? ' <small class="aenderungslabel">geändert</small>'
                    : "") +
                  "</dt><dd" +
                  (wert(e.uebertragener_stand, key) !== wert(e.stand, key)
                    ? ' class="geaendert"'
                    : "") +
                  ">" +
                  esc(wert(s, key)) +
                  "</dd>",
              )
              .join("") +
            "</dl></section>",
        )
        .join("") +
      "</div><p>Übertrage die Korrektur zuerst in dein Abrechnungssystem. Bestätige sie anschließend am Nachweis.</p>";
    $("#vergleichfenster").showModal();
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-arbeit]");
    if (!b) return;
    void bediene(async () => {
      const { arbeit: aktion, id } = b.dataset,
        e = getEintraege().find((x) => x.id === id);
      if (aktion === "nachtrag") oeffnen();
      if (aktion === "korrektur" && e) oeffnen(e);
      if (aktion === "unterbrechung" && e) oeffnen(e, "unterbrechung");
      if (aktion === "vergleich" && e) vergleich(e);
      if (
        aktion === "storno" &&
        e &&
        confirm(
          "Abschnitt stornieren? Er bleibt in der Historie erhalten. Eine bereits übertragene Buchung musst du auch extern zurücknehmen.",
        )
      )
        await request("/abschnitte/" + e.id + "/storno", "POST", {
          fassung: e.fassung,
        });
      if (aktion === "zielpflege") {
        zielEdit = getZiele().find((z) => z.id === id);
        if (!zielEdit) return;
        const f = $("#zielpflegeform").elements;
        f.bezeichnung.value = zielEdit.bezeichnung;
        f.abrechenbar.checked = zielEdit.abrechenbar;
        f.projektId.innerHTML =
          '<option value="">Ohne Projekt</option>' +
          getZiele()
            .filter(
              (z) =>
                z.art === "Projekt" &&
                z.kunde_id === zielEdit.kunde_id &&
                z.id !== id,
            )
            .map(
              (z) =>
                '<option value="' +
                esc(z.id) +
                '">' +
                esc(z.bezeichnung) +
                "</option>",
            )
            .join("");
        f.projektId.value = zielEdit.projekt_id ?? "";
        f.projektId.disabled = zielEdit.art === "Projekt";
        const kunde = getKunden().find((k) => k.id === zielEdit.kunde_id);
        f.kunde.value = kunde.name;
        $("#zielpflegefenster").showModal();
      }
    });
  });
  $("#sofort").onclick = () => {
    const f = $("#sofortform").elements;
    f.kundeId.innerHTML = kundenOptionen();
    $("#sofortfenster").showModal();
  };
  $("#sofortform").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      const kundeId = ev.target.elements.kundeId.value;
      await kommando("auto", {
        art: "vorlaeufig",
        ...(kundeId ? { kundeId } : {}),
      });
      $("#sofortfenster").close();
    });
  };
  $("#intern").onclick = () =>
    void bediene(() => kommando("auto", { art: "intern" }));
  form.elements.auswahl.onchange = () => {
    const ziel = getZiele().find(
      (z) => "ziel:" + z.id === form.elements.auswahl.value,
    );
    if (ziel) form.elements.abrechenbar.checked = ziel.abrechenbar;
    zuordnung();
    vorschau();
  };
  for (const name of ["beginn", "ende"]) form.elements[name].oninput = vorschau;
  for (const name of ["beginnOffset", "endeOffset"])
    form.elements[name].onchange = vorschau;
  form.onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      const f = form.elements,
        wahl = f.auswahl.value;
      const data = {
        art: wahl.startsWith("ziel:") ? "zugeordnet" : wahl,
        beginn: zeitwahl("beginn"),
        ende: zeitwahl("ende"),
        leistungstext: f.leistungstext.value,
        abrechenbar: f.abrechenbar.checked,
      };
      if (!data.beginn || !data.ende)
        throw new Error("Bitte gültige Uhrzeiten wählen.");
      if (data.art === "zugeordnet") data.zielId = wahl.slice(5);
      if (data.art === "vorlaeufig" && f.kundeId.value)
        data.kundeId = f.kundeId.value;
      if (bearbeitung) data.fassung = bearbeitung.fassung;
      await request(
        "/abschnitte" + (bearbeitung ? "/" + bearbeitung.id + "/" + modus : ""),
        "POST",
        data,
      );
      $("#zeitfenster").close();
    });
  };
  $("#zielpflegeform").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      const f = ev.target.elements,
        kunde = getKunden().find((k) => k.id === zielEdit.kunde_id);
      await request("/ziele/" + zielEdit.id, "PATCH", {
        kundeName: f.kunde.value,
        kundeFassung: kunde.fassung,
        bezeichnung: f.bezeichnung.value,
        projektId: f.projektId.disabled ? null : f.projektId.value || null,
        abrechenbar: f.abrechenbar.checked,
        fassung: zielEdit.fassung,
      });
      $("#zielpflegefenster").close();
    });
  };
  async function ladeWoche() {
    const w = await request("/woche?von=" + wochentag);
    const datum = (tag) =>
      new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(tag + "T12:00:00Z"));
    wochentag = w.von;
    $("#wochentitel").textContent = datum(w.von) + " – " + datum(w.bis);
    $("#wochensumme").textContent = minutenText(w.erfasst);
    $("#wochenabrechenbar").textContent = minutenText(w.abrechenbar);
    $("#wochenzeilen").innerHTML =
      w.zeilen
        .map(
          (r) =>
            "<tr><td>" +
            esc(datum(r.tag)) +
            "</td><td>" +
            esc(r.kunde ?? "Intern / vorläufig") +
            "</td><td>" +
            esc(r.projekt ?? "—") +
            "</td><td>" +
            minutenText(r.minuten) +
            "</td></tr>",
        )
        .join("") ||
      '<tr><td colspan="4">In dieser Woche wurden noch keine Zeiten erfasst.</td></tr>';
    $("#wochennacharbeit").textContent = "Offene Nacharbeiten · " + w.offen;
    $("#wochennacharbeit").onclick = () =>
      void bediene(() => zuNachweisen(w.von, w.bis));
  }
  for (const [id, delta] of [
    ["woche-vorher", -7],
    ["woche-nachher", 7],
  ])
    $("#" + id).onclick = () =>
      void bediene(async () => {
        wochentag = new Date(
          Date.parse(wochentag + "T12:00:00Z") + delta * 86400000,
        )
          .toISOString()
          .slice(0, 10);
      });
  return { ladeWoche };
}
