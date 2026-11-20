export function kontenOberflaeche({
  $,
  esc,
  request,
  bediene,
  melden,
  abmelden,
  istErweiterung,
}) {
  let profil = null,
    links = [],
    namen = new Map(),
    rollenentwuerfe = new Map();
  const rollen = {
    berater: "Berater",
    betrieb: "Betrieb",
    administrator: "Administrator",
  };
  $("#kontoliste").addEventListener("change", (ev) => {
    if (ev.target.matches("[data-rolle]"))
      rollenentwuerfe.set(ev.target.dataset.rolle, ev.target.value);
  });
  for (const id of ["profilform", "grundeinstellungen"])
    $("#" + id).addEventListener("input", () => {
      $("#" + id).dataset.geaendert = "true";
    });
  const zeile = (name, sub, action) =>
    '<article class="ziel zeile"><div><strong>' +
    esc(name) +
    '</strong><span class="neben">' +
    esc(sub) +
    '</span></div><div class="aktionen">' +
    action +
    "</div></article>";
  const knopf = (text, action, id) =>
    '<md-outlined-button type="button" data-konto="' +
    action +
    '" data-id="' +
    esc(id) +
    '">' +
    text +
    "</md-outlined-button>";
  function aktualisieren(neu) {
    if (profil?.id !== neu.id) rollenentwuerfe.clear();
    profil = neu;
    if (emailLink && !$("#emailfenster").open) $("#emailfenster").showModal();
    $("#admin-nav").hidden =
      istErweiterung || !(profil.admin || profil.rolle === "betrieb");
    return profil;
  }
  async function laden(seite) {
    if (seite === "verwaltung" && profil.admin) {
      const [konten, einladungen, mail] = await Promise.all([
        request("/verwaltung/konten"),
        request("/verwaltung/einladungen"),
        request("/verwaltung/mail"),
      ]);
      links = einladungen;
      namen = new Map(konten.map((k) => [String(k.id), k.login]));
      $("#mailhinweis").textContent = mail.konfiguriert
        ? "Einladungen werden per E-Mail versendet."
        : "Mailversand noch nicht eingerichtet. Unter Verwaltung → Mailversand einrichten.";
      $("#einladen md-filled-button").disabled = !mail.konfiguriert;
      // Die fachliche Sperre darf am Ende einer Bedienaktion nicht aufgehoben werden.
      if (!mail.konfiguriert)
        delete $("#einladen md-filled-button").dataset.wartet;
      $("#kontoliste").innerHTML = konten
        .map((k) => {
          const eigenes = String(k.id) === String(profil.id);
          const value = rollenentwuerfe.get(String(k.id)) ?? k.rolle;
          return (
            '<article class="ziel konto"><div class="zeile"><div><strong>' +
            esc(k.login) +
            '</strong><span class="neben">' +
            (eigenes ? "Dieses Konto · " : "") +
            esc(rollen[k.rolle]) +
            " · " +
            (k.aktiv ? "Aktiv" : "Gesperrt") +
            "</span></div>" +
            (eigenes
              ? ""
              : '<label>Rolle<select id="rolle-' +
                esc(k.id) +
                '" data-rolle="' +
                esc(k.id) +
                '">' +
                Object.entries(rollen)
                  .map(
                    ([id, name]) =>
                      '<option value="' +
                      id +
                      '"' +
                      (id === value ? " selected" : "") +
                      ">" +
                      name +
                      "</option>",
                  )
                  .join("") +
                "</select></label>") +
            "</div>" +
            (eigenes
              ? ""
              : '<div class="aktionen">' +
                '<md-filled-button type="button" data-konto="rolle" data-id="' +
                esc(k.id) +
                '">Rolle speichern</md-filled-button>' +
                knopf(
                  k.aktiv ? "Sperren" : "Entsperren",
                  k.aktiv ? "sperren" : "entsperren",
                  k.id,
                ) +
                "</div>") +
            "</article>"
          );
        })
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
      if (!$("#profilform").dataset.geaendert) {
        $("#profilform").elements.email.value =
          profil.emailAusstehend ?? profil.email ?? "";
        $("#profilform").elements.name.value = profil.name ?? "";
      }
      $("#profil-ausstehend").textContent = profil.emailAusstehend
        ? "Bestätigung ausstehend: " + profil.emailAusstehend
        : "";
      $("#profil-ausstehend").hidden = !profil.emailAusstehend;
      $("#kontoname").textContent = profil.name
        ? profil.name + " · " + profil.login
        : profil.login;
      if (!$("#grundeinstellungen").dataset.geaendert) {
        $("#grundeinstellungen").elements.nachkommastellen.value = String(
          profil.nachkommastellen,
        );
        $("#grundeinstellungen").elements.pruefminuten.value = String(
          profil.pruefminuten,
        );
      }
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
      if (aktion === "rolle") {
        const rolle = $("#rolle-" + CSS.escape(id)).value;
        await request("/verwaltung/konten/" + id + "/rolle", "PATCH", {
          rolle,
        });
        if (rollenentwuerfe.get(id) === rolle) rollenentwuerfe.delete(id);
        melden("Rolle für " + namen.get(id) + " gespeichert.");
      }
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
      const email = ev.target.elements.email.value;
      const name = ev.target.elements.name.value;
      profil = await request("/profil", "PATCH", {
        ...(email ? { email } : {}),
        name,
      });
      const neuerEntwurf =
        ev.target.elements.email.value !== email ||
        ev.target.elements.name.value !== name;
      if (!neuerEntwurf) delete ev.target.dataset.geaendert;
      melden(
        (profil.emailAusstehend
          ? "Bestätigungslink versendet. Bis zur Bestätigung bleibt die bisherige E-Mail-Adresse gültig."
          : "Profil gespeichert.") +
          (neuerEntwurf
            ? " Deine weiteren Änderungen sind noch nicht gespeichert."
            : ""),
      );
    });
  };
  $("#grundeinstellungen").onsubmit = (ev) => {
    ev.preventDefault();
    void bediene(async () => {
      const f = ev.target.elements;
      const gesendet = {
        nachkommastellen: Number(f.nachkommastellen.value),
        pruefminuten: Number(f.pruefminuten.value),
      };
      await request("/einstellungen", "PATCH", gesendet);
      const neuerEntwurf =
        Number(f.nachkommastellen.value) !== gesendet.nachkommastellen ||
        Number(f.pruefminuten.value) !== gesendet.pruefminuten;
      if (!neuerEntwurf) delete ev.target.dataset.geaendert;
      melden(
        neuerEntwurf
          ? "Einstellungen gespeichert. Deine weiteren Änderungen sind noch nicht gespeichert."
          : "Einstellungen gespeichert.",
      );
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
  $("#passwort-oeffnen").onclick = () => $("#passwortfenster").showModal();
  $("#sitzungen-oeffnen").onclick = () => $("#sitzungsfenster").showModal();
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
  let einmallink = null,
    emailLink = null;
  $("#emailfenster").addEventListener("close", () => {
    emailLink = null;
  });
  function einmallinkLaden() {
    const emailMatch = /^#email=([a-f0-9]{64})$/.exec(location.hash);
    if (emailMatch) {
      emailLink = emailMatch[1];
      history.replaceState(null, "", location.pathname);
      if (profil) $("#emailfenster").showModal();
      else
        melden("Bitte anmelden, um deine neue E-Mail-Adresse zu bestätigen.");
      return;
    }
    const match = /^#(einladung|reset)=([a-f0-9]{64})$/.exec(location.hash);
    if (!match) return;
    einmallink = { typ: match[1], token: match[2] };
    history.replaceState(null, "", location.pathname);
    $("#linkform").reset();
    melden();
    $("#linktitel").textContent =
      match[1] === "einladung" ? "Einladung annehmen" : "Passwort zurücksetzen";
    $("#linkfenster").showModal();
  }
  window.addEventListener("hashchange", einmallinkLaden);
  einmallinkLaden();
  $("#email-bestaetigen").onclick = () =>
    void bediene(async () => {
      if (!emailLink) return;
      profil = await request("/profil/email-bestaetigen", "POST", {
        token: emailLink,
      });
      emailLink = null;
      $("#emailfenster").close();
      melden("E-Mail-Adresse bestätigt.");
    });
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
  return {
    aktualisieren,
    laden,
    linkOffen: () => !!einmallink,
    name: (id) => namen.get(String(id)) ?? `Konto ${id}`,
  };
}
