import { serverAdresse } from "./erweiterung-vertrag.js";
export const istErweiterung = location.protocol === "chrome-extension:";
let unsicher = false,
  bestaetigung = false;
if (istErweiterung) {
  const s = await chrome.storage.session.get(["unsicher", "bestaetigung"]);
  unsicher = !!s.unsicher;
  bestaetigung = !!s.bestaetigung;
}
const sichern = async () => {
  if (istErweiterung)
    await chrome.storage.session.set({ unsicher, bestaetigung });
};
export const verbindungUnsicher = () => unsicher;
export const brauchtBestaetigung = () => bestaetigung;
export async function verbindungGeprueft() {
  unsicher = false;
  bestaetigung = true;
  await sichern();
}
export async function aktionBestaetigt() {
  bestaetigung = false;
  await sichern();
}
export async function senden(pfad, methode = "GET", body, key) {
  if (unsicher && methode !== "GET")
    throw new Error("Bitte zuerst den aktuellen Stand laden.");
  let basis = "",
    auth = {};
  if (istErweiterung) {
    const s = await chrome.storage.session.get("zugang");
    if (!s.zugang)
      return new Response(
        JSON.stringify({ fehler: "Bitte die Erweiterung verbinden." }),
        { status: 401 },
      );
    basis = serverAdresse(s.zugang.server);
    auth = { Authorization: "Bearer " + s.zugang.token };
  }
  try {
    const response = await fetch(basis + "/api/v1" + pfad, {
      method: methode,
      credentials: istErweiterung ? "omit" : "same-origin",
      headers: {
        ...auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (
      istErweiterung &&
      (response.status === 401 || (pfad === "/abmeldung" && response.ok))
    )
      await chrome.storage.session.remove("zugang");
    return response;
  } catch (e) {
    unsicher = true;
    await sichern();
    window.dispatchEvent(new Event("verbindung-fehlt"));
    throw new Error(
      "Keine Antwort erhalten. Lade den aktuellen Stand, bevor du fortfährst.",
      { cause: e },
    );
  }
}
