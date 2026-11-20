import { test } from "node:test";
import { strict as assert } from "node:assert";
import { anmeldeDrossel, anmeldeGrenzen } from "../dist/anmeldedrossel.js";

const A = "198.51.100.7",
  B = "203.0.113.9";

test("Die Vorgaben begrenzen Ziel, Absender und Speicher", () => {
  assert.deepEqual(anmeldeGrenzen, {
    jeZiel: 12,
    jeAbsender: 2048,
    eintraege: 4096,
    fensterMs: 600000,
  });
});

test("Zwölf Versuche je Absender und Anmeldename; Groß-/Kleinschreibung zählt gemeinsam", () => {
  const d = anmeldeDrossel();
  for (let i = 0; i < 12; i++)
    assert.equal(d.versuch(A, i % 2 ? "Lars" : "lars", 1000), true);
  assert.equal(d.versuch(A, "LARS", 1000), false);
  // Anderer Name und anderer Absender bleiben frei.
  assert.equal(d.versuch(A, "erika", 1000), true);
  assert.equal(d.versuch(B, "lars", 1000), true);
});

test("Ein Absender mit ausgeschöpftem Kontingent sperrt keinen anderen Absender", () => {
  const d = anmeldeDrossel();
  for (let i = 0; i < 2048; i++)
    assert.equal(d.versuch(A, "flut-" + i, 1000), true);
  assert.equal(d.versuch(A, "noch-einer", 1000), false);
  assert.equal(d.versuch(B, "anderes-konto", 1000), true);
});

test("Abgelehnte Versuche zählen nicht weiter und das Fenster läuft ab", () => {
  const d = anmeldeDrossel({ jeZiel: 2, fensterMs: 100 });
  assert.equal(d.versuch(A, "lars", 1000), true);
  assert.equal(d.versuch(A, "lars", 1050), true);
  assert.equal(d.versuch(A, "lars", 1099), false);
  // Das Fenster beginnt beim ersten Versuch, nicht bei der letzten Ablehnung.
  assert.equal(d.versuch(A, "lars", 1100), true);
});

test("Eine erfolgreiche Anmeldung setzt nur den Zähler dieses Ziels zurück", () => {
  const d = anmeldeDrossel({ jeZiel: 2, jeAbsender: 3 });
  assert.equal(d.versuch(A, "lars", 1000), true);
  assert.equal(d.versuch(A, "lars", 1000), true);
  d.erfolg(A, "Lars");
  assert.equal(d.versuch(A, "lars", 1000), true);
  // Das Absenderkontingent bleibt verbraucht.
  assert.equal(d.versuch(A, "erika", 1000), false);
});

test("Der Speicher bleibt begrenzt, ohne neue Absender abzuweisen", () => {
  const d = anmeldeDrossel({ eintraege: 50 });
  for (let i = 0; i < 500; i++)
    assert.equal(d.versuch("192.0.2." + i, "name-" + i, 1000), true);
  assert.deepEqual(d.groesse(), { ziele: 50, absender: 50 });
  // Verdrängt wird der älteste Eintrag; der jüngste Zähler gilt weiter.
  const e = anmeldeDrossel({ eintraege: 2, jeZiel: 1 });
  assert.equal(e.versuch("192.0.2.1", "a", 1000), true);
  assert.equal(e.versuch("192.0.2.2", "b", 1000), true);
  assert.equal(e.versuch("192.0.2.3", "c", 1000), true);
  assert.equal(e.versuch("192.0.2.3", "c", 1000), false);
  assert.equal(e.versuch("192.0.2.1", "a", 1000), true);
});

test("Abgelaufene Einträge werden vor fremden Zählern verdrängt", () => {
  const d = anmeldeDrossel({ eintraege: 2, jeZiel: 1, fensterMs: 100 });
  assert.equal(d.versuch("192.0.2.1", "a", 1000), true);
  assert.equal(d.versuch("192.0.2.2", "b", 1090), true);
  // Bei 1100 ist nur der erste Eintrag abgelaufen; der zweite Zähler bleibt wirksam.
  assert.equal(d.versuch("192.0.2.3", "c", 1100), true);
  assert.equal(d.versuch("192.0.2.2", "b", 1100), false);
});
