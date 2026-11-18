export function kontenOberflaeche({
  $,
  esc,
  request,
  bediene,
  melden,
  abmelden,
}) {
  let profil = null,
    links = [];
  const zeile = (name, sub, action) =>
    '<article class="ziel zeile"><div><strong>' +
    esc(name) +
    '</strong><span class="neben">' +
    esc(sub) +
    '</span></div><div class="aktionen">' +
    action +
    "</div></article>";
  const knopf = (text, action, id) =>
    '<button type="button" class="sek" data-konto="' +
    action +
    '" data-id="' +
    esc(id) +
    '">' +
    text +
    "</button>";
  async function aktualisieren() {
    profil = await request("/profil");
    $("#admin-nav").hidden = !profil.admin;
    return profil;
  }
  async function laden(seite) {
    if (seite === "verwaltung") {
      const [konten, einladungen, mail] = await Promise.all([
        request("/verwaltung/konten"),
        request("/verwaltung/einladungen"),
        request("/verwaltung/mail"),
      ]);
      links = einladungen;
      $("#mailhinweis").textContent = mail.konfiguriert
        ? "Einladungen werden per E-Mail versendet."
        : "Mailversand noch nicht eingerichtet. Im Container die Mailkonfiguration hinterlegen.";
      $("#einladen button").disabled = !mail.konfiguriert;
      $("#kontoliste").innerHTML = konten
        .map((k) =>
          zeile(
            k.login,
            (k.admin ? "Administrator · " : "Berater · ") +
              (k.aktiv ? "Aktiv" : "Gesperrt"),
            k.admin
              ? ""
              : knopf(
                  k.aktiv ? "Sperren" : "Entsperren",
                  k.aktiv ? "sperren" : "entsperren",
                  k.id,
                ),
          ),
        )
        .join("");
      $("#einladungsliste").innerHTML =
        links
          .map((e) =>
            zeile(
              e.email,
              e.status +
                " · gültig bis " +
                new Date(e.ablauf).toLocaleString("de-DE"),
              ["Offen", "Abgelaufen"].includes(e.status)
                ? knopf("Erneut senden", "erneut", e.id) +
                    knopf("Widerrufen", "widerrufen", e.id)
                : "",
            ),
          )
          .join("") || "<p>Noch keine Einladungen.</p>";
    }
    if (seite === "einstellungen") {
      $("#profilform").elements.email.value = profil.email ?? "";
      $("#kontoname").textContent = profil.login;
      const [sessions, release] = await Promise.all([
        request("/sitzungen"),
        request("/version"),
      ]);
      $("#versionsnummer").textContent = "Timereal " + release.version;
      $("#sitzungsliste").innerHTML = sessions
        .map((s) =>
          zeile(
            s.client === "web" ? "Browser" : "Browsererweiterung",
            (s.aktuell ? "Diese Sitzung · " : "") +
              "Angemeldet am " +
              new Date(s.erstellt_am).toLocaleString("de-DE"),
            knopf("Abmelden", "sitzung", s.id),
          ),
        )
        .join("");
    }
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-konto]");
    if (!b) return;
    void bediene(async () => {
      const { konto: aktion, id } = b.dataset;
      if (["sperren", "entsperren"].includes(aktion)) {
        if (
          aktion === "sperren" &&
          !confirm(
            "Konto sperren? Ein laufender Timer wird beendet und die Sitzungen werden widerrufen.",
          )
        )
          return;
        await request("/verwaltung/konten/" + id, "PATCH", {
          aktiv: aktion === "entsperren",
        });
      }
      if (aktion === "erneut")
        await request("/verwaltung/einladungen/" + id + "/erneut", "POST");
      if (aktion === "widerrufen")
        await request("/verwaltung/einladungen/" + id, "DELETE");
      if (aktion === "sitzung") await request("/sitzungen/" + id, "DELETE");
    });
  });
  $("#einladen").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      await request("/verwaltung/einladungen", "POST", {
        email: ev.target.elements.email.value,
      });
      ev.target.reset();
      melden("Einladung versendet.");
    });
  };
  $("#profilform").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      profil = await request("/profil", "PATCH", {
        email: ev.target.elements.email.value,
      });
      melden("E-Mail-Adresse gespeichert.");
    });
  };
  $("#passwortform").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      const f = ev.target.elements;
      await request("/passwort/aendern", "POST", {
        alt: f.alt.value,
        neu: f.neu.value,
      });
      ev.target.reset();
      abmelden();
      melden("Passwort geändert. Bitte erneut anmelden.");
    });
  };
  $("#vergessen").onclick = () => $("#resetfenster").showModal();
  $("#resetform").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      await request("/passwort/anfordern", "POST", {
        email: ev.target.elements.email.value,
      });
      $("#resetfenster").close();
      melden(
        "Falls ein aktives Konto zu dieser Adresse existiert, erhältst du einen Rücksetzlink.",
      );
    });
  };
  let einmallink = null;
  const match = /^#(einladung|reset)=([a-f0-9]{64})$/.exec(location.hash);
  if (match) {
    einmallink = { typ: match[1], token: match[2] };
    history.replaceState(null, "", location.pathname);
    $("#linktitel").textContent =
      match[1] === "einladung" ? "Einladung annehmen" : "Passwort zurücksetzen";
    $("#linkfenster").showModal();
  }
  $("#linkform").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      if (!einmallink) return;
      const f = ev.target.elements;
      if (f.passwort.value !== f.wiederholung.value)
        throw new Error("Die Passwörter stimmen nicht überein.");
      await request(
        einmallink.typ === "einladung"
          ? "/einladung/annehmen"
          : "/passwort/zuruecksetzen",
        "POST",
        { token: einmallink.token, passwort: f.passwort.value },
      );
      einmallink = null;
      ev.target.reset();
      $("#linkfenster").close();
      abmelden();
      melden("Passwort gespeichert. Melde dich mit deiner E-Mail-Adresse an.");
    });
  };
  return { aktualisieren, laden, linkOffen: () => !!einmallink };
}
