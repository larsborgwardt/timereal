export function kontoSicherheit({ $, request, aktualisieren, istErweiterung }) {
  let status,
    einrichtung = null,
    codes = [],
    aktion = "einrichtung",
    busy = false;
  const bereich = $("#mfa-bereich");
  bereich.innerHTML = `<ol class="mfa-schritte" id="mfa-schritte" aria-label="Einrichtung"><li>1 · Passwort</li><li>2 · Authenticator</li><li>3 · Wiederherstellung</li></ol><p id="mfa-fehler" role="alert" hidden></p>
    <section class="karte" id="mfa-verwaltung" hidden>
      <h2>Zwei-Faktor-Anmeldung</h2><h3>Authenticator</h3><p>Eingeschaltet</p>
      <p>Dein Konto verlangt bei einer neuen Anmeldung zusätzlich einen Authenticator- oder Wiederherstellungscode.</p>
      <h3>Wiederherstellungscodes</h3><p id="mfa-anzahl"></p>
      <p>Neue Codes ersetzen deine bisherigen Codes. Du kannst sie anschließend einmal herunterladen oder kopieren.</p>
      <div class="aktionen"><md-filled-button id="mfa-neue-codes">Neue Codes erstellen</md-filled-button><md-outlined-button id="mfa-ausschalten">Zwei-Faktor-Anmeldung ausschalten</md-outlined-button><md-outlined-button data-mfa-zurueck>Zurück zum Konto</md-outlined-button></div>
    </section>
    <form class="karte" id="mfa-passwort-form" hidden>
      <h2 id="mfa-passwort-titel">Passwort bestätigen</h2><p id="mfa-passwort-hilfe">Bestätige dein Passwort, um die Einrichtung zu beginnen.</p>
      <md-outlined-text-field label="Aktuelles Passwort" id="mfa-passwort" type="password" required maxlength="512" autocomplete="current-password"></md-outlined-text-field>
      <div id="mfa-zweiter-nachweis" hidden><md-outlined-select label="Bestätigen mit" id="mfa-art"><md-select-option value="totp"><div slot="headline">Authenticator</div></md-select-option><md-select-option value="recovery"><div slot="headline">Wiederherstellungscode</div></md-select-option></md-outlined-select>
      <md-outlined-text-field label="Sechsstelliger Code" id="mfa-bestaetigung" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></md-outlined-text-field></div>
      <div class="aktionen"><md-filled-button id="mfa-passwort-weiter">Weiter</md-filled-button><md-outlined-button type="button" data-mfa-zurueck>Abbrechen</md-outlined-button></div>
    </form>
    <form class="karte" id="mfa-einrichten" hidden>
      <h2>Authenticator verbinden</h2><p>Scanne den QR-Code mit deiner Authenticator-App. Auf demselben Gerät kannst du stattdessen den Einrichtungsschlüssel kopieren.</p>
      <img id="mfa-qr" width="256" height="256" alt="Persönlicher QR-Code für deine Authenticator-App">
      <md-outlined-button type="button" id="mfa-schluessel-kopieren">Einrichtungsschlüssel kopieren</md-outlined-button>
      <md-outlined-text-field label="Sechsstelliger Code" id="mfa-code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></md-outlined-text-field>
      <p class="neben">Gib den aktuellen Code aus deiner Authenticator-App ein.</p>
      <div class="aktionen"><md-filled-button>Code prüfen und aktivieren</md-filled-button><md-outlined-button type="button" id="mfa-abbrechen">Abbrechen</md-outlined-button></div>
    </form>
    <section class="karte" id="mfa-codes" hidden>
      <h2>Wiederherstellungscodes sichern</h2><p>Bewahre diese Codes außerhalb von Timereal sicher auf. Jeder Code kann einmal verwendet werden. Diese Ansicht wird nur einmal angezeigt.</p>
      <p class="erfolg">Zwei-Faktor-Anmeldung ist eingeschaltet</p><pre id="mfa-code-liste"></pre><div class="aktionen"><md-outlined-button id="mfa-codes-download">Codes herunterladen</md-outlined-button><md-outlined-button id="mfa-codes-kopieren">Codes kopieren</md-outlined-button></div>
      <label class="mfa-gesichert"><input id="mfa-gesichert" type="checkbox"> Ich habe die Codes sicher aufbewahrt.</label><md-filled-button id="mfa-fertig" disabled>Fertig</md-filled-button>
      <p class="neben">Andere Sitzungen wurden abgemeldet. Verbinde deine Browsererweiterung anschließend neu.</p>
    </section><p id="mfa-hinweis" role="status"></p>`;
  function zeige(id) {
    $("#konto-uebersicht").hidden = $("#grundeinstellungen").hidden = true;
    bereich.hidden = false;
    $("#mfa-schritte").hidden = aktion !== "einrichtung" || id === "verwaltung";
    [...$("#mfa-schritte").children].forEach((li, index) => {
      if (index === ["passwort-form", "einrichten", "codes"].indexOf(id))
        li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    for (const item of ["verwaltung", "passwort-form", "einrichten", "codes"])
      $("#mfa-" + item).hidden = item !== id;
    $("#mfa-fehler").hidden = true;
    $("#mfa-hinweis").textContent = "";
    const heading = $("#mfa-" + id + " h2");
    heading.tabIndex = -1;
    heading.focus();
  }
  function geheimnisseLoeschen() {
    einrichtung = null;
    codes = [];
    $("#mfa-qr").removeAttribute("src");
    $("#mfa-code-liste").textContent = "";
    bereich.querySelectorAll("form").forEach((f) => f.reset());
    $("#mfa-gesichert").checked = false;
    $("#mfa-fertig").disabled = true;
  }
  function loeschen() {
    geheimnisseLoeschen();
    bereich.hidden = true;
    $("#konto-uebersicht").hidden = $("#grundeinstellungen").hidden = false;
  }
  async function arbeiten(fn) {
    if (busy) return;
    busy = true;
    $("#mfa-fehler").hidden = true;
    const buttons = [
      ...document.querySelectorAll(
        "button, md-filled-button, md-outlined-button, md-text-button",
      ),
    ].filter((b) => !b.disabled);
    buttons.forEach((b) => (b.disabled = true));
    try {
      await fn();
    } catch (e) {
      $("#mfa-fehler").textContent = e.message;
      $("#mfa-fehler").hidden = false;
    } finally {
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
      $("#mfa-fertig").disabled = !$("#mfa-gesichert").checked;
    }
  }
  async function laden() {
    $("#mfa-karte").hidden = istErweiterung;
    if (istErweiterung) return;
    status = await request("/mfa");
    $("#mfa-status").textContent = status.aktiv
      ? "Eingeschaltet"
      : "Noch nicht eingeschaltet";
    $("#mfa-start").textContent = status.aktiv ? "Verwalten" : "Einrichten";
    $("#mfa-start").disabled = busy || (!status.aktiv && !status.verfuegbar);
    $("#mfa-verfuegbar").hidden = status.aktiv || status.verfuegbar;
    $("#mfa-anzahl").textContent = status.codes + " unbenutzte Codes verfügbar";
  }
  function bestaetigung(was) {
    aktion = was;
    geheimnisseLoeschen();
    zeige("passwort-form");
    $("#mfa-passwort-titel").textContent =
      was === "einrichtung"
        ? "Passwort bestätigen"
        : was === "codes"
          ? "Neue Codes erstellen"
          : "Zwei-Faktor-Anmeldung ausschalten";
    $("#mfa-passwort-hilfe").textContent =
      was === "einrichtung"
        ? "Bestätige dein Passwort, um die Einrichtung zu beginnen."
        : was === "deaktivieren"
          ? "Danach schützt nur noch dein Passwort neue Anmeldungen. Andere angemeldete Geräte und Erweiterungen werden abgemeldet."
          : "Neue Codes ersetzen die bisherigen Codes. Andere angemeldete Geräte und Erweiterungen werden abgemeldet.";
    $("#mfa-zweiter-nachweis").hidden = was === "einrichtung";
    $("#mfa-bestaetigung").required = was !== "einrichtung";
    $("#mfa-passwort-weiter").textContent =
      was === "einrichtung"
        ? "Weiter"
        : was === "codes"
          ? "Neue Codes erstellen"
          : "Ausschalten";
    $("#mfa-art").dispatchEvent(new Event("change"));
    $("#mfa-passwort").focus();
  }
  function codesZeigen(neu) {
    geheimnisseLoeschen();
    codes = neu;
    $("#mfa-code-liste").textContent = codes.join("\n");
    zeige("codes");
  }
  $("#mfa-start").onclick = () =>
    status?.aktiv ? zeige("verwaltung") : bestaetigung("einrichtung");
  $("#mfa-neue-codes").onclick = () => bestaetigung("codes");
  $("#mfa-ausschalten").onclick = () => bestaetigung("deaktivieren");
  bereich.querySelectorAll("[data-mfa-zurueck]").forEach(
    (b) =>
      (b.onclick = () => {
        loeschen();
        $("#mfa-start").focus();
      }),
  );
  $("#mfa-art").onchange = () => {
    const recovery = $("#mfa-art").value === "recovery",
      input = $("#mfa-bestaetigung");
    input.value = "";
    input.inputMode = recovery ? "text" : "numeric";
    input.maxLength = recovery ? 39 : 6;
    input.pattern = recovery ? "[A-Fa-f0-9-]{32,39}" : "[0-9]{6}";
    $("#mfa-bestaetigung").label = recovery
      ? "Wiederherstellungscode"
      : "Sechsstelliger Code";
  };
  $("#mfa-passwort-form").onsubmit = (ev) => {
    ev.preventDefault();
    void arbeiten(async () => {
      const passwort = $("#mfa-passwort").value;
      try {
        if (aktion === "einrichtung") {
          einrichtung = await request("/mfa/einrichtung", "POST", { passwort });
          $("#mfa-qr").src = einrichtung.qr;
          zeige("einrichten");
          $("#mfa-code").focus();
        } else {
          const result = await request("/mfa/" + aktion, "POST", {
            passwort,
            art: $("#mfa-art").value,
            code: $("#mfa-bestaetigung").value.trim(),
          });
          if (aktion === "codes") codesZeigen(result.codes);
          else loeschen();
          await aktualisieren();
        }
      } finally {
        $("#mfa-passwort").value = "";
      }
    });
  };
  $("#mfa-einrichten").onsubmit = (ev) => {
    ev.preventDefault();
    void arbeiten(async () => {
      const result = await request("/mfa/aktivieren", "POST", {
        id: einrichtung.id,
        code: $("#mfa-code").value.trim(),
      });
      codesZeigen(result.codes);
      await aktualisieren();
    });
  };
  $("#mfa-abbrechen").onclick = () =>
    void arbeiten(async () => {
      await request("/mfa/einrichtung", "DELETE");
      loeschen();
      $("#mfa-start").focus();
    });
  const kopieren = async (text) => {
    await navigator.clipboard.writeText(text);
    $("#mfa-hinweis").textContent = "Kopiert. Bewahre die Daten sicher auf.";
  };
  $("#mfa-schluessel-kopieren").onclick = () =>
    void arbeiten(() => kopieren(einrichtung.secret));
  $("#mfa-codes-kopieren").onclick = () =>
    void arbeiten(() => kopieren(codes.join("\n")));
  $("#mfa-codes-download").onclick = () => {
    const url = URL.createObjectURL(
      new Blob(
        ["Timereal Wiederherstellungscodes\n\n" + codes.join("\n") + "\n"],
        { type: "text/plain;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "timereal-wiederherstellungscodes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("#mfa-gesichert").onchange = () =>
    ($("#mfa-fertig").disabled = !$("#mfa-gesichert").checked);
  $("#mfa-fertig").onclick = () => {
    loeschen();
    $("#mfa-start").focus();
  };
  document.querySelectorAll("nav button").forEach((b) =>
    b.addEventListener("click", () => {
      if (!busy) loeschen();
    }),
  );
  window.addEventListener("pagehide", geheimnisseLoeschen);
  return { laden, loeschen };
}
