const phasen = [
  ["pruefung", "Release wird geprüft"],
  ["vorbereitung", "Update wird vorbereitet"],
  ["sicherung", "Datensicherung läuft"],
  ["migration", "Datenbank wird aktualisiert"],
  ["neustart", "Timereal startet neu"],
  ["abschlusspruefung", "Installation wird geprüft"],
];
export function updateFortschritt(job) {
  if (!job) return null;
  const fertig = job.zustand === "erfolgreich";
  const index = Math.max(
    0,
    phasen.findIndex(
      ([phase]) => phase === (job.phase === "bereit" ? "sicherung" : job.phase),
    ),
    // Die Installation prüft ihr vorbereitetes Paket erneut. Diese Prüfung
    // nimmt bereits abgeschlossene Vorbereitungsschritte nicht zurück.
    ["sicherung", "migration", "neustart"].includes(job.zustand)
      ? phasen.findIndex(([phase]) => phase === job.zustand)
      : 0,
  );
  return {
    gesamt: phasen.length,
    schritt: fertig ? phasen.length : index + 1,
    abgeschlossen: fertig ? phasen.length : index,
    text: fertig ? "Update abgeschlossen" : phasen[index][1],
    laeuft: [
      "vorbereitung",
      "pruefung",
      "sicherung",
      "migration",
      "neustart",
    ].includes(job.zustand),
  };
}
