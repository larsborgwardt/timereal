// Verwaltung → Mailversand (Entwurf 15, D-RELEASE-009). Nur Administratoren.
// Das SMTP-Passwort wird nie angezeigt; ein leeres Feld behält das gespeicherte.
export function mailOberflaeche({ $, request, sichtbar }) {
  const form = $("#mail-einstellungen"),
    test = $("#mail-testmail");
  let stand = null,
    laedt = false,
    generation = 0;
  const text = (id, wert) => {
    const el = $("#mail-" + id);
    if (el.textContent !== (wert ?? "")) el.textContent = wert ?? "";
  };
  function meldung(id, wert, fehler = false) {
    text(id, wert);
    $("#mail-" + id).hidden = !wert;
    $("#mail-" + id).classList.toggle("fehlertext", fehler);
  }
  function sperren(wert) {
    for (const el of [
      $("#mail-speichern"),
      $("#mail-verwerfen"),
      $("#mail-senden"),
    ]) {
      el.disabled = wert;
      if (wert) delete el.dataset.wartet;
    }
    if (!wert) $("#mail-senden").disabled = !stand?.konfiguriert;
    form.setAttribute("aria-busy", String(wert));
  }
  function fuellen() {
    const f = form.elements;
    f.host.value = stand?.host ?? "";
    f.port.value = String(stand?.port ?? 587);
    f.verschluesselung.value = stand?.secure ? "tls" : "starttls";
    f.from.value = stand?.from ?? "";
    f.user.value = stand?.user ?? "";
    f.password.value = "";
    f.passwort.value = "";
    f.password.placeholder = stand?.passwortGesetzt
      ? "Gespeichert – leer lassen, um es zu behalten"
      : "";
    text(
      "zustand",
      stand?.konfiguriert ? "Eingerichtet" : "Noch nicht eingerichtet",
    );
    $("#mail-zustand").classList.toggle("ok", !!stand?.konfiguriert);
    $("#mail-testhinweis").hidden = !!stand?.konfiguriert;
    sperren(laedt);
  }
  async function laden() {
    if (!sichtbar() || laedt) return;
    const vorher = ++generation;
    laedt = true;
    sperren(true);
    try {
      const neu = await request("/verwaltung/mail/einstellungen");
      if (vorher !== generation) return;
      stand = neu;
      meldung("fehler", "");
      fuellen();
    } catch (e) {
      if (vorher === generation) meldung("fehler", e.message, true);
    } finally {
      if (vorher === generation) {
        laedt = false;
        sperren(false);
      }
    }
  }
  // Ergebnis und Fehler erscheinen in der Karte der jeweiligen Aktion.
  async function ausfuehren(arbeit, ort = "") {
    const vorher = ++generation;
    laedt = true;
    sperren(true);
    for (const id of ["fehler", "ergebnis", "testfehler", "testergebnis"])
      meldung(id, "");
    try {
      await arbeit(vorher);
    } catch (e) {
      if (vorher === generation) meldung(ort + "fehler", e.message, true);
    } finally {
      if (vorher === generation) {
        laedt = false;
        sperren(false);
      }
    }
  }
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const f = form.elements;
    void ausfuehren(async (vorher) => {
      const neu = await request("/verwaltung/mail/einstellungen", "PUT", {
        host: f.host.value.trim(),
        port: Number(f.port.value),
        secure: f.verschluesselung.value === "tls",
        from: f.from.value.trim(),
        user: f.user.value.trim(),
        password: f.password.value,
        version: stand?.version ?? "leer",
        passwort: f.passwort.value,
      });
      if (vorher !== generation) return;
      stand = neu;
      fuellen();
      meldung(
        "ergebnis",
        "Gespeichert. Die Verbindung wurde geprüft und gilt sofort.",
      );
    });
  };
  $("#mail-verwerfen").onclick = () => {
    fuellen();
    meldung("fehler", "");
    meldung("ergebnis", "");
  };
  test.onsubmit = (ev) => {
    ev.preventDefault();
    void ausfuehren(async (vorher) => {
      await request("/verwaltung/mail/test", "POST", {
        email: test.elements.email.value.trim(),
        version: stand?.version ?? "leer",
      });
      if (vorher !== generation) return;
      meldung(
        "testergebnis",
        "Der Mailserver hat die Testmail angenommen. Prüfe auch deinen Spamordner.",
      );
    }, "test");
  };
  return {
    laden,
    zuruecksetzen() {
      generation++;
      laedt = false;
      stand = null;
      form.reset();
      test.reset();
      for (const id of ["fehler", "ergebnis", "testfehler", "testergebnis"])
        meldung(id, "");
      fuellen();
    },
  };
}
