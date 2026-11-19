import * as transport from "./transport.js";
import { arbeitsablaufOberflaeche } from "./arbeitsablauf.js";
import { kontenOberflaeche } from "./konten.js";
import { betriebsOberflaeche } from "./betrieb.js";
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const zone = "Europe/Berlin";
const uhr = (wert) =>
  new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(wert));
const datum = (wert) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(wert));
const tag = (wert) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(wert);
let seite = "heute",
  modus = "uebernahme",
  state,
  ziele = [],
  kunden = [],
  eintraege = [],
  notiz,
  busy = false,
  pending = null,
  refreshNr = 0;
function fokusMerken() {
  const vorher = document.activeElement;
  const bereich = vorher?.closest("section[id], dialog[id]");
  const attribute = ["data-action", "data-arbeit", "data-konto", "data-id"];
  const selector = vorher?.id
    ? "#" + CSS.escape(vorher.id)
    : attribute
        .filter((a) => vorher?.hasAttribute(a))
        .map((a) => `[${a}="${CSS.escape(vorher.getAttribute(a))}"]`)
        .join("");
  return () => {
    // Einen zwischenzeitlich vom Menschen gesetzten Fokus nicht zurückholen.
    if (
      document.activeElement !== document.body &&
      document.activeElement !== vorher
    )
      return;
    let ziel = vorher?.isConnected ? vorher : selector ? $(selector) : null;
    if (!ziel && bereich?.getClientRects().length) {
      ziel = bereich.querySelector("h1, h2");
      if (ziel) ziel.tabIndex = -1;
    }
    if (ziel?.getClientRects().length && !ziel.disabled)
      ziel.focus({ preventScroll: true });
  };
}
function seitenFokus() {
  const heading = $("#" + seite + " h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}
function melden(msg = "") {
  const box = $("#meldung");
  box.textContent = msg;
  box.hidden = !msg;
  document.querySelectorAll(".dialogmeldung").forEach((e) => e.remove());
  const dialog = document.querySelector("dialog[open]");
  if (msg && dialog) {
    const hinweis = document.createElement("p");
    hinweis.className = "dialogmeldung meldung";
    hinweis.setAttribute("role", "alert");
    hinweis.textContent = msg;
    (dialog.querySelector("form") ?? dialog).prepend(hinweis);
  }
}
async function request(pfad, methode = "GET", body, key) {
  const response = await transport.senden(pfad, methode, body, key);
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) zeigeLogin();
    const error = new Error(data.fehler || "Aktion fehlgeschlagen.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function zeigeLogin() {
  betrieb.zuruecksetzen();
  ++refreshNr;
  seite = "login";
  state = null;
  pending = null;
  ziele = [];
  kunden = [];
  eintraege = [];
  notiz = null;
  document.querySelectorAll("dialog[open]").forEach((d) => {
    if (d.id !== "linkfenster" && d.id !== "resetfenster") d.close();
  });
  $("#notiz").value = "";
  $("#timer").replaceChildren();
  $("#ziele").replaceChildren();
  for (const id of [
    "eintraege",
    "tageseintraege",
    "wochenzeilen",
    "kontoliste",
    "einladungsliste",
    "sitzungsliste",
    "vergleichinhalt",
  ])
    $("#" + id).replaceChildren();
  document.querySelectorAll("dialog form").forEach((f) => {
    if (!["linkform", "resetform"].includes(f.id)) f.reset();
  });
  for (const id of [
    "profilform",
    "grundeinstellungen",
    "passwortform",
    "einladen",
  ]) {
    $("#" + id).reset();
    delete $("#" + id).dataset.geaendert;
  }
  panels();
}
function panels() {
  for (const id of [
    "login",
    "heute",
    "nachweise",
    "verwaltung",
    "einstellungen",
    "woche",
  ])
    $("#" + id).hidden = seite !== id;
  $("nav").hidden = $("#logout").hidden = seite === "login";
  document.querySelectorAll("nav button[data-page]").forEach((b) => {
    if (b.dataset.page === seite) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}
function btn(label, action, klasse = "sek") {
  return (
    '<button type="button" class="' +
    klasse +
    '" data-action="' +
    esc(action) +
    '">' +
    esc(label) +
    "</button>"
  );
}
function zielname(id, art) {
  const z = ziele.find((x) => x.id === id);
  return z
    ? z.kunde + " · " + z.art + " " + z.bezeichnung
    : art === "intern"
      ? "Interne Zeit"
      : "Vorläufige Zeit";
}
function zeigeTimer() {
  const a = state.aktiv,
    p = state.pause;
  const name = a
    ? zielname(a.ziel_id, a.art)
    : p
      ? zielname(p.zielId, p.art)
      : "Kein Timer aktiv";
  $("#timer").innerHTML =
    '<div class="daten"><div><h2>' +
    esc(name) +
    '</h2><span class="neben">' +
    (a
      ? "Läuft seit " + uhr(a.beginn)
      : p
        ? "Pause seit " + uhr(p.seit)
        : "Wähle ein Buchungsziel, um die Zeit zu erfassen.") +
    "</span></div>" +
    (a ? '<strong class="timerzeit" id="dauer"></strong>' : "") +
    '</div><div class="aktionen">' +
    (a
      ? btn("Pausieren", "pause", "") +
        btn("Stoppen", "stopp") +
        btn("Leistungstext", "aktivnotiz")
      : p
        ? btn("Fortsetzen", "fortsetzen", "") + btn("Stoppen", "stopp")
        : "") +
    "</div>";
  dauer();
  zeigeZiele();
}
function dauer() {
  const e = $("#dauer");
  if (!e || !state?.aktiv) return;
  const min = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(state.aktiv.beginn)) / 60000),
  );
  e.textContent =
    String(Math.floor(min / 60)).padStart(2, "0") +
    ":" +
    String(min % 60).padStart(2, "0");
}
function arbeitButton(text, aktion, id) {
  return `<button type="button" class="sek" data-arbeit="${aktion}" data-id="${esc(id)}">${text}</button>`;
}
function zeigeZiele() {
  const suche = $("#suche").value.trim().toLocaleLowerCase("de");
  const liste = ziele.filter((z) =>
    (z.kunde + " " + z.art + " " + z.bezeichnung)
      .toLocaleLowerCase("de")
      .includes(suche),
  );
  $("#ziele").innerHTML =
    liste
      .map(
        (z) =>
          '<div class="ziel zeile"><div><strong>' +
          esc(z.kunde) +
          '</strong><span class="neben">' +
          esc(z.art + " · " + z.bezeichnung) +
          "</span></div>" +
          (state?.aktiv?.ziel_id === z.id
            ? "Läuft"
            : btn(
                state?.aktiv ? "Hierhin wechseln" : "Hier starten",
                "ziel-" + z.id,
                "",
              )) +
          arbeitButton("Bearbeiten", "zielpflege", z.id) +
          "</div>",
      )
      .join("") || "<p>Kein passendes Buchungsziel.</p>";
}
function zeigeEintraege(ziel = "#eintraege", alle = false) {
  $("#liste").setAttribute("aria-pressed", modus === "uebernahme");
  $("#historie").setAttribute("aria-pressed", modus === "historie");
  const suche = alle
    ? ""
    : $("#filter").elements.suche.value.trim().toLowerCase();
  const rows = eintraege.filter(
    (e) =>
      e.ende &&
      (alle ||
        modus === "historie" ||
        !["Storniert", "Nicht abrechenbar", "Übertragen"].includes(e.status)) &&
      [e.kunde, e.ziel, e.projekt].join(" ").toLowerCase().includes(suche),
  );
  rows.sort(
    (a, b) =>
      b.tag.localeCompare(a.tag) ||
      a.beginn.localeCompare(b.beginn) ||
      Number(a.id) - Number(b.id),
  );
  let day = "";
  $(ziel).innerHTML =
    rows
      .map((e) => {
        const titel =
          day === e.tag ? "" : "<h2>" + esc(datum(e.beginn)) + "</h2>";
        day = e.tag;
        const zeit =
          uhr(e.beginn) +
          "–" +
          (datum(e.ende) !== datum(e.beginn) ? datum(e.ende) + " " : "") +
          uhr(e.ende);
        const bereit = ["Bereit", "Erneut prüfen", "Storno offen"].includes(
          e.status,
        );
        return (
          titel +
          '<article class="eintrag"><div class="zeile"><strong>' +
          esc(
            e.kunde
              ? e.kunde + " · " + (e.ziel ?? "Vorläufig")
              : zielname(null, e.art),
          ) +
          "</strong><span>" +
          esc(e.status) +
          "</span></div><p>" +
          esc(zeit) +
          " · " +
          esc(e.minuten) +
          " min · " +
          esc(e.stand.stunden?.replace(".", ",")) +
          " h</p><p>" +
          esc(e.leistungstext) +
          "</p>" +
          (e.uebertragener_stand && e.status === "Erneut prüfen"
            ? '<p class="stand">Zuletzt übertragen: ' +
              esc(e.uebertragener_stand.stunden) +
              " h · " +
              esc(e.uebertragener_stand.leistungstext) +
              "</p>"
            : "") +
          '<div class="aktionen">' +
          (e.storniert
            ? ""
            : btn("Leistungstext", "notiz-" + e.id) +
              arbeitButton("Korrigieren", "korrektur", e.id) +
              (Number(e.minuten) >= 3
                ? arbeitButton("Unterbrechung einfügen", "unterbrechung", e.id)
                : "") +
              arbeitButton("Stornieren", "storno", e.id)) +
          (e.uebertragener_stand
            ? arbeitButton("Buchung vergleichen", "vergleich", e.id)
            : "") +
          (bereit
            ? btn("Kopieren", "kopie-" + e.id) +
              btn("Übernahme bestätigen", "uebernahme-" + e.id, "")
            : "") +
          "</div></article>"
        );
      })
      .join("") || "<p>Für diese Auswahl liegen keine Einträge vor.</p>";
}
async function laden() {
  const nr = ++refreshNr;
  const snapshot = await request("/arbeitsstand");
  if (nr !== refreshNr) return;
  const fokusZurueck = fokusMerken();
  konten.aktualisieren(snapshot.profil);
  state = snapshot.timer;
  ziele = snapshot.ziele;
  kunden = snapshot.kunden;
  if (seite === "login") {
    seite = "heute";
    if (snapshot.profil.admin && location.hash === "#betrieb-domain") {
      seite = "verwaltung";
      betrieb.domainOeffnen();
      history.replaceState(null, "", location.pathname);
    }
  }
  panels();
  if (seite === "heute") {
    zeigeTimer();
    fokusZurueck();
    const heute = tag(new Date());
    const rows = await request("/historie?von=" + heute + "&bis=" + heute);
    if (nr === refreshNr) {
      const eintragFokus = fokusMerken();
      eintraege = rows;
      zeigeEintraege("#tageseintraege", true);
      eintragFokus();
    }
    return;
  }
  if (seite === "woche") {
    await arbeitsablauf.ladeWoche();
    return;
  }
  if (["verwaltung", "einstellungen"].includes(seite)) {
    await konten.laden(seite);
    if (seite === "verwaltung") await betrieb.laden();
    fokusZurueck();
    return;
  }
  const f = $("#filter").elements;
  const rows = await request(
    "/historie?von=" + f.von.value + "&bis=" + f.bis.value,
  );
  if (nr === refreshNr) {
    const eintragFokus = fokusMerken();
    eintraege = rows;
    zeigeEintraege();
    eintragFokus();
  }
}
async function kommando(action, felder = {}) {
  if (
    transport.brauchtBestaetigung() &&
    !confirm(
      "Der aktuelle Timerstand wurde geladen. Diese Timeraktion jetzt ausführen?",
    )
  )
    return;

  if (action === "auto") action = state.aktiv ? "wechsel" : "start";
  const input = { version: state.version, ...felder };
  const signatur = JSON.stringify([action, input]);
  const key =
    pending?.signatur === signatur ? pending.key : crypto.randomUUID();
  pending = { signatur, key };
  try {
    await request("/timer/" + action, "POST", input, key);
    pending = null;
    await transport.aktionBestaetigt();
  } catch (e) {
    if (e.status) pending = null;
    throw e;
  }
}
async function bediene(fn, { navigation = false } = {}) {
  if (busy) return;
  const vorherigeSeite = seite;
  const fokusZurueck = fokusMerken();
  busy = true;
  const dialog = document.querySelector("dialog[open]");
  const status = dialog ? document.createElement("p") : $("#arbeitsstatus");
  if (dialog) {
    status.className = "arbeitsstatus";
    status.setAttribute("role", "status");
    dialog.prepend(status);
  }
  const hinweis = () => {
    status.textContent = navigation
      ? "Seite wird geladen…"
      : "Wird verarbeitet…";
    status.hidden = false;
  };
  // Schnelle Seitenwechsel bleiben ruhig; längere Abrufe erhalten Feedback.
  const hinweisTimer = navigation ? setTimeout(hinweis, 300) : null;
  if (!navigation) hinweis();
  document.querySelectorAll("button:enabled").forEach((b) => {
    b.disabled = true;
    b.dataset.wartet = "";
  });
  ++refreshNr;
  melden();
  try {
    await fn();
    if (seite !== "login" || state) await laden();
  } catch (e) {
    melden(e.message);
    if (e.status === 409) await laden().catch(() => {});
  } finally {
    clearTimeout(hinweisTimer);
    busy = false;
    document.querySelectorAll("[data-wartet]").forEach((b) => {
      b.disabled = false;
      delete b.dataset.wartet;
    });
    if (dialog) status.remove();
    else {
      status.textContent = "";
      status.hidden = true;
    }
    if (seite !== vorherigeSeite) seitenFokus();
    else fokusZurueck();
  }
}
function oeffneNotiz(e) {
  notiz = e;
  $("#notiz").value = e.leistungstext;
  $("#notizfenster").showModal();
  $("#notiz").focus();
}
async function aktion(s) {
  if (["stopp", "pause", "fortsetzen"].includes(s)) return kommando(s);
  if (s === "aktivnotiz") {
    oeffneNotiz(state.aktiv);
    return;
  }
  const [art, id] = s.split("-");
  if (art === "ziel")
    return kommando(state.aktiv ? "wechsel" : "start", {
      art: "zugeordnet",
      zielId: id,
    });
  const e = eintraege.find((x) => x.id === id);
  if (!e) return;
  if (art === "notiz") oeffneNotiz(e);
  if (art === "kopie") {
    await navigator.clipboard.writeText(
      [
        datum(e.beginn),
        uhr(e.beginn),
        datum(e.ende),
        uhr(e.ende),
        e.kunde,
        e.projekt,
        e.ziel,
        e.leistungstext,
        e.stand.stunden.replace(".", ","),
      ]
        .filter(Boolean)
        .join("\t"),
    );
    melden("Nachweis kopiert.");
  }
  if (art === "uebernahme")
    await request("/abschnitte/" + e.id + "/uebernahme", "POST", {
      fassung: e.fassung,
      stand: e.stand,
    });
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-close")) b.closest("dialog").close();
  if (b.dataset.page)
    void bediene(
      async () => {
        seite = b.dataset.page;
      },
      { navigation: true },
    );
  if (b.dataset.action) void bediene(() => aktion(b.dataset.action));
});
function projekte() {
  const f = $("#zielform").elements;
  f.projektId.innerHTML =
    '<option value="">Ohne Projekt</option>' +
    ziele
      .filter((z) => z.art === "Projekt" && z.kunde === f.kunde.value)
      .map(
        (z) =>
          '<option value="' +
          esc(z.id) +
          '">' +
          esc(z.bezeichnung) +
          "</option>",
      )
      .join("");
  f.projektId.disabled = f.art.value === "Projekt";
}
$("#neu").onclick = () => {
  const f = $("#zielform");
  f.reset();
  $("#kunden").innerHTML = [...new Set(ziele.map((z) => z.kunde))]
    .map((k) => '<option value="' + esc(k) + '"></option>')
    .join("");
  projekte();
  $("#zielspeichern").textContent = state.aktiv
    ? "Speichern und wechseln"
    : "Speichern und starten";
  $("#zielfenster").showModal();
};
$("#zielform").elements.kunde.oninput = projekte;
$("#zielform").elements.art.onchange = projekte;
$("#zielform").onsubmit = (ev) => {
  ev.preventDefault();
  void bediene(async () => {
    const f = ev.target.elements;
    const ziel = {
      kunde: f.kunde.value,
      art: f.art.value,
      bezeichnung: f.bezeichnung.value,
      abrechenbar: f.abrechenbar.checked,
    };
    if (f.projektId.value && !f.projektId.disabled)
      ziel.projektId = f.projektId.value;
    await kommando(state.aktiv ? "wechsel" : "start", { neuesZiel: ziel });
    $("#zielfenster").close();
  });
};
$("#notizform").onsubmit = (ev) => {
  ev.preventDefault();
  void bediene(async () => {
    await request("/abschnitte/" + notiz.id + "/notiz", "PATCH", {
      fassung: notiz.fassung,
      leistungstext: $("#notiz").value,
    });
    $("#notizfenster").close();
  });
};
$("#anmelden").onsubmit = (ev) => {
  ev.preventDefault();
  void bediene(async () => {
    const f = ev.target.elements;
    await request("/anmeldung", "POST", {
      login: f.login.value,
      passwort: f.passwort.value,
    });
    f.passwort.value = "";
    seite = "heute";
  });
};
$("#logout").onclick = async () => {
  try {
    await request("/abmeldung", "POST");
    zeigeLogin();
    melden();
  } catch (e) {
    melden(e.message);
  }
};
$("#suche").oninput = zeigeZiele;
$("#filter-reset").onclick = () =>
  void bediene(async () => {
    const h = new Date(),
      v = new Date(h);
    v.setDate(v.getDate() - 6);
    const f = $("#filter").elements;
    f.von.value = tag(v);
    f.bis.value = tag(h);
    f.suche.value = "";
  });
