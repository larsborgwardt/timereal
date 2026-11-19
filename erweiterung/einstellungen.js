import {
  serverAdresse,
  andereServerBerechtigungen,
} from "./erweiterung-vertrag.js";
const form = document.querySelector("form"),
  meldung = document.querySelector("#meldung");
let gespeicherterServer;
try {
  gespeicherterServer = (await chrome.storage.local.get("server")).server ?? "";
} catch (error) {
  meldung.textContent =
    "Die Einstellungen konnten nicht geladen werden. Bitte dieses Fenster neu öffnen.";
  throw error;
}
form.elements.server.value = gespeicherterServer;
form.onsubmit = async (ev) => {
  ev.preventDefault();
  form.querySelector("button").disabled = true;
  meldung.textContent = "";
  let angefragteOrigin = "";
  try {
    const server = serverAdresse(form.elements.server.value),
      u = new URL(server);
    angefragteOrigin = u.protocol + "//" + u.hostname + "/*";
    const erlaubt = await chrome.permissions.request({
      origins: [u.protocol + "//" + u.hostname + "/*"],
    });
    if (!erlaubt)
      throw new Error(
        "Der Zugriff auf diese Timereal-Adresse wurde nicht erlaubt.",
      );
    const hex = (bytes) =>
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const verifier = hex(crypto.getRandomValues(new Uint8Array(32))),
      state = hex(crypto.getRandomValues(new Uint8Array(24)));
    const challenge = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      ),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    const redirect = chrome.identity.getRedirectURL("timereal");
    const result = await chrome.identity.launchWebAuthFlow({
      url:
        server +
        "/erweiterung-anmelden.html?" +
        new URLSearchParams({ challenge, state, redirect }),
      interactive: true,
    });
    const back = new URL(result);
    if (
      back.origin + back.pathname !== redirect ||
      back.searchParams.get("state") !== state ||
      !back.searchParams.get("code")
    )
      throw new Error("Der Anmelderücksprung passt nicht zu dieser Anfrage.");
    const response = await fetch(server + "/api/v1/erweiterung/token", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: back.searchParams.get("code"),
        verifier,
        redirect,
      }),
    });
    const data = await response.json();
    if (!response.ok || !/^[a-f0-9]{64}$/.test(data.token))
      throw new Error(data.fehler ?? "Anmeldung fehlgeschlagen.");
    const alteOrigins = andereServerBerechtigungen(
      (await chrome.permissions.getAll()).origins ?? [],
      server,
    );
    if (
      alteOrigins.length &&
      !(await chrome.permissions.remove({ origins: alteOrigins }))
    )
      throw new Error(
        "Die Berechtigung des bisherigen Servers konnte nicht entfernt werden.",
      );
    await chrome.storage.session.set({
      zugang: { server, token: data.token },
      unsicher: false,
      bestaetigung: false,
    });
    await chrome.storage.local.set({ server });
    gespeicherterServer = server;
    meldung.textContent =
      "Verbunden. Du kannst dieses Fenster schließen und Timereal über die Browserleiste öffnen.";
    document.querySelector("#oeffnen").hidden = false;
  } catch (e) {
    if (
      angefragteOrigin &&
      (!gespeicherterServer ||
        andereServerBerechtigungen([angefragteOrigin], gespeicherterServer)
          .length)
    )
      await chrome.permissions
        .remove({ origins: [angefragteOrigin] })
        .catch(() => false);
    meldung.textContent = e.message;
  } finally {
    form.querySelector("button").disabled = false;
  }
};
document.querySelector("#oeffnen").onclick = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
form.querySelector("button").disabled = false;
form.elements.server.disabled = false;
