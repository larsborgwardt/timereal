const $ = (s) => document.querySelector(s),
  q = new URLSearchParams(location.search);
const daten = {
  challenge: q.get("challenge"),
  state: q.get("state"),
  redirect: q.get("redirect"),
};
history.replaceState(null, "", location.pathname);
const melden = (e) => {
  $("#meldung").hidden = false;
  $("#meldung").textContent = e.message;
};
async function request(path, body) {
  const r = await fetch("/api/v1" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
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
    } else melden(e);
  }
}
$("#anmelden").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  f.querySelector("button").disabled = true;
  try {
    await request("/anmeldung", {
      login: f.elements.login.value,
      passwort: f.elements.passwort.value,
    });
    f.elements.passwort.value = "";
    await profil();
  } catch (e) {
    melden(e);
  } finally {
    f.querySelector("button").disabled = false;
  }
};
$("#verbinden").onclick = async () => {
  $("#verbinden").disabled = true;
  try {
    const r = await request("/erweiterung/freigabe", daten);
    location.assign(r.weiter);
  } catch (e) {
    melden(e);
    $("#verbinden").disabled = false;
  }
};
if (!daten.challenge || !daten.state || !daten.redirect)
  melden(
    new Error("Bitte die Anmeldung aus der Timereal-Erweiterung starten."),
  );
else void profil();
