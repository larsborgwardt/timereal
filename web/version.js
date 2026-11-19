const version = document.querySelector("#footer-version");
const status = document.querySelector("#update-status");
const link = document.querySelector("#update-link");
const detail = document.querySelector("#update-detail");
let running = false;

async function read(path) {
  const response = await fetch("/api/v1/" + path, {
    signal: AbortSignal.timeout(7000),
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Versionsauskunft nicht erreichbar.");
  return response.json();
}

async function refresh() {
  if (running || document.hidden) return;
  running = true;
  try {
    try {
      const installed = await read("version");
      version.textContent = "v" + installed.version;
    } catch {
      version.textContent = "Version nicht verfügbar";
    }
    try {
      const update = await read("updates");
      link.hidden = !update.updateAvailable;
      // Links werden aus einer geprüften Versionsnummer aufgebaut, nicht aus fremdem HTML.
      if (
        update.updateAvailable &&
        /^\d+\.\d+\.\d+$/.test(update.latestVersion)
      ) {
        const tag = update.releaseUrl?.split("/releases/tag/")[1];
        if (!tag || !/^v?\d+\.\d+\.\d+$/.test(tag))
          throw new Error("Ungültiger Release-Link.");
        link.href =
          "https://github.com/larsborgwardt/timereal/releases/tag/" + tag;
        link.textContent = "Update verfügbar: v" + update.latestVersion + " ↗";
      }
      status.textContent =
        update.status === "disabled"
          ? "Updateprüfung deaktiviert"
          : update.status === "unavailable"
            ? "Updateprüfung nicht möglich"
            : update.updateAvailable
              ? ""
              : "Kein Update verfügbar";
      detail.textContent =
        update.status === "unavailable" && update.checkedAt
          ? "Letzte erfolgreiche Prüfung: " +
            new Date(update.checkedAt).toLocaleString("de-DE")
          : update.updateAvailable
            ? "Updates werden durch den Administrator installiert."
            : "";
    } catch {
      status.textContent = "Updateprüfung nicht möglich";
      // Ein zuvor sichtbarer Hinweis bleibt beim Netzausfall als letzter bekannter Stand erhalten.
      detail.textContent = link.hidden
        ? ""
        : "Angezeigt wird der zuletzt geladene Stand.";
    }
  } finally {
    running = false;
  }
}
void refresh();
setInterval(() => void refresh(), 60 * 60 * 1000);
document.addEventListener("visibilitychange", () => void refresh());
