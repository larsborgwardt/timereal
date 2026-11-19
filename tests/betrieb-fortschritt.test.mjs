import { test } from "node:test";
import assert from "node:assert/strict";
import { updateFortschritt } from "../web/betrieb-fortschritt.js";

test("Fortschritt folgt bestätigten Betriebsphasen; nur Erfolg füllt den Balken", () => {
  for (const [phase, schritt] of [
    ["pruefung", 1],
    ["vorbereitung", 2],
    ["sicherung", 3],
    ["migration", 4],
    ["neustart", 5],
    ["abschlusspruefung", 6],
  ]) {
    const stand = updateFortschritt({ zustand: "vorbereitung", phase });
    assert.equal(stand.schritt, schritt);
    assert.equal(stand.abgeschlossen, schritt - 1);
    assert.equal(stand.gesamt, 6);
    assert.equal(stand.laeuft, true);
  }
  assert.equal(
    updateFortschritt({ zustand: "erfolgreich", phase: "erfolgreich" })
      .abgeschlossen,
    6,
  );
  for (const zustand of [
    "fehlgeschlagen",
    "vorherige_version_aktiv",
    "wiederherstellung_noetig",
  ]) {
    const stand = updateFortschritt({ zustand, phase: "neustart" });
    assert.equal(stand.laeuft, false);
    assert.ok(stand.abgeschlossen < 6);
  }
  assert.equal(
    updateFortschritt({ zustand: "bereit", phase: "bereit" }).laeuft,
    false,
  );
  assert.equal(updateFortschritt(null), null);
});

test("Abgeschlossene Vorbereitung bleibt beim Übergang zur Installation sichtbar", () => {
  for (const [zustand, phase] of [
    ["vorbereitung", "bereit"],
    ["sicherung", "pruefung"],
    ["sicherung", "vorbereitung"],
  ]) {
    const stand = updateFortschritt({ zustand, phase });
    assert.equal(stand.abgeschlossen, 2);
    assert.equal(stand.text, "Datensicherung läuft");
  }
});
