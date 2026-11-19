const $ = (s) => document.querySelector(s),
  q = new URLSearchParams(location.search);
const daten = {
  challenge: q.get("challenge"),
  state: q.get("state"),
  redirect: q.get("redirect"),
};
history.replaceState(null, "", location.pathname);
const melden = (e) => {
  $("#meldung").hidden = !e;
  $("#meldung").textContent = e?.message ?? "";
};
async function request(path, body) {
  let r;
  try {
    r = await fetch("/api/v1" + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      "Keine Verbindung zu Timereal. Bitte prüfe deine Verbindung und versuche es erneut.",
    );
  }
  const d = await r.json().catch(() => {
    throw new Error(
      "Die Serverantwort konnte nicht gelesen werden. Bitte versuche es erneut.",
    );
  });
  if (!r.ok)
    throw Object.assign(new Error(d.fehler ?? "Anmeldung fehlgeschlagen."), {
      status: r.status,
    });
  return d;
}
async function profil() {
  try {
    const p = await request("/profil");
    $("#konto").textContent = p.login;
    $("#anmelden").hidden = true;
    $("#freigabe").hidden = false;
  } catch (e) {
    if (e.status === 401) {
      $("#anmelden").hidden = false;
      $("#freigabe").hidden = true;
    } else throw e;
  }
}
let busy = false;
async function arbeiten(fn) {
  if (busy) return;
  busy = true;
  melden();
  const buttons = [...document.querySelectorAll("button:enabled")];
  buttons.forEach((b) => {
    b.disabled = true;
  });
  $("#arbeitsstatus").textContent = "Wird verarbeitet…";
  $("#arbeitsstatus").hidden = false;
  try {
    await fn();
  } catch (e) {
    melden(e);
  } finally {
    busy = false;
    buttons.forEach((b) => {
      b.disabled = false;
    });
    $("#arbeitsstatus").hidden = true;
  }
}
$("#anmelden").onsubmit = (ev) => {
  ev.preventDefault();
  const f = ev.target;
  void arbeiten(async () => {
    await request("/anmeldung", {
      login: f.elements.login.value,
      passwort: f.elements.passwort.value,
    });
    f.elements.passwort.value = "";
    await profil();
  });
};
$("#verbinden").onclick = () => {
  void arbeiten(async () => {
    const r = await request("/erweiterung/freigabe", daten);
    location.assign(r.weiter);
  });
};
if (!daten.challenge || !daten.state || !daten.redirect) {
  $("#arbeitsstatus").hidden = true;
  melden(
    new Error("Bitte die Anmeldung aus der Timereal-Erweiterung starten."),
  );
} else void arbeiten(profil);
