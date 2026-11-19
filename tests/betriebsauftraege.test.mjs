import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Auftragsbuch } from "../betrieb/verwaltung/auftraege.mjs";

async function bestand(t) {
  const dir = await mkdtemp(join(tmpdir(), "timereal-auftraege-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, buch: await Auftragsbuch.oeffnen(dir) };
}
const start = (extra = {}) => ({
  aktion: "update-vorbereiten",
  konto: "42",
  schluessel: randomUUID(),
  daten: { tag: "v0.7.0" },
  ...extra,
});

test("Annahme ist dauerhaft, vertraulich und nach verlorener Antwort idempotent", async (t) => {
  const { dir, buch } = await bestand(t);
  const anfrage = start();
  const erster = await buch.annehmen(anfrage);
  assert.equal(erster.neu, true);
  assert.equal(erster.auftrag.zustand, "vorbereitung");
  assert.equal(erster.auftrag.phase, "pruefung");
  const datei = join(dir, "auftraege.json");
  const gespeichert = JSON.parse(await readFile(datei, "utf8"));
  assert.equal(gespeichert.auftraege[0].id, erster.auftrag.id);
  assert.equal((await stat(datei)).mode & 0o777, 0o600);
  const neu = await Auftragsbuch.oeffnen(dir);
  const wiederholt = await neu.annehmen(anfrage);
  assert.equal(wiederholt.neu, false);
  assert.equal(wiederholt.auftrag.id, erster.auftrag.id);
  await assert.rejects(neu.annehmen({ ...anfrage, daten: { tag: "v0.8.0" } }), {
    code: "KONFLIKT",
  });
});

test("Gleichzeitige Annahme erzeugt einen Auftrag; andere Betriebsaktionen kollidieren", async (t) => {
  const { buch } = await bestand(t);
  const anfrage = start();
  const antworten = await Promise.all(
    Array.from({ length: 10 }, () => buch.annehmen(anfrage)),
  );
  assert.equal(new Set(antworten.map((r) => r.auftrag.id)).size, 1);
  assert.equal(antworten.filter((r) => r.neu).length, 1);
  await assert.rejects(buch.annehmen(start()), { code: "BELEGT" });
  const job = antworten[0].auftrag;
  await buch.fortschreiben(job.id, {
    zustand: "bereit",
    commit: "a".repeat(40),
  });
  const domain = await buch.annehmen(
    start({ aktion: "domain-pruefen", daten: { domain: "zeit.example.org" } }),
  );
  assert.equal(domain.auftrag.typ, "domain");
});

test("Aktivierung benötigt den richtigen Vorzustand und einen eigenen Auftragsschlüssel", async (t) => {
  const { buch } = await bestand(t);
  const { auftrag } = await buch.annehmen(start());
  const aktivieren = start({
    aktion: "update-installieren",
    jobId: auftrag.id,
    daten: {},
  });
  await assert.rejects(buch.annehmen(aktivieren), { code: "ZUSTAND" });
  await buch.fortschreiben(auftrag.id, {
    zustand: "bereit",
    commit: "b".repeat(40),
  });
  const r = await buch.annehmen(aktivieren);
  assert.equal(r.auftrag.zustand, "sicherung");
  assert.equal((await buch.annehmen(aktivieren)).neu, false);
  await assert.rejects(
    buch.annehmen(
      start({
        aktion: "domain-bestaetigen",
        jobId: auftrag.id,
        daten: { origin: "https://zeit.example.org" },
      }),
    ),
    { code: "ZUSTAND" },
  );
});

test("Unzulässige Argumente, fremde Pfade und Geheimnisse werden nicht gespeichert", async (t) => {
  const { buch, dir } = await bestand(t);
  for (const req of [
    start({ daten: { tag: "main" } }),
    start({ daten: { tag: "v0.7.0", passwort: "geheim" } }),
    start({ daten: { tag: "v0.7.0", remote: "https://fremd.test" } }),
    start({ aktion: "shell", daten: {} }),
    start({ konto: "../../etc" }),
    start({
      aktion: "domain-pruefen",
      daten: { domain: "https://zeit.test/pfad" },
    }),
    start({ schluessel: "" }),
  ])
    await assert.rejects(buch.annehmen(req), { code: "EINGABE" });
  assert.equal(
    JSON.parse(await readFile(join(dir, "auftraege.json"), "utf8")).auftraege
      .length,
    0,
  );
});

test("Domainbestätigung gilt nur am neuen Ursprung, Rücknahme bleibt separat möglich", async (t) => {
  const { buch } = await bestand(t);
  const { auftrag } = await buch.annehmen(
    start({ aktion: "domain-pruefen", daten: { domain: "zeit.example.org" } }),
  );
  await buch.fortschreiben(auftrag.id, {
    zustand: "bestaetigung_ausstehend",
    frist: Date.now() + 180000,
  });
  const req = start({
    aktion: "domain-bestaetigen",
    jobId: auftrag.id,
    daten: { origin: "https://fremd.example.org" },
  });
  await assert.rejects(buch.annehmen(req), { code: "HERKUNFT" });
  const r = await buch.annehmen({
    ...req,
    daten: { origin: "https://zeit.example.org" },
  });
  assert.equal(r.auftrag.zustand, "erfolgreich");
});

test("Beschädigter Bestand wird laut abgewiesen und nicht durch eine leere Datei ersetzt", async (t) => {
  const { dir } = await bestand(t);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(dir, "auftraege.json"), "kaputt");
  await assert.rejects(Auftragsbuch.oeffnen(dir));
  assert.equal(await readFile(join(dir, "auftraege.json"), "utf8"), "kaputt");
});

test("Neue Domain wird bei gleichzeitigem Zugriff mehrerer Sitzungen nur einmal bestätigt", async (t) => {
  const { buch } = await bestand(t);
  const { auftrag } = await buch.annehmen(
    start({
      aktion: "domain-speichern",
      daten: { domain: "zeit.example.org" },
    }),
  );
  await buch.fortschreiben(auftrag.id, {
    zustand: "bestaetigung_ausstehend",
    frist: Date.now() + 180000,
  });
  const bestaetigen = (konto, origin = "https://zeit.example.org") =>
    start({
      aktion: "domain-bestaetigen",
      konto,
      jobId: auftrag.id,
      daten: { origin },
    });
  const antworten = await Promise.all([
    buch.annehmen(bestaetigen("42")),
    buch.annehmen(bestaetigen("43")),
  ]);
  assert.deepEqual(
    antworten.map((r) => r.neu),
    [true, false],
  );
  assert.ok(antworten.every((r) => r.auftrag.zustand === "erfolgreich"));
  // Ein alter Tab darf das bestätigte Ergebnis erneut lesen, aber weder den
  // Vorgang neu ausführen noch mit einem anderen Ursprung anerkennen.
  await buch.fortschreiben(auftrag.id, { frist: Date.now() - 1 });
  assert.equal((await buch.annehmen(bestaetigen("44"))).neu, false);
  await assert.rejects(
    buch.annehmen(bestaetigen("45", "https://fremd.example.org")),
    { code: "HERKUNFT" },
  );
  await buch.fortschreiben(auftrag.id, { zustand: "zurueckgesetzt" });
  await assert.rejects(buch.annehmen(bestaetigen("46")), { code: "ZUSTAND" });
});

test("Ungeklärte Wiederherstellung sperrt weitere Betriebsaufträge bis zur Nachprüfung", async (t) => {
  const { buch } = await bestand(t);
  const { auftrag } = await buch.annehmen(start());
  await buch.fortschreiben(auftrag.id, { zustand: "wiederherstellung_noetig" });
  await assert.rejects(buch.annehmen(start()), { code: "BELEGT" });
  await buch.fortschreiben(auftrag.id, { zustand: "vorherige_version_aktiv" });
  assert.equal((await buch.annehmen(start())).neu, true);
});
