// Derselbe zweite Anmeldeschritt für Web-App und Erweiterungsfreigabe.
export function faktorAnmeldung({ host, request, erfolgreich, zurueck }) {
  let recovery = false,
    busy = false;
  host.innerHTML = `<form id="login-faktor" class="karte login" hidden>
    <h2 id="login-faktor-titel">Anmeldung bestätigen</h2><p id="login-faktor-konto"></p>
    <p id="login-faktor-hilfe">Gib den aktuellen Code aus deiner Authenticator-App ein.</p>
    <p id="login-faktor-fehler" role="alert" hidden></p>
    <md-outlined-text-field label="Sechsstelliger Code" id="login-faktor-code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"></md-outlined-text-field>
    <div class="aktionen"><md-filled-button>Anmelden</md-filled-button><md-outlined-button type="button" id="login-faktor-zurueck">Zurück zur Anmeldung</md-outlined-button><md-outlined-button type="button" id="login-faktor-wechsel">Wiederherstellungscode verwenden</md-outlined-button></div>
    <p class="neben">Die Bestätigung ist für fünf Minuten gültig. Danach meldest du dich erneut mit deinem Passwort an.</p>
    </form>`;
  const $ = (s) => host.querySelector(s),
    form = $("#login-faktor"),
    input = $("#login-faktor-code");
  function modus() {
    input.value = "";
    $("#login-faktor-titel").textContent = recovery
      ? "Wiederherstellungscode verwenden"
      : "Anmeldung bestätigen";
    input.inputMode = recovery ? "text" : "numeric";
    input.maxLength = recovery ? 39 : 6;
    input.pattern = recovery ? "[A-Fa-f0-9-]{32,39}" : "[0-9]{6}";
    $("#login-faktor-code").label = recovery
      ? "Wiederherstellungscode"
      : "Sechsstelliger Code";
    $("#login-faktor-hilfe").textContent = recovery
      ? "Verwende einen deiner unbenutzten Wiederherstellungscodes."
      : "Gib den aktuellen Code aus deiner Authenticator-App ein.";
    $("#login-faktor-wechsel").textContent = recovery
      ? "Authenticator verwenden"
      : "Wiederherstellungscode verwenden";
    $("#login-faktor-fehler").hidden = true;
  }
  async function ausfuehren(fn) {
    if (busy) return;
    busy = true;
    form
      .querySelectorAll("md-filled-button, md-outlined-button")
      .forEach((b) => (b.disabled = true));
    $("#login-faktor-fehler").hidden = true;
    try {
      await fn();
    } catch (e) {
      $("#login-faktor-fehler").textContent = e.message;
      $("#login-faktor-fehler").hidden = false;
      input.focus();
    } finally {
      busy = false;
      form
        .querySelectorAll("md-filled-button, md-outlined-button")
        .forEach((b) => (b.disabled = false));
    }
  }
  function loeschen() {
    form.hidden = true;
    input.value = "";
    $("#login-faktor-konto").textContent = "";
  }
  form.onsubmit = (ev) => {
    ev.preventDefault();
    void ausfuehren(async () => {
      await request("/anmeldung/faktor", "POST", {
        art: recovery ? "recovery" : "totp",
        code: input.value.trim(),
      });
      loeschen();
      await erfolgreich();
    });
  };
  $("#login-faktor-wechsel").onclick = () => {
    recovery = !recovery;
    modus();
    input.focus();
  };
  $("#login-faktor-zurueck").onclick = () =>
    void ausfuehren(async () => {
      await request("/anmeldung/faktor", "DELETE");
      loeschen();
      zurueck();
    });
  return {
    zeigen(login) {
      recovery = false;
      modus();
      $("#login-faktor-konto").textContent = "Für " + login;
      form.hidden = false;
      input.focus();
    },
    loeschen,
  };
}