$("#filter").onsubmit = (ev) => {
  ev.preventDefault();
  void bediene(async () => {});
};
for (const [id, m] of [
  ["liste", "uebernahme"],
  ["historie", "historie"],
])
  $("#" + id).onclick = () => {
    modus = m;
    zeigeEintraege();
  };
const heute = new Date(),
  vorher = new Date(heute);
vorher.setDate(vorher.getDate() - 6);
$("#filter").elements.von.value = tag(vorher);
$("#filter").elements.bis.value = tag(heute);
function aktualisieren() {
  if (
    !busy &&
    state &&
    !document.hidden &&
    !document.querySelector("dialog[open]")
  )
    laden().catch((e) => melden(e.message));
}
window.addEventListener("focus", aktualisieren);
setInterval(aktualisieren, 10000);
setInterval(dauer, 1000);
const arbeitsablauf = arbeitsablaufOberflaeche({
  $,
  esc,
  request,
  bediene,
  melden,
  getZiele: () => ziele,
  getKunden: () => kunden,
  getEintraege: () => eintraege,
  getZone: () => zone,
  kommando,
  heute: () => tag(new Date()),
  zuNachweisen: (von, bis) => {
    seite = "nachweise";
    modus = "uebernahme";
    const f = $("#filter").elements;
    f.von.value = von;
    f.bis.value = bis;
    f.suche.value = "";
  },
});
const konten = kontenOberflaeche({
  $,
  esc,
  request,
  bediene,
  melden,
  abmelden: zeigeLogin,
});
const betrieb = betriebsOberflaeche({
  $,
  request,
  kontoname: (id) => konten.name(id),
  verbindungGeprueft: async () => {
    if (transport.verbindungUnsicher()) {
      await transport.verbindungGeprueft();
      verbindungMelden();
    }
  },
});
laden()
  .catch((e) => {
    if (e.status !== 401) melden(e.message);
  })
  .finally(() => {
    $("#arbeitsstatus").textContent = "";
    $("#arbeitsstatus").hidden = true;
  });

function verbindungMelden() {
  $("#verbindung").hidden = !transport.verbindungUnsicher();
}
window.addEventListener("verbindung-fehlt", verbindungMelden);
verbindungMelden();
$("#verbindung-laden").onclick = () =>
  void bediene(async () => {
    await laden();
    await transport.verbindungGeprueft();
    pending = null;
    verbindungMelden();
    melden(
      "Aktueller Stand geladen. Die nächste Timeraktion bitte bestätigen.",
    );
  });
if (transport.istErweiterung) {
  for (const bereich of ["updates", "domain", "logs"])
    document.querySelector(`[data-betrieb="${bereich}"]`).hidden = true;
  $("#anmelden").hidden = true;
  $("#vergessen").hidden = true;
  const verbinden = document.createElement("button");
  verbinden.textContent = "Erweiterung verbinden";
  verbinden.onclick = () => chrome.runtime.openOptionsPage();
  $("#login").append(verbinden);
  const oeffnen = document.createElement("button");
  oeffnen.id = "ganze-app";
  oeffnen.className = "sek";
  oeffnen.textContent = "Ganze App öffnen";
  oeffnen.onclick = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
  if (document.body.dataset.popup)
    document.querySelector("main").prepend(oeffnen);
}
